import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

type VercelRequest = { body?: unknown };
type VercelResponse = { status: (statusCode: number) => VercelResponse; json: (body: unknown) => void };

export const config = {
  runtime: "nodejs",
};

const suggestionItemSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .describe(
      "A temática, conceito ou especialidade central da Conscienciologia abordada (ex: 'Estado Vibracional', 'Reciclagem Existencial', 'Tenepes', 'Holossoma', 'Autopensenização', etc.).",
    ),
  question: z
    .string()
    .trim()
    .min(16)
    .max(120)
    .describe(
      "Uma pergunta inicial completa, clara e convidativa em português do Brasil, terminada em ponto de interrogação.",
    ),
});

function isCompletePortugueseSuggestion(value: string) {
  return (
    value.endsWith("?") &&
    /^[A-Za-zÀ-ÖØ-öø-ÿ0-9 .,;:!?…'"“”‘’()\[\]{}<>/\\—–-]+$/.test(value)
  );
}

function toSafeAuditValue(value: unknown): unknown {
  const json = JSON.stringify(value, (key, currentValue: unknown) => {
    if (/^(authorization|api-key|set-cookie)$/i.test(key)) return "[valor sensível omitido]";
    if (/^(reasoningEncryptedContent|encrypted_content)$/i.test(key)) {
      return "[conteúdo de raciocínio criptografado omitido]";
    }
    if (typeof currentValue === "bigint") return currentValue.toString();
    return currentValue;
  });
  return json === undefined ? null : (JSON.parse(json) as unknown);
}

export async function POST(request: VercelRequest, response: VercelResponse) {
  try {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      response.status(500).json({ error: "Missing OPENAI_API_KEY in environment variables" });
      return;
    }

    const body = (request.body ?? {}) as {
      sessionId?: unknown;
      count?: unknown;
      previousThemes?: unknown;
      previousTopics?: unknown;
      previousQuestions?: unknown;
      exclude?: unknown;
    };
    const sessionId =
      typeof body.sessionId === "string" && body.sessionId.length > 0
        ? body.sessionId.slice(0, 64)
        : undefined;
    const count = typeof body.count === "number" && [2, 3, 4].includes(body.count) ? body.count : 4;

    const previousThemesList = Array.isArray(
      body.previousThemes ?? body.previousTopics ?? body.previousQuestions ?? body.exclude,
    )
      ? ((body.previousThemes ?? body.previousTopics ?? body.previousQuestions ?? body.exclude) as unknown[])
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(-30)
      : [];

    const suggestionsSchema = z.object({
      suggestions: z
        .array(suggestionItemSchema)
        .length(count, `Retorne exatamente ${count} perguntas com suas respectivas temáticas.`),
    });
    const capturedRequests: unknown[] = [];
    const auditedFetch: typeof fetch = async (input, init) => {
      let parsedBody: unknown = init?.body ?? null;
      if (typeof init?.body === "string") {
        try {
          parsedBody = JSON.parse(init.body) as unknown;
        } catch {
          parsedBody = init.body;
        }
      }
      capturedRequests.push({
        method: init?.method ?? "POST",
        endpoint: typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        body: parsedBody,
      });
      return globalThis.fetch(input, init);
    };
    const openai = createOpenAI({ apiKey, fetch: auditedFetch });

    const previousThemesContext =
      previousThemesList.length > 0
        ? `\nTemáticas/conceitos da Conscienciologia já abordados anteriormente nesta sessão (NÃO repita nem se aproxime dessas temáticas):\n${previousThemesList
          .map((t) => `- ${t}`)
          .join("\n")}\n\nEscolha temáticas completamente inéditas e distintas dentro do amplo universo da Conscienciologia.\n`
        : "";

    const prompt =
      `Gere exatamente ${count} perguntas de sugestão sobre o corpus da Conscienciologia seguindo estritamente estas diretrizes:\n\n` +
      `- Para cada item retorne a temática ('topic') e a pergunta ('question').\n` +
      `- Cada pergunta deve abordar uma temática ou conceito totalmente diferente das outras perguntas deste lote.\n` +
      `- Escolha livremente novas temáticas e termos técnicos da Conscienciologia, variando amplamente os tópicos a cada geração.\n` +
      `- Não repita temáticas abordadas em rodadas anteriores.\n` +
      `- Gere perguntas com no máximo 10 palavras cada uma.\n` +
      `- Escreva em português do Brasil, de forma clara, natural e terminando com ponto de interrogação.\n` +
      `- Não faça perguntas muito fechadas ou que possam ser respondidas com sim ou não.\n` +
      `- Prefira usar termos e jargões conscienciológicos.\n` +
      previousThemesContext;

    const result = await generateObject({
      model: openai.responses("gpt-5.6-luna"),
      schema: suggestionsSchema,
      schemaName: "perguntas_iniciais",
      schemaDescription:
        `Um objeto com exatamente ${count} sugestões contendo temática ('topic') e pergunta ('question') sobre Conscienciologia, com temas variados e perguntas curtas (máx 10 palavras).`,
      prompt,
      maxOutputTokens: 512,
      providerOptions: {
        openai: {
          reasoningEffort: "none",
          reasoningContext: "current_turn",
          store: true,
          textVerbosity: "low",
          ...(sessionId ? { safetyIdentifier: sessionId } : {}),
        },
      },
    });

    const questions = result.object.suggestions.map((item) => item.question);
    const themes = result.object.suggestions.map((item) => item.topic);

    if (
      questions.length !== count ||
      !questions.every(isCompletePortugueseSuggestion)
    ) {
      response.status(502).json({ error: "A LLM não retornou perguntas sugeridas válidas." });
      return;
    }

    response.status(200).json({
      suggestions: questions,
      themes,
      audit: {
        request: toSafeAuditValue({ calls: capturedRequests }),
        response: toSafeAuditValue({
          model: "gpt-5.6-luna",
          output: result.object.suggestions,
          finishReason: result.finishReason,
          usage: result.usage,
          providerMetadata: result.providerMetadata,
          response: result.response,
          warnings: result.warnings,
        }),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar perguntas iniciais.";
    console.error("Suggestions API error:", error);
    response.status(500).json({ error: message.replace(/sk-[A-Za-z0-9_-]+/g, "[chave removida]") });
  }
}

export default POST;
