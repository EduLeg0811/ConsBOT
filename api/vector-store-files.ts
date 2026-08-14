export const config = {
  runtime: "nodejs",
};

const VECTOR_STORES = {
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

const OPENAI_API_URL = "https://api.openai.com/v1";
const MAX_FILES = 1000;

function isVectorStoreId(value: string | null): value is VectorStoreId {
  return value !== null && Object.hasOwn(VECTOR_STORES, value);
}

async function openAIGet<T>(path: string, apiKey: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${OPENAI_API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "assistants=v2",
    },
    signal,
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

export async function GET(request: Request) {
  try {
    const vectorStoreId = new URL(request.url).searchParams.get("vectorStoreId");
    if (!isVectorStoreId(vectorStoreId)) {
      return Response.json({ error: "Base vetorial inválida." }, { status: 400 });
    }

    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      return Response.json({ error: "OPENAI_API_KEY não configurada." }, { status: 500 });
    }

    const { files, truncated } = await listAllVectorStoreFiles(
      vectorStoreId,
      apiKey,
      request.signal,
    );
    const enrichedFiles = await addFileNames(files, apiKey, request.signal);

    return Response.json(
      {
        vectorStore: { id: vectorStoreId, label: VECTOR_STORES[vectorStoreId] },
        files: enrichedFiles,
        truncated,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    const message = error instanceof Error ? error.message : "Erro ao listar as fontes.";
    console.error("Vector store files API error:", error);
    return Response.json({ error: message }, { status: 502 });
  }
}

export default GET;
