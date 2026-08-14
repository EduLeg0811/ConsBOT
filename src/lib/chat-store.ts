import type { UIMessage } from "ai";

import {
  DEFAULT_SETTINGS,
  MODELS,
  normalizeMaxOutputTokens,
  RESPONSE_FORMATS,
  VECTOR_STORES,
  type ChatSettings,
} from "@/lib/chat-settings";

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
  const settings = { ...DEFAULT_SETTINGS, ...(t.settings ?? {}) };
  settings.maxOutputTokens = normalizeMaxOutputTokens(settings.maxOutputTokens);
  const model = MODELS.some((candidate) => candidate.id === settings.model)
    ? settings.model
    : DEFAULT_SETTINGS.model;
  const vectorStoreId = VECTOR_STORES.some((candidate) => candidate.id === settings.vectorStoreId)
    ? settings.vectorStoreId
    : DEFAULT_SETTINGS.vectorStoreId;
  const responseFormat = RESPONSE_FORMATS.some(
    (candidate) => candidate.id === settings.responseFormat,
  )
    ? settings.responseFormat
    : DEFAULT_SETTINGS.responseFormat;
  return {
    id: t.id,
    title: typeof t.title === "string" && t.title.trim() ? t.title : "Nova conversa",
    updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : Date.now(),
    messages: [],
    settings: { ...settings, model, vectorStoreId, responseFormat },
  };
}

export function loadThreads(): ChatThread[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(THREADS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const containedMessages = parsed.some(
      (thread) =>
        thread &&
        typeof thread === "object" &&
        Array.isArray((thread as Partial<ChatThread>).messages) &&
        (thread as Partial<ChatThread>).messages!.length > 0,
    );
    const threads = parsed
      .map(normalize)
      .filter((t): t is ChatThread => t !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    // Migra registros antigos para o formato do histórico lateral, sem texto
    // de mensagens persistido no navegador.
    if (containedMessages) saveThreads(threads);
    return threads;
  } catch {
    return [];
  }
}

export function saveThreads(threads: ChatThread[]) {
  if (!isBrowser()) return;
  // O painel lateral guarda apenas o índice das conversas. As mensagens não
  // devem sobreviver a uma recarga nem voltar como contexto em outra sessão.
  const sidebarHistory = threads.map((thread) => ({ ...thread, messages: [] as UIMessage[] }));
  window.localStorage.setItem(THREADS_KEY, JSON.stringify(sidebarHistory));
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
