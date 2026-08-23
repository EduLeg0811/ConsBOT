import {
  AGENT_CLASSIFIER_MODEL,
  AGENT_CLASSIFIER_REASONING,
  agentInstructionsFor,
} from "@/lib/agent/config";
import { buildSearchBookAction, cleanTerm, isUsableTerm } from "@/lib/agent/rules";
import { isEnglishVectorStore } from "@/lib/chat-settings";
import { API_BASE } from "@/lib/main-server";
import type { AgentAction, AgentContext } from "@/lib/agent/types";

/** Rótulos que o classificador pode devolver. Um por ação oferecível, mais
 * `none` — que é a resposta esperada na esmagadora maioria das perguntas. */
const CLASSIFIER_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: ["search_literal", "none"],
      description:
        "search_literal quando o usuário quer LOCALIZAR uma palavra ou expressão literal nos livros; none em qualquer outro caso, inclusive pedidos de explicação, definição ou opinião sobre um conceito.",
    },
    term: {
      type: "string",
      description:
        "A palavra ou expressão exata a ser localizada, sem aspas e sem as palavras do pedido. String vazia quando intent for none.",
    },
  },
  required: ["intent", "term"],
  additionalProperties: false,
} as const;

/** Perguntas curtas demais não carregam pedido de busca; poupa uma chamada. */
const MIN_TEXT_LENGTH = 8;

type ClassifierPayload = { intent?: string; term?: string };

/** Detecção por LLM: mesma saída de `detectActions`, obtida com uma chamada a
 * /api/llm em vez de casamento de padrões.
 *
 * Falha em silêncio de propósito — rede fora, 500 do Main-Server ou JSON
 * inesperado resultam em «nenhuma ação», nunca em erro visível: o módulo é um
 * extra opcional e não pode interferir na conversa. Idem para o abort, que é
 * o caso normal quando o usuário envia outra pergunta antes da resposta.
 */
export async function classifyActions(
  ctx: AgentContext,
  signal?: AbortSignal,
): Promise<AgentAction[]> {
  const text = ctx.userText.trim();
  if (text.length < MIN_TEXT_LENGTH) return [];

  const english = isEnglishVectorStore(ctx.settings.vectorStoreId);
  // Vazio = padrão do idioma da base; o menu de configuração (Agent Prompt)
  // é o único lugar que preenche isso, e só dentro da sessão.
  const instructions = ctx.settings.agentPrompt.trim() || agentInstructionsFor(english);

  try {
    const response = await fetch(`${API_BASE}/api/llm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      signal,
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: `${instructions}\n\n---\n${text}`,
          },
        ],
        model: AGENT_CLASSIFIER_MODEL,
        reasoningEffort: AGENT_CLASSIFIER_REASONING.id,
        verbosity: "low",
        responseSchema: CLASSIFIER_SCHEMA,
        responseSchemaName: "agent_intent",
        responseSchemaDescription: english
          ? "The intent of the question and, when applicable, the literal term to look up."
          : "A intenção da pergunta e, quando for o caso, o termo literal a localizar.",
      }),
    });

    if (!response.ok) return [];

    const result = (await response.json()) as { content?: string };
    if (!result.content) return [];

    const parsed = JSON.parse(result.content) as ClassifierPayload;
    if (parsed.intent !== "search_literal") return [];

    const term = cleanTerm(parsed.term);
    if (!isUsableTerm(term)) return [];

    return [buildSearchBookAction(term, ctx)];
  } catch {
    return [];
  }
}
