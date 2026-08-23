import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";

import { classifyActions } from "@/lib/agent/classify";
import { detectActions } from "@/lib/agent/detect";
import { logFeatureAccess } from "@/lib/access-log";
import type { AgentAction, AgentContext } from "@/lib/agent/types";
import type { ChatSettings } from "@/lib/chat-settings";
import type { ConsBotUIMessage } from "@/lib/audit-log";

/** Concatena o texto das mensagens do papel indicado, da última para trás.
 * Devolve também o id, que serve de chave de recálculo no modo `llm`. */
function lastMessageOf(messages: ConsBotUIMessage[], role: "user" | "assistant") {
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

type Props = {
  threadId: string;
  settings: ChatSettings;
  messages: ConsBotUIMessage[];
};

/** Botões opcionais de ação sugerida (módulo AGENT).
 *
 * Com `settings.agentMode` desligado devolve null antes de qualquer trabalho —
 * é por isso que o ChatWindow pode montar este componente incondicionalmente,
 * sem `if`. O padrão de `agentMode` vem de AGENT_MODE (ver agent/config.ts).
 */
export function AgentActions({ threadId, settings, messages }: Props) {
  const user = lastMessageOf(messages, "user");
  const assistant = lastMessageOf(messages, "assistant");
  const enabled = settings.agentMode;
  const detection = settings.agentDetection;

  // O contexto muda de identidade a cada render (ThreadPage remonta as settings
  // fora do admin); guardá-lo em ref mantém os efeitos presos ao que de fato
  // importa — a mensagem e o modo —, sem disparar uma classificação por render.
  const ctxRef = useRef<AgentContext>({
    userText: "",
    settings,
    threadId,
  });
  ctxRef.current = {
    userText: user?.text ?? "",
    assistantText: assistant?.text,
    settings,
    threadId,
  };

  const ruleActions = useMemo(
    () => (enabled && detection === "rules" ? detectActions(ctxRef.current) : []),
    // `user.text` é a entrada real de detectActions; ctxRef acompanha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, detection, user?.text, settings.vectorStoreId],
  );

  const [llmActions, setLlmActions] = useState<AgentAction[]>([]);

  useEffect(() => {
    if (!enabled || detection !== "llm" || !user?.id) {
      setLlmActions([]);
      return;
    }

    // Uma classificação por mensagem do usuário. O abort cobre o caso normal de
    // o usuário perguntar de novo antes de a anterior voltar.
    const controller = new AbortController();
    void classifyActions(ctxRef.current, controller.signal).then((actions) => {
      if (!controller.signal.aborted) setLlmActions(actions);
    });

    return () => controller.abort();
  }, [enabled, detection, user?.id, user?.text]);

  const actions = detection === "llm" ? llmActions : ruleActions;

  if (!enabled || actions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((action) => (
        <a
          key={action.id}
          href={action.href}
          target="_blank"
          rel="noopener noreferrer"
          title={action.title}
          onClick={() =>
            logFeatureAccess({
              module: "consbot",
              action: "agent_action",
              label: "Ação sugerida",
              value: action.id,
              chat_id: threadId,
              meta: { rule: action.id, detection, ...action.meta },
            })
          }
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-chat text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
        >
          <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{action.label}</span>
        </a>
      ))}
    </div>
  );
}
