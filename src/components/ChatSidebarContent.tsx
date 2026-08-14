import { useEffect, useRef, useState } from "react";
import { Check, MessageSquare, Pencil, RotateCcw, Settings2, Sparkles, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsFields } from "@/components/SettingsFields";
import { DEFAULT_SETTINGS, type ChatSettings } from "@/lib/chat-settings";
import type { ChatThread } from "@/lib/chat-store";
import { cn } from "@/lib/utils";

export type ChatSidebarProps = {
  threads: ChatThread[];
  activeId: string;
  settings: ChatSettings;
  onSettingsChange: (settings: ChatSettings) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
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
  onSettingsChange,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onClearAll,
}: ChatSidebarProps) {
  const [tab, setTab] = useState<"chats" | "settings">("chats");
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-50">
      <div className="flex items-center gap-2 px-3 py-3">
        <button
          type="button"
          onClick={onNew}
          className="group inline-flex items-center gap-2 rounded-md px-1 py-1.5 text-sm font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Sparkles className="size-4 text-amber-500 transition-transform group-hover:scale-110 group-hover:text-orange-500" />
          Nova conversa
        </button>
      </div>

      <div className="flex gap-1 px-3 pb-2">
        <Button
          size="sm"
          variant="ghost"
          className={cn(
            "flex-1 gap-2 rounded-full",
            tab === "chats" && "bg-white shadow-sm hover:bg-white",
          )}
          onClick={() => setTab("chats")}
        >
          <MessageSquare />
          Conversas
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className={cn(
            "flex-1 gap-2 rounded-full",
            tab === "settings" && "bg-white shadow-sm hover:bg-white",
          )}
          onClick={() => setTab("settings")}
        >
          <Settings2 />
          Configurações
        </Button>
      </div>

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
                    isActive ? "border-primary text-foreground" : "hover:bg-zinc-100",
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
                      <Button variant="ghost" size="icon-sm" aria-label="Salvar nome" onClick={commitEdit}>
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
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Ajustes desta conversa. Cada conversa guarda os seus próprios.
            </p>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Restaurar padrão"
              onClick={() => onSettingsChange(DEFAULT_SETTINGS)}
            >
              <RotateCcw />
            </Button>
          </div>
          <SettingsFields value={settings} onChange={onSettingsChange} />
        </div>
      )}

      <div className="border-t border-border px-3 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-destructive hover:text-destructive"
          onClick={onClearAll}
        >
          <Trash2 />
          Limpar todo o histórico
        </Button>
      </div>
    </div>
  );
}
