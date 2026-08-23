import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Search } from "lucide-react";

import { AgentCard } from "@/agent/ui/AgentCard";
import { planAgent } from "@/agent/planner/plan";
import { detectActions } from "@/agent/planner/rules";
import { executeAgentAction } from "@/agent/tools/registry";
import type { AgentHost } from "@/agent/host";
import type { AgentSettings } from "@/agent/settings";
import type {
  AgentAction,
  AgentCard as AgentCardData,
  AgentContext,
  AgentIntentId,
  AgentMessage,
} from "@/agent/types";

/** Concatena o texto das mensagens do papel indicado, da última para trás.
 * Devolve também o id, que serve de chave de recálculo no modo `llm`. */
function lastMessageOf(messages: AgentMessage[], role: "user" | "assistant") {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== role) continue;

    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join(" ")
      .trim();

    if (text) return { id: message.id, text };
  }

  return null;
}

type CardState = { loading: boolean; error: string | null; card: AgentCardData | null };

type Props = {
  threadId: string;
  settings: AgentSettings;
  host: AgentHost;
  messages: AgentMessage[];
};

/** Botões opcionais de ação sugerida (módulo AGENT).
 *
 * Com `settings.agentMode` desligado devolve null antes de qualquer trabalho —
 * é por isso que o ChatWindow pode montar este componente incondicionalmente,
 * sem `if`. O padrão de `agentMode` vem de AGENT_MODE (ver agent/config.ts).
 */
export function AgentActions({ threadId, settings, host, messages }: Props) {
  const user = lastMessageOf(messages, "user");
  const assistant = lastMessageOf(messages, "assistant");
  const enabled = settings.enabled;
  const detection = settings.detection;
  // Consultar a API em vez de abrir o módulo externo só existe sob o
  // classificador; em `rules` o botão é sempre link.
  const apiMode = detection === "llm" && settings.action === "api";
  const english = host.english;

  // O contexto muda de identidade a cada render (ThreadPage remonta as settings
  // fora do admin); guardá-lo em ref mantém os efeitos presos ao que de fato
  // importa — a mensagem e o modo —, sem disparar uma classificação por render.
  const ctxRef = useRef<AgentContext>({ userText: "", settings, host, threadId });
  ctxRef.current = {
    userText: user?.text ?? "",
    assistantText: assistant?.text,
    settings,
    host,
    threadId,
  };

  const ruleActions = useMemo(
    () => (enabled && detection === "rules" ? detectActions(ctxRef.current) : []),
    // `user.text` é a entrada real de detectActions; ctxRef acompanha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, detection, user?.text, host.english],
  );

  const [llmActions, setLlmActions] = useState<AgentAction[]>([]);
  const [cards, setCards] = useState<Record<string, CardState>>({});

  useEffect(() => {
    if (!enabled || detection !== "llm" || !user?.id) {
      setLlmActions([]);
      return;
    }

    // Um plano por mensagem do usuário. `planAgent` guarda o último, então
    // quando o modo «Alimentar resposta» já planejou antes de responder,
    // isto reaproveita — e não custa uma segunda chamada.
    let current = true;
    void planAgent(ctxRef.current).then((plan) => {
      // No modo «Alimentar resposta» o resultado já foi para o prompt; só há
      // botão quando o planejador pediu as duas entregas.
      const suppressed = ctxRef.current.settings.action === "context" && plan.delivery !== "both";
      if (current) setLlmActions(suppressed ? [] : plan.actions);
    });

    return () => {
      current = false;
    };
  }, [enabled, detection, user?.id, user?.text]);

  // Cada mensagem começa sem cards: o resultado da anterior não vale para a
  // pergunta nova. Vivem só na sessão, como as settings.
  useEffect(() => setCards({}), [user?.id, apiMode]);

  const openExternal = useCallback(
    (action: AgentAction, via: "link" | "api" | "card-footer") => {
      host.logEvent({ intent: action.id, via, detection, meta: action.meta });
      window.open(action.href, "_blank", "noopener,noreferrer");
    },
    [detection, host],
  );

  const runSearch = useCallback(
    (action: AgentAction) => {
      const term = action.meta?.term ?? "";
      setCards((current) => ({
        ...current,
        [action.id]: { loading: true, error: null, card: null },
      }));

      host.logEvent({ intent: action.id, via: "api", detection, meta: action.meta });

      void executeAgentAction(action, ctxRef.current)
        .then((card) =>
          setCards((current) => ({
            ...current,
            [action.id]: { loading: false, error: null, card },
          })),
        )
        .catch(() =>
          setCards((current) => ({
            ...current,
            [action.id]: {
              loading: false,
              card: null,
              error: english
                ? "Could not reach the search service."
                : "Não foi possível consultar o serviço de busca.",
            },
          })),
        );
    },
    [detection, english, host],
  );

  const actions = detection === "llm" ? llmActions : ruleActions;

  if (!enabled || actions.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((action) =>
          apiMode ? (
            <button
              key={action.id}
              type="button"
              title={
                english ? "Searches and shows the result here" : "Busca e mostra o resultado aqui"
              }
              disabled={cards[action.id]?.loading}
              onClick={() => runSearch(action)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-chat text-foreground transition-colors hover:border-chart-2/50 hover:bg-chart-2/10 hover:text-chart-2 disabled:opacity-50"
            >
              <Search className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{action.label}</span>
            </button>
          ) : (
            <a
              key={action.id}
              href={action.href}
              target="_blank"
              rel="noopener noreferrer"
              title={action.title}
              onClick={() =>
                host.logEvent({ intent: action.id, via: "link", detection, meta: action.meta })
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-chat text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
            >
              <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{action.label}</span>
            </a>
          ),
        )}
      </div>

      {apiMode
        ? actions
            .filter((action) => cards[action.id])
            .map((action) => (
              <AgentCard
                key={`card-${action.id}`}
                action={action}
                card={cards[action.id]?.card ?? null}
                loading={cards[action.id]?.loading ?? false}
                error={cards[action.id]?.error ?? null}
                english={english}
                onOpenExternal={() => openExternal(action, "card-footer")}
              />
            ))
        : null}
    </div>
  );
}
