import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// A app fala diretamente com o Main-Server (ver src/lib/main-server.ts); não
// há mais backend próprio, então não há mais rota de dev a simular aqui.
export default defineConfig({
  plugins: [tsconfigPaths(), tailwindcss(), react()],
  server: {
    // 5173 continua sendo o padrão local. `PORT` existe porque o Vite não lê
    // essa variável sozinho, e sem isso quem inicia o servidor de fora — o
    // painel de preview, um script — não consegue escolher outra porta quando
    // a 5173 já está ocupada por uma instância anterior.
    port: Number(process.env.PORT) || 5173,
  },
});
