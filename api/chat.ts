import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

export const config = {
  runtime: "nodejs",
};

const ALLOWED_MODELS = ["gpt-4o-mini", "gpt-4o", "o3-mini"] as const;
const EFFORTS = ["low", "medium", "high"] as const;

function toSafeStreamError(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro desconhecido ao gerar a resposta.";
  return message.replace(/sk-[A-Za-z0-9_-]+/g, "[chave removida]");
}

type ChatRequestBody = {
  messages?: unknown;
  model?: unknown;
  systemPrompt?: unknown;
  reasoningEffort?: unknown;
  reasoningSummary?: unknown;
  maxOutputTokens?: unknown;
  topP?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequestBody;

    if (!Array.isArray(body.messages)) {
      return new Response("Messages are required", { status: 400 });
    }

    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      return new Response("Missing OPENAI_API_KEY in environment variables", { status: 500 });
    }

    const modelName =
      typeof body.model === "string" &&
      (ALLOWED_MODELS as readonly string[]).includes(body.model)
        ? body.model
        : "gpt-4o";

    const effort =
      typeof body.reasoningEffort === "string" &&
      (EFFORTS as readonly string[]).includes(body.reasoningEffort)
        ? body.reasoningEffort
        : "medium";

    const system =
      typeof body.systemPrompt === "string" && body.systemPrompt.trim().length > 0
        ? body.systemPrompt.trim()
        : undefined;

    const maxOutputTokens =
      typeof body.maxOutputTokens === "number" &&
      Number.isFinite(body.maxOutputTokens) &&
      body.maxOutputTokens > 0
        ? Math.min(Math.round(body.maxOutputTokens), 32000)
        : undefined;

    const topP =
      typeof body.topP === "number" && body.topP > 0 && body.topP <= 1
        ? body.topP
        : undefined;

    const sendReasoning = body.reasoningSummary !== false;

    const openai = createOpenAI({
      apiKey,
    });

    const isReasoningModel = modelName.startsWith("o");

    const result = streamText({
      model: openai(modelName),
      ...(system && !isReasoningModel ? { system } : {}),
      ...(topP && !isReasoningModel ? { topP } : {}),
      messages: await convertToModelMessages(body.messages as UIMessage[]),
      abortSignal: request.signal,
      providerOptions: isReasoningModel
        ? {
            openai: {
              reasoningEffort: effort,
              ...(maxOutputTokens ? { maxOutputTokens } : {}),
            },
          }
        : {
            openai: {
              ...(maxOutputTokens ? { maxOutputTokens } : {}),
            },
          },
    });

    return result.toUIMessageStreamResponse({
      originalMessages: body.messages as UIMessage[],
      sendReasoning,
      onError: (error) => {
        console.error("Chat stream error:", error);
        return toSafeStreamError(error);
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return new Response("Cancelado", { status: 499 });
    }
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Chat API error:", error);
    return new Response(message, { status: 500 });
  }
}

export default POST;
