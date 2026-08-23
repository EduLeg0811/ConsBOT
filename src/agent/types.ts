import type { ChatSettings } from "@/lib/chat-settings";

/** Tipos de ação que o módulo sabe oferecer.
 *
 * Só existe `open-url` por enquanto: abrir um módulo externo em nova aba.
 * Novos tipos (rota interna, diálogo, download) entram aqui quando houver
 * uma regra real que precise deles — não antes.
 */
export type AgentActionKind = "open-url";

/** Uma ação já pronta para virar botão: rótulo e destino resolvidos. */
export type AgentAction = {
  /** Igual ao id da regra que a produziu; usado como key e no log de uso. */
  id: string;
  kind: AgentActionKind;
  label: string;
  title?: string;
  href: string;
  /** Capturas da regra (ex.: `{ term: "consciex" }`), enviadas na telemetria. */
  meta?: Record<string, string>;
};

/** Tudo que uma regra pode inspecionar para decidir se dispara. */
export type AgentContext = {
  /** Texto da última mensagem do usuário — o gatilho principal. */
  userText: string;
  /** Texto da última resposta do assistente, quando já houver. */
  assistantText?: string;
  settings: ChatSettings;
  threadId: string;
};

/** Uma regra = reconhecer (`match`) + descrever a ação (`build`).
 *
 * `match` devolve null quando não dispara, ou um objeto de capturas que o
 * `build` usa para montar o rótulo e o destino. Manter as duas coisas
 * separadas é o que permite testar a detecção sem tocar em UI.
 */
export type AgentRule = {
  id: string;
  match: (ctx: AgentContext) => Record<string, string> | null;
  build: (captures: Record<string, string>, ctx: AgentContext) => AgentAction | null;
};
