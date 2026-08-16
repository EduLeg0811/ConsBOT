import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Moon, Sun } from "lucide-react";
import { toast } from "sonner";

import { ChatSidebar, ChatSidebarSheet } from "@/components/ChatSidebar";
import { ChatWindow } from "@/components/ChatWindow";
import { Toaster } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SETTINGS,
  systemPromptForFormat,
  type ChatSettings,
  type ResponseFormatId,
} from "@/lib/chat-settings";
import {
  addAuditLog,
  clearAllAuditLogs,
  type AuditCompletion,
  clearAuditLogs,
  type ConsBotUIMessage,
  loadAuditLogs,
  updateAuditLog,
  type AuditLog,
} from "@/lib/audit-log";
import {
  createThread,
  deleteThread,
  loadThreads,
  saveThreads,
  titleFromMessages,
  upsertThread,
  type ChatThread,
} from "@/lib/chat-store";

const CONTAINER_WIDTHS = ["5xl", "6xl", "7xl", "full"] as const;
type ContainerWidth = (typeof CONTAINER_WIDTHS)[number];
// Evita duas novas conversas causadas pela dupla inicialização do StrictMode em desenvolvimento.......
let initialSessionThread: ChatThread | null = null;

const CONTAINER_WIDTH_CONFIG: Record<ContainerWidth, { className: string; label: string }> = {
  "5xl": { className: "max-w-5xl", label: "5XL" },
  "6xl": { className: "max-w-6xl", label: "6XL" },
  "7xl": { className: "max-w-7xl", label: "7XL" },
  full: { className: "max-w-full", label: "Full" },
};

export function ThreadPage() {
  const [containerWidth, setContainerWidth] = useState<ContainerWidth>("7xl");
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  const hasManualThemeRef = useRef(false);
  const [threads, setThreads] = useState<ChatThread[]>(() => {
    const loaded = loadThreads();
    const existingEmpty = loaded.find((t) => t.messages.length === 0);
    if (existingEmpty) {
      const otherThreads = loaded.filter((t) => t.id !== existingEmpty.id);
      const next = [existingEmpty, ...otherThreads];
      saveThreads(next);
      return next;
    }
    const thread = initialSessionThread ?? createThread();
    initialSessionThread = thread;
    const next = [thread, ...loaded];
    saveThreads(next);
    return next;
  });
  const [activeId, setActiveId] = useState<string>(() => threads[0]!.id);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [accessLevel, setAccessLevel] = useState<0 | 1>(() => {
    if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "[::1]")) {
      return 1;
    }
    return 0;
  });

  useEffect(() => {
    void fetch("/api/access-level", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível obter o nível de acesso.");
        return (await response.json()) as { accessLevel?: unknown };
      })
      .then((body) => setAccessLevel(body.accessLevel === 1 ? 1 : 0))
      .catch(() => {
        const isLocalhost =
          typeof window !== "undefined" &&
          (window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1" ||
            window.location.hostname === "[::1]");
        setAccessLevel(isLocalhost ? 1 : 0);
      });
  }, []);

  useEffect(() => {
    setAuditLogs(loadAuditLogs(activeId));
  }, [activeId]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = (event: MediaQueryListEvent | MediaQueryList) => {
      if (hasManualThemeRef.current) return;
      const nextIsDark = event.matches;
      document.documentElement.classList.toggle("dark", nextIsDark);
      setIsDark(nextIsDark);
    };
    syncSystemTheme(media);
    media.addEventListener("change", syncSystemTheme);
    return () => media.removeEventListener("change", syncSystemTheme);
  }, []);

  const persist = useCallback((next: ChatThread[]) => {
    setThreads(next);
    saveThreads(next);
  }, []);

  const active = threads.find((thread) => thread.id === activeId) ?? null;
  const isAdmin = accessLevel === 1;
  const effectiveSettings = active
    ? isAdmin
      ? active.settings
      : {
        ...DEFAULT_SETTINGS,
        responseFormat: active.settings.responseFormat,
        systemPrompt: active.settings.systemPrompt,
      }
    : DEFAULT_SETTINGS;

  const goTo = (id: string) => setActiveId(id);

  const cycleContainerWidth = () => {
    const currentIndex = CONTAINER_WIDTHS.indexOf(containerWidth);
    const nextWidth = CONTAINER_WIDTHS[(currentIndex + 1) % CONTAINER_WIDTHS.length]!;
    setContainerWidth(nextWidth);
  };

  const toggleTheme = () => {
    hasManualThemeRef.current = true;
    setIsDark((current) => {
      const next = !current;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };

  const handleNew = () => {
    const thread = createThread();
    persist(upsertThread(threads ?? [], thread));
    goTo(thread.id);
  };

  const handleDelete = (id: string) => {
    const next = deleteThread(threads ?? [], id);
    if (next.length === 0) {
      const thread = createThread();
      persist([thread]);
      goTo(thread.id);
      return;
    }
    persist(next);
    if (id === activeId) goTo(next[0]!.id);
  };

  const handleClearAll = () => {
    const thread = createThread();
    saveThreads([thread]);
    setThreads([thread]);
    toast.success("Histórico apagado deste navegador");
    goTo(thread.id);
  };

  const handleRename = (id: string, title: string) => {
    persist((threads ?? []).map((thread) => (thread.id === id ? { ...thread, title } : thread)));
  };

  const handleSettingsChange = (settings: ChatSettings) => {
    if (!active) return;
    const nextSettings = isAdmin
      ? settings
      : {
        ...DEFAULT_SETTINGS,
        responseFormat: settings.responseFormat,
        systemPrompt: settings.systemPrompt,
      };
    persist(upsertThread(threads ?? [], { ...active, settings: nextSettings, updatedAt: active.updatedAt }));
  };

  const handleAuditStart = useCallback(
    (request: unknown) => {
      const log: AuditLog = {
        id: crypto.randomUUID(),
        threadId: activeId,
        startedAt: Date.now(),
        status: "streaming",
        request,
      };
      addAuditLog(log);
      setAuditLogs(loadAuditLogs(activeId));
      return log.id;
    },
    [activeId],
  );

  const handleAuditComplete = useCallback(
    (id: string, result: AuditCompletion, status: AuditLog["status"] = "complete") => {
      if (!id) return;
      updateAuditLog(id, { ...result, status, completedAt: Date.now() });
      setAuditLogs(loadAuditLogs(activeId));
    },
    [activeId],
  );

  const handleClearAuditLogs = () => {
    clearAuditLogs(activeId);
    setAuditLogs([]);
  };

  const handleMessagesChange = useCallback(
    (messages: ConsBotUIMessage[]) => {
      setThreads((prevThreads) => {
        const current = prevThreads.find((thread) => thread.id === activeId);
        if (!current) return prevThreads;
        if (current.messages.length === messages.length && messages.length === 0) return prevThreads;
        const nextTitle =
          current.title === "Nova conversa"
            ? (titleFromMessages(messages) ?? current.title)
            : current.title;
        const updated: ChatThread = {
          ...current,
          messages,
          title: nextTitle,
          updatedAt: messages.length > 0 ? Date.now() : current.updatedAt,
        };
        const next = upsertThread(prevThreads, updated);
        saveThreads(next);
        return next;
      });
    },
    [activeId],
  );

  if (!active) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Carregando conversa...
      </div>
    );
  }

  const sidebarProps = {
    threads,
    activeId,
    settings: effectiveSettings,
    isAdmin,
    onSettingsChange: handleSettingsChange,
    onSelect: goTo,
    onNew: handleNew,
    onRename: handleRename,
    onDelete: handleDelete,
    onClearAll: handleClearAll,
    auditLogs,
    onClearAuditLogs: handleClearAuditLogs,
  };
  const currentContainerWidth = CONTAINER_WIDTH_CONFIG[containerWidth];

  return (
    <div className="flex h-dvh bg-background text-foreground">
      <ChatSidebar {...sidebarProps} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[60px] items-center border-b border-border/70">
          <div
            className={cn(
              "mx-auto flex w-full items-center gap-3 px-4 transition-all duration-300",
              currentContainerWidth.className,
            )}
          >
            <div className="lg:hidden">
              <ChatSidebarSheet {...sidebarProps} />
            </div>
            <a
              href="https://www.cons-ia.org"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Página inicial do ConsBOT"
              title="Ir para www.cons-ia.org"
            >
              <img
                src="/icon.png"
                alt="ConsBOT"
                className="h-12 w-12 shrink-0 object-contain transition-transform duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_color-mix(in_oklch,var(--primary)_40%,transparent)]"
              />
              <span className="flex min-w-0 items-center gap-2">
                <h1 className="max-w-[14rem] truncate font-nunito text-xl font-normal tracking-tight text-foreground sm:max-w-none">
                  Cons<em className="ml-[4px] italic text-primary">BOT</em>
                </h1>

                <span className="hidden h-4 w-px bg-border sm:inline mx-1" />
                <span className="hidden text-[10px] uppercase tracking-[0.22em] text-muted-foreground sm:inline">
                  Assistente de IA da Conscienciologia
                </span>
              </span>
            </a>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={cycleContainerWidth}
                title={`Largura da tela: ${currentContainerWidth.label}`}
                aria-label={`Largura da tela: ${currentContainerWidth.label}`}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Maximize2 className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                title={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
                aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {isDark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
              </button>
            </div>
          </div>
        </header>

        <div className="w-full shrink-0 pt-3 pb-1">
          <div
            className={cn(
              "mx-auto flex w-full justify-end px-4 transition-all duration-300",
              currentContainerWidth.className,
            )}
          >
            <TooltipProvider delayDuration={250}>
              <div className="flex items-center gap-1.5" aria-label="Formato da resposta">
                {[
                  {
                    id: "chatgpt",
                    label: "Formato ChatGPT",
                    description: "Resposta livre e conversacional, no estilo padrão do ChatGPT.",
                  },
                  {
                    id: "conscienciological",
                    label: "Confor Conscienciológico",
                    description: "Resposta estruturada no confor da Conscienciologia.",
                  },
                ].map((format) => {
                  const selected = active.settings.responseFormat === format.id;
                  return (
                    <Tooltip key={format.id}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() =>
                            handleSettingsChange({
                              ...active.settings,
                              responseFormat: format.id as ResponseFormatId,
                              systemPrompt: systemPromptForFormat(format.id as ResponseFormatId),
                            })
                          }
                          className={
                            selected
                              ? "rounded-lg border border-orange-300/80 bg-orange-50 px-2.5 py-1.5 text-[11px] font-medium text-orange-800 shadow-[0_1px_4px_-3px_rgba(157,78,25,0.65)] dark:border-orange-300/35 dark:bg-orange-400/15 dark:text-orange-200"
                              : "rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
                          }
                        >
                          {format.label}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-56 bg-popover text-center text-[11px] leading-snug text-popover-foreground">
                        {format.description}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          </div>
        </div>

        <ChatWindow
          key={activeId}
          threadId={activeId}
          settings={effectiveSettings}
          containerWidthClass={currentContainerWidth.className}
          initialMessages={(active?.messages as ConsBotUIMessage[]) ?? []}
          onMessagesChange={handleMessagesChange}
          onAuditStart={handleAuditStart}
          onAuditComplete={handleAuditComplete}
        />
      </div>
      <Toaster />
    </div>
  );
}
