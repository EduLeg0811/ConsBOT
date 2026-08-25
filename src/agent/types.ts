import type {
  AgentAnswerMode,
  AgentDelivery,
  AgentIntentId,
  AgentVerbeteField,
} from "@/agent/config";
import type { AgentHost } from "@/agent/host";
import type { AgentSettings } from "@/agent/settings";

export type { AgentAnswerMode, AgentDelivery, AgentIntentId, AgentVerbeteField };

/** Tipos de ação que o módulo sabe oferecer.
 *
 * Só existe `open-url` por enquanto: abrir um módulo externo em nova aba.
 * Novos tipos (rota interna, diálogo, download) entram aqui quando houver
 * uma intenção real que precise deles — não antes.
 */
export type AgentActionKind = "open-url";

/** Uma ação já pronta para virar botão: rótulo e destino resolvidos. */
export type AgentAction = {
  /** Igual ao id da intenção; usado como key na lista e no log de uso. */
  id: AgentIntentId;
  kind: AgentActionKind;
  label: string;
  title?: string;
  href: string;
  /** Dados da detecção (ex.: `{ term: "consciex" }`), enviados na telemetria. */
  meta?: Record<string, string>;
};

/** O que a detecção produz, antes de virar botão. Regras e classificador LLM
 * devolvem isto — é o ponto em que os dois modos se encontram. */
export type AgentMatch = {
  intent: AgentIntentId;
  /** Vazio quando a intenção não precisa de termo (ver `termRequired` em AgentTool). */
  term: string;
  /** Só para `search_verbete`, e só no modo «Busca Integrada» — ver AGENT_VERBETE_FIELDS. */
  field?: AgentVerbeteField;
  /** Só para `search_book`: id da obra quando o usuário nomeia uma. Vazio busca
   * em todas. Ver AGENT_BOOKS. */
  book?: string;
};

/** Uma linha do card: de onde veio e o trecho que casou. */
export type AgentCardItem = { source: string; snippet: string };

/** Resultado normalizado de uma consulta ao Main-Server (modo `api`).
 * Os quatro endpoints têm formas diferentes; `search.ts` os reduz a isto. */
export type AgentCard = {
  intent: AgentIntentId;
  term: string;
  /** Total no corpus quando o endpoint informa; senão, o tamanho de `items`. */
  total: number;
  /** `total` é um piso, não a contagem exata: o lote veio cheio e o endpoint
   * não informa quantos existem além dele. O card mostra «12+» em vez de «12»,
   * que era o número que enganava — o mesmo rótulo significava coisas
   * diferentes em `search_book` (tamanho do lote) e em `search_verbete`
   * (`totalFound` de verdade). */
  saturated: boolean;
  items: AgentCardItem[];
};

/** Tudo que uma regra pode inspecionar para decidir se dispara. */
export type AgentContext = {
  /** Texto da última mensagem do usuário — o gatilho principal. */
  userText: string;
  /** Texto da última resposta do assistente, quando já houver. */
  assistantText?: string;
  settings: AgentSettings;
  host: AgentHost;
  threadId: string;
};

/** Mensagem da conversa, na forma mínima de que o módulo precisa.
 *
 * Deliberadamente frouxo: o `UIMessage` do Vercel AI SDK, que o ConsBOT usa,
 * é atribuível a isto sem conversão — o hospedeiro passa `messages` direto,
 * e o módulo não precisa conhecer o tipo dele. */
export type AgentMessage = {
  id: string;
  role: string;
  parts: Array<{ type: string; text?: string }>;
};

/** Uma capacidade do agente, descrita num arquivo só.
 *
 * É o contrato que a fase 2 introduziu para acabar com a dispersão: antes,
 * acrescentar uma capacidade exigia mexer no enum do classificador, nas
 * instruções, no construtor de rótulo e no fetcher — quatro arquivos que
 * precisavam concordar. Agora é um arquivo em `tools/`, e o registro cuida do
 * resto: o prompt do planejador e o JSON Schema são GERADOS daqui.
 */
export type AgentTool = {
  name: AgentIntentId;

  /** Bloco desta ferramenta no prompt do planejador — o «dispara quando», o
   * «não dispara quando» e o que vai em cada parâmetro. Recebe o idioma da
   * base ativa. Ver a ficha correspondente em docs/agent-rules.docx. */
  describe: (english: boolean) => string;

  /** Parâmetros ALÉM de `term`, como propriedades de JSON Schema. Entram no
   * schema do planejador; o modo estrito exige que todos sejam obrigatórios,
   * então cada um precisa aceitar string vazia como «não se aplica». */
  parameters?: Record<string, unknown>;

  /** Sem termo o botão não faz sentido e não aparece. `bibliografia_livros` é
   * a exceção: sem título, abre a bibliografia completa. */
  termRequired: boolean;

  /** Detecção determinística — o plano B do modo `rules`. Ausente quando a
   * intenção depende de julgamento (ver `consulta_dicionarios`). */
  rule?: (ctx: AgentContext) => AgentMatch | null;

  /** O botão: rótulo e destino externo. */
  toAction: (match: AgentMatch, ctx: AgentContext) => AgentAction;

  /** A consulta ao Main-Server, no modo «Busca Integrada». */
  execute: (match: AgentMatch, ctx: AgentContext, signal?: AbortSignal) => Promise<AgentCard>;
};

/** O que o planejador devolve: as ações e como ele quer entregá-las.
 *
 * `delivery` só é consultado no modo «Alimentar LLM»; nos modos «Abrir
 * módulo» e «Busca Integrada» quem decide a entrega é o modo, e o campo é
 * ignorado. Ver AGENT_DELIVERIES em config.ts. */
export type AgentPlan = {
  actions: AgentAction[];
  delivery: AgentDelivery;
  /** Quem responde: a própria triagem ou o modelo completo. */
  answerMode: AgentAnswerMode;
  /** A resposta curta, quando `answerMode` é `direct`. Vazia em `full`. */
  answer: string;
};
