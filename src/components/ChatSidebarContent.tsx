import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookA,
  BookMarked,
  BookOpen,
  Check,
  Clipboard,
  Database,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Library,
  MessageSquare,
  PanelRightOpen,
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
  onQuickAccess: (link: { title: string; url: string }) => void;
  citationsPanelAvailable: boolean;
  citationsPanelOpen: boolean;
  onCitationsPanelOpenChange: (open: boolean) => void;
  activeTab?: SidebarTab;
  onTabChange?: (tab: SidebarTab) => void;
};

export const SIDEBAR_QUICK_LINKS = [
  {
    title: "Busca em Livros",
    url: "https://cons-ia.org/index_search_book.html",
    icon: BookOpen,
    color: "text-sky-500 dark:text-sky-400",
  },
  {
    title: "Busca em Verbetes",
    url: "https://cons-ia.org/index_search_verb.html",
    icon: FileText,
    color: "text-emerald-500 dark:text-emerald-400",
  },
  {
    title: "Bibliografia de Livros",
    url: "https://cons-ia.org/index_biblio_wv.html",
    icon: Library,
    color: "text-amber-500 dark:text-amber-400",
  },
  {
    title: "Bibliografia de Verbetes",
    url: "https://cons-ia.org/index_biblio_verbete.html",
    icon: BookMarked,
    color: "text-violet-500 dark:text-violet-400",
  },
  {
    title: "Cosmovisão Léxica",
    url: "https://lexicons.cons-ia.org/",
    icon: BookA,
    color: "text-teal-500 dark:text-teal-400",
  },
] as const;

function formatThreadDate(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.toLocaleDateString("pt-BR")} ● ${date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}

function interactionLabel(value: unknown): string {
  if (!value || typeof value !== "object") return "Evento de interface";
  const record = value as Record<string, unknown>;
  return typeof record.label === "string" && record.label ? record.label : "Evento de interface";
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
  onQuickAccess,
  citationsPanelAvailable,
  citationsPanelOpen,
  onCitationsPanelOpenChange,
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

  useEffect(() => {
    if (!isAdmin) {
      if (logsEnabled) setLogsEnabled(false);
      if (tab === "logs") setTab("chats");
    }
  }, [isAdmin, logsEnabled, tab]);

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
            .filter(({ id }) => id !== "logs" || (isAdmin && logsEnabled))
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
      ) : tab === "logs" && isAdmin ? (
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
          <AgentAuditSummary logs={auditLogs} />
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
              {auditLogs.map((log) =>
                log.kind === "interaction" ? (
                  <details
                    key={log.id}
                    className="group rounded-xl border border-sky-200/80 bg-sky-50/55 dark:border-sky-900/60 dark:bg-sky-950/15"
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5">
                      <span className="size-2 shrink-0 rounded-full bg-sky-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-foreground">
                          {interactionLabel(log.request)}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          Evento de interface ·{" "}
                          {new Date(log.startedAt).toLocaleTimeString("pt-BR")}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground transition-transform group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <div className="border-t border-sky-200/70 px-3 py-3 dark:border-sky-900/50">
                      <AuditBlock
                        label="Detalhes da ação"
                        value={log.request}
                        onCopy={() => void copyLog(log.request)}
                      />
                    </div>
                  </details>
                ) : (
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
                      {log.agentPills?.length ? (
                        <div className="space-y-2 rounded-lg border border-chart-2/25 bg-chart-2/5 px-2.5 py-2">
                          <p className="text-[11px] font-medium text-foreground">
                            Pills disponibilizados
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {log.agentPills.map((pill) => (
                              <span
                                key={pill.id}
                                className="rounded-full border border-chart-2/30 bg-card px-2 py-0.5 text-[10px] text-foreground"
                              >
                                {pill.label}
                              </span>
                            ))}
                          </div>
                          <AuditBlock
                            label="Metadados dos pills"
                            value={log.agentPills}
                            onCopy={() => void copyLog(log.agentPills)}
                          />
                        </div>
                      ) : null}
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
                          label={
                            log.openaiRequest ? "Resposta OpenAI" : "Resposta recebida · legado"
                          }
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
                ),
              )}
            </div>
          )}
        </div>
      ) : null}

      {tab === "settings" && (citationsPanelAvailable || isAdmin) ? (
        <TooltipProvider delayDuration={250}>
          <div className="flex justify-end gap-1 px-3 pb-2">
            {citationsPanelAvailable ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    aria-label={
                      citationsPanelOpen ? "Fechar painel de citações" : "Abrir painel de citações"
                    }
                    onClick={() => onCitationsPanelOpenChange(!citationsPanelOpen)}
                  >
                    <PanelRightOpen className={citationsPanelOpen ? "rotate-180" : undefined} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-52 bg-popover text-center text-[11px] leading-snug text-popover-foreground">
                  {citationsPanelOpen
                    ? "Fechar o painel de citações."
                    : "Abrir o painel de citações."}
                </TooltipContent>
              </Tooltip>
            ) : null}
            {isAdmin ? (
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
            ) : null}
          </div>
        </TooltipProvider>
      ) : null}

      {tab === "chats" ? (
        <div className="border-t border-sidebar-border bg-sidebar px-3 py-2 space-y-0.5">
          <p className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
            Acesso rápido
          </p>
          {SIDEBAR_QUICK_LINKS.map(({ title, url, icon: Icon, color }) => (
            <Button
              key={title}
              variant="ghost"
              size="sm"
              asChild
              className="group w-full justify-start gap-2 text-xs font-medium text-foreground/90 hover:bg-sidebar-accent hover:text-foreground active:bg-sidebar-accent"
            >
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title={title}
                onClick={() => onQuickAccess({ title, url })}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0 transition-transform duration-150 group-hover:scale-110",
                    color,
                  )}
                />
                <span className="truncate">{title}</span>
                <ExternalLink className="ml-auto size-3 shrink-0 opacity-30 transition-opacity duration-150 group-hover:opacity-75" />
              </a>
            </Button>
          ))}
        </div>
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

type AgentAuditDecision = { route: string; origin?: string; confidence?: number; actionCount?: number };

function agentDecisionFromLog(log: AuditLog): AgentAuditDecision | null {
  const request = log.request;
  if (!request || typeof request !== "object") return null;
  const record = request as Record<string, unknown>;

  if (record.action === "classifier_decision" && record.meta && typeof record.meta === "object") {
    const meta = record.meta as Record<string, unknown>;
    return typeof meta.route === "string"
      ? {
        route: meta.route,
        ...(typeof meta.origin === "string" ? { origin: meta.origin } : {}),
        ...(typeof meta.confidence === "number" ? { confidence: meta.confidence } : {}),
        ...(Array.isArray(meta.actions) ? { actionCount: meta.actions.length } : {}),
      }
      : null;
  }

  const body = record.body;
  if (!body || typeof body !== "object") return null;
  const decision = (body as Record<string, unknown>).agentDecision;
  if (!decision || typeof decision !== "object") return null;
  const value = decision as Record<string, unknown>;
  return typeof value.route === "string"
    ? {
      route: value.route,
      ...(typeof value.origin === "string" ? { origin: value.origin } : {}),
      ...(typeof value.confidence === "number" ? { confidence: value.confidence } : {}),
      ...(Array.isArray(value.actions) ? { actionCount: value.actions.length } : {}),
    }
    : null;
}

function AgentAuditSummary({ logs }: { logs: AuditLog[] }) {
  const decisions = useMemo(
    () =>
      logs
        .filter((log) => log.kind === "interaction")
        .map(agentDecisionFromLog)
        .filter((value): value is AgentAuditDecision => value !== null),
    [logs],
  );
  if (decisions.length === 0) return null;

  const counts = decisions.reduce<Record<string, number>>((result, decision) => {
    result[decision.route] = (result[decision.route] ?? 0) + 1;
    return result;
  }, {});
  const fallbacks = decisions.filter((decision) => decision.origin === "fallback").length;
  const availablePills = decisions.reduce((total, decision) => total + (decision.actionCount ?? 0), 0);
  const pillClicks = logs.filter((log) => {
    const request = log.request;
    return (
      log.kind === "interaction" &&
      Boolean(request) &&
      typeof request === "object" &&
      (request as Record<string, unknown>).action === "pill_click"
    );
  }).length;
  const averageConfidence =
    decisions.reduce((total, decision) => total + (decision.confidence ?? 0), 0) / decisions.length;

  return (
    <section className="mx-1 mb-3 rounded-xl border border-chart-2/20 bg-chart-2/5 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold text-foreground">Resumo do roteador</p>
        <span className="text-[10px] text-muted-foreground">
          confiança média {Math.round(averageConfidence * 100)}%
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Object.entries(counts).map(([route, count]) => (
          <span
            key={route}
            className="rounded-full border border-chart-2/25 bg-card px-2 py-0.5 text-[10px] text-foreground"
          >
            {route}: {count}
          </span>
        ))}
        {fallbacks > 0 ? (
          <span className="rounded-full border border-amber-300/70 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800">
            fallback: {fallbacks}
          </span>
        ) : null}
        {availablePills > 0 ? (
          <span className="rounded-full border border-border/70 bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
            pills: {pillClicks}/{availablePills} clicados
          </span>
        ) : null}
      </div>
    </section>
  );
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
