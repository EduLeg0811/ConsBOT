import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SettingsFields } from "@/components/SettingsFields";
import { DEFAULT_SETTINGS, type ChatSettings } from "@/lib/chat-settings";

type Props = {
  settings: ChatSettings;
  onSave: (settings: ChatSettings) => void;
};

export function SettingsDialog({ settings, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ChatSettings>(settings);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 rounded-full">
          <Settings2 />
          <span className="hidden sm:inline">Configurações</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurações do ConsBOT</DialogTitle>
          <DialogDescription>
            Escolha o modelo, ajuste os parâmetros e defina o prompt de sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <SettingsFields value={draft} onChange={setDraft} />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => setDraft(DEFAULT_SETTINGS)}>
            Restaurar padrão
          </Button>
          <Button
            onClick={() => {
              onSave(draft);
              setOpen(false);
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
