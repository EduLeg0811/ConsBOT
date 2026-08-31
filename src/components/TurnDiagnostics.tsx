import { Bot, ChevronRight, SlidersHorizontal } from "lucide-react";

import type {
  AgentClassifierTrace,
  ConsBotMessageMetadata,
  TurnConfigSnapshot,
} from "@/lib/audit-log";

function metadataValue<T extends keyof ConsBotMessageMetadata>(
  metadata: unknown,
  key: T,
): ConsBotMessageMetadata[T] | undefined {
  if (!metadata || typeof metadata !== "object" || !(key in metadata)) return undefined;
  return (metadata as ConsBotMessageMetadata)[key];
}

function turnConfigFromMetadata(metadata: unknown): TurnConfigSnapshot | null {
  const value = metadataValue(metadata, "turnConfig");
  if (!value || typeof value !== "object") return null;
  const snapshot = value as TurnConfigSnapshot;
  if (!snapshot.model || !snapshot.profile || !Array.isArray(snapshot.semanticSources)) return null;
  return snapshot;
}

function classifierTraceFromMetadata(metadata: unknown): AgentClassifierTrace | null {
  const value = metadataValue(metadata, "agentClassifier");
  if (!value || typeof value !== "object") return null;
  const trace = value as AgentClassifierTrace;
  return trace.model && trace.response ? trace : null;
}

function agentPlanFromMetadata(metadata: unknown) {
  const value = metadataValue(metadata, "agentPlan");
  if (!value || typeof value !== "object") return null;
  const plan = value as NonNullable<ConsBotMessageMetadata["agentPlan"]>;
  return typeof plan.route === "string" && Array.isArray(plan.actions) ? plan : null;
}

export function TurnSettingsSummary({
  metadata,
  isAdmin = true,
}: {
  metadata: unknown;
  isAdmin?: boolean;
}) {
  if (!isAdmin) return null;
  const config = turnConfigFromMetadata(metadata);
  if (!config) return null;

  const retrieval =
    config.retrieval === "corpus"
      ? `Recupera Corpus manual — LLM desativada${config.semanticSources.length ? `: ${config.semanticSources.join(", ")}` : ""}`
      : "File Search";
  const agent =
    config.retrieval === "corpus"
      ? "Agente não acionado"
      : config.agent.enabled
        ? `Agente: Luna · ${config.agent.presentation === "classic" ? "Clássico" : "Citações"}`
        : "Agente desligado";

  return (
    <div className="mt-1.5 ml-auto flex max-w-[95%] items-start justify-end gap-1.5 text-right text-[10px] leading-relaxed text-muted-foreground/80">
      <SlidersHorizontal className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
      <span title="Parâmetros usados neste turno">
        {[
          config.model,
          config.profile,
          config.reasoning,
          `${config.responseDepth} · ~${config.targetWords.toLocaleString("pt-BR")} palavras`,
          config.responseFormat,
          config.vectorStore,
          retrieval,
          agent,
        ].join(" · ")}
      </span>
    </div>
  );
}

export function AgentClassifierTraceCard({
  metadata,
  isAdmin = true,
}: {
  metadata: unknown;
  isAdmin?: boolean;
}) {
  if (!isAdmin) return null;
  const trace = classifierTraceFromMetadata(metadata);
  const plan = agentPlanFromMetadata(metadata);
  if (!trace && !plan) return null;

  const originLabel = plan?.origin === "fallback" ? "Fallback seguro" : "ConsBOT Luna";
  const confidence = plan?.confidence;

  return (
    <details className="group mt-2 ml-auto max-w-[95%] rounded-xl border border-chart-2/30 bg-chart-2/5 px-3 py-2 text-left">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-medium text-foreground">
        <span className="rounded-md bg-chart-2/15 p-1 text-chart-2">
          <Bot className="size-3" aria-hidden="true" />
        </span>
        <span>{trace ? `Classificador LLM · ${trace.model}` : `Roteamento · ${originLabel}`}</span>
        <ChevronRight className="ml-auto size-3 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>
      <div className="mt-2 space-y-2">
        {plan ? (
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            <span className="rounded-full border border-chart-2/25 bg-card px-2 py-0.5 text-foreground">
              Rota: {plan.route}
            </span>
            {confidence !== undefined ? (
              <span className="rounded-full border border-border/70 bg-card px-2 py-0.5 text-muted-foreground">
                Confiança: {Math.round(confidence * 100)}%
              </span>
            ) : null}
            <span className="rounded-full border border-border/70 bg-card px-2 py-0.5 text-muted-foreground">
              {originLabel}
            </span>
            {plan.actions.length ? (
              <span className="rounded-full border border-border/70 bg-card px-2 py-0.5 text-muted-foreground">
                {plan.actions.length} pill{plan.actions.length > 1 ? "s" : ""}
              </span>
            ) : null}
          </div>
        ) : null}
        {plan?.reason ? <p className="text-[10px] text-muted-foreground">{plan.reason}</p> : null}
        {trace ? (
          <pre className="max-h-56 overflow-auto rounded-lg border border-border/60 bg-card/80 p-2.5 font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {trace.response}
          </pre>
        ) : null}
      </div>
    </details>
  );
}
