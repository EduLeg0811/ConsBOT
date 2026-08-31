import { API_BASE } from "@/lib/main-server";

export const SEMANTIC_CONTEXT_LIMIT = 8;
export const SEMANTIC_CONTEXT_TIMEOUT_MS = 15_000;

export type SemanticIndex = {
  id: string;
  label: string;
  sourceFile: string;
  sourceRows: number;
  model: string;
  dimensions: number;
  embeddingDtype: string;
  suggestedMinScore: number;
};

export type SemanticContextFailure = {
  sourceId: string;
  detail: string;
};

export type SemanticContextResult = {
  id: string;
  sourceId: string;
  sourceLabel: string;
  title: string | null;
  page: string | null;
  paragraph: number | null;
  row: number | null;
  chunkIndex: number | null;
  chunkTotal: number | null;
  text: string;
  score: number;
  /** Origem da recuperação; ausente em turnos salvos antes do modo literal. */
  matchKinds?: Array<"literal" | "semantic">;
};

export type SemanticContextResponse = {
  ok: boolean;
  query: string;
  requestedSourceIds: string[];
  processedSourceIds: string[];
  failedSources: SemanticContextFailure[];
  totalFound: number;
  semanticFound?: number;
  literalFound?: number;
  returnedCount: number;
  durationMs: number;
  results: SemanticContextResult[];
};

export type SemanticContextTurn = {
  /** A recuperação semântica é apenas documental; nunca integra o prompt da LLM. */
  retrievalMode?: "corpus";
  status: "success" | "empty" | "error";
  query: string;
  requestedSourceIds: string[];
  processedSourceIds: string[];
  failedSources: SemanticContextFailure[];
  totalFound: number;
  durationMs: number;
  results: SemanticContextResult[];
  error?: string;
};

let indexesPromise: Promise<SemanticIndex[]> | null = null;

export function fetchSemanticIndexes(forceRefresh = false): Promise<SemanticIndex[]> {
  if (!forceRefresh && indexesPromise) return indexesPromise;
  indexesPromise = fetch(`${API_BASE}/api/semantic/indexes`, {
    headers: { Accept: "application/json" },
  })
    .then(async (response) => {
      const payload = (await response.json()) as {
        indexes?: SemanticIndex[];
        detail?: string;
      };
      if (!response.ok)
        throw new Error(payload.detail || "Não foi possível carregar as fontes semânticas.");
      return Array.isArray(payload.indexes) ? payload.indexes : [];
    })
    .catch((error) => {
      indexesPromise = null;
      throw error;
    });
  return indexesPromise;
}

export async function fetchSemanticContext({
  query,
  lexicalQuery,
  sourceIds,
  signal,
  limit = SEMANTIC_CONTEXT_LIMIT,
}: {
  query: string;
  lexicalQuery?: string;
  sourceIds: string[];
  signal?: AbortSignal;
  limit?: number;
}): Promise<SemanticContextResponse> {
  const response = await fetch(`${API_BASE}/api/semantic/context`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    signal,
    body: JSON.stringify({
      query,
      ...(lexicalQuery?.trim() ? { lexicalQuery: lexicalQuery.trim() } : {}),
      sourceIds,
      limit,
    }),
  });
  const payload = (await response.json()) as SemanticContextResponse & {
    detail?: string | { message?: string };
  };
  if (!response.ok) {
    const detail = typeof payload.detail === "string" ? payload.detail : payload.detail?.message;
    throw new Error(detail || "Não foi possível consultar o contexto semântico.");
  }
  return payload;
}

export async function retrieveSemanticContext({
  query,
  lexicalQuery,
  sourceIds,
  signal,
  limit = SEMANTIC_CONTEXT_LIMIT,
  timeoutMs = SEMANTIC_CONTEXT_TIMEOUT_MS,
  retrievalMode = "corpus",
}: {
  query: string;
  lexicalQuery?: string;
  sourceIds: string[];
  signal?: AbortSignal;
  limit?: number;
  timeoutMs?: number;
  retrievalMode?: "corpus";
}): Promise<SemanticContextTurn> {
  const controller = new AbortController();
  const startedAt = performance.now();
  let timedOut = false;
  const cancelFromCaller = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", cancelFromCaller, { once: true });
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return semanticTurnFromResponse(
      await fetchSemanticContext({
        query,
        lexicalQuery,
        sourceIds,
        signal: controller.signal,
        limit,
      }),
      retrievalMode,
    );
  } catch (error) {
    // Cancelar a rodada não é falha da busca nem deve iniciar o fallback.
    if (signal?.aborted) throw error;
    const turn = semanticErrorTurn(
      query,
      sourceIds,
      timedOut
        ? new Error(
            `A busca semântica excedeu o limite de ${Math.round(timeoutMs / 1000)} segundos.`,
          )
        : error,
    );
    turn.retrievalMode = retrievalMode;
    turn.durationMs = Math.round(performance.now() - startedAt);
    return turn;
  } finally {
    globalThis.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", cancelFromCaller);
  }
}

/**
 * Extrai uma chave literal somente quando a pessoa deixou o alvo claro.
 * A pergunta inteira continua sendo usada pela busca vetorial; isto evita uma
 * varredura lexical ruidosa para perguntas conceituais comuns.
 */
export function lexicalQueryForContext(query: string): string {
  const text = query.trim();
  const quoted = text.match(/["“']([^"”']{1,250})[”"']/u)?.[1]?.trim();
  if (quoted) return quoted;

  const explicitTerm = text.match(
    /\b(?:termo|palavra|express[aã]o|verbete)\s+(?:["“']?)([\p{L}\p{N}][\p{L}\p{N}-]{0,79})/iu,
  )?.[1];
  if (explicitTerm) return explicitTerm.trim();

  return /^[\p{L}\p{N}-]{2,250}$/u.test(text) ? text : "";
}

export function semanticTurnFromResponse(
  response: SemanticContextResponse,
  retrievalMode: "corpus" = "corpus",
): SemanticContextTurn {
  return {
    retrievalMode,
    status: response.results.length > 0 ? "success" : "empty",
    query: response.query,
    requestedSourceIds: response.requestedSourceIds,
    processedSourceIds: response.processedSourceIds,
    failedSources: response.failedSources,
    totalFound: response.totalFound,
    durationMs: response.durationMs,
    results: response.results,
  };
}

export function semanticErrorTurn(
  query: string,
  sourceIds: string[],
  error: unknown,
): SemanticContextTurn {
  return {
    status: "error",
    query,
    requestedSourceIds: sourceIds,
    processedSourceIds: [],
    failedSources: [],
    totalFound: 0,
    durationMs: 0,
    results: [],
    error: error instanceof Error ? error.message : "Complemento semântico indisponível.",
  };
}

export function semanticContextFromMetadata(metadata: unknown): SemanticContextTurn | null {
  if (!metadata || typeof metadata !== "object" || !("semanticContext" in metadata)) return null;
  const context = (metadata as { semanticContext?: unknown }).semanticContext;
  if (!context || typeof context !== "object" || !("status" in context)) return null;
  const status = (context as { status?: unknown }).status;
  if (status !== "success" && status !== "empty" && status !== "error") return null;
  if (
    !Array.isArray((context as SemanticContextTurn).requestedSourceIds) ||
    !Array.isArray((context as SemanticContextTurn).processedSourceIds) ||
    !Array.isArray((context as SemanticContextTurn).failedSources) ||
    !Array.isArray((context as SemanticContextTurn).results)
  ) {
    return null;
  }
  return context as SemanticContextTurn;
}

export function citedSemanticIds(text: string, results: SemanticContextResult[]): Set<string> {
  const cited = new Set<string>();
  for (const result of results) {
    if (text.includes(`[${result.id}]`)) cited.add(result.id);
  }
  return cited;
}
