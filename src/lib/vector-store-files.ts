import type { VectorStoreId } from "@/lib/chat-settings";
import { API_BASE } from "@/lib/main-server";

/** Arquivo devolvido pelo Main-Server para uma base File Search. */
export type VectorStoreSourceFile = {
  id: string;
  filename: string;
  status: "in_progress" | "completed" | "cancelled" | "failed";
  createdAt: number;
  usageBytes: number | null;
  bytes: number | null;
  attributes: Record<string, string | number | boolean> | null;
  lastError: { code: string; message: string } | null;
};

export type VectorStoreFilesResponse = {
  vectorStore: { id: string; label: string };
  totalFiles: number;
  files: VectorStoreSourceFile[];
  truncated: boolean;
  detail?: string;
};

// Cache de sessão compartilhado entre o menu Fontes e ações internas do
// Agent. Uma pré-carga em andamento também é reutilizada, evitando duas
// consultas idênticas à OpenAI quando a pergunta chega cedo.
const cachedSourcesByStore = new Map<VectorStoreId, VectorStoreFilesResponse>();
const inFlightRequestsByStore = new Map<VectorStoreId, Promise<VectorStoreFilesResponse>>();

export function cachedVectorStoreFiles(storeId: VectorStoreId): VectorStoreFilesResponse | undefined {
  return cachedSourcesByStore.get(storeId);
}

export function fetchVectorStoreFiles(
  storeId: VectorStoreId,
  forceRefresh = false,
): Promise<VectorStoreFilesResponse> {
  if (!forceRefresh) {
    const cached = cachedSourcesByStore.get(storeId);
    if (cached) return Promise.resolve(cached);

    const inFlight = inFlightRequestsByStore.get(storeId);
    if (inFlight) return inFlight;
  }

  const promise = fetch(`${API_BASE}/api/vector-stores/${encodeURIComponent(storeId)}/files`, {
    headers: { Accept: "application/json" },
  })
    .then(async (response) => {
      const body = (await response.json()) as VectorStoreFilesResponse;
      if (!response.ok) throw new Error(body.detail || "Não foi possível carregar as fontes.");
      cachedSourcesByStore.set(storeId, body);
      return body;
    })
    .finally(() => {
      inFlightRequestsByStore.delete(storeId);
    });

  inFlightRequestsByStore.set(storeId, promise);
  return promise;
}

/** Pré-carrega sem bloquear a abertura da conversa. */
export function prefetchVectorStoreSources(storeId: VectorStoreId) {
  if (!storeId || storeId === "none" || cachedSourcesByStore.has(storeId)) return;
  void fetchVectorStoreFiles(storeId).catch(() => {
    // O menu ou o Agent poderá tentar outra vez quando realmente precisar.
  });
}
