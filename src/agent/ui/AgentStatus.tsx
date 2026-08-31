import { Bot } from "lucide-react";

import type { AgentSettings } from "@/agent/settings";

type Props = { settings: AgentSettings; isAdmin?: boolean; bypassed?: boolean };

/** Linha compacta e factual das condições usadas no turno. */
export function AgentStatus({ settings, isAdmin, bypassed = false }: Props) {
  if (!isAdmin || !settings.enabled) return null;
  return (
    <div className="mt-0.5 flex items-center justify-end gap-1 pr-1 text-[11px] leading-relaxed text-muted-foreground/55">
      <Bot className="size-3 shrink-0" aria-hidden="true" />
      <span>{bypassed ? "Agent Mode · não acionado (Recupera Corpus)" : "Agent Mode ● Luna · None"}</span>
    </div>
  );
}
