import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { ChatSidebar, ChatSidebarSheet } from "@/components/ChatSidebar";
import { ChatWindow } from "@/components/ChatWindow";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  saveSettings,
  systemPromptForFormat,
  type ChatSettings,
  type ResponseFormatId,
} from "@/lib/chat-settings";
import {
  addAuditLog,
  type AuditCompletion,
  clearAuditLogs,
  type ConsBotUIMessage,
  loadAuditLogs,
  updateAuditLog,
  type AuditLog,
} from "@/lib/audit-log";
import {
  clearAllThreads,
  createThread,
  deleteThread,
  ensureThread,
  loadThreads,
  saveThreads,
  titleFromMessages,
  upsertThread,
  type ChatThread,
} from "@/lib/chat-store";

const RESPONSE_LENGTH_OPTIONS = [
  { label: "Síntese", value: 256 },
  { label: "Breve", value: 512 },
  { label: "Longa", value: 1024 },
  { label: "Extensa", value: 2048 },
  { label: "Livre", value: 4096 },
] as const;

export function ThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    const { threads: list, activeId } = ensureThread(threadId);
    setThreads(list);
    if (activeId !== threadId) {
      navigate(`/c/${activeId}`, { replace: true });
    }
  }, [threadId, navigate]);

  useEffect(() => {
    if (threadId) setAuditLogs(loadAuditLogs(threadId));
  }, [threadId]);

  const persist = useCallback((next: ChatThread[]) => {
    setThreads(next);
    saveThreads(next);
  }, []);

  const active = threads?.find((thread) => thread.id === threadId) ?? null;

  const goTo = (id: string) => navigate(`/c/${id}`);

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
    if (id === threadId) goTo(next[0]!.id);
  };

  const handleClearAll = () => {
    clearAllThreads();
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
    saveSettings(settings);
    persist(upsertThread(threads ?? [], { ...active, settings, updatedAt: active.updatedAt }));
  };

  const handleAuditStart = useCallback(
    (request: unknown) => {
      if (!threadId) return "";
      const log: AuditLog = {
        id: crypto.randomUUID(),
        threadId,
        startedAt: Date.now(),
        status: "streaming",
        request,
      };
      addAuditLog(log);
      setAuditLogs(loadAuditLogs(threadId));
      return log.id;
    },
    [threadId],
  );

  const handleAuditComplete = useCallback(
    (id: string, result: AuditCompletion, status: AuditLog["status"] = "complete") => {
      if (!threadId || !id) return;
      updateAuditLog(id, { ...result, status, completedAt: Date.now() });
      setAuditLogs(loadAuditLogs(threadId));
    },
    [threadId],
  );

  const handleClearAuditLogs = () => {
    if (!threadId) return;
    clearAuditLogs(threadId);
    setAuditLogs([]);
  };

  const handleMessagesChange = useCallback(
    (messages: ConsBotUIMessage[]) => {
      const current = loadThreads().find((thread) => thread.id === threadId);
      if (!current) return;
      if (current.messages.length === messages.length && messages.length === 0) return;
      const nextTitle =
        current.title === "Nova conversa"
          ? (titleFromMessages(messages) ?? current.title)
          : current.title;
      const updated: ChatThread = {
        ...current,
        // As mensagens são apenas o estado temporário da tela atual. No
        // histórico persistente ficam título, data e configurações.
        messages: [],
        title: nextTitle,
        updatedAt: messages.length > 0 ? Date.now() : current.updatedAt,
      };
      persist(upsertThread(loadThreads(), updated));
    },
    [threadId, persist],
  );

  if (!threads || !active || !threadId) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Carregando conversa...
      </div>
    );
  }

  const sidebarProps = {
    threads,
    activeId: threadId,
    settings: active.settings,
    onSettingsChange: handleSettingsChange,
    onSelect: goTo,
    onNew: handleNew,
    onRename: handleRename,
    onDelete: handleDelete,
    onClearAll: handleClearAll,
    auditLogs,
    onClearAuditLogs: handleClearAuditLogs,
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <ChatSidebar {...sidebarProps} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-2.5">
          <div className="lg:hidden">
            <ChatSidebarSheet {...sidebarProps} />
          </div>
          <img src="/icon.png" alt="Ícone do ConsBOT" className="size-10 shrink-0 object-contain" />
          <div className="min-w-0 flex-1 lg:flex-none">
            <h1 className="truncate text-lg font-semibold tracking-tight">ConsBOT</h1>
          </div>
          <div className="order-3 flex w-full flex-wrap items-center justify-end gap-2 lg:order-none lg:ml-auto lg:w-auto lg:flex-nowrap">
            <TooltipProvider delayDuration={250}>
              <div className="flex items-center gap-1" aria-label="Formato da resposta">
                {[
                  {
                    id: "chatgpt",
                    label: "Formato ChatGPT",
                    description: "Resposta livre e conversacional, no estilo padrão do ChatGPT.",
                  },
                  {
                    id: "conscienciological",
                    label: "Confor conscienciológico",
                    description:
                      "Resposta estruturada, com terminologia e fontes da Conscienciologia.",
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
                              ? "rounded-lg border border-[#f3bf93] bg-[#fff1e6] px-2.5 py-1.5 text-[11px] font-medium text-[#a64b16] shadow-[0_1px_4px_-3px_rgba(157,78,25,0.65)]"
                              : "rounded-lg border border-[#eadbd0] bg-[#fffdfb] px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-[0_1px_3px_-3px_rgba(100,70,45,0.42)] transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
                          }
                        >
                          {format.label}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-56 bg-slate-700 text-center text-[11px] leading-snug text-white">
                        {format.description}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>

            <Select
              value={String(active.settings.maxOutputTokens)}
              onValueChange={(value) =>
                handleSettingsChange({ ...active.settings, maxOutputTokens: Number(value) })
              }
            >
              <SelectTrigger
                aria-label="Tamanho máximo da resposta"
                className="h-8 w-28 border-border/80 bg-slate-50 px-2.5 text-[11px] font-medium text-slate-600 shadow-[0_1px_4px_-3px_rgba(71,85,105,0.45)] hover:bg-slate-100"
              >
                <SelectValue placeholder="Tamanho da resposta" />
              </SelectTrigger>
              <SelectContent className="border-border/80 bg-slate-50 text-xs">
                {RESPONSE_LENGTH_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={String(option.value)}
                    className="text-xs focus:bg-slate-100 focus:text-slate-700"
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        <ChatWindow
          key={threadId}
          threadId={threadId}
          settings={active.settings}
          initialMessages={[]}
          onMessagesChange={handleMessagesChange}
          onAuditStart={handleAuditStart}
          onAuditComplete={handleAuditComplete}
        />
      </div>
      <Toaster />
    </div>
  );
}
