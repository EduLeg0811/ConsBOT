import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },

  // ── Fronteira do módulo AGENT ──────────────────────────────────────────────
  // O módulo é autocontido: o que ele precisa do ConsBOT entra pelo AgentHost
  // (src/agent/host.ts). Importar @/lib ou @/components aqui dentro recria a
  // amarra que a modularização desfez, e tira a chance de extrair o módulo.
  {
    files: ["src/agent/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/*", "@/components/*", "@/pages/*", "@/hooks/*"],
              message:
                "O modulo AGENT nao importa do ConsBOT. Precisa de algo do hospedeiro? Acrescente ao AgentHost em src/agent/host.ts.",
            },
          ],
        },
      ],
    },
  },

  // O caminho inverso: o ConsBOT fala com o módulo só pela superfície pública.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/agent/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/agent/*"],
              message: 'Importe de "@/agent" — o indice e a unica superficie publica do modulo.',
            },
          ],
        },
      ],
    },
  },

  eslintPluginPrettier,
);
