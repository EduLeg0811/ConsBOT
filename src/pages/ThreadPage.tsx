import type { UIMessage } from "ai";
import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { ChatSidebar, ChatSidebarSheet } from "@/components/ChatSidebar";
import { ChatWindow } from "@/components/ChatWindow";
import { Toaster } from "@/components/ui/sonner";
import { MODELS, saveSettings, type ChatSettings } from "@/lib/chat-settings";
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

export function ThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<ChatThread[] | null>(null);

  useEffect(() => {
    const { threads: list, activeId } = ensureThread(threadId);
    setThreads(list);
    if (activeId !== threadId) {
      navigate(`/c/${activeId}`, { replace: true });
    }
  }, [threadId, navigate]);

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

  const handleMessagesChange = useCallback(
    (messages: UIMessage[]) => {
      const current = loadThreads().find((thread) => thread.id === threadId);
      if (!current) return;
      if (current.messages.length === messages.length && messages.length === 0) return;
      const nextTitle =
        current.title === "Nova conversa" ? (titleFromMessages(messages) ?? current.title) : current.title;
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
  };

  const activeModel = MODELS.find((model) => model.id === active.settings.model);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <ChatSidebar {...sidebarProps} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border/70 px-4 py-3">
          <div className="lg:hidden">
            <ChatSidebarSheet {...sidebarProps} />
          </div>
          <img
            src="/favicon.png"
            alt="Ícone do ConsBOT"
            className="size-10 shrink-0 object-contain"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight">{active.title}</h1>
            <p className="truncate text-xs text-muted-foreground">
              ConsBOT · {activeModel?.label ?? "OpenAI"}
            </p>
          </div>
        </header>

        <ChatWindow
          key={threadId}
          threadId={threadId}
          settings={active.settings}
          initialMessages={[]}
          onMessagesChange={handleMessagesChange}
        />
      </div>
      <Toaster />
    </div>
  );
}
