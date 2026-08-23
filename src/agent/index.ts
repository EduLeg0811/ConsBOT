/** Módulo AGENT — ações sugeridas ao lado da resposta do ConsBOT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  ESTE ARQUIVO É A ÚNICA SUPERFÍCIE PÚBLICA DO MÓDULO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  O hospedeiro importa daqui e de mais lugar nenhum — o lint recusa
 *  `@/agent/qualquer-coisa`. Em troca, nada aqui dentro importa de `@/lib`,
 *  `@/components` ou `@/pages`: o que o módulo precisa do aplicativo entra
 *  pelo `AgentHost`.
 *
 *  São quatro pontos de contato no ConsBOT, um por export:
 *   1. ChatWindow monta <AgentActions />;
 *   2. SettingsFields monta <AgentSettingsSection />;
 *   3. chat-settings.ts carrega `agent: AgentSettings`, um bloco opaco;
 *   4. ChatWindow chama prepareAgentContext() antes de enviar, e anexa o que
 *      voltar ao systemPrompt — só o modo «Alimentar resposta» devolve algo.
 *
 *  Acrescentar capacidade ou preferência ao agente não deve tocar em nenhum
 *  dos quatro. Se tocar, a fronteira vazou.
 *
 *  O catálogo de intenções e as decisões de projeto vivem em
 *  docs/agent-rules.docx, que é a fonte de verdade — código e documento mudam
 *  juntos.
 */
export { AgentActions } from "@/agent/ui/AgentActions";
export { prepareAgentContext } from "@/agent/planner/context";
export { AgentSettingsSection } from "@/agent/ui/AgentSettingsSection";
export { AGENT_SETTINGS_DEFAULT, type AgentSettings } from "@/agent/settings";
export type { AgentEvent, AgentHost } from "@/agent/host";
