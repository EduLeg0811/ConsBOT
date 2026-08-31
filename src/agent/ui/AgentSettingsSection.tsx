import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { AGENT_CLASSIFIER_MODEL, AGENT_CLASSIFIER_REASONING } from "@/agent/config";
import { agentInstructionsFor } from "@/agent/planner/prompt";
import type { AgentSettings } from "@/agent/settings";

type Props = {
  value: AgentSettings;
  onChange: (next: AgentSettings) => void;
  isAdmin: boolean;
  english: boolean;
};

/** O modo já é escolhido na recuperação documental; aqui só se calibra Luna. */
export function AgentSettingsSection({ value, onChange, isAdmin, english }: Props) {
  const [promptOpen, setPromptOpen] = useState(false);
  if (!isAdmin) return null;

  const set = (patch: Partial<AgentSettings>) => onChange({ ...value, ...patch });

  return (
    <section className="space-y-2 rounded-xl border border-chart-2/20 bg-chart-2/5 p-3">
      <button
        type="button"
        onClick={() => setPromptOpen((open) => !open)}
        className="flex w-full items-center gap-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight
          className={`size-3 shrink-0 transition-transform ${promptOpen ? "rotate-90" : ""}`}
          aria-hidden="true"
        />
        <span className="font-medium text-foreground">Prompt avançado do Agent</span>
        <span className="ml-auto text-[10px] text-muted-foreground/70">
          {AGENT_CLASSIFIER_MODEL} · {AGENT_CLASSIFIER_REASONING.label}
        </span>
      </button>
      <p className="pl-[18px] text-[10px] leading-relaxed text-muted-foreground">
        Ajusta somente a calibração de Luna; os fluxos do Agent permanecem fixos.
      </p>

      {promptOpen ? (
        <textarea
          className="flex min-h-[96px] w-full rounded-lg border border-input bg-card px-3 py-2 text-[11px] leading-relaxed shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={value.prompt || agentInstructionsFor(english)}
          rows={8}
          onChange={(event) => set({ prompt: event.target.value })}
        />
      ) : null}
    </section>
  );
}
