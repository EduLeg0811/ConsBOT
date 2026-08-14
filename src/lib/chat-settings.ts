export const MODELS = [
  {
    id: "gpt-4o-mini",
    label: "ConsBOT Luna",
    description: "Rápido e econômico para conversas do dia a dia.",
  },
  {
    id: "gpt-4o",
    label: "ConsBOT Terra",
    description: "Equilíbrio entre alta qualidade, velocidade e precisão.",
  },
  {
    id: "o3-mini",
    label: "ConsBOT Sol",
    description: "Raciocínio avançado para tarefas lógicas e complexas.",
  },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

export type ChatSettings = {
  model: ModelId;
  systemPrompt: string;
  reasoningEffort: "low" | "medium" | "high";
  reasoningSummary: boolean;
  maxOutputTokens: number;
  topP: number;
};

export const DEFAULT_SETTINGS: ChatSettings = {
  model: "gpt-4o",
  systemPrompt:
    "Você é o ConsBOT, um assistente atencioso, claro e objetivo. Responda sempre no idioma do usuário, use markdown quando ajudar e admita quando não souber algo.",
  reasoningEffort: "medium",
  reasoningSummary: true,
  maxOutputTokens: 4000,
  topP: 1,
};

const SETTINGS_KEY = "consbot:settings:v1";
const MESSAGES_KEY = "consbot:messages:v1";

export function loadSettings(): ChatSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ChatSettings>;
    // Se o modelo salvo for legado/antigo, redefinir para o padrão
    const validModel = MODELS.some((m) => m.id === parsed.model);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      model: validModel ? (parsed.model as ModelId) : DEFAULT_SETTINGS.model,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ChatSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadMessages<T>(): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MESSAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function saveMessages<T>(messages: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
}

export function clearMessages() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(MESSAGES_KEY);
}

/** ID de sessão anônimo e distinto por navegador. */
export function getSessionId(): string {
  if (typeof window === "undefined") return "sess-default";
  const key = "consbot:session-id";
  let id = window.localStorage.getItem(key);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sess-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    window.localStorage.setItem(key, id);
  }
  return id;
}
