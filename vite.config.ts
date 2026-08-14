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

              const abortController = new AbortController();
              req.once("aborted", () => abortController.abort());
              const request = new Request(`http://localhost${req.url}`, {
                method: req.method,
                headers: { "Content-Type": req.headers["content-type"] ?? "application/json" },
                ...(isChatRequest || isSuggestionsRequest ? { body: bodyStr } : {}),
                signal: abortController.signal,
              });
              const response = isChatRequest
                ? await handleChatPost(request)
                : isSuggestionsRequest
                  ? await handleSuggestionsPost(request)
                  : await handleVectorStoreFilesGet(request);

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
