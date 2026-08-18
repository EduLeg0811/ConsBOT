import type { UIMessage } from "ai";

import { DEFAULT_SETTINGS, type ChatSettings } from "@/lib/chat-settings";

export type ChatThread = {
  id: string;
  title: string;
  updatedAt: number;
  messages: UIMessage[];
  settings: ChatSettings;
};

const THREADS_KEY = "consbot:threads:v1";

function isBrowser() {
  return typeof window !== "undefined";
}

export function newId(): string {
  if (isBrowser() && typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `t-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function normalize(raw: unknown): ChatThread | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Partial<ChatThread>;
  if (typeof t.id !== "string") return null;
  const messages = Array.isArray(t.messages) ? (t.messages as UIMessage[]) : [];
  return {
    id: t.id,
    title: typeof t.title === "string" && t.title.trim() ? t.title : "Nova conversa",
    updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : Date.now(),
    messages,
    // As settings são de sessão: toda carga da página parte do padrão, e o
    // que estiver gravado (por uma versão anterior) é ignorado de propósito.
    // Por isso não há validação de model/vectorStoreId/responseFormat aqui —
    // o padrão é válido por construção.
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function loadThreads(): ChatThread[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(THREADS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalize)
      .filter((t): t is ChatThread => t !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveThreads(threads: ChatThread[]) {
  if (!isBrowser()) return;
  // `settings` fica de fora: os ajustes do menu de configuração valem só para
  // a sessão em curso. Gravá-los e depois ignorá-los na leitura daria no
  // mesmo, mas deixaria no localStorage um estado que nada relê — e que
  // pareceria autoritativo para quem fosse inspecioná-lo depois.
  const persistable = threads.map(({ settings: _settings, ...thread }) => thread);
  window.localStorage.setItem(THREADS_KEY, JSON.stringify(persistable));
}

export function createThread(): ChatThread {
  return {
    id: newId(),
    title: "Nova conversa",
    updatedAt: Date.now(),
    messages: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** Garante que exista uma thread e devolve a lista + o id ativo desejado. */
export function ensureThread(requestedId?: string): { threads: ChatThread[]; activeId: string } {
  const threads = loadThreads();
  if (requestedId && threads.some((t) => t.id === requestedId)) {
    return { threads, activeId: requestedId };
  }
  if (!requestedId && threads.length > 0) {
    return { threads, activeId: threads[0]!.id };
  }
  const thread = requestedId ? { ...createThread(), id: requestedId } : createThread();
  const next = [thread, ...threads];
  saveThreads(next);
  return { threads: next, activeId: thread.id };
}

export function upsertThread(threads: ChatThread[], thread: ChatThread): ChatThread[] {
  const exists = threads.some((t) => t.id === thread.id);
  const next = exists
    ? threads.map((t) => (t.id === thread.id ? thread : t))
    : [thread, ...threads];
  return next.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteThread(threads: ChatThread[], id: string): ChatThread[] {
  return threads.filter((t) => t.id !== id);
}

export function clearAllThreads() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(THREADS_KEY);
}

export function titleFromMessages(messages: UIMessage[]): string | null {
  const first = messages.find((m) => m.role === "user");
  if (!first) return null;
  const text = first.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join(" ")
    .trim();
  if (!text) return null;
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}
