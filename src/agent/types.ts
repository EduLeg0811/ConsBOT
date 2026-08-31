import type { AgentIntentId, AgentVerbeteField } from "@/agent/config";
import type { AgentHost } from "@/agent/host";
import type { AgentSettings } from "@/agent/settings";

export type { AgentIntentId, AgentVerbeteField };

/** Decisão exclusiva do classificador para o turno. */
export type AgentRoute = "direct" | "full" | "corpus" | "clarify";
export type AgentPlanOrigin = "luna" | "fallback" | "bypass";

/** Tipos de ação que o módulo sabe oferecer.
 *
 * `open-url` vira pill para um módulo externo; `inline-result` é resolvido
 * dentro da própria resposta do ConsBOT, sem card nem botão adicional.
 */
export type AgentActionKind = "open-url" | "inline-result";

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

/** O que o classificador devolve antes de virar botão. */
export type AgentMatch = {
  intent: AgentIntentId;
  /** Vazio quando a intenção não precisa de termo (ver `termRequired` em AgentTool). */
  term: string;
  /** Só para `search_verbete` — ver AGENT_VERBETE_FIELDS. */
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

/** Contexto mínimo que o classificador e o card interno podem consultar. */
export type AgentContext = {
  /** Texto da última mensagem do usuário — o gatilho principal. */
  userText: string;
  /** Texto da última resposta do assistente, quando já houver. */
  assistantText?: string;
  /** Pergunta anterior, para referências curtas como “e no LO?”. */
  previousUserText?: string;
  /** Fontes semânticas realmente selecionadas; evita prometer corpus vazio. */
  semanticSourceIds?: string[];
  /** File Search está disponível para a resposta principal deste turno. */
  hasFileSearch?: boolean;
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
  metadata?: unknown;
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

  /** Padrão local reservado a integrações legadas; o Agent atual sempre usa Luna. */
  rule?: (ctx: AgentContext) => AgentMatch | null;

  /** Ação já pronta para o destino externo ou a resposta interna. */
  toAction: (match: AgentMatch, ctx: AgentContext) => AgentAction;

  /** Consulta que alimenta uma ação interna, quando houver. */
  execute: (match: AgentMatch, ctx: AgentContext, signal?: AbortSignal) => Promise<AgentCard>;
};

/** O plano persistível de um turno do Agent. */
export type AgentPlan = {
  actions: AgentAction[];
  route: AgentRoute;
  /** A resposta curta em `direct` ou a orientação de `corpus`. */
  answer: string;
  /** Estimativa normalizada do roteador. */
  confidence: number;
  /** Rótulo curto, auditável, sem expor cadeia de raciocínio. */
  reason: string;
  /** Origem efetiva: Luna, fallback seguro ou bypass. */
  origin: AgentPlanOrigin;
  /** Rota antes das proteções locais, quando ela foi ajustada. */
  proposedRoute?: AgentRoute;
  /** Duração do roteamento Luna; ausente para fallback local/bypass. */
  durationMs?: number;
  /** JSON devolvido pelo classificador Luna, para diagnóstico do turno ADMIN. */
  classifierResponse?: string;
};
