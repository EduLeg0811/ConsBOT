import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Streamdown } from "streamdown";

import { AGENT_CARD_PREVIEW } from "@/agent/config";
import type { AgentAction, AgentCard as AgentCardData } from "@/agent/types";

type Props = {
  action: AgentAction;
  card: AgentCardData | null;
  loading: boolean;
  error: string | null;
  english: boolean;
  onOpenExternal: () => void;
};

/** Resultado da consulta ao Main-Server, dentro da própria conversa.
 *
 * Mostra `AGENT_CARD_PREVIEW` linhas e expande no lugar — os demais resultados
 * já vieram na mesma resposta, então «ver mais» não volta à rede. O rodapé leva
 * ao módulo completo, que é onde mora a ferramenta de verdade. */
export function AgentCard({ action, card, loading, error, english, onOpenExternal }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
        <span>{english ? "Searching…" : "Buscando…"}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
        <p>{error}</p>
        <button
          type="button"
          onClick={onOpenExternal}
          className="mt-1.5 inline-flex items-center gap-1 text-chart-2 hover:underline"
        >
          <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
          {english ? "Open the full module" : "Abrir o módulo completo"}
        </button>
      </div>
    );
  }

  if (!card) return null;

  const visible = expanded ? card.items : card.items.slice(0, AGENT_CARD_PREVIEW);
  const hidden = card.items.length - visible.length;

  return (
    <div className="overflow-hidden rounded-xl border border-chart-2/40 bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-chart-2/25 px-3 py-2">
        <span className="text-xs font-medium text-foreground">{action.label}</span>
        <span className="text-[11px] text-muted-foreground">
          {card.items.length === 0
            ? english
              ? "no results"
              : "nenhum resultado"
            : english
              ? `${card.total} result${card.total === 1 ? "" : "s"}`
              : `${card.total} resultado${card.total === 1 ? "" : "s"}`}
        </span>
      </div>

      {visible.length > 0 ? (
        <ul className="divide-y divide-chart-2/15">
          {visible.map((item, index) => (
            <li key={`${item.source}-${index}`} className="px-3 py-2">
              {item.source ? (
                <p className="text-[11px] font-medium text-chart-2">{item.source}</p>
              ) : null}
              {/* Os trechos vêm do corpus com marcação (**Definologia**, termos
                  em itálico). Renderizar como markdown preserva a ênfase que o
                  autor deu; sem isso, ou os asteriscos apareciam na tela, ou a
                  ênfase se perdia ao ser removida. */}
              <Streamdown className="agent-card-snippet mt-0.5 text-xs leading-relaxed text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&>p]:m-0 [&_[data-streamdown='strong']]:font-bold [&_[data-streamdown='strong']]:text-foreground [&_strong]:font-bold [&_b]:font-bold">
                {item.snippet}
              </Streamdown>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-chart-2/25 px-3 py-2">
        {hidden > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {english ? `Show ${hidden} more` : `Ver mais ${hidden}`}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onOpenExternal}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-chart-2"
        >
          <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
          {english ? "Full module" : "Módulo completo"}
        </button>
      </div>
    </div>
  );
}
