import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";

import type { AuditDataParts } from "../src/lib/audit-log.ts";
import { getAccessLevel } from "./access-level.js";
import { enforceModelRateLimit } from "./rate-limit.js";

type VercelRequest = {
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  status: (statusCode: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  write: (chunk: Uint8Array) => void;
  end: (chunk?: string) => void;
};

export const config = {
  runtime: "nodejs",
};

const ALLOWED_MODELS = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"] as const;
const EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"] as const;
// Padrões do backend: mantidos no diretório api para que a função Vercel não
// dependa de módulos do bundle do cliente em src/.
const DEFAULT_MODEL = "gpt-5.6-terra";
const DEFAULT_VECTOR_STORE_ID = "vs_6a7f75cd0be48191b3f3960a518c6ff3";
const DEFAULT_MAX_OUTPUT_TOKENS = 2048;
const DEFAULT_RESPONSE_FORMAT = "conscienciological";
const FALLBACK_SYSTEM_PROMPT =
  "Você é o ConsBOT, especializado em Conscienciologia. Responda com clareza, precisão, respeito às fontes disponíveis e no idioma do usuário.";
const VECTOR_STORE_IDS = [
  "vs_6a7f75cd0be48191b3f3960a518c6ff3",
  "vs_6912908250e4819197e23fe725e04fae",
  "vs_698be4e07c748191b834905ebc7a7da3",
  "vs_69931da436e48191b43453e845e63bd3",
  "vs_68f195fdeda08191815ec795ba1f57ba",
  "vs_699d09de9ca48191b63fbbd4d195a696",
] as const;

const RESPONSE_LENGTH_GUIDANCE: Record<number, string> = {
  256: "Responda em modo Síntese: entregue somente o essencial, em no máximo um parágrafo curto ou uma lista breve quando necessária.",
  512: "Responda em modo Breve: priorize objetividade e entregue apenas o contexto indispensável, em poucos parágrafos curtos.",
  1024: "Responda em modo Longa: desenvolva a explicação com contexto e exemplos pertinentes, sem repetição.",
  2048: "Responda em modo Extensa: aprofunde a análise com organização e exemplos, preservando clareza e concisão.",
  4096: "Responda em modo Livre: adapte a extensão à complexidade da solicitação, sem alongar artificialmente a resposta.",
};

function toSafeStreamError(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro desconhecido ao gerar a resposta.";
  return message.replace(/sk-[A-Za-z0-9_-]+/g, "[chave removida]");
}

type ChatRequestBody = {
  messages?: unknown;
  sessionId?: unknown;
  model?: unknown;
  vectorStoreId?: unknown;
  systemPrompt?: unknown;
  reasoningEffort?: unknown;
  textVerbosity?: unknown;
  maxOutputTokens?: unknown;
  responseFormat?: unknown;
};

type AuditUIMessage = UIMessage<unknown, AuditDataParts>;

function toAuditValue(value: unknown): unknown {
  const seen = new WeakSet<object>();
  const json = JSON.stringify(value, (key, currentValue: unknown) => {
    if (/^(authorization|api-key|set-cookie)$/i.test(key)) return "[valor sensível omitido]";
    if (/^(reasoningEncryptedContent|encrypted_content)$/i.test(key)) {
      const length = typeof currentValue === "string" ? currentValue.length : 0;
      return `[conteúdo de raciocínio criptografado omitido${length ? ` — ${length} caracteres` : ""}]`;
    }
    if (typeof currentValue === "bigint") return currentValue.toString();
    if (currentValue instanceof Date) return currentValue.toISOString();
    if (currentValue && typeof currentValue === "object") {
      if (seen.has(currentValue)) return "[referência circular omitida]";
      seen.add(currentValue);
    }
    return currentValue;
  });

  return json === undefined ? null : (JSON.parse(json) as unknown);
}

export async function POST(request: VercelRequest, response: VercelResponse) {
  try {
    const body = (request.body ?? {}) as ChatRequestBody;

    if (!Array.isArray(body.messages)) {
      response.status(400).end("Messages are required");
      return;
    }

    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      response.status(500).end("Missing OPENAI_API_KEY in environment variables");
      return;
    }

    const isAdmin = getAccessLevel() === 1;
    const modelName =
      isAdmin &&
      typeof body.model === "string" &&
      (ALLOWED_MODELS as readonly string[]).includes(body.model)
        ? body.model
        : DEFAULT_MODEL;

    try {
      const rateLimit = await enforceModelRateLimit(request, modelName);
      if (rateLimit.enabled) {
        response.setHeader("X-RateLimit-Limit", String(rateLimit.limit));
        response.setHeader("X-RateLimit-Remaining", String(rateLimit.remaining));
      }
      if (!rateLimit.allowed) {
        response.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
        response.status(429).end(
          `Limite diário para ${modelName} atingido. Tente novamente em cerca de ${Math.ceil(rateLimit.retryAfterSeconds / 3600)} hora(s).`,
        );
        return;
      }
    } catch (rateLimitError) {
      // A indisponibilidade do Redis não impede o chat; o erro fica somente no log do servidor.
      console.error("Rate limit unavailable:", rateLimitError);
    }

    const effort =
      isAdmin &&
      typeof body.reasoningEffort === "string" &&
      (EFFORTS as readonly string[]).includes(body.reasoningEffort)
        ? body.reasoningEffort
        : "none";

    const textVerbosity =
      isAdmin &&
      typeof body.textVerbosity === "string" && ["low", "medium", "high"].includes(body.textVerbosity)
        ? body.textVerbosity
        : "low";

    const vectorStoreId =
      isAdmin &&
      typeof body.vectorStoreId === "string" &&
      (VECTOR_STORE_IDS as readonly string[]).includes(body.vectorStoreId)
        ? body.vectorStoreId
        : DEFAULT_VECTOR_STORE_ID;

    const system =
      typeof body.systemPrompt === "string" && body.systemPrompt.trim().length > 0
        ? body.systemPrompt.trim()
        : FALLBACK_SYSTEM_PROMPT;

    const maxOutputTokens =
      isAdmin &&
      typeof body.maxOutputTokens === "number" &&
      Number.isFinite(body.maxOutputTokens) &&
      body.maxOutputTokens > 0
        ? Math.min(Math.round(body.maxOutputTokens), 32000)
        : DEFAULT_MAX_OUTPUT_TOKENS;

    const isConscienciologicalFormat =
      typeof body.responseFormat === "string"
        ? body.responseFormat === "conscienciological"
        : DEFAULT_RESPONSE_FORMAT === "conscienciological";
    const responseLengthGuidance = maxOutputTokens
      ? RESPONSE_LENGTH_GUIDANCE[maxOutputTokens]
      : undefined;
    const conscienciologicalSynthesisRule =
      isConscienciologicalFormat && maxOutputTokens === 256
        ? "MODO SÍNTESE — REGRA OBRIGATÓRIA: responda apenas com # [Título], seguido de **Definição.** e # Exemplo. A definição deve conter exatamente uma frase e respeitar integralmente a forma conscienciológica exigida; o exemplo deve conter exatamente uma frase e começar com palavra-síntese em negrito. Não inclua Argumentação, Conclusão, Sugestões de Aprofundamento, Referências nem qualquer outro conteúdo."
        : undefined;
    const effectiveSystem = [system, responseLengthGuidance, conscienciologicalSynthesisRule]
      .filter(Boolean)
      .join("\n\n");

    const sessionId =
      typeof body.sessionId === "string" && body.sessionId.length > 0
        ? body.sessionId.slice(0, 64)
        : undefined;

    const capturedOpenAIRequests: unknown[] = [];
    const auditedFetch: typeof fetch = async (input, init) => {
      const rawBody = init?.body;
      let parsedBody: unknown = rawBody ?? null;
      if (typeof rawBody === "string") {
        try {
          parsedBody = JSON.parse(rawBody) as unknown;
        } catch {
          parsedBody = rawBody;
        }
      }
      capturedOpenAIRequests.push({
        method: init?.method ?? "POST",
        endpoint: typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        body: parsedBody,
      });
      return globalThis.fetch(input, init);
    };

    const openai = createOpenAI({ apiKey, fetch: auditedFetch });

    const modelMessages = await convertToModelMessages(body.messages as AuditUIMessage[]);
    const result = streamText({
      model: openai.responses(modelName),
      ...(effectiveSystem ? { system: effectiveSystem } : {}),
      messages: modelMessages,
      // O handler do Vercel recebe IncomingMessage, não o Request da Web API.
      // Mantemos um sinal próprio para que a rota funcione igualmente no deploy.
      abortSignal: new AbortController().signal,
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
      ...(vectorStoreId
        ? {
            tools: {
              fileSearch: openai.tools.fileSearch({ vectorStoreIds: [vectorStoreId] }),
            },
            toolChoice: { type: "tool" as const, toolName: "fileSearch" },
          }
        : {}),
      providerOptions: {
        openai: {
          reasoningEffort: effort,
          textVerbosity,
          reasoningSummary: null,
          reasoningContext: "all_turns",
          store: true,
          ...(sessionId ? { safetyIdentifier: sessionId } : {}),
          ...(vectorStoreId ? { include: ["file_search_call.results"] } : {}),
        },
      },
    });

    const stream = createUIMessageStream<AuditUIMessage>({
      execute: async ({ writer }) => {
        writer.merge(
          result.toUIMessageStream<AuditUIMessage>({
            originalMessages: body.messages as AuditUIMessage[],
            sendReasoning: false,
            sendSources: true,
            sendFinish: false,
            onError: (error) => {
              console.error("Chat stream error:", error);
              return toSafeStreamError(error);
            },
          }),
        );

        const [responseMetadata, content, usage, finishReason, providerMetadata, warnings] =
          await Promise.all([
            result.response,
            result.content,
            result.totalUsage,
            result.finishReason,
            result.providerMetadata,
            result.warnings,
          ]);

        writer.write({
          type: "data-openaiAudit",
          transient: true,
          data: {
            request: toAuditValue({
              calls: capturedOpenAIRequests,
            }),
            response: toAuditValue({
              id: responseMetadata.id,
              model: responseMetadata.modelId,
              createdAt: responseMetadata.timestamp,
              headers: responseMetadata.headers,
              rawBody: responseMetadata.body ?? null,
              output: content,
              finishReason,
              usage,
              providerMetadata,
              warnings,
            }),
          },
        });
        writer.write({ type: "finish", finishReason });
      },
      onError: (error) => {
        console.error("Chat audit stream error:", error);
        return toSafeStreamError(error);
      },
    });

    const streamedResponse = createUIMessageStreamResponse({ stream });
    response.status(streamedResponse.status);
    streamedResponse.headers.forEach((value, key) => response.setHeader(key, value));
    if (!streamedResponse.body) {
      response.end();
      return;
    }
    await streamedResponse.body.pipeTo(
      new WritableStream<Uint8Array>({
        write(chunk) {
          response.write(chunk);
        },
        close() {
          response.end();
        },
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      response.status(499).end("Cancelado");
      return;
    }
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Chat API error:", error);
    response.status(500).end(message);
  }
}

export default POST;
