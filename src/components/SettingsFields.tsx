import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MODELS, type ChatSettings, type ModelId } from "@/lib/chat-settings";

type Props = {
  value: ChatSettings;
  onChange: (settings: ChatSettings) => void;
};

export function SettingsFields({ value: draft, onChange: setDraft }: Props) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Modelo</Label>
        <Select
          value={draft.model}
          onValueChange={(value) => setDraft({ ...draft, model: value as ModelId })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODELS.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {MODELS.find((m) => m.id === draft.model)?.description}
        </p>
      </div>

      <div className="space-y-2">
        <Label>Prompt de sistema</Label>
        <Textarea
          value={draft.systemPrompt}
          rows={5}
          onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value })}
          placeholder="Descreva como o ConsBOT deve se comportar..."
        />
      </div>

      <div className="space-y-2">
        <Label>Nível de raciocínio</Label>
        <Select
          value={draft.reasoningEffort}
          onValueChange={(value) =>
            setDraft({ ...draft, reasoningEffort: value as ChatSettings["reasoningEffort"] })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Baixo — respostas mais rápidas</SelectItem>
            <SelectItem value="medium">Médio — equilibrado</SelectItem>
            <SelectItem value="high">Alto — análises profundas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label>Tamanho máximo da resposta</Label>
          <span className="text-sm font-medium text-muted-foreground">
            {draft.maxOutputTokens} tokens
          </span>
        </div>
        <Slider
          value={[draft.maxOutputTokens]}
          min={256}
          max={16000}
          step={256}
          onValueChange={([value]) =>
            setDraft({ ...draft, maxOutputTokens: value ?? draft.maxOutputTokens })
          }
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label>Top P (diversidade)</Label>
          <span className="text-sm font-medium text-muted-foreground">
            {draft.topP.toFixed(2)}
          </span>
        </div>
        <Slider
          value={[draft.topP]}
          min={0.1}
          max={1}
          step={0.05}
          onValueChange={([value]) => setDraft({ ...draft, topP: value ?? draft.topP })}
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
        <div>
          <Label className="text-sm">Mostrar raciocínio</Label>
          <p className="text-xs text-muted-foreground">
            Exibe um resumo do pensamento do modelo antes da resposta.
          </p>
        </div>
        <Switch
          checked={draft.reasoningSummary}
          onCheckedChange={(checked) => setDraft({ ...draft, reasoningSummary: checked })}
        />
      </div>
    </div>
  );
}
