import { API_BASE } from "@/lib/main-server";

/** Telemetria de acesso enviada ao Main-Server e lida no painel `/logs/view`.
 *
 * Não confundir com `audit-log.ts`: aquele é a auditoria técnica da chamada à
 * OpenAI, vive só na sessão do navegador e nunca sai da máquina. Este manda o
 * evento de uso para o servidor. O formato do corpo é o mesmo que o Cons-IA-FE
 * envia em `src/lib/config.ts`; o Main-Server normaliza tudo em
 * `app/core/logs.py:normalize_event`.
 */

const SESSION_KEY = "client_session_id";

function getSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

function trim(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

export interface LogEventData {
  event?: string;
  category?: string;
  module?: string;
  action?: string;
  label?: string;
  page?: string;
  page_label?: string;
  chat_id?: string;
  value?: string;
  meta?: unknown;
}

export function logEvent(data: LogEventData): void {
  try {
    const url = `${API_BASE}/api/logs`;
    const body = JSON.stringify({
      // Identifica o frontend de origem, distinto do módulo acessado.
      app: "consbot",
      event: trim(data.event, "feature_access"),
      category: trim(data.category),
      module: trim(data.module),
      action: trim(data.action),
      label: trim(data.label),
      page: trim(data.page || location.pathname || ""),
      page_label: trim(data.page_label),
      session_id: getSessionId(),
      chat_id: trim(data.chat_id),
      value: trim(data.value),
      meta: data.meta ?? null,
    });

    // sendBeacon sobrevive à navegação; o fetch é o fallback dos navegadores
    // que não o expõem. Nenhum dos dois pode derrubar o envio da pergunta.
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // Telemetria nunca interrompe a conversa.
    });
  } catch {
    // idem
  }
}

export function logFeatureAccess(data: LogEventData = {}): void {
  logEvent({ event: "feature_access", category: "feature", ...data });
}
