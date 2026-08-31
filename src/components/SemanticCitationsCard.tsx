import { AlertCircle, BookOpenText, FileText, Quote } from "lucide-react";

import { MessageResponse } from "@/components/ai-elements/message";
import {
  citedSemanticIds,
  type SemanticContextResult,
  type SemanticContextTurn,
} from "@/lib/semantic-context";

function SourceItem({
  result,
  position,
  padPosition,
}: {
  result: SemanticContextResult;
  position: number;
  padPosition: boolean;
}) {
  const location = [
    result.sourceLabel,
    result.title,
    result.page ? `p. ${result.page}` : null,
    !result.page && result.paragraph ? `par. ${result.paragraph}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <span className="mt-px shrink-0 font-mono text-[10px] font-semibold tabular-nums text-primary">
        {String(position).padStart(padPosition ? 2 : 1, "0")}.
      </span>
      <div className="min-w-0 text-[11px] leading-relaxed text-foreground">
        <MessageResponse className="inline [&>p]:inline [&>p]:mb-0" responseFormat="chatgpt">
          {result.text}
        </MessageResponse>{" "}
        <span className="inline text-[10px] text-muted-foreground/75 italic">[{location}]</span>
      </div>
    </li>
  );
}

export function SemanticCitationsCard({
  context,
  assistantText,
  isAdmin,
  panel = false,
  question,
}: {
  context: SemanticContextTurn;
  assistantText: string;
  isAdmin: boolean;
  /** No painel lateral, todas as fontes ficam expandidas como listagem. */
  panel?: boolean;
  /** Pergunta que originou a recuperação, apresentada no cabeçalho do painel. */
  question?: string;
}) {
  const citedIds = citedSemanticIds(assistantText, context.results);
  const cited = context.results.filter((result) => citedIds.has(result.id));
  const consulted = context.results.filter((result) => !citedIds.has(result.id));
  const positionById = new Map(context.results.map((result, index) => [result.id, index + 1]));
  const padPosition = context.results.length > 9;
  const panelHeader = panel ? (
    <div className="flex items-start gap-2.5">
      <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
        <FileText className="size-3.5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-foreground" title={question}>
          {question?.trim() || "Consulta ao corpus"}
        </p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
          {context.status === "error"
            ? "Recuperação indisponível"
            : context.status === "empty" || context.results.length === 0
              ? "Nenhum trecho recuperado"
              : `${cited.length} utilizada${cited.length === 1 ? "" : "s"} · ${context.results.length} trecho${context.results.length === 1 ? "" : "s"} recuperado${context.results.length === 1 ? "" : "s"}`}
        </p>
      </div>
    </div>
  ) : null;

  if (context.status === "error") {
    const notice = (
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300/50 bg-amber-50/65 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-200">
        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Não foi possível recuperar os trechos do corpus nesta consulta.
          {isAdmin && context.error ? ` ${context.error}` : ""}
        </span>
      </div>
    );
    return panel ? (
      <section className="space-y-3 border-t border-border/65 pt-4 first:border-t-0 first:pt-0">
        {panelHeader}
        {notice}
      </section>
    ) : (
      notice
    );
  }

  if (context.status === "empty" || context.results.length === 0) {
    const notice = (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-border/65 bg-secondary/35 px-3 py-2 text-[11px] text-muted-foreground">
        <BookOpenText className="size-3.5 shrink-0" />
        Nenhum trecho complementar relevante foi encontrado nas fontes selecionadas.
      </div>
    );
    return panel ? (
      <section className="space-y-3 border-t border-border/65 pt-4 first:border-t-0 first:pt-0">
        {panelHeader}
        {notice}
      </section>
    ) : (
      notice
    );
  }

  const listClass = panel ? "" : "divide-y divide-border/45";

  return (
    <section
      className={
        panel
          ? "space-y-3 border-t border-border/65 pt-4 first:border-t-0 first:pt-0"
          : "mt-3 space-y-3 rounded-2xl border border-border/70 bg-white p-3.5"
      }
    >
      {panelHeader ?? (
        <div className="flex items-start gap-2.5">
          <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
            <Quote className="size-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">Citações do corpus</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
              {cited.length} utilizada{cited.length === 1 ? "" : "s"} · {context.results.length}{" "}
              trecho
              {context.results.length === 1 ? "" : "s"} recuperado
              {context.results.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      )}

      {cited.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
            Citações utilizadas
          </p>
          <ol className={listClass}>
            {cited.map((result) => (
              <SourceItem
                key={result.id}
                result={result}
                position={positionById.get(result.id) ?? 0}
                padPosition={padPosition}
              />
            ))}
          </ol>
        </div>
      ) : null}

      {consulted.length > 0 ? (
        panel ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Fontes consultadas ({consulted.length})
            </p>
            <ol className={`mt-2 ${listClass}`}>
              {consulted.map((result) => (
                <SourceItem
                  key={result.id}
                  result={result}
                  position={positionById.get(result.id) ?? 0}
                  padPosition={padPosition}
                />
              ))}
            </ol>
          </div>
        ) : (
          <details className="group" open={cited.length === 0}>
            <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Fontes consultadas ({consulted.length})
            </summary>
            <ol className="mt-2 divide-y divide-border/45">
              {consulted.map((result) => (
                <SourceItem
                  key={result.id}
                  result={result}
                  position={positionById.get(result.id) ?? 0}
                  padPosition={padPosition}
                />
              ))}
            </ol>
          </details>
        )
      ) : null}
    </section>
  );
}
