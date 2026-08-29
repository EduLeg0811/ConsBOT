import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Database, FileText, LoaderCircle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VECTOR_STORES, vectorStoresFor, type VectorStoreId } from "@/lib/chat-settings";
import { API_BASE } from "@/lib/main-server";
import { cn } from "@/lib/utils";

type SourceFile = {
  id: string;
  filename: string;
  status: "in_progress" | "completed" | "cancelled" | "failed";
  createdAt: number;
  usageBytes: number | null;
  bytes: number | null;
  attributes: Record<string, string | number | boolean> | null;
  lastError: { code: string; message: string } | null;
};

type SourcesResponse = {
  vectorStore: { id: string; label: string };
  totalFiles: number;
  files: SourceFile[];
  truncated: boolean;
  detail?: string;
};

// Cache em memória da sessão: alternar os painéis não deve repetir uma
// consulta já concluída. A atualização explícita continua sendo a fonte de
// uma nova leitura da OpenAI..
const cachedSourcesByStore = new Map<VectorStoreId, SourcesResponse>();
const inFlightRequestsByStore = new Map<VectorStoreId, Promise<SourcesResponse>>();
let hasInitializedSourcesPanel = false;

export function fetchVectorStoreFiles(
  storeId: VectorStoreId,
  forceRefresh = false,
): Promise<SourcesResponse> {
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
      const body = (await response.json()) as SourcesResponse;
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

/** Pré-carrega fontes de uma base no background sem onerar a inicialização */
export function prefetchVectorStoreSources(storeId: VectorStoreId) {
  if (!storeId || storeId === "none" || cachedSourcesByStore.has(storeId)) return;
  fetchVectorStoreFiles(storeId).catch(() => {
    // Falha silenciosa em background; a interface tenta novamente se o usuário abrir o menu
  });
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function splitFilename(filename: string) {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === filename.length - 1) {
    return { name: filename, extension: "ARQ" };
  }
  return {
    name: filename.slice(0, dotIndex),
    extension: filename.slice(dotIndex + 1).toUpperCase(),
  };
}

function extensionColor(extension: string) {
  if (extension === "PDF") return "text-red-600";
  if (extension === "DOC" || extension === "DOCX") return "text-blue-600";
  if (["XLS", "XLSX", "CSV"].includes(extension)) return "text-emerald-700";
  if (extension === "PPT" || extension === "PPTX") return "text-orange-600";
  if (extension === "MD") return "text-violet-600";
  if (extension === "JSON") return "text-amber-700";
  if (extension === "HTML" || extension === "HTM") return "text-orange-700";
  return "text-slate-600";
}

export function VectorStoreSources({
  vectorStoreId,
  onVectorStoreChange,
  isAdmin,
}: {
  vectorStoreId: VectorStoreId;
  onVectorStoreChange: (vectorStoreId: VectorStoreId) => void;
  /** O seletor aparece nos dois níveis; o que muda é quais bases ele lista. */
  isAdmin: boolean;
}) {
  const [selectedStoreId, setSelectedStoreId] = useState<VectorStoreId>(vectorStoreId);
  const [data, setData] = useState<SourcesResponse | null>(
    () => cachedSourcesByStore.get(vectorStoreId) ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPendingSelection, setHasPendingSelection] = useState(false);
  const [request, setRequest] = useState<{ vectorStoreId: VectorStoreId; refreshKey: number }>(
    () => ({
      vectorStoreId:
        hasInitializedSourcesPanel || cachedSourcesByStore.has(vectorStoreId)
          ? "none"
          : vectorStoreId,
      refreshKey: 0,
    }),
  );

  useEffect(() => {
    setSelectedStoreId(vectorStoreId);
    setHasPendingSelection(false);
    setData(cachedSourcesByStore.get(vectorStoreId) ?? null);
    setError(null);
  }, [vectorStoreId]);

  const refresh = useCallback(() => {
    setHasPendingSelection(false);
    onVectorStoreChange(selectedStoreId);
    setRequest((current) => ({
      vectorStoreId: selectedStoreId,
      refreshKey: current.refreshKey + 1,
    }));
  }, [onVectorStoreChange, selectedStoreId]);

  const handleSelectChange = useCallback(
    (nextVectorStoreId: VectorStoreId) => {
      setSelectedStoreId(nextVectorStoreId);
      setError(null);
      setHasPendingSelection(nextVectorStoreId !== vectorStoreId);
      const cached = cachedSourcesByStore.get(nextVectorStoreId) ?? null;
      setData(cached);
    },
    [vectorStoreId],
  );

  useEffect(() => {
    hasInitializedSourcesPanel = true;
  }, []);

  useEffect(() => {
    const requestedStoreId = request.vectorStoreId;
    if (requestedStoreId === "none") {
      // Se não há nova requisição mas já há uma busca em andamento no prefetch, conectar a ela
      const inFlight = inFlightRequestsByStore.get(selectedStoreId);
      if (inFlight && !cachedSourcesByStore.has(selectedStoreId)) {
        let active = true;
        setLoading(true);
        inFlight
          .then((body) => {
            if (active) {
              setData(body);
              setError(null);
            }
          })
          .catch((err: unknown) => {
            if (active) {
              setError(err instanceof Error ? err.message : "Não foi possível carregar as fontes.");
            }
          })
          .finally(() => {
            if (active) setLoading(false);
          });
        return () => {
          active = false;
        };
      }
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    const force = request.refreshKey > 0;
    fetchVectorStoreFiles(requestedStoreId, force)
      .then((body) => {
        if (active) {
          setData(body);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Não foi possível carregar as fontes.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [request, selectedStoreId]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      <SourcesHeader
        selectedStoreId={selectedStoreId}
        committedStoreId={vectorStoreId}
        loadedStoreLabel={data?.vectorStore.label ?? null}
        pending={hasPendingSelection}
        onSelectChange={handleSelectChange}
        onRefresh={refresh}
        disabled={loading}
        isAdmin={isAdmin}
      />

      {vectorStoreId === "none" && !hasPendingSelection ? (
        <div className="rounded-xl border border-dashed border-border bg-card/65 px-4 py-8 text-center">
          <Database className="mx-auto mb-2 size-5 text-muted-foreground/60" />
          <p className="text-sm font-medium">Busca com RAG desativada</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Selecione uma base acima e pressione atualizar.
          </p>
        </div>
      ) : loading && !data ? (
        <div className="rounded-xl border border-border/80 bg-card/65 px-4 py-8 text-center">
          <LoaderCircle className="mx-auto mb-2 size-5 animate-spin text-primary" />
          <p className="text-sm font-medium">Carregando fontes</p>
          <p className="mt-1 text-xs text-muted-foreground">Consultando a OpenAI…</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-5 text-center">
          <AlertCircle className="mx-auto mb-2 size-5 text-red-500" />
          <p className="text-sm font-medium text-destructive">Não foi possível carregar</p>
          <p className="mt-1 break-words text-xs leading-relaxed text-destructive/85">{error}</p>
          <Button variant="outline" size="sm" className="mt-3 bg-card" onClick={refresh}>
            Tentar novamente
          </Button>
        </div>
      ) : hasPendingSelection ? (
        <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/60 px-4 py-8 text-center">
          <RefreshCw className="mx-auto mb-2 size-5 text-amber-600" />
          <p className="text-sm font-medium">Atualização pendente</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Pressione atualizar para carregar a base selecionada.
          </p>
        </div>
      ) : !data ? null : data.files.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/65 px-4 py-8 text-center">
          <FileText className="mx-auto mb-2 size-5 text-muted-foreground/60" />
          <p className="text-sm font-medium">Base sem arquivos</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Nenhuma fonte foi anexada a esta base.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
            <span>{data?.totalFiles ?? 0} fontes</span>
            {loading ? (
              <span className="inline-flex items-center gap-1">
                <LoaderCircle className="size-3 animate-spin" /> Atualizando
              </span>
            ) : null}
          </div>
          {data?.files.map((file) => {
            const size = formatBytes(file.bytes ?? file.usageBytes);
            const { name, extension } = splitFilename(file.filename);
            return (
              <article
                key={file.id}
                title={
                  file.lastError ? `${file.filename} — ${file.lastError.message}` : file.filename
                }
                className="rounded-xl border border-border/85 bg-card px-3 py-2 shadow-[0_6px_18px_-16px_rgba(25,70,50,0.5)]"
              >
                <div className="flex min-w-0 items-center gap-2 text-xs font-normal leading-none">
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  <span aria-hidden="true" className="shrink-0 text-muted-foreground/45">
                    ●
                  </span>
                  <span className={cn("shrink-0 font-normal", extensionColor(extension))}>
                    {extension}
                  </span>
                  {size ? (
                    <>
                      <span aria-hidden="true" className="shrink-0 text-muted-foreground/45">
                        ●
                      </span>
                      <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                        {size}
                      </span>
                    </>
                  ) : null}
                </div>
              </article>
            );
          })}
          {data?.truncated ? (
            <p className="px-1 pt-1 text-[11px] leading-relaxed text-amber-700">
              A lista foi limitada às 1.000 fontes mais recentes.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SourcesHeader({
  selectedStoreId,
  committedStoreId,
  loadedStoreLabel,
  pending,
  onSelectChange,
  onRefresh,
  disabled,
  isAdmin,
}: {
  selectedStoreId: VectorStoreId;
  committedStoreId: VectorStoreId;
  loadedStoreLabel: string | null;
  pending: boolean;
  onSelectChange: (vectorStoreId: VectorStoreId) => void;
  onRefresh: () => void;
  disabled: boolean;
  isAdmin: boolean;
}) {
  const selectedStore = VECTOR_STORES.find((store) => store.id === selectedStoreId);

  return (
    <div className="mb-7 space-y-3 px-1 pt-1">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Fontes de consulta
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Base de dados da Conscienciologia
        </p>
      </div>

      <div className="mt-5 space-y-2">
        {/* <Label>Busca com RAG</Label> */}
        {/* Os rótulos são siglas internas (ALLWV, LO...) que não dizem nada a
            quem chega agora. Vem de `selectedStoreId`, a seleção corrente, e não
            de `loadedStoreLabel`: a descrição deve acompanhar a escolha no
            ato, sem esperar o refresh que carrega a lista de arquivos. */}
        {selectedStore ? (
          <p className="mb-2 text-[10px] leading-snug text-muted-foreground/80">
            {selectedStore.description}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <Select
            value={selectedStoreId}
            onValueChange={(value) => onSelectChange(value as VectorStoreId)}
          >
            <SelectTrigger className="min-w-0 flex-1 bg-card shadow-[0_2px_8px_-5px_rgba(25,70,50,0.32)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {vectorStoresFor(isAdmin).map((store) => (
                <SelectItem key={store.id} value={store.id}>
                  {store.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0 bg-card shadow-[0_2px_8px_-5px_rgba(25,70,50,0.32)]"
            aria-label="Atualizar fontes"
            title="Atualizar fontes"
            onClick={onRefresh}
            disabled={disabled}
          >
            <RefreshCw className={cn(disabled && "animate-spin")} />
          </Button>
        </div>
        <p
          className={cn(
            "text-[11px] leading-relaxed",
            pending ? "font-medium text-amber-700" : "text-muted-foreground",
          )}
        >
          {pending
            ? "Seleção alterada: atualize"
            : committedStoreId === "none"
              ? "Nenhuma base será usada nas chamadas."
              : `Vector Store: ${loadedStoreLabel ?? "aguardando…"}`}
        </p>
      </div>
    </div>
  );
}
