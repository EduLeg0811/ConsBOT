import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

export const config = {
  runtime: "nodejs",
};

const suggestionSchema = z
  .string()
  .trim()
  .min(12)
  .max(90)
  .describe("Uma pergunta inicial curta, clara e convidativa em português do Brasil.");

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

export async function POST(request: Request) {
  try {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      return Response.json(
        { error: "Missing OPENAI_API_KEY in environment variables" },
        { status: 500 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as { sessionId?: unknown };
    const sessionId =
      typeof body.sessionId === "string" && body.sessionId.length > 0
        ? body.sessionId.slice(0, 64)
        : undefined;
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
      output: "array",
      schema: suggestionSchema,
      schemaName: "perguntas_iniciais",
      schemaDescription:
        "Exatamente oito perguntas distintas sobre o corpus da Conscienciologia, para iniciar uma conversa.",
      prompt:
        "Gere exatamente 8 perguntas iniciais relativas ao corpus da Conscienciologia, abordando " +
        "temas ou áreas diferentes. Escreva em português do Brasil, em tom natural, claro e direto. " +
        "Distribua as perguntas entre, por exemplo, projeciologia, evolução consciencial, " +
        "tenepes, parapsiquismo, consciencioterapia, cosmoética, pensenologia, energossomatologia " +
        "e teoria da Conscienciologia. Use exclusivamente português brasileiro e caracteres da escrita latina. " +
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

    // O schema já valida cada pergunta. Não descartamos sugestões utilizáveis
    // apenas porque o modelo retornou menos de oito itens em uma chamada.
    if (result.object.length === 0) {
      return Response.json(
        { error: "A LLM não retornou perguntas sugeridas." },
        { status: 502 },
      );
    }

    return Response.json({
      suggestions: result.object,
      audit: {
        request: toSafeAuditValue({ calls: capturedRequests }),
        response: toSafeAuditValue({
          model: "gpt-5.6-luna",
          output: result.object,
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
    return Response.json(
      { error: message.replace(/sk-[A-Za-z0-9_-]+/g, "[chave removida]") },
      { status: 500 },
    );
  }
}

export default POST;
