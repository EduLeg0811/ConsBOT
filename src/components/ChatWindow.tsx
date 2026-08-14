import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Copy, Database, FileText, RefreshCw, Share2 } from "lucide-react";
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
import { getSessionId, MODELS, VECTOR_STORES, type ChatSettings } from "@/lib/chat-settings";
import type {
  AuditCompletion,
  AuditLog,
  ConsBotUIMessage,
  OpenAIAuditEvent,
} from "@/lib/audit-log";

const REASONING_LABELS: Record<ChatSettings["reasoningEffort"], string> = {
  none: "Imediato",
  low: "Otimizado",
  medium: "Médio",
  high: "Alto",
  xhigh: "Muito alto",
  max: "Máximo",
};

type SuggestionsResponse = {
  suggestions?: string[];
  audit?: { request?: unknown; response?: unknown };
  error?: string;
};

function getRagStatus(
  userMessage: ConsBotUIMessage,
  assistantMessage: ConsBotUIMessage | undefined,
  fallbackVectorStoreId: ChatSettings["vectorStoreId"],
) {
  const fileSearchPart = assistantMessage?.parts.find((part) => part.type === "tool-fileSearch");

  if (!fileSearchPart || fileSearchPart.type !== "tool-fileSearch") {
    return null;
  }

  const resultCount =
    fileSearchPart.state === "output-available" &&
      fileSearchPart.output &&
      typeof fileSearchPart.output === "object" &&
      "results" in fileSearchPart.output &&
      Array.isArray(fileSearchPart.output.results)
      ? fileSearchPart.output.results.length
      : null;

  const metadata = userMessage.metadata;
  const vectorStoreId =
    metadata &&
      typeof metadata === "object" &&
      "ragVectorStoreId" in metadata &&
      typeof metadata.ragVectorStoreId === "string"
      ? metadata.ragVectorStoreId
      : fallbackVectorStoreId;
  const vectorStoreLabel = VECTOR_STORES.find((store) => store.id === vectorStoreId)?.label;
  const storeDetail = vectorStoreLabel ? ` · ${vectorStoreLabel}` : "";

  return fileSearchPart.state === "output-available"
    ? `Base RAG${storeDetail}${resultCount === null ? "" : ` · ${resultCount} fonte${resultCount === 1 ? "" : "s"}`}`
    : `Consultando a base RAG${storeDetail}…`;
}

function normalizeConscienciologicalLists(text: string) {
  return text.replace(
    /(^#{1,6}\s+Sugestões de Aprofundamento:?\s*\r?\n+)([\s\S]*?)(?=\r?\n#{1,6}\s|\s*$)/gim,
    (section, heading: string, content: string) => {
      const items = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .map((line) => line.replace(/^(?:\d+[.)]|[-*+])\s+/, ""))
        .filter(Boolean);

      if (items.length === 0) return section;

      return `${heading}${items.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n`;
    },
  );
}

type Props = {
  threadId: string;
  settings: ChatSettings;
  containerWidthClass: string;
  initialMessages: ConsBotUIMessage[];
  onMessagesChange: (messages: ConsBotUIMessage[]) => void;
  onAuditStart: (request: unknown) => string;
  onAuditComplete: (id: string, result: AuditCompletion, status?: AuditLog["status"]) => void;
};

export function ChatWindow({
  threadId,
  settings,
  containerWidthClass,
  initialMessages,
  onMessagesChange,
  onAuditStart,
  onAuditComplete,
}: Props) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isRefreshingSuggestions, setIsRefreshingSuggestions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingAuditId = useRef<string | null>(null);
  const openaiAuditRef = useRef<OpenAIAuditEvent | null>(null);
  const auditCompleteRef = useRef(onAuditComplete);
  auditCompleteRef.current = onAuditComplete;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const sessionId = useMemo(() => getSessionId(), []);
  const activeModel = MODELS.find((model) => model.id === settings.model);
  const activeVectorStore = VECTOR_STORES.find((store) => store.id === settings.vectorStoreId);
  const llmParameters = [
    `GPT-5.6 ${activeModel?.label.replace("ConsBOT ", "") ?? "Terra"}`,
    REASONING_LABELS[settings.reasoningEffort],
    ({ low: "Verb. baixa", medium: "Verb. média", high: "Verb. alta" })[settings.textVerbosity],
    `${settings.maxOutputTokens} tokens`,
    settings.vectorStoreId === "none" ? "Sem RAG" : activeVectorStore?.label,
    settings.responseFormat === "conscienciological" ? "Confor Conscienciológico" : "Modo livre",
  ].filter((parameter): parameter is string => Boolean(parameter));

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            ...body,
            messages,
            sessionId,
            model: settingsRef.current.model,
            vectorStoreId: settingsRef.current.vectorStoreId,
            systemPrompt: settingsRef.current.systemPrompt,
            responseFormat: settingsRef.current.responseFormat,
            reasoningEffort: settingsRef.current.reasoningEffort,
            textVerbosity: settingsRef.current.textVerbosity,
            maxOutputTokens: settingsRef.current.maxOutputTokens,
          },
        }),
      }),
    [sessionId],
  );

  const { messages, sendMessage, status, stop, setMessages, regenerate } =
    useChat<ConsBotUIMessage>({
      id: threadId,
      transport,
      onData: (part) => {
        if (part.type === "data-openaiAudit") openaiAuditRef.current = part.data;
      },
      onError: (error) => {
        if (pendingAuditId.current) {
          auditCompleteRef.current(
            pendingAuditId.current,
            { response: { error: error.message } },
            "error",
          );
          pendingAuditId.current = null;
        }
        toast.error(error.message || "Não foi possível responder agora.");
      },
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

  useEffect(() => {
    if (isBusy || !pendingAuditId.current) return;
    const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
    if (lastAssistant) {
      onAuditComplete(pendingAuditId.current, {
        openaiRequest: openaiAuditRef.current?.request,
        response: openaiAuditRef.current?.response ?? {
          aviso: "O stream terminou sem metadados de auditoria da OpenAI.",
        },
        uiResponse: lastAssistant,
      });
    } else
      onAuditComplete(
        pendingAuditId.current,
        { response: { error: "A chamada foi finalizada sem uma resposta da LLM." } },
        "error",
      );
    pendingAuditId.current = null;
    openaiAuditRef.current = null;
  }, [isBusy, messages, onAuditComplete]);

  const submit = useCallback(
    (text: string) => {
      const value = text.trim();
      if (!value || isBusy) return;
      openaiAuditRef.current = null;
      pendingAuditId.current = onAuditStart({
        endpoint: "/api/chat",
        sentAt: new Date().toISOString(),
        body: {
          messages: [...messages, { role: "user", parts: [{ type: "text", text: value }] }],
          sessionId,
          model: settingsRef.current.model,
          vectorStoreId: settingsRef.current.vectorStoreId,
          systemPrompt: settingsRef.current.systemPrompt,
          responseFormat: settingsRef.current.responseFormat,
          reasoningEffort: settingsRef.current.reasoningEffort,
          textVerbosity: settingsRef.current.textVerbosity,
          maxOutputTokens: settingsRef.current.maxOutputTokens,
        },
      });
      setInput("");
      void sendMessage({
        text: value,
        metadata: { ragVectorStoreId: settingsRef.current.vectorStoreId },
      });
    },
    [isBusy, messages, onAuditStart, sendMessage, sessionId],
  );

  const refreshSuggestions = useCallback(async () => {
    if (isRefreshingSuggestions || isBusy) return;
    setIsRefreshingSuggestions(true);
    const auditId = onAuditStart({
      endpoint: "/api/suggestions",
      sentAt: new Date().toISOString(),
      body: {
        model: "gpt-5.6-luna",
        reasoningEffort: "none",
        maxOutputTokens: 512,
        count: 8,
      },
    });

    try {
      const response = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const result = (await response.json()) as SuggestionsResponse;
      if (!response.ok) throw new Error(result.error || "Não foi possível gerar novas perguntas.");
      if (!Array.isArray(result.suggestions) || result.suggestions.length === 0) {
        throw new Error("A LLM não retornou perguntas sugeridas.");
      }
      setSuggestions(result.suggestions);
      onAuditComplete(auditId, {
        openaiRequest: result.audit?.request,
        response: result.audit?.response ?? result,
        uiResponse: result.suggestions,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível gerar novas perguntas.";
      onAuditComplete(auditId, { response: { error: message } }, "error");
      toast.error(message);
    } finally {
      setIsRefreshingSuggestions(false);
    }
  }, [isBusy, isRefreshingSuggestions, onAuditComplete, onAuditStart, sessionId]);

  const initialSuggestionsRequestedRef = useRef(false);
  useEffect(() => {
    if (
      initialSuggestionsRequestedRef.current ||
      isBusy ||
      messages.length > 0 ||
      initialMessages.length > 0
    ) {
      return;
    }

    initialSuggestionsRequestedRef.current = true;
    void refreshSuggestions();
  }, [initialMessages.length, isBusy, messages.length, refreshSuggestions]);

  const regenerateWithAudit = () => {
    if (isBusy) return;
    openaiAuditRef.current = null;
    pendingAuditId.current = onAuditStart({
      endpoint: "/api/chat",
      sentAt: new Date().toISOString(),
      action: "regenerate",
      body: {
        messages,
        sessionId,
        model: settingsRef.current.model,
        vectorStoreId: settingsRef.current.vectorStoreId,
        systemPrompt: settingsRef.current.systemPrompt,
        responseFormat: settingsRef.current.responseFormat,
        reasoningEffort: settingsRef.current.reasoningEffort,
        textVerbosity: settingsRef.current.textVerbosity,
        maxOutputTokens: settingsRef.current.maxOutputTokens,
      },
    });
    void regenerate();
  };

  const stopWithAudit = () => {
    if (pendingAuditId.current) {
      onAuditComplete(
        pendingAuditId.current,
        { response: { message: "Resposta interrompida pelo usuário." } },
        "cancelled",
      );
      pendingAuditId.current = null;
      openaiAuditRef.current = null;
    }
    stop();
  };

  const latestAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
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
    <main
      className={`mx-auto flex w-full ${containerWidthClass} flex-1 flex-col overflow-hidden px-4 transition-all duration-300`}
    >
      <Conversation className="flex-1">
        <ConversationContent className="gap-5 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-6 pt-10">
              <ConversationEmptyState
                icon={
                  <img
                    src="/icon.png"
                    alt=""
                    className="size-20 object-contain"
                    aria-hidden="true"
                  />
                }
                title="Olá Conscienciólogo!"
                description="O que você gostaria de conversar hoje?"
                descriptionClassName="text-[#8a8a8a] italic"
              />
              <div className="-mb-3 flex w-full justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full text-muted-foreground/70 hover:bg-emerald-50 hover:text-emerald-800"
                  aria-label="Gerar novas perguntas iniciais"
                  title="Gerar novas perguntas"
                  onClick={() => void refreshSuggestions()}
                  disabled={isRefreshingSuggestions || isBusy}
                >
                  <RefreshCw className={isRefreshingSuggestions ? "animate-spin" : undefined} />
                </Button>
              </div>
              {suggestions.length > 0 ? (
                <div className="grid w-full gap-2 sm:grid-cols-2">
                  {suggestions.map((suggestion) => (
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
              ) : null}
            </div>
          ) : null}

          {messages.map((message, messageIndex) => {
            const ragStatus =
              message.role === "user"
                ? getRagStatus(message, messages[messageIndex + 1], settings.vectorStoreId)
                : null;
            const displayedSourceKeys = new Set<string>();

            return (
              <div key={message.id} className="w-full">
                <Message from={message.role}>
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
                        const text =
                          message.role === "assistant" &&
                            settings.responseFormat === "conscienciological"
                            ? normalizeConscienciologicalLists(part.text)
                            : part.text;

                        return (
                          <MessageResponse
                            key={`${message.id}-t-${index}`}
                            responseFormat={settings.responseFormat}
                          >
                            {text}
                          </MessageResponse>
                        );
                      }
                      if (part.type === "tool-fileSearch") {
                        return null;
                      }
                      if (part.type === "source-document") {
                        const sourceKey = part.filename ?? part.title ?? `source-${index}`;
                        if (displayedSourceKeys.has(sourceKey)) return null;
                        displayedSourceKeys.add(sourceKey);
                        return (
                          <div
                            key={`${message.id}-source-${index}`}
                            className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"
                          >
                            <FileText className="size-3.5 shrink-0" />
                            <span className="truncate">Fonte: {part.filename ?? part.title}</span>
                          </div>
                        );
                      }
                      return null;
                    })}
                  </MessageContent>
                </Message>
                {ragStatus ? (
                  <div className="mt-1 flex items-center justify-end gap-1 pr-1 text-[11px] leading-relaxed text-muted-foreground/55">
                    <Database className="size-3 shrink-0" aria-hidden="true" />
                    <span>{ragStatus}</span>
                  </div>
                ) : null}
              </div>
            );
          })}

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
                onClick={regenerateWithAudit}
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
              onClick={isBusy ? stopWithAudit : undefined}
              className="size-10 rounded-full bg-[#10a37f] text-white hover:bg-[#0d8c6d] disabled:bg-[#10a37f]/35 disabled:text-white"
            >
              {isBusy ? undefined : <ArrowUp className="size-5" />}
            </PromptInputSubmit>
          </div>
        </PromptInput>
        <p className="mt-2 pr-2 text-right text-[11px] leading-none text-muted-foreground/60">
          {llmParameters.join("  ●  ")}
        </p>
      </div>
    </main>
  );
}
