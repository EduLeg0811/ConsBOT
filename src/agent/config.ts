/** Configuração do módulo AGENT (ações sugeridas).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  AGENT_MODE — 0 (desligado, padrão) | 1 (ligado)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  LIGADO, o ConsBOT passa a exibir BOTÕES OPCIONAIS abaixo da conversa quando
 *  a pergunta do usuário casa com alguma regra de `src/lib/agent/rules.ts`.
 *  Exemplo: pedido de busca literal ("localize a palavra 'consciex'") faz
 *  aparecer um botão que abre o módulo de busca em livros do Cons-ia.org.
 *
 *  O que este módulo NÃO faz — de propósito:
 *   - não altera o systemPrompt, o payload de /api/llm nem a resposta da LLM;
 *   - não executa nada sozinho: quem clica é o usuário, sempre.
 *
 *  Apesar do nome, não é um "modo agente" no sentido de tool calling — a LLM
 *  não decide nem executa ferramenta alguma. É detecção de intenção por regra
 *  determinística no cliente, com sugestão de ação. Ver README do módulo.
 *
 *  DESLIGADO (0), o módulo é inerte: <AgentActions /> devolve null e nenhuma
 *  regra é avaliada.
 *
 *  Este valor é apenas o PADRÃO da sessão: com ACCESS_LEVEL=1 o menu de
 *  configuração expõe um interruptor que o sobrescreve em `ChatSettings.agentMode`
 *  enquanto a aba estiver aberta (as settings não são persistidas — ver
 *  chat-store.ts). Fora do admin vale sempre o padrão calculado aqui.
 *
 *  PRECEDÊNCIA:
 *   1. VITE_AGENT_MODE, quando definida, manda — inclusive para DESLIGAR no
 *      dev (VITE_AGENT_MODE=0) quando se quer conferir o comportamento normal.
 *   2. Sem essa variável, o dev (`npm run dev`) liga sozinho. `import.meta.env.DEV`
 *      é do Vite e vale só no dev server: nenhum build de produção entra aqui,
 *      nem rodando na mesma máquina, nem aberto pelo IP da LAN.
 *   3. Em build, vale AGENT_MODE_DEFAULT — troque para 1 para ligar em produção.
 */
// Anotado como `number` de propósito: sem isso o TS trava o literal em 0 e
// acusa a comparação `=== 1` como impossível quando você trocar o valor.
const AGENT_MODE_DEFAULT: number = 0;

const agentModeOverride = String(import.meta.env.VITE_AGENT_MODE ?? "").trim();

export const AGENT_MODE = agentModeOverride
  ? agentModeOverride === "1"
  : import.meta.env.DEV || AGENT_MODE_DEFAULT === 1;

/** Módulo externo de busca de palavra/termo em livros (página do Cons-ia.org).
 *
 * ATENÇÃO — contrato `?q=`: hoje essa página é uma SPA que ainda NÃO lê
 * parâmetros de URL; o termo entra só pelo campo de busca. O link abaixo já
 * envia `?q=<termo>` para que, quando o Cons-ia passar a ler o parâmetro, o
 * deep link funcione sem nenhuma alteração aqui. Enquanto isso não acontece,
 * o botão abre a página de busca normalmente e o usuário digita o termo.
 */
const DEFAULT_SEARCH_BOOK_URL = "https://cons-ia.org/index_search_book.html";

export const SEARCH_BOOK_URL = (
  String(import.meta.env.VITE_SEARCH_BOOK_URL || "").trim() || DEFAULT_SEARCH_BOOK_URL
).replace(/\?+$/, "");

/** Nome do parâmetro de busca esperado pelo Cons-ia.org. */
export const SEARCH_BOOK_PARAM = "q";

/** Como o módulo decide se uma pergunta merece ação sugerida.
 *
 * `rules`  — casamento de padrões em `rules.ts`. Roda no cliente, é síncrono,
 *            determinístico e de custo zero; erra por omissão quando o usuário
 *            formula o pedido de um jeito que nenhuma regra prevê.
 * `llm`    — uma chamada extra a /api/llm com JSON Schema (`classify.ts`).
 *            Pega paráfrase e ambiguidade, mas custa token e latência por
 *            pergunta, e é não-determinístico.
 */
export const AGENT_DETECTIONS = [
  {
    id: "rules",
    label: "Regras",
    description: "Determinístico no cliente.",
  },
  {
    id: "llm",
    label: "Classificador LLM",
    description: "Chamada extra por pergunta.",
  },
] as const;

export type AgentDetectionId = (typeof AGENT_DETECTIONS)[number]["id"];

export const AGENT_DETECTION_DEFAULT: AgentDetectionId = "rules";

/** Modelo da classificação: o mais barato/rápido do catálogo, já que a tarefa
 * é rotular uma frase curta, não redigir. Mesmo usado nas sugestões iniciais. */
export const AGENT_CLASSIFIER_MODEL = "gpt-5.6-luna";

/** Esforço de raciocínio da classificação: nenhum. Rotular uma frase curta com
 * dois valores possíveis não se beneficia de raciocínio, e cada passo a mais
 * atrasaria um botão que aparece ao lado de uma resposta já em andamento.
 * `id` vai na requisição; `label` é o que o painel de configuração mostra. */
export const AGENT_CLASSIFIER_REASONING = { id: "none", label: "None" } as const;

/** Instruções do classificador de intenção (modo `llm`).
 *
 * Ficam aqui, e não em `classify.ts`, porque o menu de configuração as exibe
 * em "Agent Prompt" e permite sobrescrevê-las na sessão — mesmo arranjo do
 * prompt de sistema. Com `ChatSettings.agentPrompt` vazio vale o padrão do
 * idioma da base ativa. */
export const AGENT_INSTRUCTIONS_PT = [
  "Você classifica a intenção de UMA pergunta feita a um assistente de Conscienciologia.",
  "Responda search_literal somente quando o usuário pede para ENCONTRAR uma palavra ou expressão literal nos textos — ou seja, quer saber onde ela aparece, em quais obras, ou ver as citações em que ocorre.",
  "Responda none quando o usuário quer o SIGNIFICADO, a explicação, a aplicação ou a discussão de um conceito, ainda que cite um termo técnico.",
  "Na dúvida, responda none: um botão indevido atrapalha mais do que a ausência dele.",
  "Em search_literal, term recebe apenas a palavra ou expressão procurada.",
].join("\n");

export const AGENT_INSTRUCTIONS_EN = [
  "You classify the intent of ONE question asked to a Conscientiology assistant.",
  "Answer search_literal only when the user asks to FIND a literal word or expression in the texts — where it appears, in which works, or to see the passages quoting it.",
  "Answer none when the user wants the MEANING, explanation, application or discussion of a concept, even if a technical term is mentioned.",
  "When in doubt answer none: an unwarranted button is worse than no button.",
  "For search_literal, term holds only the word or expression being looked for.",
].join("\n");

export function agentInstructionsFor(english: boolean) {
  return english ? AGENT_INSTRUCTIONS_EN : AGENT_INSTRUCTIONS_PT;
}
