import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowUp, Copy, Database, RefreshCw, Share2 } from "lucide-react";
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
import { MODELS, VECTOR_STORES, type ChatSettings } from "@/lib/chat-settings";
import { useIsMobile } from "@/hooks/use-mobile";
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

function isCompletePortugueseSuggestion(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const suggestion = value.trim();

  return (
    suggestion.length >= 16 &&
    suggestion.length <= 120 &&
    suggestion.endsWith("?") &&
    /^[A-Za-zÀ-ÖØ-öø-ÿ0-9 .,;:!?…'"“”‘’()\[\]{}<>/\\—–-]+$/.test(suggestion)
  );
}

function getRagStatus(
  userMessage: ConsBotUIMessage,
  assistantMessage: ConsBotUIMessage | undefined,
  fallbackVectorStoreId: ChatSettings["vectorStoreId"],
  sourceCounts: Record<string, number>,
) {
  const fileSearchPart = assistantMessage?.parts.find((part) => part.type === "tool-fileSearch");

  if (!fileSearchPart || fileSearchPart.type !== "tool-fileSearch") {
    return null;
  }

  const metadata = userMessage.metadata;
  const vectorStoreId =
    metadata &&
      typeof metadata === "object" &&
      "ragVectorStoreId" in metadata &&
      typeof metadata.ragVectorStoreId === "string"
      ? metadata.ragVectorStoreId
      : fallbackVectorStoreId;
  const vectorStoreLabel = VECTOR_STORES.find((store) => store.id === vectorStoreId)?.label;
  const storeDetail = vectorStoreLabel ? ` ${vectorStoreLabel}` : "";
  const totalFiles = sourceCounts[vectorStoreId];

  return fileSearchPart.state === "output-available"
    ? `${storeDetail}${totalFiles === undefined ? "" : ` · ${totalFiles} fonte${totalFiles === 1 ? "" : "s"}`}`
    : `Consultando ${storeDetail}…`;
}

function normalizeConscienciologicalLists(text: string) {
  let result = text;

  // Normaliza Sugestões de Aprofundamento (bullets com espaçamento simples, sem quebras extras)
  result = result.replace(
    /(^#{1,6}\s*(?:\d+[.)]\s*)?Sugestões\s+(?:de|para)\s+Aprofundamento:?\s*\r?\n+)([\s\S]*?)(?=\r?\n#{1,6}\s|\s*$)/gim,
    (section, heading: string, content: string) => {
      const items = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .map((line) => line.replace(/^(?:\d+[.)]|[-*+•–—])\s*/, "").trim())
        .filter(Boolean);

      if (items.length === 0) return section;

      return `${heading.trimEnd()}\n${items.map((item) => `- ${item}`).join("\n")}\n\n`;
    },
  );

  // Normaliza Referências / Referências Bibliográficas (lista numerada consecutiva com espaçamento simples)
  result = result.replace(
    /(^#{1,6}\s*(?:\d+[.)]\s*)?Referências(?:\s+Bibliográficas)?:?\s*\r?\n+)([\s\S]*?)(?=\r?\n#{1,6}\s|\s*$)/gim,
    (section, heading: string, content: string) => {
      const items = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .map((line) => line.replace(/^(?:\d+[.)]|[-*+•–—])\s*/, "").trim())
        .filter(Boolean);

      if (items.length === 0) return section;

      return `${heading.trimEnd()}\n${items.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\n`;
    },
  );

  return result;
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

type VectorStoreSummaryResponse = {
  vectorStore: { id: string; label: string };
  totalFiles: number;
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
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasInitialUrlQuestion = useRef(
    Boolean(
      (
        searchParams.get("question") ||
        searchParams.get("q") ||
        searchParams.get("prompt") ||
        searchParams.get("pergunta") ||
        ""
      ).trim(),
    ),
  );
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isRefreshingSuggestions, setIsRefreshingSuggestions] = useState(false);
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingAuditId = useRef<string | null>(null);
  const openaiAuditRef = useRef<OpenAIAuditEvent | null>(null);
  const auditCompleteRef = useRef(onAuditComplete);
  const initialUrlQuestionProcessedRef = useRef(false);
  auditCompleteRef.current = onAuditComplete;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const sessionId = threadId;
  const activeModel = MODELS.find((model) => model.id === settings.model);
  const activeVectorStore = VECTOR_STORES.find((store) => store.id === settings.vectorStoreId);
  const llmParameters = [
    `GPT-5.6 ${activeModel?.label.replace("ConsBOT ", "") ?? "Terra"}`,
    REASONING_LABELS[settings.reasoningEffort],
    ({ low: "Low verbosity", medium: "Medium verbosity", high: "High verbosity" })[settings.textVerbosity],
    `${settings.maxOutputTokens} tokens`,
    settings.vectorStoreId === "none" ? "Sem RAG" : activeVectorStore?.label,
    settings.responseFormat === "conscienciological" ? "Confor Conscienciológico" : "Modo livre",
  ].filter((parameter): parameter is string => Boolean(parameter));

  useEffect(() => {
    if (settings.vectorStoreId === "none" || sourceCounts[settings.vectorStoreId] !== undefined) {
      return;
    }

    const controller = new AbortController();
    void fetch(
      `/api/vector-store-files?vectorStoreId=${encodeURIComponent(settings.vectorStoreId)}&summary=1`,
      { signal: controller.signal, headers: { Accept: "application/json" } },
    )
      .then(async (response) => {
        const body = (await response.json()) as VectorStoreSummaryResponse;
        if (!response.ok || typeof body.totalFiles !== "number") return;
        setSourceCounts((current) => ({ ...current, [settings.vectorStoreId]: body.totalFiles }));
      })
      .catch(() => {
        // A indicação de RAG continua disponível mesmo se a contagem não puder ser carregada.
      });

    return () => controller.abort();
  }, [settings.vectorStoreId, sourceCounts]);

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
      messages: initialMessages,
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
    if (initialMessages.length > 0) {
      setMessages(initialMessages);
    }
  }, [initialMessages, setMessages]);

  const isBusy = status === "submitted" || status === "streaming";

  const changeRef = useRef(onMessagesChange);
  changeRef.current = onMessagesChange;

  useEffect(() => {
    if (!restoredRef.current || isBusy) return;
    changeRef.current(messages);
  }, [messages, isBusy]);

  useEffect(() => {
    if (!isBusy) {
      textareaRef.current?.focus();
      if (textareaRef.current && input) {
        const len = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(len, len);
      }
    }
  }, [isBusy, threadId, input]);

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

  useEffect(() => {
    const query =
      searchParams.get("question") ||
      searchParams.get("q") ||
      searchParams.get("prompt") ||
      searchParams.get("pergunta");

    if (query) {
      const trimmed = query.trim();
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("question");
      nextParams.delete("q");
      nextParams.delete("prompt");
      nextParams.delete("pergunta");
      setSearchParams(nextParams, { replace: true });

      if (trimmed && !initialUrlQuestionProcessedRef.current) {
        initialUrlQuestionProcessedRef.current = true;
        submit(trimmed);
      }
    }
  }, [searchParams, setSearchParams, submit]);

  const refreshSuggestions = useCallback(async () => {
    if (isRefreshingSuggestions || isBusy) return;
    const isMobileView = typeof window !== "undefined" ? window.innerWidth < 768 : isMobile;
    const expectedCount = isMobileView ? 2 : 4;
    setIsRefreshingSuggestions(true);
    const auditId = onAuditStart({
      endpoint: "/api/suggestions",
      sentAt: new Date().toISOString(),
      body: {
        model: "gpt-5.6-luna",
        reasoningEffort: "none",
        maxOutputTokens: 512,
        count: expectedCount,
      },
    });

    try {
      const response = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sessionId, count: expectedCount }),
      });
      const result = (await response.json()) as SuggestionsResponse;
      if (!response.ok) throw new Error(result.error || "Não foi possível gerar novas perguntas.");
      const completeSuggestions = Array.isArray(result.suggestions)
        ? result.suggestions.filter(isCompletePortugueseSuggestion)
        : [];
      if (completeSuggestions.length !== expectedCount) {
        throw new Error(
          `A LLM não retornou ${expectedCount === 2 ? "duas" : "quatro"} perguntas completas em português brasileiro.`,
        );
      }
      setSuggestions(completeSuggestions);
      onAuditComplete(auditId, {
        openaiRequest: result.audit?.request,
        response: result.audit?.response ?? result,
        uiResponse: completeSuggestions,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível gerar novas perguntas.";
      onAuditComplete(auditId, { response: { error: message } }, "error");
      toast.error(message);
    } finally {
      setIsRefreshingSuggestions(false);
    }
  }, [isBusy, isMobile, isRefreshingSuggestions, onAuditComplete, onAuditStart, sessionId]);

  const initialSuggestionsRequestedRef = useRef(false);
  useEffect(() => {
    if (
      initialSuggestionsRequestedRef.current ||
      hasInitialUrlQuestion.current ||
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
        <ConversationContent className="gap-5 pt-4 pb-6 sm:pt-12">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-3 pt-0 sm:gap-6 sm:pt-10">
              <ConversationEmptyState
                icon={
                  <img
                    src="/icon.png"
                    alt=""
                    className="size-16 sm:size-20 object-contain"
                    aria-hidden="true"
                  />
                }
                title="Olá Conscienciólogo!"
                description="O que você gostaria de conversar hoje?"
                descriptionClassName="text-[#8a8a8a] italic"
                className="p-2 sm:p-8 gap-2 sm:gap-3"
              />
              {!hasInitialUrlQuestion.current ? (
                <>
                  <div className="-mb-3 flex w-full justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-full text-muted-foreground/70 hover:bg-primary/10 hover:text-primary"
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
                      {suggestions.slice(0, isMobile ? 2 : 4).map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => submit(suggestion)}
                          className="rounded-xl border border-border bg-card/80 px-3.5 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          {messages.map((message, messageIndex) => {
            const ragStatus =
              message.role === "user"
                ? getRagStatus(message, messages[messageIndex + 1], settings.vectorStoreId, sourceCounts)
                : null;
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
                      // Os documentos recuperados pelo File Search são suporte interno da
                      // resposta. As referências bibliográficas exibidas vêm somente do texto
                      // final produzido pela LLM, evitando duplicação na seção Referências.
                      if (part.type === "source-document") return null;
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

      <div className="pb-9 sm:pb-5">
        <PromptInput
          className="[&_[data-slot=input-group]]:rounded-[28px] [&_[data-slot=input-group]]:border-border/70 [&_[data-slot=input-group]]:bg-card [&_[data-slot=input-group]]:shadow-[0_3px_14px_-5px_oklch(0.3_0.02_155/0.22)]"
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
              className="size-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary/35 disabled:text-primary-foreground"
            >
              {isBusy ? undefined : <ArrowUp className="size-5" />}
            </PromptInputSubmit>
          </div>
        </PromptInput>
        <p className="mt-2 pr-2 text-right text-[11px] leading-relaxed text-muted-foreground/60 sm:leading-none">
          {llmParameters.join("  ●  ")}
        </p>
      </div>
    </main>
  );
}
