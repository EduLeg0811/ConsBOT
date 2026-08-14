export const config = {
  runtime: "nodejs",
};

type VercelRequest = { query?: Record<string, string | string[] | undefined> };
type VercelResponse = {
  status: (statusCode: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
  end: () => void;
};

const DEFAULT_VECTOR_STORE_ID = "vs_6a7f75cd0be48191b3f3960a518c6ff3";

function isAdmin() {
  return process.env.ACCESS_LEVEL === "1";
}

const VECTOR_STORES = {
  vs_6a7f75cd0be48191b3f3960a518c6ff3: "CONS_LIBRARY",
  vs_6912908250e4819197e23fe725e04fae: "ALLWV",
  vs_698be4e07c748191b834905ebc7a7da3: "LO",
  vs_69931da436e48191b43453e845e63bd3: "TRANSLATE",
  vs_68f195fdeda08191815ec795ba1f57ba: "EDUNOTES",
  vs_699d09de9ca48191b63fbbd4d195a696: "ECWV",
} as const;

type VectorStoreId = keyof typeof VECTOR_STORES;

type VectorStoreFile = {
  id: string;
  created_at: number;
  status: "in_progress" | "completed" | "cancelled" | "failed";
  usage_bytes?: number;
  attributes?: Record<string, string | number | boolean> | null;
  last_error?: { code: string; message: string } | null;
};

type VectorStoreFilePage = {
  data: VectorStoreFile[];
  has_more: boolean;
  last_id?: string;
};

type OpenAIFile = {
  id: string;
  filename: string;
  bytes: number;
  created_at: number;
};

type OpenAIVectorStore = {
  file_counts?: { total?: number };
};

const OPENAI_API_URL = "https://api.openai.com/v1";
const MAX_FILES = 1000;

function isVectorStoreId(value: string | null): value is VectorStoreId {
  return value !== null && Object.hasOwn(VECTOR_STORES, value);
}

async function openAIGet<T>(path: string, apiKey: string, signal: AbortSignal): Promise<T> {
  const timeoutSignal = AbortSignal.timeout(20_000);
  const response = await fetch(`${OPENAI_API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "assistants=v2",
    },
    signal: AbortSignal.any([signal, timeoutSignal]),
  });

  if (!response.ok) {
    let detail = `OpenAI respondeu com HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body.error?.message) detail = body.error.message;
    } catch {
      // Mantém a mensagem segura baseada apenas no status HTTP.
    }
    throw new Error(detail.replace(/sk-[A-Za-z0-9_-]+/g, "[chave removida]"));
  }

  return (await response.json()) as T;
}

async function listAllVectorStoreFiles(
  vectorStoreId: VectorStoreId,
  apiKey: string,
  signal: AbortSignal,
) {
  const files: VectorStoreFile[] = [];
  let after: string | undefined;
  let hasMore = true;

  while (hasMore && files.length < MAX_FILES) {
    const params = new URLSearchParams({ limit: "100", order: "desc" });
    if (after) params.set("after", after);

    const page = await openAIGet<VectorStoreFilePage>(
      `/vector_stores/${encodeURIComponent(vectorStoreId)}/files?${params.toString()}`,
      apiKey,
      signal,
    );
    files.push(...page.data);
    hasMore = page.has_more && Boolean(page.last_id);
    after = page.last_id;
  }

  return { files: files.slice(0, MAX_FILES), truncated: hasMore };
}

async function addFileNames(files: VectorStoreFile[], apiKey: string, signal: AbortSignal) {
  const enriched: Array<{
    id: string;
    filename: string;
    status: VectorStoreFile["status"];
    createdAt: number;
    usageBytes: number | null;
    bytes: number | null;
    attributes: VectorStoreFile["attributes"];
    lastError: VectorStoreFile["last_error"];
  }> = [];

  for (let index = 0; index < files.length; index += 10) {
    const batch = files.slice(index, index + 10);
    const items = await Promise.all(
      batch.map(async (file) => {
        let metadata: OpenAIFile | null = null;
        try {
          metadata = await openAIGet<OpenAIFile>(
            `/files/${encodeURIComponent(file.id)}`,
            apiKey,
            signal,
          );
        } catch (error) {
          if (signal.aborted) throw error;
        }

        return {
          id: file.id,
          filename: metadata?.filename ?? file.id,
          status: file.status,
          createdAt: file.created_at,
          usageBytes: file.usage_bytes ?? null,
          bytes: metadata?.bytes ?? null,
          attributes: file.attributes ?? null,
          lastError: file.last_error ?? null,
        };
      }),
    );
    enriched.push(...items);
  }

  return enriched;
}

export async function GET(request: VercelRequest, response: VercelResponse) {
  try {
    const rawVectorStoreId = request.query?.vectorStoreId;
    const vectorStoreId = isAdmin()
      ? typeof rawVectorStoreId === "string"
        ? rawVectorStoreId
        : null
      : DEFAULT_VECTOR_STORE_ID;
    if (!isVectorStoreId(vectorStoreId)) {
      response.status(400).json({ error: "Base vetorial inválida." });
      return;
    }

    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      response.status(500).json({ error: "OPENAI_API_KEY não configurada." });
      return;
    }

    const controller = new AbortController();

    const summaryOnly = request.query?.summary === "1";
    const vectorStore = await openAIGet<OpenAIVectorStore>(
      `/vector_stores/${encodeURIComponent(vectorStoreId)}`,
      apiKey,
      controller.signal,
    );
    const totalFiles = vectorStore.file_counts?.total ?? 0;

    if (summaryOnly) {
      response.setHeader("Cache-Control", "private, no-store");
      response.status(200).json({
        vectorStore: { id: vectorStoreId, label: VECTOR_STORES[vectorStoreId] },
        totalFiles,
      });
      return;
    }

    const { files, truncated } = await listAllVectorStoreFiles(
      vectorStoreId,
      apiKey,
      controller.signal,
    );
    const enrichedFiles = await addFileNames(files, apiKey, controller.signal);

    response.setHeader("Cache-Control", "private, no-store");
    response.status(200).json({
      vectorStore: { id: vectorStoreId, label: VECTOR_STORES[vectorStoreId] },
      totalFiles,
      files: enrichedFiles,
      truncated,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      response.status(504).json({ error: "A OpenAI demorou demais para responder. Tente atualizar novamente." });
      return;
    }
    const message = error instanceof Error ? error.message : "Erro ao listar as fontes.";
    console.error("Vector store files API error:", error);
    response.status(502).json({ error: message });
  }
}

export default GET;
