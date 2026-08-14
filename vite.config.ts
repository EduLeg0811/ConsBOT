import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { POST as handleChatPost } from "./api/chat.ts";
import { POST as handleSuggestionsPost } from "./api/suggestions.ts";
import { GET as handleVectorStoreFilesGet } from "./api/vector-store-files.ts";

function devApiChatPlugin(): Plugin {
  return {
    name: "dev-api-chat",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const isChatRequest = req.url?.startsWith("/api/chat") && req.method === "POST";
        const isSuggestionsRequest =
          req.url?.startsWith("/api/suggestions") && req.method === "POST";
        const isSourcesRequest =
          req.url?.startsWith("/api/vector-store-files") && req.method === "GET";

        if (isChatRequest || isSuggestionsRequest || isSourcesRequest) {
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
              process.env["OPENAI_API_KEY"] = apiKey;

              let parsedBody: unknown = {};
              if (isChatRequest || isSuggestionsRequest) {
                try {
                  parsedBody = bodyStr ? (JSON.parse(bodyStr) as unknown) : {};
                } catch {
                  res.statusCode = 400;
                  res.end("JSON inválido");
                  return;
                }
              }
              const query = Object.fromEntries(new URL(`http://localhost${req.url}`).searchParams);
              const apiRequest = { body: parsedBody, query };
              const handler = isChatRequest
                ? handleChatPost
                : isSuggestionsRequest
                  ? handleSuggestionsPost
                  : handleVectorStoreFilesGet;
              const apiResponse = {
                status(statusCode: number) {
                  res.statusCode = statusCode;
                  return apiResponse;
                },
                setHeader(name: string, value: string) {
                  res.setHeader(name, value);
                },
                json(value: unknown) {
                  res.setHeader("Content-Type", "application/json; charset=utf-8");
                  res.end(JSON.stringify(value));
                },
                write(chunk: Uint8Array) {
                  res.write(Buffer.from(chunk));
                },
                end(chunk?: string) {
                  res.end(chunk);
                },
              };
              await handler(apiRequest, apiResponse);
            } catch (err) {
              console.error("Dev API error:", err);
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
  plugins: [tsconfigPaths(), tailwindcss(), react(), devApiChatPlugin()],
  server: {
    port: 5173,
  },
});
