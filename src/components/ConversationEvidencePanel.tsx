import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PanelRightClose, Quote } from "lucide-react";

import { AgentActions, type AgentHost, type AgentSettings } from "@/agent";
import { SemanticCitationsCard } from "@/components/SemanticCitationsCard";
import { Button } from "@/components/ui/button";
import type { ConsBotUIMessage } from "@/lib/audit-log";
import { semanticContextFromMetadata } from "@/lib/semantic-context";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: ConsBotUIMessage[];
  threadId: string;
  settings: AgentSettings;
  host: AgentHost;
  isAdmin: boolean;
};

const MIN_WIDTH = 200;
const MAX_WIDTH = 1000;

export function ConversationEvidencePanel({
  open,
  onOpenChange,
  messages,
  threadId,
  settings,
  host,
  isAdmin,
}: Props) {
  const [width, setWidth] = useState(500);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const contexts = useMemo(
    () =>
      messages.flatMap((message, index) => {
        const user = messages[index - 1];
        if (message.role !== "assistant" || user?.role !== "user") return [];
        const context = semanticContextFromMetadata(user.metadata);
        return context ? [{ assistant: message, context, user }] : [];
      }),
    [messages],
  );
  const hasActions = messages.some((message, index) => {
    if (
      message.role !== "user" ||
      messages[index + 1]?.role !== "assistant" ||
      !message.metadata?.agentPlan
    )
      return false;
    return (
      message.metadata.agentPlan.presentation !== "classic" &&
      message.metadata.agentPlan.actions.length > 0
    );
  });
  const hasContent = contexts.length > 0 || hasActions;
  const latestUser = [...messages].reverse().find((message) => message.role === "user");
  const latestPresentation = latestUser?.metadata?.agentPlan?.presentation ?? "citations";

  useEffect(() => {
    if (hasContent) onOpenChange(true);
  }, [hasContent, onOpenChange]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      dragRef.current = { startX: event.clientX, startWidth: width };
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    },
    [width],
  );

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setWidth(
        Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, drag.startWidth + drag.startX - event.clientX)),
      );
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  if (!open) return null;

  return (
    <aside
      className="relative hidden min-h-0 shrink-0 flex-col border-l border-border/70 bg-white lg:flex"
      style={{ width }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Ajustar largura do painel de citações"
        onPointerDown={onPointerDown}
        className="absolute inset-y-0 -left-1 w-2 cursor-col-resize hover:bg-primary/40"
      />
      <div className="flex h-16 items-center gap-2 border-b border-border/70 bg-sidebar px-3 text-sidebar-foreground">
        <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
          <Quote className="size-3.5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">Citações e informações</p>
          <p className="text-[10px] text-muted-foreground">Dados auxiliares desta conversa</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          aria-label="Fechar painel de citações"
          title="Fechar painel"
          onClick={() => onOpenChange(false)}
        >
          <PanelRightClose />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {contexts.length === 0 && !hasActions ? (
          <p className="rounded-xl border border-dashed border-border/70 bg-background/65 px-3 py-4 text-center text-[11px] leading-relaxed text-muted-foreground">
            As citações e resultados auxiliares aparecerão aqui quando disponíveis.
          </p>
        ) : null}

        {contexts.map(({ assistant, context, user }) => (
          <SemanticCitationsCard
            key={`${assistant.id}-semantic`}
            context={context}
            assistantText={assistant.parts
              .filter((part) => part.type === "text")
              .map((part) => (part.type === "text" ? part.text : ""))
              .join("\n")}
            question={user.parts
              .filter((part) => part.type === "text")
              .map((part) => (part.type === "text" ? part.text : ""))
              .join("\n")}
            isAdmin={isAdmin}
            panel
          />
        ))}

        {messages.at(-1)?.role === "assistant" && latestPresentation !== "classic" ? (
          <AgentActions
            threadId={threadId}
            settings={settings}
            host={host}
            messages={messages}
            expandedByDefault
          />
        ) : null}
      </div>
    </aside>
  );
}
