import { useEffect, useRef, useState } from "react";
import {
  Check,
  Clipboard,
  Database,
  Eye,
  EyeOff,
  FileText,
  MessageSquare,
  Pencil,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsFields } from "@/components/SettingsFields";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { VectorStoreSources } from "@/components/VectorStoreSources";
import { DEFAULT_SETTINGS, type ChatSettings } from "@/lib/chat-settings";
import type { ChatThread } from "@/lib/chat-store";
import { sanitizeAuditValue, type AuditLog } from "@/lib/audit-log";
import { cn } from "@/lib/utils";

export type SidebarTab = "chats" | "settings" | "sources" | "logs";

export type ChatSidebarProps = {
  threads: ChatThread[];
  activeId: string;
  settings: ChatSettings;
  isAdmin: boolean;
  onSettingsChange: (settings: ChatSettings) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  auditLogs: AuditLog[];
  onClearAuditLogs: () => void;
  activeTab?: SidebarTab;
  onTabChange?: (tab: SidebarTab) => void;
};

function formatThreadDate(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.toLocaleDateString("pt-BR")} ● ${date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}

export function ChatSidebarContent({
  threads,
  activeId,
  settings,
  isAdmin,
  onSettingsChange,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onClearAll,
  auditLogs,
  onClearAuditLogs,
  activeTab,
  onTabChange,
}: ChatSidebarProps) {
  const [internalTab, setInternalTab] = useState<SidebarTab>("chats");
  const tab = activeTab ?? internalTab;
  const setTab = (nextTab: SidebarTab | ((prev: SidebarTab) => SidebarTab)) => {
    const resolved = typeof nextTab === "function" ? nextTab(tab) : nextTab;
    setInternalTab(resolved);
    onTabChange?.(resolved);
  };
  const [logsEnabled, setLogsEnabled] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  const startEdit = (thread: ChatThread) => {
    setEditingId(thread.id);
    setDraftTitle(thread.title);
  };

  const commitEdit = () => {
    if (editingId) {
      const value = draftTitle.trim();
      if (value) onRename(editingId, value);
    }
    setEditingId(null);
  };

  const copyLog = async (value: unknown) => {
    await navigator.clipboard.writeText(JSON.stringify(sanitizeAuditValue(value), null, 2));
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center justify-center border-b border-border/70 px-3">
        <button
          type="button"
          onClick={onNew}
          className="group inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Sparkles className="size-4 text-amber-500 transition-transform group-hover:scale-110 group-hover:text-orange-500" />
          Nova conversa
        </button>
      </div>

      <TooltipProvider delayDuration={250}>
        <div className="mt-4 mb-2 flex gap-0 px-3 py-1">
          {[
            {
              id: "chats" as const,
              label: "Chats",
              icon: MessageSquare,
              description: "Acesse e gerencie as conversas.",
            },
            {
              id: "settings" as const,
              label: "Config",
              icon: Settings2,
              description: "Ajuste modelo e parâmetros.",
            },
            {
              id: "sources" as const,
              label: "Fontes",
              icon: Database,
              description: "Selecione a base de dados dos arquivos.",
            },
            {
              id: "logs" as const,
              label: "Logs",
              icon: FileText,
              description: "Audite as chamadas e respostas da LLM.",
            },
          ]
            .filter(({ id }) => id !== "logs" || logsEnabled)
            .map(({ id, label, icon: Icon, description }) => {
              const selected = tab === id;
              return (
                <Tooltip key={id}>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={cn(
                        "flex-1 gap-2 rounded-full border border-transparent transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        selected &&
                          "font-bold text-emerald-600 dark:text-emerald-300 hover:bg-sidebar-accent hover:text-emerald-700 dark:hover:text-emerald-200",
                      )}
                      onClick={() => setTab(id)}
                      aria-label={label === "Fontes" ? "Fontes de consulta" : label}
                    >
                      <Icon />
                      {label}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-52 bg-popover text-center text-[11px] leading-snug text-popover-foreground">
                    {description}
                  </TooltipContent>
                </Tooltip>
              );
            })}
        </div>
      </TooltipProvider>

      {tab === "chats" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          <p className="px-3 pb-2 pt-1 text-xs font-medium text-muted-foreground">Conversas</p>
          <ul className="space-y-1">
            {threads.map((thread) => {
              const isActive = thread.id === activeId;
              const isEditing = editingId === thread.id;
              return (
                <li
                  key={thread.id}
                  className={cn(
                    "group flex items-center gap-1 border-l-2 border-transparent px-3 py-2 transition-colors",
                    isActive ? "border-primary text-foreground" : "hover:bg-sidebar-accent",
                  )}
                >
                  {isEditing ? (
                    <>
                      <Input
                        ref={editRef}
                        value={draftTitle}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") commitEdit();
                          if (event.key === "Escape") setEditingId(null);
                        }}
                        className="h-7 text-sm"
                        aria-label="Renomear conversa"
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Salvar nome"
                        onClick={commitEdit}
                      >
                        <Check />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Cancelar"
                        onClick={() => setEditingId(null)}
                      >
                        <X />
                      </Button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onSelect(thread.id)}
                        onDoubleClick={() => startEdit(thread)}
                        className="min-w-0 flex-1 text-left"
                        title={thread.title}
                      >
                        <span className="block truncate text-sm">{thread.title}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {formatThreadDate(thread.updatedAt)}
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Renomear ${thread.title}`}
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => startEdit(thread)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Excluir ${thread.title}`}
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => onDelete(thread.id)}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : tab === "settings" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Configuração
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Conversa atual</p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Restaurar padrão"
              onClick={() => onSettingsChange(DEFAULT_SETTINGS)}
            >
              <RotateCcw />
            </Button>
          </div>
          <SettingsFields value={settings} onChange={onSettingsChange} isAdmin={isAdmin} />
        </div>
      ) : tab === "sources" ? (
        <VectorStoreSources
          vectorStoreId={settings.vectorStoreId}
          onVectorStoreChange={(vectorStoreId) => onSettingsChange({ ...settings, vectorStoreId })}
          isAdmin={isAdmin}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <div className="mb-3 flex items-start justify-between gap-3 px-1 pt-1">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Auditoria
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Chamadas e respostas desta conversa.
              </p>
            </div>
            {auditLogs.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                onClick={onClearAuditLogs}
              >
                Limpar
              </Button>
            ) : null}
          </div>
          {auditLogs.length === 0 ? (
            <div className="mx-1 rounded-xl border border-dashed border-border bg-card/60 px-4 py-8 text-center">
              <FileText className="mx-auto mb-2 size-5 text-muted-foreground/60" />
              <p className="text-sm font-medium">Nenhuma chamada ainda</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Os detalhes aparecem aqui assim que você enviar uma mensagem.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {auditLogs.map((log) => (
                <details
                  key={log.id}
                  className="group rounded-xl border border-border bg-card shadow-[0_5px_16px_-14px_rgba(25,70,50,0.45)]"
                  open={log.status === "streaming"}
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        log.status === "complete"
                          ? "bg-emerald-500"
                          : log.status === "error"
                            ? "bg-red-500"
                            : log.status === "cancelled"
                              ? "bg-zinc-400"
                              : "animate-pulse bg-amber-500",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold">
                        {log.status === "complete"
                          ? "Concluída"
                          : log.status === "error"
                            ? "Com erro"
                            : log.status === "cancelled"
                              ? "Interrompida"
                              : "Em andamento"}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {new Date(log.startedAt).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "medium",
                        })}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <div className="space-y-3 border-t border-border/70 px-3 py-3">
                    <RagAuditStatus log={log} />
                    {log.openaiRequest ? (
                      <AuditBlock
                        label="Chamada OpenAI · /v1/responses"
                        value={log.openaiRequest}
                        onCopy={() => void copyLog(log.openaiRequest)}
                      />
                    ) : (
                      <AuditBlock
                        label="Payload da aplicação · POST /api/llm"
                        value={log.request}
                        onCopy={() => void copyLog(log.request)}
                      />
                    )}
                    {log.response ? (
                      <AuditBlock
                        label={log.openaiRequest ? "Resposta OpenAI" : "Resposta recebida · legado"}
                        value={log.response}
                        onCopy={() => void copyLog(log.response)}
                      />
                    ) : (
                      <p className="text-xs italic text-muted-foreground">
                        Aguardando resposta da LLM…
                      </p>
                    )}
                    {log.openaiRequest ? (
                      <details className="rounded-lg border border-border/70 bg-secondary/35 px-2.5 py-2">
                        <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">
                          Ver payload da aplicação e mensagem da interface
                        </summary>
                        <div className="mt-3 space-y-3">
                          <AuditBlock
                            label="Aplicação · POST /api/llm"
                            value={log.request}
                            onCopy={() => void copyLog(log.request)}
                          />
                          {log.uiResponse ? (
                            <AuditBlock
                              label="Mensagem convertida para UI"
                              value={log.uiResponse}
                              onCopy={() => void copyLog(log.uiResponse)}
                            />
                          ) : null}
                        </div>
                      </details>
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "settings" ? (
        <TooltipProvider delayDuration={250}>
          <div className="flex justify-end px-3 pb-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  aria-label={logsEnabled ? "Ocultar painel de Logs" : "Habilitar painel de Logs"}
                  onClick={() => setLogsEnabled((enabled) => !enabled)}
                >
                  {logsEnabled ? <EyeOff /> : <Eye />}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-52 bg-popover text-center text-[11px] leading-snug text-popover-foreground">
                {logsEnabled
                  ? "Ocultar o painel de auditoria de Logs."
                  : "Habilitar o painel de auditoria de Logs."}
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      ) : null}

      <div className="border-t border-sidebar-border bg-sidebar px-3 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-destructive hover:bg-sidebar-accent hover:text-destructive active:bg-sidebar-accent"
          onClick={onClearAll}
        >
          <Trash2 />
          Limpar todo o histórico
        </Button>
      </div>
    </div>
  );
}

function hasFileSearchExecution(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasFileSearchExecution);

  const record = value as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  const toolName = typeof record.toolName === "string" ? record.toolName : "";
  if (type === "file_search_call" || toolName === "fileSearch") return true;
  return Object.values(record).some(hasFileSearchExecution);
}

function RagAuditStatus({ log }: { log: AuditLog }) {
  const requestJson = JSON.stringify(log.openaiRequest ?? log.request);
  const requested = requestJson.includes("file_search") || requestJson.includes("vectorStoreId");
  if (!requested) return null;

  const executed = hasFileSearchExecution(log.response) || hasFileSearchExecution(log.uiResponse);
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs",
        executed
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : log.status === "streaming"
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-red-200 bg-red-50 text-red-900",
      )}
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          executed ? "bg-emerald-500" : log.status === "streaming" ? "bg-amber-500" : "bg-red-500",
        )}
      />
      {executed
        ? "RAG solicitado e file_search executado"
        : log.status === "streaming"
          ? "RAG solicitado · aguardando file_search"
          : "RAG solicitado, mas a execução não apareceu na resposta"}
    </div>
  );
}

function AuditBlock({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: unknown;
  onCopy: () => void;
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-600">
          {label}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6"
          aria-label={`Copiar ${label}`}
          title={`Copiar ${label}`}
          onClick={onCopy}
        >
          <Clipboard className="size-3.5" />
        </Button>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#173a31] px-3 py-2.5 font-mono text-[11px] leading-relaxed text-[#e4f3e8]">
        <HighlightedJson value={value} />
      </pre>
    </section>
  );
}

function HighlightedJson({ value }: { value: unknown }) {
  const json = JSON.stringify(sanitizeAuditValue(value), null, 2);
  const parts = json.split(/("(?:\\.|[^"\\])*")(?=\s*:)/g);

  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className="font-semibold text-amber-300">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
