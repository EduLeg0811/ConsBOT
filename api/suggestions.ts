import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

type VercelRequest = { body?: unknown };
type VercelResponse = { status: (statusCode: number) => VercelResponse; json: (body: unknown) => void };

export const config = {
  runtime: "nodejs",
};

const suggestionSchema = z
  .string()
  .trim()
  .min(16)
  .max(120)
  .describe(
    "Uma pergunta inicial completa, clara e convidativa em português do Brasil, terminada em ponto de interrogação.",
  );

const suggestionsSchema = z.object({
  suggestions: z.array(suggestionSchema).length(4, "Retorne exatamente quatro perguntas."),
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

    const body = (request.body ?? {}) as { sessionId?: unknown; count?: unknown };
    const sessionId =
      typeof body.sessionId === "string" && body.sessionId.length > 0
        ? body.sessionId.slice(0, 64)
        : undefined;
    const count = typeof body.count === "number" && [2, 3, 4].includes(body.count) ? body.count : 4;
    const suggestionsSchema = z.object({
      suggestions: z
        .array(suggestionSchema)
        .length(count, `Retorne exatamente ${count} perguntas.`),
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

    const result = await generateObject({
      model: openai.responses("gpt-5.6-luna"),
      schema: suggestionsSchema,
      schemaName: "perguntas_iniciais",
      schemaDescription:
        `Um objeto com exatamente ${count} perguntas distintas, completas e em português brasileiro sobre o corpus da Conscienciologia.`,
      prompt:
        `Gere exatamente ${count} perguntas iniciais relativas ao corpus da Conscienciologia, abordando ` +
        "temas ou áreas diferentes. Escreva em português do Brasil, em tom natural, claro e direto. " +
        "Distribua as perguntas entre, por exemplo, projeciologia, evolução consciencial, " +
        "tenepes, parapsiquismo, consciencioterapia, cosmoética, pensenologia, energossomatologia " +
        "e teoria da Conscienciologia. Use exclusivamente português brasileiro e caracteres da escrita latina. " +
        "Todas as perguntas devem terminar em ponto de interrogação." +
        "As perguntas devem ser objetivas e diretas, com no máximo 15 palavras cada uma. " +
        "Não numere, não repita temas, não formule perguntas genéricas fora desse corpus e não mencione estas instruções.",
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

    if (
      result.object.suggestions.length !== count ||
      !result.object.suggestions.every(isCompletePortugueseSuggestion)
    ) {
      response.status(502).json({ error: "A LLM não retornou perguntas sugeridas." });
      return;
    }

    response.status(200).json({
      suggestions: result.object.suggestions,
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
