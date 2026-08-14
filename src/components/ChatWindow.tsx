import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Copy, RefreshCw, Share2 } from "lucide-react";
import { toast } from "sonner";


import { Button } from "@/components/ui/button";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import type { ChatSettings } from "@/lib/chat-settings";

const SUGGESTIONS = [
  "Explique um conceito difícil de forma simples",
  "Revise e melhore este texto",
  "Crie um plano de estudos de 7 dias",
  "Resuma os pontos principais de um tema",
];

type Props = {
  threadId: string;
  settings: ChatSettings;
  initialMessages: UIMessage[];
  onMessagesChange: (messages: UIMessage[]) => void;
};

export function ChatWindow({ threadId, settings, initialMessages, onMessagesChange }: Props) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            ...body,
            messages,
            sessionId: threadId,
            model: settingsRef.current.model,
            systemPrompt: settingsRef.current.systemPrompt,
            reasoningEffort: settingsRef.current.reasoningEffort,
            reasoningSummary: settingsRef.current.reasoningSummary,
            maxOutputTokens: settingsRef.current.maxOutputTokens,
            topP: settingsRef.current.topP,
          },
        }),
      }),
    [threadId],
  );

  const { messages, sendMessage, status, stop, setMessages, regenerate } = useChat({
    id: threadId,
    transport,
    onError: (error) => toast.error(error.message || "Não foi possível responder agora."),
  });

  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (initialMessages.length > 0) setMessages(initialMessages);
  }, [initialMessages, setMessages]);

  const isBusy = status === "submitted" || status === "streaming";

  const changeRef = useRef(onMessagesChange);
  changeRef.current = onMessagesChange;

  useEffect(() => {
    if (!restoredRef.current || isBusy) return;
    changeRef.current(messages);
  }, [messages, isBusy]);

  useEffect(() => {
    if (!isBusy) textareaRef.current?.focus();
  }, [isBusy, threadId]);

  const submit = useCallback(
    (text: string) => {
      const value = text.trim();
      if (!value || isBusy) return;
      setInput("");
      void sendMessage({ text: value });
    },
    [isBusy, sendMessage],
  );

  const latestAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
  const latestAssistantText = latestAssistantMessage?.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { text: string }).text)
    .join("\n")
    .trim();

  const copyLatestResponse = async () => {
    if (!latestAssistantText) return;
    try {
      await navigator.clipboard.writeText(latestAssistantText);
      toast.success("Resposta copiada");
    } catch {
      toast.error("Não foi possível copiar a resposta.");
    }
  };

  const shareLatestResponse = async () => {
    if (!latestAssistantText) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Resposta do ConsBOT", text: latestAssistantText });
        return;
      }
      await navigator.clipboard.writeText(latestAssistantText);
      toast.success("Resposta copiada para compartilhar");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Não foi possível compartilhar a resposta.");
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4">
      <Conversation className="flex-1">
        <ConversationContent className="gap-5 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-6 pt-10">
              <ConversationEmptyState
                icon={
                  <img
                    src="/favicon.png"
                    alt=""
                    className="size-20 object-contain"
                    aria-hidden="true"
                  />
                }
                title="Olá Conscienciólogo!"
                description="O que gostaria de conversar hoje?"
                descriptionClassName="text-[#8a8a8a] italic"
              />
              <div className="grid w-full gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => submit(suggestion)}
                    className="rounded-2xl border border-border bg-card/80 px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <MessageContent
                className={
                  message.role === "user"
                    ? "bg-chat-user text-chat-user-foreground rounded-2xl px-4 py-3"
                    : "bg-transparent px-0 text-foreground"
                }
              >
                {message.parts.map((part, index) => {
                  if (part.type === "reasoning" && part.text.trim().length > 0) {
                    return (
                      <details
                        key={`${message.id}-r-${index}`}
                        className="mb-2 rounded-xl border border-border/70 bg-secondary/60 px-3 py-2 text-xs text-muted-foreground"
                      >
                        <summary className="cursor-pointer font-medium">Raciocínio</summary>
                        <div className="mt-2 whitespace-pre-wrap">{part.text}</div>
                      </details>
                    );
                  }
                  if (part.type === "text") {
                    return (
                      <MessageResponse key={`${message.id}-t-${index}`}>{part.text}</MessageResponse>
                    );
                  }
                  return null;
                })}
              </MessageContent>
            </Message>
          ))}

          {status === "submitted" ? <Shimmer className="text-sm">Pensando...</Shimmer> : null}

          {latestAssistantText && !isBusy ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-lg text-muted-foreground hover:text-foreground"
                aria-label="Copiar resposta"
                title="Copiar resposta"
                onClick={() => void copyLatestResponse()}
              >
                <Copy />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-lg text-muted-foreground hover:text-foreground"
                aria-label="Compartilhar resposta"
                title="Compartilhar resposta"
                onClick={() => void shareLatestResponse()}
              >
                <Share2 />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-lg text-muted-foreground hover:text-foreground"
                aria-label="Tentar novamente"
                title="Tentar novamente"
                onClick={() => void regenerate()}
              >
                <RefreshCw />
              </Button>
            </div>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="pb-5">
        <PromptInput
          className="[&_[data-slot=input-group]]:rounded-[28px] [&_[data-slot=input-group]]:border-border/70 [&_[data-slot=input-group]]:bg-white [&_[data-slot=input-group]]:shadow-[0_3px_14px_-5px_oklch(0.3_0.02_155/0.22)]"
          onSubmit={(message, event) => {
            event.preventDefault();
            submit(message.text || input);
          }}
        >
          <PromptInputTextarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="field-sizing-content max-h-48 min-h-14 resize-none bg-transparent px-5 py-4 text-base"
            placeholder="Pergunte ao ConsBOT"
          />
          <div className="flex shrink-0 items-center pr-2">
            <PromptInputSubmit
              status={status}
              disabled={!isBusy && input.trim().length === 0}
              onClick={isBusy ? () => stop() : undefined}
              className="size-10 rounded-full bg-[#10a37f] text-white hover:bg-[#0d8c6d] disabled:bg-[#10a37f]/35 disabled:text-white"
            >
              {isBusy ? undefined : <ArrowUp className="size-5" />}
            </PromptInputSubmit>
          </div>
        </PromptInput>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Enter envia · Shift+Enter quebra linha · O ConsBOT pode cometer erros.
        </p>
      </div>
    </main>
  );
}
