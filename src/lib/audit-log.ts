export type AuditLog = {
  id: string;
  threadId: string;
  startedAt: number;
  completedAt?: number;
  status: "streaming" | "complete" | "error" | "cancelled";
  /** Payload enviado pelo navegador à rota interna /api/chat. */
  request: unknown;
  /** Corpo HTTP efetivamente produzido pelo SDK para POST /v1/responses. */
  openaiRequest?: unknown;
  /** Resposta da OpenAI reconstruída do stream, com metadados e uso. */
  response?: unknown;
  /** Mensagem final já convertida para o formato de UI do AI SDK. */
  uiResponse?: unknown;
};

export type OpenAIAuditEvent = {
  request: unknown;
  response: unknown;
};

export type AuditCompletion = Pick<AuditLog, "openaiRequest" | "response" | "uiResponse">;

export type AuditDataParts = {
  openaiAudit: OpenAIAuditEvent;
};

export type ConsBotUIMessage = UIMessage<unknown, AuditDataParts>;

const AUDIT_LOGS_KEY = "consbot:audit-logs:v1";
const MAX_LOGS_PER_THREAD = 50;

export function sanitizeAuditValue(value: unknown): unknown {
  const seen = new WeakSet<object>();
  const json = JSON.stringify(value, (key, currentValue: unknown) => {
    if (/^(authorization|api-key|set-cookie)$/i.test(key)) return "[valor sensível omitido]";
    if (/^(reasoningEncryptedContent|encrypted_content)$/i.test(key)) {
      const length = typeof currentValue === "string" ? currentValue.length : 0;
      return `[conteúdo de raciocínio criptografado omitido${length ? ` — ${length} caracteres` : ""}]`;
    }
    if (currentValue && typeof currentValue === "object") {
      if (seen.has(currentValue)) return "[referência circular omitida]";
      seen.add(currentValue);
    }
    return currentValue;
  });

  return json === undefined ? null : (JSON.parse(json) as unknown);
}

function isBrowser() {
  return typeof window !== "undefined";
}

function readAll(): AuditLog[] {
  if (!isBrowser()) return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(AUDIT_LOGS_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as AuditLog[]) : [];
  } catch {
    return [];
  }
}

function writeAll(logs: AuditLog[]) {
  if (isBrowser()) window.localStorage.setItem(AUDIT_LOGS_KEY, JSON.stringify(logs));
}

export function loadAuditLogs(threadId: string): AuditLog[] {
  return readAll()
    .filter((log) => log.threadId === threadId)
    .map((log) => sanitizeAuditValue(log) as AuditLog)
    .sort((a, b) => b.startedAt - a.startedAt);
}

export function addAuditLog(log: AuditLog) {
  const sanitizedLog = sanitizeAuditValue(log) as AuditLog;
  const otherLogs = readAll().filter((entry) => entry.threadId !== log.threadId);
  const threadLogs = [
    sanitizedLog,
    ...readAll().filter((entry) => entry.threadId === log.threadId),
  ].slice(0, MAX_LOGS_PER_THREAD);
  writeAll([...otherLogs, ...threadLogs]);
}

export function updateAuditLog(id: string, patch: Partial<AuditLog>) {
  const sanitizedPatch = sanitizeAuditValue(patch) as Partial<AuditLog>;
  writeAll(readAll().map((log) => (log.id === id ? { ...log, ...sanitizedPatch } : log)));
}

export function clearAuditLogs(threadId: string) {
  writeAll(readAll().filter((log) => log.threadId !== threadId));
}
import type { UIMessage } from "ai";
