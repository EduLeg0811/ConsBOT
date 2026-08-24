import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, RefreshCw, Search } from "lucide-react";

import { AgentCard } from "@/agent/ui/AgentCard";
import { planAgent } from "@/agent/planner/plan";
import { detectActions } from "@/agent/planner/rules";
import { executeAgentAction, recallCard } from "@/agent/tools/registry";
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

function indexOfLastUser(messages: AgentMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }
  return messages.length;
}

type CardState = { loading: boolean; error: string | null; card: AgentCardData | null };

type Props = {
  threadId: string;
  settings: AgentSettings;
  host: AgentHost;
  messages: AgentMessage[];
  fullAnswerQuestion?: string;
  onFullAnswer?: (question: string) => void;
};

/** Botões opcionais de ação sugerida (módulo AGENT).
 *
 * Com `settings.agentMode` desligado devolve null antes de qualquer trabalho —
 * é por isso que o ChatWindow pode montar este componente incondicionalmente,
 * sem `if`. O padrão de `agentMode` vem de AGENT_MODE (ver agent/config.ts).
 */
export function AgentActions({
  threadId,
  settings,
  host,
  messages,
  fullAnswerQuestion,
  onFullAnswer,
}: Props) {
  const user = lastMessageOf(messages, "user");
  // A resposta anterior À PERGUNTA ATUAL, não a última da thread: depois de
  // uma resposta curta da triagem, a última seria a desta mesma pergunta, e o
  // plano seria recalculado com outra chave de cache — uma chamada a mais.
  const assistant = lastMessageOf(messages.slice(0, indexOfLastUser(messages)), "assistant");
  const enabled = settings.enabled;
  const detection = settings.detection;
  // O botão abre o card em vez de outra aba nos dois modos que consultam a
  // API. Em «Alimentar resposta» a consulta já aconteceu antes da resposta,
  // e o botão serve para VER o que alimentou — sem repetir a busca.
  // Sob a detecção por Regras o botão é sempre link.
  const cardMode = detection === "llm" && settings.action !== "link";
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
      if (current) setLlmActions(plan.actions);
    });

    return () => {
      current = false;
    };
  }, [enabled, detection, user?.id, user?.text]);

  // Cada mensagem começa sem cards: o resultado da anterior não vale para a
  // pergunta nova. Vivem só na sessão, como as settings.
  useEffect(() => setCards({}), [user?.id, cardMode]);

  const openExternal = useCallback(
    (action: AgentAction, via: "link" | "api" | "card-footer") => {
      host.logEvent({ intent: action.id, via, detection, meta: action.meta });
      window.open(action.href, "_blank", "noopener,noreferrer");
    },
    [detection, host],
  );

  const runSearch = useCallback(
    (action: AgentAction) => {
      // No modo «Alimentar resposta» esta consulta já foi feita antes da
      // resposta; então o card abre na hora, sem ir à rede de novo.
      const known = recallCard(action);
      if (known) {
        setCards((current) => ({
          ...current,
          [action.id]: { loading: false, error: null, card: known },
        }));
        host.logEvent({ intent: action.id, via: "api", detection, meta: action.meta });
        return;
      }

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

  if (!enabled || (actions.length === 0 && !fullAnswerQuestion)) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {fullAnswerQuestion && onFullAnswer ? (
          <button
            type="button"
            onClick={() => onFullAnswer(fullAnswerQuestion)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-chat text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
          >
            <RefreshCw className="size-3.5 shrink-0" aria-hidden="true" />
            <span>{english ? "Full answer" : "Resposta completa"}</span>
          </button>
        ) : null}

        {actions.map((action) =>
          cardMode ? (
            <button
              key={action.id}
              type="button"
              title={
                english ? "Searches and shows the result here" : "Busca e mostra o resultado aqui"
              }
              disabled={cards[action.id]?.loading}
              onClick={() => runSearch(action)}
              className="inline-flex items-center gap-1.5 rounded-full border border-chart-2/40 bg-chart-2/10 px-3 py-1.5 text-xs font-chat text-foreground transition-colors hover:border-chart-2/60 hover:bg-chart-2/20 disabled:opacity-50"
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
              className="inline-flex items-center gap-1.5 rounded-full border border-chart-2/40 bg-chart-2/10 px-3 py-1.5 text-xs font-chat text-foreground transition-colors hover:border-chart-2/60 hover:bg-chart-2/20"
            >
              <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{action.label}</span>
            </a>
          ),
        )}
      </div>

      {cardMode
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
