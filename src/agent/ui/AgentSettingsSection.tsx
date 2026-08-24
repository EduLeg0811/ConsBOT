import { useState } from "react";
import { ChevronRight } from "lucide-react";

import {
  AGENT_CLASSIFIER_MODEL,
  AGENT_CLASSIFIER_REASONING,
  AGENT_DETECTIONS,
  AGENT_FULL_ANSWER_DEFAULT,
  AGENT_FULL_ANSWER_MODES,
  AGENT_LLM_MODES,
  type AgentDetectionId,
  type AgentFullAnswerModeId,
  type AgentLlmModeId,
} from "@/agent/config";
import { agentInstructionsFor } from "@/agent/planner/prompt";
import type { AgentSettings } from "@/agent/settings";

type Props = {
  value: AgentSettings;
  onChange: (next: AgentSettings) => void;
  /** O painel inteiro é de admin; fora dele o módulo usa os padrões. */
  isAdmin: boolean;
  /** Base ativa é em inglês — decide o idioma do Agent Prompt exibido. */
  english: boolean;
};

/** Bloco do módulo AGENT dentro do menu de configuração do hospedeiro.
 *
 * Mora aqui, e não no painel do ConsBOT, porque preferência nova do agente é
 * assunto do agente: o hospedeiro monta este componente e não sabe quantos
 * controles existem dentro dele.
 *
 * O separador acima faz parte do bloco de propósito — é ele que marca onde a
 * configuração geral termina e a do módulo começa.
 */
export function AgentSettingsSection({ value, onChange, isAdmin, english }: Props) {
  const [promptOpen, setPromptOpen] = useState(false);

  if (!isAdmin) return null;

  const set = (patch: Partial<AgentSettings>) => onChange({ ...value, ...patch });
  const optionClass = (selected: boolean) =>
    selected
      ? "rounded-lg border border-chart-2 bg-chart-2/15 px-3 py-2 text-left shadow-[0_2px_8px_-5px_oklch(0.45_0.07_215/0.35)] disabled:opacity-50"
      : "rounded-lg border border-border bg-card/90 px-3 py-2 text-left transition-colors hover:bg-chart-2/8 disabled:opacity-50";

  return (
    <>
      <div className="h-[1px] w-full shrink-0 bg-border" />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm font-medium leading-none" htmlFor="agent-mode">
            Modo Agente
          </label>
          <button
            id="agent-mode"
            type="button"
            role="switch"
            aria-checked={value.enabled}
            data-state={value.enabled ? "checked" : "unchecked"}
            onClick={() => set({ enabled: !value.enabled })}
            className="peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors data-[state=checked]:bg-chart-2 data-[state=unchecked]:bg-input"
          >
            <span
              data-state={value.enabled ? "checked" : "unchecked"}
              className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
            />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium leading-none">Detecção da intenção</label>
        <div className="grid grid-cols-2 gap-2">
          {AGENT_DETECTIONS.map((mode) => (
            <button
              className={optionClass(value.detection === mode.id)}
              key={mode.id}
              type="button"
              disabled={!value.enabled}
              onClick={() => set({ detection: mode.id as AgentDetectionId })}
            >
              <span className="block text-xs font-medium">{mode.label}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                {mode.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Só faz sentido sob o classificador: em Regras o botão é sempre link.
          Some do painel quando a detecção volta para Regras. */}
      {value.detection === "llm" ? (
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">Ação do botão</label>
          <div className="grid grid-cols-2 gap-2">
            {AGENT_LLM_MODES.map((mode) => (
              <button
                className={optionClass(value.action === mode.id)}
                key={mode.id}
                type="button"
                disabled={!value.enabled}
                onClick={() => set({ action: mode.id as AgentLlmModeId })}
              >
                <span className="block text-xs font-medium">{mode.label}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  {mode.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Resposta Completa: automática (chama modelo completo de imediato) ou via pill (resposta curta + botão). */}
      {value.detection === "llm" ? (
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">Resposta da LLM</label>
          <div className="grid grid-cols-2 gap-2">
            {AGENT_FULL_ANSWER_MODES.map((mode) => (
              <button
                className={optionClass((value.fullAnswer ?? AGENT_FULL_ANSWER_DEFAULT) === mode.id)}
                key={mode.id}
                type="button"
                disabled={!value.enabled}
                onClick={() => set({ fullAnswer: mode.id as AgentFullAnswerModeId })}
              >
                <span className="block text-xs font-medium">{mode.label}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  {mode.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Recolhido por padrão: interessa só a quem for calibrar a detecção, e
          um segundo textarea aberto competiria com o prompt de sistema. */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setPromptOpen((open) => !open)}
          className="flex w-full items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronRight
            className={`size-3 transition-transform ${promptOpen ? "rotate-90" : ""}`}
            aria-hidden="true"
          />
          Agent Prompt
        </button>

        {promptOpen ? (
          <div className="space-y-2 pt-1">
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-input bg-card/90 px-3 py-2 text-[11px] leading-relaxed shadow-[0_2px_8px_-5px_oklch(0.45_0.07_215/0.35)] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={value.prompt || agentInstructionsFor(english)}
              rows={6}
              disabled={!value.enabled || value.detection !== "llm"}
              onChange={(event) => set({ prompt: event.target.value })}
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {["Classificador LLM", AGENT_CLASSIFIER_MODEL, AGENT_CLASSIFIER_REASONING.label].join(
                "  ●  ",
              )}
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}
