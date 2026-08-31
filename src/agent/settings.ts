import { AGENT_MODE } from "@/agent/config";

export type AgentPresentation = "citations" | "classic";

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
  /** Instruções do classificador. Vazio = padrão do idioma da base ativa. */
  prompt: string;
  /** Define se Luna pode recuperar corpus ou apenas oferecer direcionamentos. */
  presentation: AgentPresentation;
};

export const AGENT_SETTINGS_DEFAULT: AgentSettings = {
  enabled: AGENT_MODE,
  prompt: "",
  presentation: "classic",
};

/** Compatibilidade com preferências salvas antes da apresentação ser configurável. */
export function normalizeAgentSettings(
  value: Partial<AgentSettings> | null | undefined,
): AgentSettings {
  return {
    enabled: typeof value?.enabled === "boolean" ? value.enabled : AGENT_SETTINGS_DEFAULT.enabled,
    prompt: typeof value?.prompt === "string" ? value.prompt : "",
    presentation: value?.presentation === "classic" ? "classic" : "citations",
  };
}
