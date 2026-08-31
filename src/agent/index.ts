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
 *   1. ChatWindow monta <AgentActions /> e <AgentStatus />;
 *   2. SettingsFields monta <AgentSettingsSection />;
 *   3. chat-settings.ts carrega `agent: AgentSettings`, um bloco opaco;
 *   4. ChatWindow chama triageAgent() antes de enviar: Luna decide uma das
 *      rotas fixas (direta, modelo principal ou corpus). Com o módulo
 *      desligado, devolve o caminho completo sem tocar na classificação.
 *
 *  Acrescentar capacidade ou preferência ao agente não deve tocar em nenhum
 *  dos quatro. Se tocar, a fronteira vazou.
 *
 *  O catálogo de intenções e as decisões de projeto vivem em
 *  docs/agent-rules.docx, que é a fonte de verdade — código e documento mudam
 *  juntos.
 */
export { AgentActions } from "@/agent/ui/AgentActions";
export { AgentStatus } from "@/agent/ui/AgentStatus";
export { triageAgent, type AgentTriage } from "@/agent/planner/triage";
export { AgentSettingsSection } from "@/agent/ui/AgentSettingsSection";
export { executeAgentAction } from "@/agent/tools/registry";
export { sourceListAnswer, sourceListErrorAnswer } from "@/agent/tools/list-sources";
export {
  AGENT_SETTINGS_DEFAULT,
  normalizeAgentSettings,
  type AgentPresentation,
  type AgentSettings,
} from "@/agent/settings";
export type { AgentEvent, AgentHost } from "@/agent/host";
export type { AgentAction, AgentPlanOrigin, AgentRoute } from "@/agent/types";
