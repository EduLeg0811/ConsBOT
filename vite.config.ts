import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// A app fala diretamente com o Main-Server (ver src/lib/main-server.ts); não
// há mais backend próprio, então não há mais rota de dev a simular aqui.
export default defineConfig({
  plugins: [tsconfigPaths(), tailwindcss(), react()],
  server: {
    port: 5173,
  },
});
