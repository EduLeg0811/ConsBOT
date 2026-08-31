import type { UIMessage } from "ai";

import type { AgentAction, AgentPlanOrigin, AgentPresentation, AgentRoute } from "@/agent";

export type AuditLog = {
  id: string;
  threadId: string;
  startedAt: number;
  completedAt?: number;
  status: "streaming" | "complete" | "error" | "cancelled";
  kind?: "llm" | "interaction";
  /** Payload enviado pelo navegador à rota interna /api/chat. */
  request: unknown;
  /** Corpo HTTP efetivamente produzido pelo SDK para POST /v1/responses. */
  openaiRequest?: unknown;
  /** Resposta da OpenAI reconstruída do stream, com metadados e uso. */
  response?: unknown;
  /** Mensagem final já convertida para o formato de UI do AI SDK. */
  uiResponse?: unknown;
  /** Pills disponibilizados no turno, preservados na resposta e na auditoria. */
  agentPills?: AgentPillMetadata[];
};

/** O que a rota /api/llm do Main-Server envia no chunk `data-llmMeta` ao
 * final de um streaming: o request real despachado à OpenAI (não uma
 * reconstrução) mais os metadados que o próprio stream não carrega inline. */
export type OpenAIAuditEvent = {
  request: unknown;
  responseId: string | null;
  model: string;
  usage: unknown;
  finishReason: string;
};

export type AuditCompletion = Pick<
  AuditLog,
  "openaiRequest" | "response" | "uiResponse" | "agentPills"
>;

export type AuditDataParts = {
  llmMeta: OpenAIAuditEvent;
};

export type TurnConfigSnapshot = {
  model: string;
  profile: string;
  reasoning: string;
  responseDepth: string;
  targetWords: number;
  responseFormat: string;
  vectorStore: string;
  retrieval: "standard" | "corpus";
  semanticSources: string[];
  agent: {
    enabled: boolean;
    presentation: AgentPresentation;
  };
};

export type AgentClassifierTrace = {
  model: string;
  response: string;
};

export type AgentPillMetadata = {
  id: string;
  label: string;
  link: string;
  parameters?: Record<string, unknown>;
};

export type AuditInteraction = {
  module: string;
  action: string;
  label: string;
  value?: string;
  meta?: unknown;
};

export type ConsBotMessageMetadata = {
  ragVectorStoreId?: string;
  semanticContext?: import("@/lib/semantic-context").SemanticContextTurn;
  turnConfig?: TurnConfigSnapshot;
  agentClassifier?: AgentClassifierTrace;
  agentPlan?: {
    route: AgentRoute;
    actions: AgentAction[];
    presentation?: AgentPresentation;
    confidence?: number;
    reason?: string;
    origin?: AgentPlanOrigin;
    proposedRoute?: AgentRoute;
    durationMs?: number;
  };
  agentPills?: AgentPillMetadata[];
};

export type ConsBotUIMessage = UIMessage<ConsBotMessageMetadata, AuditDataParts>;

const MAX_LOGS_PER_THREAD = 50;
let sessionLogs: AuditLog[] = [];

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

function readAll(): AuditLog[] {
  return sessionLogs;
}

function writeAll(logs: AuditLog[]) {
  sessionLogs = logs;
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

/** Evento de interface local: não representa uma chamada à LLM. */
export function logAuditInteraction(threadId: string, event: AuditInteraction) {
  addAuditLog({
    id: crypto.randomUUID(),
    threadId,
    startedAt: Date.now(),
    completedAt: Date.now(),
    status: "complete",
    kind: "interaction",
    request: event,
  });
}

export function updateAuditLog(id: string, patch: Partial<AuditLog>) {
  const sanitizedPatch = sanitizeAuditValue(patch) as Partial<AuditLog>;
  writeAll(readAll().map((log) => (log.id === id ? { ...log, ...sanitizedPatch } : log)));
}

export function clearAuditLogs(threadId: string) {
  writeAll(readAll().filter((log) => log.threadId !== threadId));
}

/** Os logs são estritamente da sessão atual e não sobrevivem a uma recarga. */
export function clearAllAuditLogs() {
  sessionLogs = [];
}
