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
 *   4. ChatWindow chama triageAgent() antes de enviar: ela decide se a
 *      mensagem vai ao modelo completo, e devolve o bloco de contexto quando
 *      houver. Com o módulo desligado, devolve bypass sem tocar em rede.
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
export { AGENT_SETTINGS_DEFAULT, type AgentSettings } from "@/agent/settings";
export type { AgentEvent, AgentHost } from "@/agent/host";
