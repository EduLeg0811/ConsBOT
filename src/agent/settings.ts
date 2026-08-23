import {
  AGENT_DETECTION_DEFAULT,
  AGENT_LLM_MODE_DEFAULT,
  AGENT_MODE,
  type AgentDetectionId,
  type AgentLlmModeId,
} from "@/agent/config";

/** Preferências do módulo AGENT, guardadas pelo hospedeiro.
 *
 * O módulo é dono deste tipo de propósito: acrescentar uma preferência aqui
 * não obriga a tocar em nada do ConsBOT, que carrega isto como um bloco opaco
 * dentro das próprias settings. Foi a dependência invertida que a fase 1
 * desfez — antes o `chat-settings.ts` do núcleo conhecia campo por campo.
 */
export type AgentSettings = {
  /** Módulo ligado nesta sessão. Padrão em AGENT_MODE (ver config.ts). */
  enabled: boolean;
  /** Regras determinísticas no cliente ou classificação por LLM. */
  detection: AgentDetectionId;
  /** Instruções do classificador. Vazio = padrão do idioma da base ativa. */
  prompt: string;
  /** No modo `llm`, se o botão abre o módulo externo ou consulta a API. */
  action: AgentLlmModeId;
};

export const AGENT_SETTINGS_DEFAULT: AgentSettings = {
  enabled: AGENT_MODE,
  detection: AGENT_DETECTION_DEFAULT,
  prompt: "",
  action: AGENT_LLM_MODE_DEFAULT,
};
