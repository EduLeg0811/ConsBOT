import { Bot } from "lucide-react";

import { AGENT_DETECTIONS, AGENT_LLM_MODES } from "@/agent/config";
import type { AgentSettings } from "@/agent/settings";

type Props = { settings: AgentSettings };

/** Linha de parâmetros do módulo, ao lado do eco da pergunta.
 *
 * Fica junto do status do RAG porque responde à mesma pergunta: com que
 * configuração aquela mensagem foi processada. Some quando o módulo está
 * desligado — que é o estado em que ele não fez nada.
 *
 * A ação aparece mesmo sob a detecção por Regras, onde a preferência é
 * ignorada e o botão é sempre link: o que se mostra é o comportamento
 * efetivo daquela mensagem, não o valor guardado.
 */
export function AgentStatus({ settings }: Props) {
  if (!settings.enabled) return null;

  const detection = AGENT_DETECTIONS.find((mode) => mode.id === settings.detection);
  const action = AGENT_LLM_MODES.find(
    (mode) => mode.id === (settings.detection === "llm" ? settings.action : "link"),
  );

  return (
    <div className="mt-0.5 flex items-center justify-end gap-1 pr-1 text-[11px] leading-relaxed text-muted-foreground/55">
      <Bot className="size-3 shrink-0" aria-hidden="true" />
      <span>
        Agent Mode: {detection?.label ?? settings.detection}
        {action ? ` ● ${action.label}` : ""}
      </span>
    </div>
  );
}
