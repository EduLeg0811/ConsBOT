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
 *   3. Em build, vale AGENT_MODE_DEFAULT, hoje 1: o módulo vai ligado para
 *      produção. Troque para 0 para desligá-lo em todos os builds de uma vez.
 */
// Anotado como `number` de propósito: sem isso o TS trava o literal e acusa a
// comparação `=== 1` como impossível quando o valor mudar.
const AGENT_MODE_DEFAULT: number;

const agentModeOverride = String(import.meta.env.VITE_AGENT_MODE ?? "").trim();

export const AGENT_MODE = agentModeOverride
  ? agentModeOverride === "1"
  : import.meta.env.DEV || AGENT_MODE_DEFAULT === 1;

/** Catálogo de intenções. A ordem importa: é a ordem de avaliação das regras
 * e, em caso de empate, a ordem em que os botões aparecem.
 *
 * Especificado em docs/agent-rules.docx — este arquivo é a tradução daquele
 * documento para código, e os dois devem ser alterados juntos. */
export const AGENT_INTENTS = [
  "search_book",
  "search_verbete",
  "bibliografia_livros",
  "consulta_dicionarios",
] as const;

export type AgentIntentId = (typeof AGENT_INTENTS)[number];

/** Módulos externos de destino, um por intenção.
 *
 * ATENÇÃO — contrato `?q=`: NENHUMA destas páginas lê parâmetro de URL hoje.
 * Todas são SPAs cujo termo entra pelo campo de busca; foi verificado nos
 * bundles das três. Os links abaixo já enviam `?q=<termo>` para que o deep
 * link passe a funcionar assim que cada página passar a ler o parâmetro, sem
 * alteração nenhuma aqui. Enquanto isso, o botão abre a página e o usuário
 * digita o termo. */
const stripQuery = (url: string) => url.replace(/[?&]+$/, "");

export const AGENT_TARGETS: Record<AgentIntentId, string> = {
  search_book: stripQuery(
    String(import.meta.env.VITE_SEARCH_BOOK_URL || "").trim() ||
    "https://cons-ia.org/index_search_book.html",
  ),
  search_verbete: stripQuery(
    String(import.meta.env.VITE_SEARCH_VERBETE_URL || "").trim() ||
    "https://cons-ia.org/index_search_verb.html",
  ),
  bibliografia_livros: stripQuery(
    String(import.meta.env.VITE_BIBLIOGRAPHY_URL || "").trim() ||
    "https://cons-ia.org/index_biblio_wv.html",
  ),
  consulta_dicionarios: stripQuery(
    String(import.meta.env.VITE_LEXICONS_URL || "").trim() || "https://lexicons.cons-ia.org/",
  ),
};

/** Campos pelos quais a busca em verbetes pode ser feita.
 *
 * Existe porque o endpoint `/api/lexical/verbetes/search` do Main-Server aceita
 * autor, título e especialidade separados — coisa que a página web não faz.
 * Vale, portanto, apenas no modo «Buscar aqui»; no modo link o campo é
 * ignorado, já que a URL só leva o termo. `""` = busca no texto (Definologia),
 * que é o padrão e o único caminho das demais intenções. */
export const AGENT_VERBETE_FIELDS = ["", "titulo", "autor", "especialidade"] as const;

export type AgentVerbeteField = (typeof AGENT_VERBETE_FIELDS)[number];

/** Nome do parâmetro de busca, igual nos três destinos. */
export const AGENT_SEARCH_PARAM = "q";

/** Como o módulo decide se uma pergunta merece ação sugerida.
 *
 * `rules`  — casamento de padrões em `rules.ts`. Roda no cliente, é síncrono,
 *            determinístico e de custo zero; erra por omissão quando o usuário
 *            formula o pedido de um jeito que nenhuma regra prevê, e não
 *            alcança intenções que dependem de julgamento (ver
 *            consulta_dicionarios, que só existe no modo `llm`).
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

/** Padrão da sessão. O classificador é o caminho principal: alcança as quatro
 * ferramentas, entende paráfrase e corrige grafia. As regras ficam como plano
 * B, para quando o Main-Server estiver fora. */
export const AGENT_DETECTION_DEFAULT: AgentDetectionId = "llm";

/** Modelo da classificação: o mais barato/rápido do catálogo, já que a tarefa
 * é rotular uma frase curta, não redigir. Mesmo usado nas sugestões iniciais. */
export const AGENT_CLASSIFIER_MODEL = "gpt-5.6-luna";

/** Esforço de raciocínio da classificação: nenhum. Rotular uma frase curta não
 * se beneficia de raciocínio, e cada passo a mais atrasaria um botão que
 * aparece ao lado de uma resposta já em andamento.
 * `id` vai na requisição; `label` é o que o painel de configuração mostra. */
export const AGENT_CLASSIFIER_REASONING = { id: "none", label: "None" } as const;

/** No modo Classificador LLM, o que o botão faz.
 *
 * `link` — PADRÃO. Abre o módulo externo em nova aba, levando o termo na URL.
 *          Não consulta nada: o custo é zero e o usuário decide para onde vai.
 * `api`  — Consulta o endpoint correspondente do Main-Server e mostra o
 *          resultado num card dentro da própria conversa, com um link discreto
 *          para o módulo completo. A consulta só acontece no clique.
 *
 * Vale apenas para a detecção `llm`; em `rules` o botão é sempre link. */
export const AGENT_LLM_MODES = [
  {
    id: "link",
    label: "Abrir módulo",
    description: "Nova aba, com o termo na URL.",
  },
  {
    id: "api",
    label: "Busca Integrada",
    description: "Consulta a API e mostra num card.",
  },
  {
    id: "context",
    label: "Alimentar LLM",
    description: "Busca antes e entrega à LLM.",
  },
] as const;

export type AgentLlmModeId = (typeof AGENT_LLM_MODES)[number]["id"];

export const AGENT_LLM_MODE_DEFAULT: AgentLlmModeId = "link";

/** Quantos resultados pedir ao Main-Server e quantos mostrar antes do
 * «ver mais». Buscar mais do que se mostra é o que permite expandir sem uma
 * segunda ida à rede. */
/** Quem responde a mensagem — a decisão de porteiro da triagem.
 *
 * `direct`: a própria triagem responde, em `answer`. Só vale quando a
 *           resposta não depende do corpus: saudação, meta-pergunta, ou
 *           pedido de busca — nesse caso a busca É a resposta, e `answer` é
 *           só a frase de contexto que acompanha o pill.
 * `full`:   o modelo completo responde, com acesso às fontes. É o padrão e
 *           o destino de tudo que precise ser escrito ou consultado.
 *
 * O viés é deliberadamente conservador: gastar uma chamada à toa é barato,
 * engolir uma pergunta que merecia resposta é caro. */
export const AGENT_ANSWER_MODES = ["direct", "full"] as const;

export type AgentAnswerMode = (typeof AGENT_ANSWER_MODES)[number];

/** Teto da frase que acompanha o pill. Duas frases, não um parágrafo: quem
 * pediu busca quer a busca, não texto. */
export const AGENT_ANSWER_MAX = 320;

/** Como o planejador quer que o resultado chegue ao usuário. Só é consultado
 * no modo «Alimentar resposta»; nos outros dois quem decide é o modo. */
export const AGENT_DELIVERIES = ["card", "context", "both"] as const;

export type AgentDelivery = (typeof AGENT_DELIVERIES)[number];

/** Quantos resultados de cada ferramenta entram no prompt da resposta. Menos
 * que no card: aqui cada item custa token em toda pergunta que buscar. */
export const AGENT_CONTEXT_ITEMS = 6;

export const AGENT_SEARCH_LIMIT = 12;
export const AGENT_CARD_PREVIEW = 5;

/** Obras pesquisáveis pelo `search_book`, com os apelidos que as pessoas usam.
 *
 * Os ids são os do Main-Server (`GET /api/lexical/sources`) e vão em `sources`
 * na consulta. `aliases` são minúsculos e sem acento — a detecção normaliza o
 * texto antes de comparar; `sigla` casa só em maiúsculas, para «LO» não pegar
 * o «lo» de qualquer palavra.
 *
 * A Enciclopédia (EC) está de fora de propósito: é o corpus dos VERBETES, e
 * quem a menciona cai em `search_verbete`, não aqui.
 *
 * Apelidos que também são termos de busca ficaram de fora — «proéxis» e
 * «tenepes» sozinhos são conceito, não livro; só «manual da proéxis» e
 * «manual da tenepes» identificam a obra. */
export const AGENT_BOOKS = [
  {
    id: "TEAT",
    label: "200 Teáticas da Conscienciologia",
    sigla: "TEAT",
    aliases: ["200 teaticas da conscienciologia", "200 teaticas"],
  },
  {
    id: "EXP",
    label: "700 Experimentos da Conscienciologia",
    sigla: "EXP",
    aliases: ["700 experimentos da conscienciologia", "700 experimentos"],
  },
  { id: "CCG", label: "Conscienciograma", sigla: "CCG", aliases: ["conscienciograma"] },
  {
    id: "DAC",
    label: "Dicionário de Argumentos da Conscienciologia",
    sigla: "DAC",
    aliases: ["dicionario de argumentos da conscienciologia", "dicionario de argumentos"],
  },
  { id: "HSP", label: "Homo sapiens pacificus", sigla: "HSP", aliases: ["homo sapiens pacificus"] },
  {
    id: "HSR",
    label: "Homo sapiens reurbanisatus",
    sigla: "HSR",
    aliases: ["homo sapiens reurbanisatus"],
  },
  {
    id: "LO",
    label: "Léxico de Ortopensatas",
    sigla: "LO",
    aliases: ["lexico de ortopensatas", "lexico"],
  },
  {
    id: "MDE",
    label: "Manual da Dupla Evolutiva",
    sigla: "MDE",
    aliases: ["manual da dupla evolutiva", "dupla evolutiva"],
  },
  { id: "MP", label: "Manual da Proéxis", sigla: "MP", aliases: ["manual da proexis"] },
  { id: "TNP", label: "Manual da Tenepes", sigla: "TNP", aliases: ["manual da tenepes"] },
  {
    id: "MINI_ARLINDO",
    label: "Minitertúlia — Arlindo",
    sigla: "",
    aliases: ["minitertulia arlindo", "minitertulia"],
  },
  {
    id: "PROJ1986",
    label: "Projeciologia (1986)",
    sigla: "",
    aliases: ["projeciologia 1986", "projeciologia (1986)"],
  },
  { id: "PROJ", label: "Projeciologia", sigla: "PROJ", aliases: ["projeciologia"] },
  { id: "QUEST", label: "Questões Mini", sigla: "QUEST", aliases: ["questoes mini"] },
  {
    id: "TC",
    label: "Temas da Conscienciologia",
    sigla: "TC",
    aliases: ["temas da conscienciologia"],
  },
  { id: "ZEFIRO", label: "Zéfiro", sigla: "ZEFIRO", aliases: ["zefiro"] },
] as const;

export type AgentBookId = (typeof AGENT_BOOKS)[number]["id"];

export const AGENT_BOOK_IDS: readonly string[] = AGENT_BOOKS.map((book) => book.id);

export function agentBookLabel(id: string | undefined): string {
  return AGENT_BOOKS.find((book) => book.id === id)?.label ?? "";
}
