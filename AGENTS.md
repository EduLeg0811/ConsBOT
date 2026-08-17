# ConsBOT

Guia de desenvolvimento para assistentes e agentes IA.

- **Stack:** React 19, Vite, Tailwind CSS v4, Vercel AI SDK, TypeScript.
- **Roteamento:** React Router (SPA).
- **Backend:** Nenhum próprio — puro frontend. Todas as chamadas (chat em
  streaming, sugestões, listagem de vector stores) vão para o Main-Server
  compartilhado via `src/lib/main-server.ts`. Ver `docs/CONSUMERS.md` no
  repositório do Main-Server para o contrato de `/api/llm`.
