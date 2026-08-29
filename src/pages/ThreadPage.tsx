import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Moon, SlidersHorizontal, Sun } from "lucide-react";
import { toast } from "sonner";

import { ChatSidebar, ChatSidebarSheet } from "@/components/ChatSidebar";
import type { SidebarTab } from "@/components/ChatSidebarContent";
import { ChatWindow } from "@/components/ChatWindow";
import { prefetchVectorStoreSources } from "@/components/VectorStoreSources";
import { Toaster } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  allowedVectorStoreId,
  DEFAULT_SETTINGS,
  isEnglishVectorStore,
  PROFILES,
  PROFILE_VERBOSITY,
  systemPromptForFormat,
  withResponseFormat,
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
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("chats");
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  // Feature-gating de UI, não uma fronteira de segurança: o admin mode antes
  // era um pedido a uma rota serverless própria (ACCESS_LEVEL no ambiente do
  // Vercel), que só ocultava/mostrava controles — o corpo da requisição
  // sempre foi de livre escolha do cliente, com ou sem essa checagem. Sem
  // backend próprio, isAdmin fica inteiramente no cliente: o dev server, ou
  // localhost, ou VITE_ACCESS_LEVEL=1 definido no build para uma implantação
  // de teste.
  const [accessLevel] = useState<0 | 1>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("admin") === "0" || params.get("user") === "1") return 0;
      if (params.get("admin") === "1") return 1;
    }

    // `npm run dev` é sempre admin. A checagem de hostname abaixo não cobre o
    // dev aberto pelo IP da LAN (celular na rede); `import.meta.env.DEV` cobre,
    // e continua falso em qualquer build de produção.
    if (import.meta.env.DEV) return 1;

    const isLocalhost =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        window.location.hostname === "[::1]");
    const buildFlag = String(import.meta.env.VITE_ACCESS_LEVEL || "").trim() === "1";
    return isLocalhost || buildFlag ? 1 : 0;
  });

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
      : // Fora do admin o painel expõe apenas formato, verbosidade e base RAG;
      // todo o resto vem do padrão. O prompt continua sendo o canônico do
      // formato — não há como customizá-lo aqui, então nunca uma cópia
      // antiga da thread.
      {
        ...DEFAULT_SETTINGS,
        responseFormat: active.settings.responseFormat,
        profile: active.settings.profile ?? DEFAULT_SETTINGS.profile,
        systemPrompt: systemPromptForFormat(active.settings.responseFormat),
        textVerbosity:
          PROFILE_VERBOSITY[active.settings.profile ?? DEFAULT_SETTINGS.profile],
        vectorStoreId: allowedVectorStoreId(active.settings.vectorStoreId, false),
      }
    : DEFAULT_SETTINGS;

  const goTo = (id: string) => setActiveId(id);

  // Pré-carrega no background a lista de arquivos da base RAG padrão em tempo ocioso,
  // sem atrasar a inicialização da tela nem a digitação do usuário.
  useEffect(() => {
    const storeId = effectiveSettings.vectorStoreId;
    if (!storeId || storeId === "none") return;

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const handle = (
        window as unknown as {
          requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
        }
      ).requestIdleCallback(
        () => {
          prefetchVectorStoreSources(storeId);
        },
        { timeout: 3000 },
      );
      return () => {
        if ("cancelIdleCallback" in window) {
          (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(
            handle,
          );
        }
      };
    }

    const timer = setTimeout(() => {
      prefetchVectorStoreSources(storeId);
    }, 1500);
    return () => clearTimeout(timer);
  }, [effectiveSettings.vectorStoreId]);

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
    const thread = createThread(effectiveSettings);
    persist(upsertThread(threads ?? [], thread));
    goTo(thread.id);
  };

  const handleDelete = (id: string) => {
    const next = deleteThread(threads ?? [], id);
    if (next.length === 0) {
      const thread = createThread(effectiveSettings);
      persist([thread]);
      goTo(thread.id);
      return;
    }
    persist(next);
    if (id === activeId) goTo(next[0]!.id);
  };

  const handleClearAll = () => {
    const thread = createThread(effectiveSettings);
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
        profile: settings.profile ?? DEFAULT_SETTINGS.profile,
        systemPrompt: systemPromptForFormat(settings.responseFormat),
        textVerbosity:
          PROFILE_VERBOSITY[settings.profile ?? DEFAULT_SETTINGS.profile],
        vectorStoreId: allowedVectorStoreId(settings.vectorStoreId, false),
      };
    persist(
      upsertThread(threads ?? [], {
        ...active,
        settings: nextSettings,
        updatedAt: active.updatedAt,
      }),
    );
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
        if (current.messages.length === messages.length && messages.length === 0)
          return prevThreads;
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

  const handleOpenSettings = () => {
    setSidebarTab("settings");
    setMobileSheetOpen(true);
  };

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
    activeTab: sidebarTab,
    onTabChange: setSidebarTab,
  };
  const currentContainerWidth = CONTAINER_WIDTH_CONFIG[containerWidth];

  return (
    <div className="flex h-dvh bg-background text-foreground">
      <ChatSidebar {...sidebarProps} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center border-b border-border/70">
          <div
            className={cn(
              "mx-auto flex w-full items-center gap-3 px-4 transition-all duration-300",
              currentContainerWidth.className,
            )}
          >
            <div className="lg:hidden">
              <ChatSidebarSheet
                {...sidebarProps}
                open={mobileSheetOpen}
                onOpenChange={setMobileSheetOpen}
              />
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
                <h1 className="max-w-[14rem] truncate font-nunito text-[1.35rem] font-normal tracking-tight text-foreground sm:max-w-none">
                  Cons<em className="ml-[3px] italic text-primary font-semibold">BOT</em>
                </h1>

                <span className="hidden h-4 w-px bg-border sm:inline mx-1" />
                <span className="hidden font-nunito-sans text-[10px] uppercase tracking-[0.22em] text-muted-foreground sm:inline">
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
                {isDark ? (
                  <Sun className="size-4" aria-hidden="true" />
                ) : (
                  <Moon className="size-4" aria-hidden="true" />
                )}
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleOpenSettings}
                    className="group inline-flex items-center gap-2 rounded-full border border-[#E4DBC8] bg-[#F7F2E7] px-3.5 py-1.5 text-xs font-medium text-stone-700 shadow-xs backdrop-blur transition-all duration-200 hover:border-primary/60 hover:bg-[#EFE8D6] hover:text-stone-900 hover:shadow-sm active:scale-[0.98] dark:border-[#423C32] dark:bg-[#28241D] dark:text-stone-300 dark:hover:border-primary/50 dark:hover:bg-[#332E25] dark:hover:text-stone-100"
                    aria-label="Ajustar estilo das respostas no menu de configurações"
                  >
                    <SlidersHorizontal className="size-3.5 text-primary transition-transform duration-200 group-hover:rotate-45" />
                    <span>Estilo das respostas</span>
                    <span className="h-3 w-px bg-[#D9CEB7] dark:bg-[#4A4337]" />
                    <span className="font-semibold text-foreground">
                      {PROFILES.find(
                        (p) => p.id === (active.settings.profile ?? DEFAULT_SETTINGS.profile),
                      )?.label ?? "Tutor"}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64 bg-popover text-center text-[11px] leading-snug text-popover-foreground">
                  Clique para abrir as configurações e personalizar o perfil, formato e parâmetros.
                </TooltipContent>
              </Tooltip>
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
          isAdmin={isAdmin}
        />
      </div>
      <Toaster />
    </div>
  );
}
