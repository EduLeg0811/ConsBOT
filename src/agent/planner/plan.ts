import {
  AGENT_BOOK_IDS,
  AGENT_CLASSIFIER_MODEL,
  AGENT_CLASSIFIER_REASONING,
  AGENT_ANSWER_MAX,
  AGENT_DELIVERIES,
  AGENT_PLANNER_TIMEOUT_MS,
  AGENT_VERBETE_FIELDS,
} from "@/agent/config";
import { agentInstructionsFor } from "@/agent/planner/prompt";
import { AGENT_PLANNER_SCHEMA } from "@/agent/planner/schema";
import { cleanTerm } from "@/agent/tools/lib/text";
import { actionsFromMatches, agentTool, MAX_AGENT_ACTIONS } from "@/agent/tools/registry";
import type {
  AgentAnswerMode,
  AgentContext,
  AgentDelivery,
  AgentIntentId,
  AgentMatch,
  AgentPlan,
  AgentVerbeteField,
} from "@/agent/types";

/** Piso de tamanho. Serve só para descartar toque acidental — «a», «?» —, não
 * para filtrar pergunta curta: era 8 caracteres, e nesse patamar engolia as
 * saudações («Oi», «Bom dia»), que são justamente o caso que a triagem sabe
 * responder sozinha. O custo de classificar uma frase de duas letras é o
 * mesmo de qualquer outra, e é baixo. */
const MIN_TEXT_LENGTH = 2;

const EMPTY: AgentPlan = { actions: [], delivery: "card", answerMode: "full", answer: "" };

/** Mesma forma de EMPTY, identidade diferente: marca o plano que saiu vazio
 * por FALHA (rede, timeout, JSON inesperado), e não porque o classificador
 * decidiu que não havia ação. Só a identidade é usada — nunca vaza para fora
 * de `planAgent`, que o troca por EMPTY. */
const FAILED: AgentPlan = { actions: [], delivery: "card", answerMode: "full", answer: "" };

type PlannerPayload = {
  actions?: Array<{ intent?: string; term?: string; field?: string; book?: string }>;
  delivery?: string;
  answer_mode?: string;
  answer?: string;
};

function asVerbeteField(value: unknown): AgentVerbeteField | undefined {
  return typeof value === "string" && (AGENT_VERBETE_FIELDS as readonly string[]).includes(value)
    ? (value as AgentVerbeteField)
    : undefined;
}

function asBookId(value: unknown): string | undefined {
  return typeof value === "string" && AGENT_BOOK_IDS.includes(value) ? value : undefined;
}

function asAnswerMode(value: unknown): AgentAnswerMode {
  // Viés conservador em código, não só no prompt: qualquer coisa que não seja
  // exatamente "direct" cai em "full". O erro caro é engolir a pergunta.
  return value === "direct" ? "direct" : "full";
}

/** Saudação, agradecimento, despedida ou pergunta sobre o próprio assistente
 * — o caso (a) das instruções de triagem, o único em que responder sem ação e
 * sem fontes é seguro.
 *
 * É verificado no cliente, e não confiado ao classificador, porque o erro que
 * ele evita é o mais caro do módulo: responder de cabeça uma pergunta que
 * dependia do corpus. O `answer_mode` do modelo pede permissão; esta função
 * concede. */
const SMALL_TALK =
  /^(?:\s*(?:ol[áa]|oi|opa|e\s*a[íi]|al[ôo]|bom\s+dia|boa\s+tarde|boa\s+noite|tudo\s+bem|obrigad[oa]|valeu|agradeç[oa]|at[ée]\s+(?:logo|mais)|tchau|adeus|hi|hello|hey|good\s+(?:morning|afternoon|evening)|thanks?|thank\s+you|bye|goodbye|tudo\s+bem\s+com\s+voc[êe]|como\s+(?:vai|est[áa])|como\s+voc[êe]\s+(?:vai|est[áa])|how\s+are\s+you|how(?:'s|\s+is)\s+it\s+going)(?![\p{L}\p{N}])[\s\p{P}]*)+$/iu;

const ABOUT_ASSISTANT =
  /(?<![\p{L}\p{N}])(?:quem\s+(?:é|e)\s+voc[êe]|o\s+que\s+voc[êe]\s+(?:faz|é|e|pode)|como\s+voc[êe]\s+funciona|para\s+que\s+voc[êe]\s+serve|o\s+que\s+(?:é|e)\s+(?:o\s+)?consbot|who\s+are\s+you|what\s+(?:can|do)\s+you\s+do|how\s+do\s+you\s+work)(?![\p{L}\p{N}])/iu;

export function isSmallTalk(text: string): boolean {
  return SMALL_TALK.test(text) || ABOUT_ASSISTANT.test(text);
}

function asDelivery(value: unknown): AgentDelivery {
  return typeof value === "string" && (AGENT_DELIVERIES as readonly string[]).includes(value)
    ? (value as AgentDelivery)
    : "card";
}

/* ─────────────────────────────── memória curta ──────────────────────────────
 * Dois interessados podem querer o MESMO plano da mesma pergunta: o preparo do
 * contexto, antes da resposta, e a barra de botões, depois dela. Sem isto
 * seriam duas chamadas idênticas por mensagem.
 *
 * Guarda só a última: o plano da pergunta anterior não serve para a nova.
 * De quebra, absorve o efeito montado duas vezes pelo StrictMode em dev.
 *
 * Nenhum interessado pode CANCELAR a chamada: a promessa é compartilhada, e um
 * abort de um derrubaria o resultado do outro. Quem perdeu o interesse ignora
 * o que chegar. O único sinal que a interrompe é o teto de espera interno
 * (AGENT_PLANNER_TIMEOUT_MS), que vale para todos os interessados de uma vez. */
let cached: { key: string; plan: Promise<AgentPlan> } | null = null;

function cacheKey(ctx: AgentContext): string {
  // Só o que muda o plano entra na chave. A presença de histórico ficava aqui
  // enquanto `mayAnswer` dependia dela; agora quem autoriza a resposta direta
  // é `isSmallTalk`, que olha só a mensagem — e o histórico fora da chave faz
  // os dois interessados (triagem e barra de botões) caírem no mesmo plano com
  // mais confiabilidade, que é a razão de o cache existir.
  return [ctx.userText.trim(), ctx.settings.prompt, ctx.host.english].join(" | ");
}

/** Planejamento por LLM: uma chamada decide SE há ação, QUAL ferramenta, com
 * QUAIS parâmetros e COMO entregar. Devolve o mesmo tipo de ação do plano B
 * determinístico, para a UI não saber qual dos dois a produziu.
 *
 * Falha em silêncio de propósito — rede fora, 500 do Main-Server ou JSON
 * inesperado resultam em «nenhuma ação», nunca em erro visível: o módulo é um
 * extra opcional e não pode interferir na conversa.
 */
export function planAgent(ctx: AgentContext): Promise<AgentPlan> {
  const key = cacheKey(ctx);
  if (cached?.key === key) return cached.plan;

  const plan = requestPlan(ctx).then((result) => {
    // Plano vazio POR FALHA não vira memória: a rede caiu ou o teto de espera
    // estourou, e quem perguntar em seguida — a barra de botões, depois da
    // resposta — merece uma tentativa nova em vez de herdar o silêncio.
    if (result === FAILED) {
      if (cached?.key === key) cached = null;
      return EMPTY;
    }
    return result;
  });

  cached = { key, plan };
  return plan;
}

async function requestPlan(ctx: AgentContext): Promise<AgentPlan> {
  const text = ctx.userText.trim();
  if (text.length < MIN_TEXT_LENGTH) return EMPTY;

  const english = ctx.host.english;
  // Vazio = instruções geradas do registro; o menu de configuração (Agent
  // Prompt) é o único lugar que preenche isso, e só dentro da sessão.
  const instructions = ctx.settings.prompt.trim() || agentInstructionsFor(english);

  try {
    const response = await fetch(`${ctx.host.apiBase}/api/llm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      // Sem isto, um servidor que aceita a conexão e não responde pendura a
      // triagem — e com ela o envio da pergunta. Ver AGENT_PLANNER_TIMEOUT_MS.
      signal: AbortSignal.timeout(AGENT_PLANNER_TIMEOUT_MS),
      body: JSON.stringify({
        // As instruções vão no systemPrompt, e não coladas na pergunta, porque
        // são idênticas em toda classificação: nessa posição viram prefixo
        // estável, que o cache de prompt da OpenAI aproveita. O
        // `promptCacheKey` roteia as chamadas para o mesmo cache.
        messages: [{ role: "user", content: text }],
        systemPrompt: instructions,
        promptCacheKey: `agent-planner-${english ? "en" : "pt"}`,
        model: AGENT_CLASSIFIER_MODEL,
        reasoningEffort: AGENT_CLASSIFIER_REASONING.id,
        verbosity: "low",
        responseSchema: AGENT_PLANNER_SCHEMA,
        responseSchemaName: "agent_intent",
        responseSchemaDescription: english
          ? "The actions the question justifies, at most two, and how to deliver them."
          : "As ações que a pergunta justifica, no máximo duas, e como entregá-las.",
      }),
    });

    if (!response.ok) return FAILED;

    const result = (await response.json()) as { content?: string };
    if (!result.content) return FAILED;

    const parsed = JSON.parse(result.content) as PlannerPayload;
    const items = Array.isArray(parsed.actions) ? parsed.actions : [];

    // O teto vale aqui também: `maxItems` não é garantido pelo modo estrito do
    // schema, então quem corta é o cliente. Ferramenta fora do registro é
    // descartada — o enum vem dele, mas o modelo pode inventar.
    const matches: AgentMatch[] = items
      .filter((item) => Boolean(agentTool(String(item.intent))))
      .slice(0, MAX_AGENT_ACTIONS)
      .map((item) => ({
        intent: item.intent as AgentIntentId,
        term: cleanTerm(item.term),
        field: asVerbeteField(item.field),
        book: asBookId(item.book),
      }));

    const answerMode = asAnswerMode(parsed.answer_mode);
    const answer =
      typeof parsed.answer === "string" ? parsed.answer.trim().slice(0, AGENT_ANSWER_MAX) : "";

    const actions = actionsFromMatches(matches, ctx);

    // Três condições para a triagem responder sozinha, e a última não é
    // negociável por prompt:
    //
    //  1. ela pediu `direct`;
    //  2. escreveu alguma coisa — um `direct` vazio mostraria resposta em
    //     branco, e sai mais barato pagar a chamada completa;
    //  3. ou há ação (a busca É a resposta), ou a mensagem é o caso (a) das
    //     instruções — saudação, agradecimento, pergunta sobre o próprio
    //     assistente —, reconhecido AQUI, por padrão, não pela palavra do
    //     classificador.
    //
    // A terceira fecha a classe de erro mais cara: a triagem não recebe as
    // fontes nem o histórico, então toda pergunta de conteúdo tem de ir ao
    // modelo completo. Antes esta linha era `!ctx.assistantText`, o que
    // protegia a conversa em andamento e deixava a PRIMEIRA mensagem
    // descoberta — justamente o primeiro contato do usuário.
    const mayAnswer = actions.length > 0 || isSmallTalk(text);

    return {
      actions,
      delivery: asDelivery(parsed.delivery),
      answerMode: answerMode === "direct" && answer && mayAnswer ? "direct" : "full",
      answer,
    };
  } catch {
    // Abort por teto de espera cai aqui junto com rede fora e JSON inesperado:
    // para o usuário são a mesma coisa — nenhum botão, conversa intacta.
    return FAILED;
  }
}
