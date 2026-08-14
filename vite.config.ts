import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

function toSafeStreamError(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro desconhecido ao gerar a resposta.";
  return message.replace(/sk-[A-Za-z0-9_-]+/g, "[chave removida]");
}

function devApiChatPlugin(): Plugin {
  return {
    name: "dev-api-chat",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith("/api/chat") && req.method === "POST") {
          let bodyStr = "";
          req.on("data", (chunk: Buffer) => {
            bodyStr += chunk.toString();
          });
          req.on("end", async () => {
            try {
              const env = loadEnv(server.config.mode, process.cwd(), "");
              const apiKey = env["OPENAI_API_KEY"] || process.env["OPENAI_API_KEY"];
              if (!apiKey) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                res.end("Erro: OPENAI_API_KEY não configurada no arquivo .env");
                return;
              }

              const body = JSON.parse(bodyStr || "{}");
              if (!Array.isArray(body.messages)) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                res.end("Mensagens são obrigatórias");
                return;
              }

              const modelName = body.model || "gpt-4o";
              const effort = body.reasoningEffort || "medium";
              const system = body.systemPrompt?.trim() || undefined;
              const maxOutputTokens =
                typeof body.maxOutputTokens === "number" && body.maxOutputTokens > 0
                  ? Math.min(Math.round(body.maxOutputTokens), 32000)
                  : undefined;
              const topP =
                typeof body.topP === "number" && body.topP > 0 && body.topP <= 1
                  ? body.topP
                  : undefined;
              const sendReasoning = body.reasoningSummary !== false;

              const openai = createOpenAI({ apiKey });
              const isReasoningModel = typeof modelName === "string" && modelName.startsWith("o");

              const result = streamText({
                model: openai(modelName),
                ...(system && !isReasoningModel ? { system } : {}),
                ...(topP && !isReasoningModel ? { topP } : {}),
                messages: await convertToModelMessages(body.messages as UIMessage[]),
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

              const response = result.toUIMessageStreamResponse({
                originalMessages: body.messages as UIMessage[],
                sendReasoning,
                onError: (error) => {
                  console.error("Dev API stream error:", error);
                  return toSafeStreamError(error);
                },
              });

              res.statusCode = response.status;
              response.headers.forEach((value, key) => {
                res.setHeader(key, value);
              });

              if (response.body) {
                const reader = response.body.getReader();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  res.write(Buffer.from(value));
                }
              }
              res.end();
            } catch (err) {
              console.error("Dev API Error:", err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "text/plain; charset=utf-8");
              const message = err instanceof Error ? err.message : "Erro desconhecido";
              res.end(message);
            }
          });
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    react(),
    devApiChatPlugin(),
  ],
  server: {
    port: 5173,
  },
});
