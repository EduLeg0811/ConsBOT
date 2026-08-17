// TEMPORÁRIO: sem deploy próprio do Main-Server ainda, aponta para o local.
// A rota antiga (/api/chat, /api/suggestions, ...) era uma função Vercel deste
// mesmo projeto; agora é o Main-Server compartilhado com os demais frontends.
const DEFAULT_API_BASE = "http://127.0.0.1:8000";
const configuredBase = String(import.meta.env.VITE_MAIN_SERVER_URL || "").trim();

export const API_BASE = (configuredBase || DEFAULT_API_BASE).replace(/\/+$/, "");
