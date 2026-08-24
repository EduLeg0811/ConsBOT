import { Bot } from "lucide-react";

import type { AgentSettings } from "@/agent/settings";

type Props = { settings: AgentSettings; isAdmin?: boolean };

const STATUS_DETECTION_LABELS: Record<string, string> = {
  rules: "Rules",
  llm: "LLM",
};

const STATUS_ACTION_LABELS: Record<string, string> = {
  link: "Open",
  api: "Card",
  context: "Appended",
};

/** Linha de parâmetros do módulo, ao lado do eco da pergunta.
 *
 * Fica junto do status do RAG porque responde à mesma pergunta: com que
 * configuração aquela mensagem foi processada. Visível apenas no modo ADMIN
 * (ACCESS_LEVEL = 1) e quando o módulo está ligado.
 */
export function AgentStatus({ settings, isAdmin }: Props) {
  if (!isAdmin || !settings.enabled) return null;

  const detectionLabel = STATUS_DETECTION_LABELS[settings.detection] ?? settings.detection;
  const effectiveAction = settings.detection === "llm" ? settings.action : "link";
  const actionLabel = STATUS_ACTION_LABELS[effectiveAction] ?? effectiveAction;

  return (
    <div className="mt-0.5 flex items-center justify-end gap-1 pr-1 text-[11px] leading-relaxed text-muted-foreground/55">
      <Bot className="size-3 shrink-0" aria-hidden="true" />
      <span>{["Agent Mode", detectionLabel, actionLabel].filter(Boolean).join(" ● ")}</span>
    </div>
  );
}
