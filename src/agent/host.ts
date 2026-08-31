/** O que o módulo AGENT precisa do aplicativo que o hospeda.
 *
 * Tudo que vinha de `@/lib/*` — a base da API, o idioma da base ativa, a
 * telemetria — entra por aqui, injetado uma vez. É o que permite ao módulo
 * não importar nada do ConsBOT: a fronteira é verificada por lint, mas quem a
 * torna possível é este contrato.
 *
 * Mantê-lo pequeno é a regra. Cada campo novo é uma amarra a mais com o
 * hospedeiro, e o dia em que este módulo virar pacote compartilhado, é este
 * tipo que os outros frontends terão de implementar.
 */
export type AgentHost = {
  /** Base do Main-Server, sem barra final. */
  apiBase: string;
  /** Base ativa é em inglês — decide o idioma de rótulos e instruções. */
  english: boolean;
  /** Vector Store ativo no ConsBOT; usado por ações que refletem a aba Fontes. */
  vectorStoreId: string;
  /**
   * Leitura compartilhada da base File Search ativa. O hospedeiro a conecta
   * ao mesmo cache do menu Fontes; integrações legadas podem omiti-la e a
   * ferramenta consulta o endpoint diretamente como último recurso.
   */
  loadActiveSourceFiles?: () => Promise<AgentSourceFilesResponse>;
  /** Registra uso. Sem operação é aceitável: telemetria nunca é essencial. */
  logEvent: (event: AgentEvent) => void;
};

export type AgentSourceFilesResponse = {
  totalFiles: number;
  truncated: boolean;
  files: Array<{ filename: string; status?: string }>;
};

/** Um clique numa ação sugerida. `via` distingue abrir o módulo externo
 * (`link`), consultar a API (`api`) e o link do rodapé do card. */
export type AgentEvent = {
  intent: string;
  via: "link" | "api" | "card-footer";
  detection: string;
  meta?: Record<string, string>;
};
