import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, convertToModelMessages } from "ai";
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
import {
  MODELS,
  isEnglishVectorStore,
  systemPromptWithVerbosity,
  VECTOR_STORES,
  type ChatSettings,
} from "@/lib/chat-settings";
import { API_BASE } from "@/lib/main-server";
import { logFeatureAccess } from "@/lib/access-log";
import { AgentActions, AgentStatus, triageAgent, type AgentHost } from "@/agent";
import { useIsMobile } from "@/hooks/use-mobile";
import type {
  AuditCompletion,
  AuditLog,
  ConsBotUIMessage,
  OpenAIAuditEvent,
} from "@/lib/audit-log";

/** `"none"` in ChatSettings means "sem RAG"; Main-Server takes an empty list
 * for that, and only forces the file_search tool when a store is actually
 * selected — forcing it with nothing to search would be a 400. */
function vectorStoresFor(vectorStoreId: ChatSettings["vectorStoreId"]) {
  return vectorStoreId === "none" ? [] : [vectorStoreId];
}

const REASONING_LABELS: Record<ChatSettings["reasoningEffort"], string> = {
  none: "No Effort",
  low: "Low Effort",
  medium: "Medium Effort",
  high: "High Effort",
  xhigh: "Very High Effort",
  max: "Max Effort",
};

const VERBOSITY_LABELS: Record<ChatSettings["textVerbosity"], string> = {
  low: "Baixo",
  medium: "Médio",
  high: "Alto",
};

// Schema JSON-Schema estrito para o /api/llm gerar as sugestões — o
// equivalente do zod suggestionItemSchema que a antiga função /api/suggestions
// usava com generateObject. min/maxLength e minItems/maxItems são um reforço;
// a validação real que decide se o lote é aceito continua sendo
// isCompleteSuggestion + a checagem de contagem abaixo, como sempre foi.
const SUGGESTIONS_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description:
              "A temática, conceito ou especialidade central da Conscienciologia abordada / Central Conscientiology concept.",
          },
          question: {
            type: "string",
            description:
              "Uma pergunta inicial completa, clara e convidativa, terminada em ponto de interrogação / A complete, clear initial question ending with a question mark.",
          },
        },
        required: ["topic", "question"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
} as const;

type SuggestionsPayload = { suggestions?: Array<{ topic?: string; question?: string }> };

function isCompleteSuggestion(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const suggestion = value.trim();

  return (
    suggestion.length >= 10 &&
    suggestion.length <= 120 &&
    suggestion.endsWith("?") &&
    /^[A-Za-zÀ-ÖØ-öø-ÿ0-9 .,;:!?…'"“”‘’()[\]{}<>/\\—–-]+$/.test(suggestion)
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
      ? (metadata.ragVectorStoreId as ChatSettings["vectorStoreId"])
      : fallbackVectorStoreId;
  const vectorStoreLabel = VECTOR_STORES.find((store) => store.id === vectorStoreId)?.label;
  const storeDetail = vectorStoreLabel ? ` ${vectorStoreLabel}` : "";
  const totalFiles = sourceCounts[vectorStoreId];
  const isEnglish = isEnglishVectorStore(vectorStoreId);

  return fileSearchPart.state === "output-available"
    ? `${storeDetail}${
        totalFiles === undefined
          ? ""
          : isEnglish
            ? ` · ${totalFiles} source${totalFiles === 1 ? "" : "s"}`
            : ` · ${totalFiles} fonte${totalFiles === 1 ? "" : "s"}`
      }`
    : isEnglish
      ? `Querying ${storeDetail}…`
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

/** Texto da última resposta do assistente, se houver. A triagem usa isso para
 * saber que a conversa já começou — e recusar responder sozinha o que dependa
 * do histórico, que ela não recebe. */
function lastAssistantText(messages: ConsBotUIMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;

    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join(" ")
      .trim();

    if (text) return text;
  }

  return undefined;
}

function getMessageText(message: ConsBotUIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { text: string }).text)
    .join("\n")
    .trim();
}

function getFirstLines(text: string, maxLines = 10): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text.trim();
  return lines.slice(0, maxLines).join("\n").trim();
}

function newMessageId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `m-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

/** A pergunta guardada numa resposta curta da triagem, quando é uma. */
function directQuestion(message: ConsBotUIMessage): string {
  const meta = message.metadata;
  return meta &&
    typeof meta === "object" &&
    "agentDirect" in meta &&
    typeof meta.agentDirect === "string"
    ? meta.agentDirect
    : "";
}

type PendingAccessLog = {
  action: string;
  label: string;
  value: string;
  chat_id: string;
  meta: Record<string, unknown>;
};

type Props = {
  threadId: string;
  settings: ChatSettings;
  containerWidthClass: string;
  initialMessages: ConsBotUIMessage[];
  onMessagesChange: (messages: ConsBotUIMessage[]) => void;
  onAuditStart: (request: unknown) => string;
  onAuditComplete: (id: string, result: AuditCompletion, status?: AuditLog["status"]) => void;
  isAdmin?: boolean;
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
  isAdmin = false,
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
  const [hasTyped, setHasTyped] = useState(() => initialMessages.length > 0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isRefreshingSuggestions, setIsRefreshingSuggestions] = useState(false);
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingAuditId = useRef<string | null>(null);
  const pendingAccessLogRef = useRef<PendingAccessLog | null>(null);
  const openaiAuditRef = useRef<OpenAIAuditEvent | null>(null);
  // O `status` do useChat só vira "submitted" depois do sendMessage, que roda
  // vários renders depois de o envio começar. Sem esta marca, o efeito de
  // fechamento via `!isBusy` disparava já no eco da pergunta e gravava a
  // resposta da rodada anterior.
  const streamStartedRef = useRef(false);
  const baselineAssistantIdRef = useRef<string | undefined>(undefined);
  // Rodada em preparo: já saiu do formulário, ainda não chegou ao useChat.
  // O ref tranca reentrada dentro do próprio `submit`; o estado é o que a
  // interface precisa para não parecer ociosa nesse intervalo.
  const submittingRef = useRef(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const auditCompleteRef = useRef(onAuditComplete);
  const initialUrlQuestionProcessedRef = useRef(false);
  auditCompleteRef.current = onAuditComplete;

  // Bloco que o módulo AGENT injeta no prompt desta requisição, no modo
  // «Alimentar LLM». Vazio em todos os outros casos — inclusive quando o
  // planejador decide que a resposta não depende de busca exata.
  const agentContextRef = useRef("");

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const activeModel = MODELS.find((model) => model.id === settings.model);
  const activeVectorStore = VECTOR_STORES.find((store) => store.id === settings.vectorStoreId);
  const isEnglish = isEnglishVectorStore(settings.vectorStoreId);

  // Contrato do módulo AGENT com o ConsBOT: é por aqui que ele alcança a API,
  // o idioma e a telemetria, sem importar nada de @/lib. Memoizado porque vai
  // parar num ref lá dentro — identidade nova a cada render dispararia efeito.
  const agentHost = useMemo<AgentHost>(
    () => ({
      apiBase: API_BASE,
      english: isEnglish,
      logEvent: (event) =>
        logFeatureAccess({
          module: "consbot",
          action: "agent_action",
          label: "Ação sugerida",
          value: event.intent,
          chat_id: threadId,
          meta: { rule: event.intent, detection: event.detection, via: event.via, ...event.meta },
        }),
    }),
    [isEnglish, threadId],
  );
  const llmParameters = [
    `GPT-5.6 ${activeModel?.label.replace("ConsBOT ", "") ?? "Terra"}`,
    !isMobile ? REASONING_LABELS[settings.reasoningEffort] : undefined,
    { low: "Low verbosity", medium: "Medium verbosity", high: "High verbosity" }[
      settings.textVerbosity
    ],
    settings.vectorStoreId === "none"
      ? isEnglish
        ? "No RAG"
        : "Sem RAG"
      : activeVectorStore?.label,
    settings.responseFormat === "conscienciological" ? "Confor Cons" : "ChatGPT",
  ].filter((parameter): parameter is string => Boolean(parameter));

  useEffect(() => {
    if (settings.vectorStoreId === "none" || sourceCounts[settings.vectorStoreId] !== undefined) {
      return;
    }

    const controller = new AbortController();
    void fetch(
      `${API_BASE}/api/vector-stores/${encodeURIComponent(settings.vectorStoreId)}/files?summary=true`,
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
        api: `${API_BASE}/api/llm`,
        prepareSendMessagesRequest: async ({ messages }) => {
          const vectorStores = vectorStoresFor(settingsRef.current.vectorStoreId);
          return {
            body: {
              // Main-Server takes plain role/content messages, not UIMessage[]
              // — the same conversion the removed /api/chat function used to
              // do server-side, now run here before the request leaves the browser.
              messages: await convertToModelMessages(messages),
              model: settingsRef.current.model,
              systemPrompt:
                systemPromptWithVerbosity(settingsRef.current) + agentContextRef.current,
              reasoningEffort: settingsRef.current.reasoningEffort,
              verbosity: settingsRef.current.textVerbosity,
              vectorStores,
              // `vectorMaxResults` só significa algo com file_search ativo, e
              // vai junto do toolChoice para o corpo não afirmar mais do que
              // a requisição realmente usa.
              ...(vectorStores.length > 0
                ? {
                    toolChoice: { type: "file_search" },
                    vectorMaxResults: settingsRef.current.vectorMaxResults,
                  }
                : {}),
              stream: true,
            },
          };
        },
      }),
    [],
  );

  const { messages, sendMessage, status, stop, setMessages, regenerate } =
    useChat<ConsBotUIMessage>({
      id: threadId,
      messages: initialMessages,
      transport,
      onData: (part) => {
        if (part.type === "data-llmMeta") openaiAuditRef.current = part.data;
      },
      onError: (error) => {
        if (pendingAccessLogRef.current) {
          logFeatureAccess({
            module: "consbot",
            action: pendingAccessLogRef.current.action,
            label: pendingAccessLogRef.current.label,
            value: pendingAccessLogRef.current.value,
            chat_id: pendingAccessLogRef.current.chat_id,
            meta: {
              ...pendingAccessLogRef.current.meta,
              response: `[Erro: ${error.message || "Não foi possível responder"}]`,
            },
          });
          pendingAccessLogRef.current = null;
        }
        streamStartedRef.current = false;
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
    if (!isBusy && !isMobile) {
      textareaRef.current?.focus();
      if (textareaRef.current && input) {
        const len = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(len, len);
      }
    }
  }, [isBusy, isMobile, threadId, input]);

  useEffect(() => {
    if (isBusy) {
      // A rodada começou de fato; só a partir daqui `!isBusy` significa
      // «terminou», e não «ainda nem saiu».
      streamStartedRef.current = true;
      return;
    }
    if (!streamStartedRef.current) return;
    if (!pendingAuditId.current && !pendingAccessLogRef.current) {
      streamStartedRef.current = false;
      return;
    }
    const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
    // Resposta ainda com o id de marco = nenhuma resposta nova chegou; gravar
    // o texto dela alinharia a pergunta desta rodada com a resposta da anterior.
    const isFresh = Boolean(lastAssistant) && lastAssistant?.id !== baselineAssistantIdRef.current;
    const assistantText = isFresh && lastAssistant ? getMessageText(lastAssistant) : "";
    const first10Lines = assistantText ? getFirstLines(assistantText, 10) : undefined;
    streamStartedRef.current = false;

    if (pendingAccessLogRef.current) {
      logFeatureAccess({
        module: "consbot",
        action: pendingAccessLogRef.current.action,
        label: pendingAccessLogRef.current.label,
        value: pendingAccessLogRef.current.value,
        chat_id: pendingAccessLogRef.current.chat_id,
        meta: {
          ...pendingAccessLogRef.current.meta,
          ...(first10Lines ? { response: first10Lines } : {}),
        },
      });
      pendingAccessLogRef.current = null;
    }

    if (pendingAuditId.current) {
      if (isFresh && lastAssistant) {
        onAuditComplete(pendingAuditId.current, {
          openaiRequest: openaiAuditRef.current?.request,
          response: openaiAuditRef.current
            ? {
                responseId: openaiAuditRef.current.responseId,
                model: openaiAuditRef.current.model,
                finishReason: openaiAuditRef.current.finishReason,
                usage: openaiAuditRef.current.usage,
              }
            : { aviso: "O stream terminou sem metadados de auditoria da OpenAI." },
          uiResponse: lastAssistant,
        });
      } else {
        onAuditComplete(
          pendingAuditId.current,
          { response: { error: "A chamada foi finalizada sem uma resposta da LLM." } },
          "error",
        );
      }
      pendingAuditId.current = null;
      openaiAuditRef.current = null;
    }
  }, [isBusy, messages, onAuditComplete]);

  const submit = useCallback(
    async (text: string, forceFull = false) => {
      const value = text.trim();
      // `isBusy` só passa a valer quando o sendMessage vai à rede, e antes
      // dele há uma triagem que pode levar segundos. Sem esta trava, um
      // segundo envio nesse intervalo abria uma rodada paralela — dois ecos,
      // duas chamadas, e os refs da primeira sobrescritos pela segunda.
      if (!value || isBusy || submittingRef.current) return;
      submittingRef.current = true;
      setIsPreparing(true);
      try {
        openaiAuditRef.current = null;
        // Marco desta rodada: a resposta que já está na tela. Enquanto a última
        // resposta for esta, não há nada novo para registrar no painel de logs.
        streamStartedRef.current = false;
        baselineAssistantIdRef.current = [...messages]
          .reverse()
          .find((message) => message.role === "assistant")?.id;
        const current = settingsRef.current;
        const store = VECTOR_STORES.find((item) => item.id === current.vectorStoreId);
        const telemetryMeta = {
          model: MODELS.find((item) => item.id === current.model)?.label ?? current.model,
          // O rótulo da base diz mais que o `vs_…` no painel; "Nenhuma" quando sem RAG.
          vector_store: store?.label ?? current.vectorStoreId,
          // O systemPrompt tem milhares de caracteres e é derivado do formato,
          // então registra-se o formato, que o identifica sem inflar o log.
          response_format: current.responseFormat,
          reasoning_effort: current.reasoningEffort,
          verbosity: current.textVerbosity,
          ...(vectorStoresFor(current.vectorStoreId).length > 0
            ? { vector_max_results: current.vectorMaxResults }
            : {}),
        };

        setInput("");
        setHasTyped(true);

        // O eco da pergunta entra ANTES da triagem. Ele não depende de LLM
        // nenhuma, e esperar a triagem para exibi-lo deixava a tela parada por
        // um segundo depois do envio — como se nada tivesse acontecido.
        const echoId = newMessageId();
        const historico = lastAssistantText(messages);
        setMessages((existing) => [
          ...existing,
          { id: echoId, role: "user", parts: [{ type: "text", text: value }] },
        ]);

        // Triagem: o único ponto em que o módulo interfere no fluxo. Com o Modo
        // Agente desligado devolve bypass sem tocar em rede, e daqui para baixo
        // tudo se comporta como antes dele existir.
        const triage = forceFull
          ? { mode: "full" as const, answer: "", context: "" }
          : await triageAgent({
              userText: value,
              assistantText: historico,
              settings: settingsRef.current.agent,
              host: agentHost,
              threadId,
            });

        // A auditoria abre DEPOIS da triagem porque é aqui que o systemPrompt
        // fica conhecido: no modo «Alimentar LLM» ele leva o bloco de consulta
        // às bases, e auditar o prompt sem esse bloco descrevia uma requisição
        // diferente da que sai.
        const systemPrompt = systemPromptWithVerbosity(current) + triage.context;
        // Vale para o envio e para um eventual «tentar novamente» deste turno.
        // Fica aqui, e não só no caminho completo, para que uma resposta direta
        // não deixe o bloco da rodada anterior pendurado no ref.
        agentContextRef.current = triage.context;
        pendingAuditId.current = onAuditStart({
          endpoint: `${API_BASE}/api/llm`,
          sentAt: new Date().toISOString(),
          body: {
            messages: [...messages, { role: "user", parts: [{ type: "text", text: value }] }],
            model: current.model,
            vectorStores: vectorStoresFor(current.vectorStoreId),
            systemPrompt,
            reasoningEffort: current.reasoningEffort,
            verbosity: current.textVerbosity,
            ...(vectorStoresFor(current.vectorStoreId).length > 0
              ? { vectorMaxResults: current.vectorMaxResults }
              : {}),
            stream: true,
          },
        });

        // A triagem resolveu sozinha: a resposta é curta e a busca vem nos pills.
        // Só intercepta para exibir a resposta curta e o pill «Resposta completa»
        // se a opção fullAnswer estiver configurada como "pill".
        // No padrão ("auto"), a chamada ao modelo completo segue diretamente.
        const allowDirect = settingsRef.current.agent.fullAnswer === "pill";
        if (!forceFull && allowDirect && triage.mode === "direct") {
          logFeatureAccess({
            module: "consbot",
            action: "ask",
            label: "Pergunta ao ConsBOT",
            value,
            chat_id: threadId,
            meta: {
              ...telemetryMeta,
              response: getFirstLines(triage.answer, 10),
            },
          });
          const directMessage: ConsBotUIMessage = {
            id: newMessageId(),
            role: "assistant",
            parts: [{ type: "text", text: triage.answer }],
            metadata: { agentDirect: value },
          };
          setMessages((existing) => [...existing, directMessage]);

          // Nenhuma chamada saiu: a auditoria aberta acima fecha aqui mesmo. Sem
          // isto ela ficava `streaming` para sempre, descrevendo uma requisição
          // que nunca aconteceu.
          if (pendingAuditId.current) {
            onAuditComplete(pendingAuditId.current, {
              response: {
                origem: "triagem do módulo AGENT",
                aviso: "Respondida pela triagem; nenhuma chamada à OpenAI foi feita.",
              },
              uiResponse: directMessage,
            });
            pendingAuditId.current = null;
          }
          return;
        }

        pendingAccessLogRef.current = {
          action: "ask",
          label: "Pergunta ao ConsBOT",
          value,
          chat_id: threadId,
          meta: telemetryMeta,
        };

        // O caminho completo passa pelo transporte, que insere a mensagem do
        // usuário por conta própria — o eco provisório sai para não duplicar.
        //
        // A troca deixa uma lacuna de um quadro (~28 ms medidos): o sendMessage
        // insere a dele depois de um await interno, então as duas atualizações
        // não caem no mesmo lote. Some se um dia o SDK aceitar reaproveitar o
        // id do eco; até lá, um quadro é melhor que a pergunta duplicada.
        setMessages((existing) => existing.filter((message) => message.id !== echoId));

        void sendMessage({
          text: value,
          metadata: { ragVectorStoreId: settingsRef.current.vectorStoreId },
        });
      } finally {
        // A partir daqui quem sinaliza atividade é o `status` do useChat.
        submittingRef.current = false;
        setIsPreparing(false);
      }
    },
    [
      agentHost,
      isBusy,
      messages,
      onAuditComplete,
      onAuditStart,
      sendMessage,
      setMessages,
      threadId,
    ],
  );

  // Refaz a pergunta pelo caminho completo. Descarta o par que a triagem
  // criou — pergunta e resposta curta — para a conversa não ficar com a mesma
  // pergunta duas vezes; o sendMessage recria a mensagem do usuário.
  const askFullAnswer = useCallback(
    (question: string) => {
      setMessages((current) => {
        const trimmed = [...current];
        if (trimmed.at(-1)?.role === "assistant") trimmed.pop();
        if (trimmed.at(-1)?.role === "user") trimmed.pop();
        return trimmed;
      });
      void submit(question, true);
    },
    [setMessages, submit],
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
        void submit(trimmed);
      }
    }
  }, [searchParams, setSearchParams, submit]);

  const previousThemesRef = useRef<string[]>([]);
  const refreshSuggestions = useCallback(
    async (forcedVectorStoreId?: ChatSettings["vectorStoreId"]) => {
      if (isRefreshingSuggestions || isBusy) return;
      const expectedCount = 4;
      setIsRefreshingSuggestions(true);

      const targetVectorStoreId = forcedVectorStoreId ?? settingsRef.current.vectorStoreId;
      const isEnglish = isEnglishVectorStore(targetVectorStoreId);

      const previousThemesContext =
        previousThemesRef.current.length > 0
          ? isEnglish
            ? `\nConscientiology themes/concepts already covered previously in this session (DO NOT repeat or approach these themes):\n${previousThemesRef.current
                .map((theme) => `- ${theme}`)
                .join(
                  "\n",
                )}\n\nChoose completely new and distinct themes within the wide universe of Conscientiology.\n`
            : `\nTemáticas/conceitos da Conscienciologia já abordados anteriormente nesta sessão (NÃO repita nem se aproxime dessas temáticas):\n${previousThemesRef.current
                .map((theme) => `- ${theme}`)
                .join(
                  "\n",
                )}\n\nEscolha temáticas completamente inéditas e distintas dentro do amplo universo da Conscienciologia.\n`
          : "";

      const prompt = isEnglish
        ? `Generate exactly ${expectedCount} suggested questions about the Conscientiology corpus following strictly these guidelines:\n\n` +
          `- For each item return the topic ('topic') and the question ('question').\n` +
          `- Each question must address a completely different topic or concept from the other questions in this batch.\n` +
          `- Freely choose new topics and technical terms of Conscientiology, widely varying the topics in each generation.\n` +
          `- Do not repeat topics covered in previous rounds.\n` +
          `- Generate questions with at most 10 words each.\n` +
          `- Write in British English, in a clear, natural manner, ending with a question mark.\n` +
          `- Do not ask overly narrow questions or questions that can be answered with yes or no.\n` +
          `- Prefer using Conscientiological terms and vocabulary.\n` +
          previousThemesContext
        : `Gere exatamente ${expectedCount} perguntas de sugestão sobre o corpus da Conscienciologia seguindo estritamente estas diretrizes:\n\n` +
          `- Para cada item retorne a temática ('topic') e a pergunta ('question').\n` +
          `- Cada pergunta deve abordar uma temática ou conceito totalmente diferente das outras perguntas deste lote.\n` +
          `- Escolha livremente novas temáticas e termos técnicos da Conscienciologia, variando amplamente os tópicos a cada geração.\n` +
          `- Não repita temáticas abordadas em rodadas anteriores.\n` +
          `- Gere perguntas com no máximo 10 palavras cada uma.\n` +
          `- Escreva em português do Brasil, de forma clara, natural e terminando com ponto de interrogação.\n` +
          `- Não faça perguntas muito fechadas ou que possam ser respondidas com sim ou não.\n` +
          `- Prefira usar termos e jargões conscienciológicos.\n` +
          previousThemesContext;

      const schemaDescription = isEnglish
        ? `An object with exactly ${expectedCount} suggestions containing topic ('topic') and question ('question') on Conscientiology, with varied themes and short questions (max 10 words) in British English.`
        : `Um objeto com exatamente ${expectedCount} sugestões contendo temática ('topic') e pergunta ('question') sobre Conscienciologia, com temas variados e perguntas curtas (máx 10 palavras).`;

      const requestBody = {
        messages: [{ role: "user", content: prompt }],
        model: "gpt-5.6-luna",
        reasoningEffort: "none",
        verbosity: "low",
        responseSchema: SUGGESTIONS_SCHEMA,
        responseSchemaName: isEnglish ? "initial_questions" : "perguntas_iniciais",
        responseSchemaDescription: schemaDescription,
      };
      const auditId = onAuditStart({
        endpoint: `${API_BASE}/api/llm`,
        sentAt: new Date().toISOString(),
        body: requestBody,
      });

      try {
        const response = await fetch(`${API_BASE}/api/llm`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(requestBody),
        });
        const result = (await response.json()) as {
          content?: string;
          detail?: string;
          request?: unknown;
          responseId?: string | null;
          model?: string;
          usage?: unknown;
        };
        if (!response.ok) {
          throw new Error(
            result.detail ||
              (isEnglish
                ? "Unable to generate new questions."
                : "Não foi possível gerar novas perguntas."),
          );
        }
        const parsed = result.content ? (JSON.parse(result.content) as SuggestionsPayload) : {};
        const suggestionItems = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
        const completeSuggestions = suggestionItems
          .map((item) => item.question)
          .filter(isCompleteSuggestion);
        if (completeSuggestions.length !== expectedCount) {
          throw new Error(
            isEnglish
              ? "The LLM did not return four complete questions in British English."
              : "A LLM não retornou quatro perguntas completas em português brasileiro.",
          );
        }
        const validThemes = suggestionItems
          .map((item) => item.topic)
          .filter((topic): topic is string => typeof topic === "string" && Boolean(topic.trim()));
        if (validThemes.length > 0) {
          previousThemesRef.current = [...previousThemesRef.current, ...validThemes].slice(-30);
        }
        setSuggestions(completeSuggestions);
        onAuditComplete(auditId, {
          openaiRequest: result.request,
          response: { responseId: result.responseId, model: result.model, usage: result.usage },
          uiResponse: completeSuggestions,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : isEnglish
              ? "Unable to generate new questions."
              : "Não foi possível gerar novas perguntas.";
        onAuditComplete(auditId, { response: { error: message } }, "error");
        toast.error(message);
      } finally {
        setIsRefreshingSuggestions(false);
      }
    },
    [isBusy, isRefreshingSuggestions, onAuditComplete, onAuditStart],
  );

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

  const prevVectorStoreIdRef = useRef(settings.vectorStoreId);
  useEffect(() => {
    if (prevVectorStoreIdRef.current === settings.vectorStoreId) {
      return;
    }
    const previousStoreId = prevVectorStoreIdRef.current;
    prevVectorStoreIdRef.current = settings.vectorStoreId;

    if (isEnglishVectorStore(previousStoreId) !== isEnglishVectorStore(settings.vectorStoreId)) {
      setHasTyped(false);
      previousThemesRef.current = [];
    }

    if (messages.length === 0 && !hasInitialUrlQuestion.current && !isBusy) {
      void refreshSuggestions(settings.vectorStoreId);
    }
  }, [isBusy, messages.length, refreshSuggestions, settings.vectorStoreId]);

  const regenerateWithAudit = () => {
    if (isBusy) return;
    const current = settingsRef.current;
    const store = VECTOR_STORES.find((item) => item.id === current.vectorStoreId);
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userText = lastUser ? getMessageText(lastUser) : "";
    pendingAccessLogRef.current = {
      action: "regenerate",
      label: "Regeneração de resposta",
      value: userText,
      chat_id: threadId,
      meta: {
        model: MODELS.find((item) => item.id === current.model)?.label ?? current.model,
        vector_store: store?.label ?? current.vectorStoreId,
        response_format: current.responseFormat,
        reasoning_effort: current.reasoningEffort,
        verbosity: current.textVerbosity,
        ...(vectorStoresFor(current.vectorStoreId).length > 0
          ? { vector_max_results: current.vectorMaxResults }
          : {}),
      },
    };
    openaiAuditRef.current = null;
    pendingAuditId.current = onAuditStart({
      endpoint: `${API_BASE}/api/llm`,
      sentAt: new Date().toISOString(),
      action: "regenerate",
      body: {
        messages,
        model: settingsRef.current.model,
        vectorStores: vectorStoresFor(settingsRef.current.vectorStoreId),
        systemPrompt: systemPromptWithVerbosity(settingsRef.current),
        reasoningEffort: settingsRef.current.reasoningEffort,
        verbosity: settingsRef.current.textVerbosity,
        ...(vectorStoresFor(settingsRef.current.vectorStoreId).length > 0
          ? { vectorMaxResults: settingsRef.current.vectorMaxResults }
          : {}),
        stream: true,
      },
    });
    void regenerate();
  };

  const stopWithAudit = () => {
    if (pendingAccessLogRef.current) {
      const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
      const assistantText = lastAssistant ? getMessageText(lastAssistant) : "";
      const first10Lines = assistantText
        ? getFirstLines(assistantText, 10)
        : "[Resposta interrompida pelo usuário]";
      logFeatureAccess({
        module: "consbot",
        action: pendingAccessLogRef.current.action,
        label: pendingAccessLogRef.current.label,
        value: pendingAccessLogRef.current.value,
        chat_id: pendingAccessLogRef.current.chat_id,
        meta: {
          ...pendingAccessLogRef.current.meta,
          response: first10Lines,
        },
      });
      pendingAccessLogRef.current = null;
    }
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
            <div className="flex flex-col items-center gap-3 pt-0 sm:gap-6 sm:pt-4">
              <div className="flex flex-col items-center gap-2 text-center">
                {/* 22px no mobile e 40px no desktop */}
                <h2 className="font-display text-[24px] font-normal leading-[1.2] text-foreground sm:text-[42px]">
                  {isEnglishVectorStore(settings.vectorStoreId) ? (
                    <>
                      Artificial Intelligence
                      <br />
                      <span className="italic text-primary/80">in Service of Consciousness</span>
                    </>
                  ) : (
                    <>
                      Inteligência Artificial
                      <br />
                      <span className="italic text-primary/80">a serviço da Consciência</span>
                    </>
                  )}
                </h2>
              </div>

              {!hasInitialUrlQuestion.current ? (
                <>
                  <div className="-mb-3 flex w-full justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-full text-muted-foreground/70 hover:bg-primary/10 hover:text-primary"
                      aria-label={
                        isEnglishVectorStore(settings.vectorStoreId)
                          ? "Generate new initial questions"
                          : "Gerar novas perguntas iniciais"
                      }
                      title={
                        isEnglishVectorStore(settings.vectorStoreId)
                          ? "Generate new questions"
                          : "Gerar novas perguntas"
                      }
                      onClick={() => void refreshSuggestions()}
                      disabled={isRefreshingSuggestions || isBusy}
                    >
                      <RefreshCw className={isRefreshingSuggestions ? "animate-spin" : undefined} />
                    </Button>
                  </div>
                  {suggestions.length > 0 ? (
                    <div className="grid w-full gap-2 sm:grid-cols-2">
                      {suggestions.slice(0, 4).map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => void submit(suggestion)}
                          className="rounded-xl border border-border bg-card/80 px-3.5 py-2 text-left text-xs font-chat text-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm"
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
                ? getRagStatus(
                    message,
                    messages[messageIndex + 1],
                    settings.vectorStoreId,
                    sourceCounts,
                  )
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
                            className="mb-2 rounded-xl border border-border/70 bg-secondary/60 px-3 py-2 text-xs font-chat text-muted-foreground"
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
                {message.role === "user" ? (
                  <AgentStatus settings={settings.agent} isAdmin={isAdmin} />
                ) : null}
              </div>
            );
          })}

          {status === "submitted" || isPreparing ? (
            <Shimmer className="text-sm">{isEnglish ? "Thinking..." : "Pensando..."}</Shimmer>
          ) : null}

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

          {/* Módulo AGENT (opt-in): inerte enquanto AGENT_MODE=0. */}
          <AgentActions
            threadId={threadId}
            settings={settings.agent}
            host={agentHost}
            messages={messages}
            fullAnswerQuestion={
              messages.at(-1)?.role === "assistant" ? directQuestion(messages.at(-1)!) : ""
            }
            onFullAnswer={askFullAnswer}
          />
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="pb-9 sm:pb-5">
        <PromptInput
          className="[&_[data-slot=input-group]]:rounded-[28px] [&_[data-slot=input-group]]:border-border/70 [&_[data-slot=input-group]]:bg-card [&_[data-slot=input-group]]:shadow-[0_3px_14px_-5px_oklch(0.3_0.02_155/0.22)]"
          onSubmit={(message, event) => {
            event.preventDefault();
            void submit(message.text || input);
          }}
        >
          <PromptInputTextarea
            ref={textareaRef}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              if (!hasTyped && event.target.value.length > 0) {
                setHasTyped(true);
              }
            }}
            className="field-sizing-content max-h-48 min-h-14 resize-none bg-transparent px-5 py-4 text-base font-chat"
            placeholder={
              hasTyped
                ? ""
                : isMobile
                  ? isEnglishVectorStore(settings.vectorStoreId)
                    ? "Hello Conscientiologist!"
                    : "Olá Conscienciólogo!"
                  : isEnglishVectorStore(settings.vectorStoreId)
                    ? "Hello Conscientiologist! What would you like to discuss today?"
                    : "Olá Conscienciólogo! O que você gostaria de conversar hoje?"
            }
          />
          <div className="flex shrink-0 items-center pr-2">
            <PromptInputSubmit
              status={status}
              disabled={!isBusy && (isPreparing || input.trim().length === 0)}
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
