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
import { VECTOR_STORES, type VectorStoreId } from "@/lib/chat-settings";
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
  files: SourceFile[];
  truncated: boolean;
  error?: string;
};

// Cache em memória da sessão: alternar os painéis não deve repetir uma
// consulta já concluída. A atualização explícita continua sendo a fonte de
// uma nova leitura da OpenAI.
const cachedSourcesByStore = new Map<VectorStoreId, SourcesResponse>();
let hasInitializedSourcesPanel = false;

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
}: {
  vectorStoreId: VectorStoreId;
  onVectorStoreChange: (vectorStoreId: VectorStoreId) => void;
}) {
  const [data, setData] = useState<SourcesResponse | null>(() =>
    cachedSourcesByStore.get(vectorStoreId) ?? null,
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

  const refresh = useCallback(() => {
    setHasPendingSelection(false);
    setRequest((current) => ({
      vectorStoreId,
      refreshKey: current.refreshKey + 1,
    }));
  }, [vectorStoreId]);

  const handleVectorStoreChange = useCallback(
    (nextVectorStoreId: VectorStoreId) => {
      const cached = cachedSourcesByStore.get(nextVectorStoreId) ?? null;
      // Uma base já carregada pode ser exibida imediatamente; apenas uma
      // base sem cache precisa aguardar o refresh solicitado pelo usuário.
      setData(cached);
      setError(null);
      setHasPendingSelection(nextVectorStoreId !== "none" && cached === null);
      onVectorStoreChange(nextVectorStoreId);
    },
    [onVectorStoreChange],
  );

  useEffect(() => {
    hasInitializedSourcesPanel = true;
  }, []);

  useEffect(() => {
    const requestedStoreId = request.vectorStoreId;
    if (requestedStoreId === "none") {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void fetch(`/api/vector-store-files?vectorStoreId=${encodeURIComponent(requestedStoreId)}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const body = (await response.json()) as SourcesResponse;
        if (!response.ok) throw new Error(body.error || "Não foi possível carregar as fontes.");
        cachedSourcesByStore.set(requestedStoreId, body);
        setData(body);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Não foi possível carregar as fontes.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [request]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      <SourcesHeader
        vectorStoreId={vectorStoreId}
        loadedStoreLabel={data?.vectorStore.label ?? null}
        pending={hasPendingSelection}
        onVectorStoreChange={handleVectorStoreChange}
        onRefresh={refresh}
        disabled={loading}
      />

      {vectorStoreId === "none" && !hasPendingSelection ? (
        <div className="rounded-xl border border-dashed border-border bg-white/65 px-4 py-8 text-center">
          <Database className="mx-auto mb-2 size-5 text-muted-foreground/60" />
          <p className="text-sm font-medium">Busca com RAG desativada</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Selecione uma base acima e pressione atualizar.
          </p>
        </div>
      ) : loading && !data ? (
        <div className="rounded-xl border border-border/80 bg-white/65 px-4 py-8 text-center">
          <LoaderCircle className="mx-auto mb-2 size-5 animate-spin text-primary" />
          <p className="text-sm font-medium">Carregando fontes</p>
          <p className="mt-1 text-xs text-muted-foreground">Consultando a OpenAI…</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-5 text-center">
          <AlertCircle className="mx-auto mb-2 size-5 text-red-500" />
          <p className="text-sm font-medium text-red-900">Não foi possível carregar</p>
          <p className="mt-1 break-words text-xs leading-relaxed text-red-700">{error}</p>
          <Button variant="outline" size="sm" className="mt-3 bg-white" onClick={refresh}>
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
        <div className="rounded-xl border border-dashed border-border bg-white/65 px-4 py-8 text-center">
          <FileText className="mx-auto mb-2 size-5 text-muted-foreground/60" />
          <p className="text-sm font-medium">Base sem arquivos</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Nenhuma fonte foi anexada a esta base.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
            <span>{data?.files.length ?? 0} fontes</span>
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
                className="rounded-xl border border-border/85 bg-white px-3 py-2 shadow-[0_6px_18px_-16px_rgba(25,70,50,0.5)]"
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
  vectorStoreId,
  loadedStoreLabel,
  pending,
  onVectorStoreChange,
  onRefresh,
  disabled,
}: {
  vectorStoreId: VectorStoreId;
  loadedStoreLabel: string | null;
  pending: boolean;
  onVectorStoreChange: (vectorStoreId: VectorStoreId) => void;
  onRefresh: () => void;
  disabled: boolean;
}) {
  return (
    <div className="mb-3 space-y-3 px-1 pt-1">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Fontes de consulta
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Base de dados da Conscienciologia
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-emerald-100/80 bg-emerald-50/40 p-3">
        <Label>Busca com RAG</Label>
        <div className="flex items-center gap-2">
          <Select
            value={vectorStoreId}
            onValueChange={(value) => onVectorStoreChange(value as VectorStoreId)}
          >
            <SelectTrigger className="min-w-0 flex-1 bg-white shadow-[0_2px_8px_-5px_rgba(25,70,50,0.32)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VECTOR_STORES.map((store) => (
                <SelectItem key={store.id} value={store.id}>
                  {store.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0 bg-white shadow-[0_2px_8px_-5px_rgba(25,70,50,0.32)]"
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
            ? "Seleção alterada — pressione atualizar para aplicar."
            : vectorStoreId === "none"
              ? "Nenhuma base será usada nas chamadas."
              : `Vector Store: ${loadedStoreLabel ?? "aguardando…"}`}
        </p>
      </div>
    </div>
  );
}
