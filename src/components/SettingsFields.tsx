import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MODELS,
  RESPONSE_FORMATS,
  systemPromptForFormat,
  type ChatSettings,
  type ModelId,
  type ResponseFormatId,
} from "@/lib/chat-settings";

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
          <SelectTrigger className="text-xs bg-white/90 shadow-[0_2px_8px_-5px_rgba(25,70,50,0.32)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="text-xs">
            {MODELS.map((model) => (
              <SelectItem className="text-xs" key={model.id} value={model.id}>
                {model.label} — {model.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {MODELS.find((m) => m.id === draft.model)?.description}
        </p>
      </div>

      <div className="space-y-2">
        <Label>Nível de raciocínio</Label>
        <Select
          value={draft.reasoningEffort}
          onValueChange={(value) =>
            setDraft({ ...draft, reasoningEffort: value as ChatSettings["reasoningEffort"] })
          }
        >
          <SelectTrigger className="text-xs bg-white/90 shadow-[0_2px_8px_-5px_rgba(25,70,50,0.32)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="text-xs">
            <SelectItem className="text-xs" value="none">
              Nenhum — menor latência
            </SelectItem>
            <SelectItem className="text-xs" value="low">
              Otimizado — respostas mais rápidas
            </SelectItem>
            <SelectItem className="text-xs" value="medium">
              Médio — equilibrado
            </SelectItem>
            <SelectItem className="text-xs" value="high">
              Alto — análises profundas
            </SelectItem>
            <SelectItem className="text-xs" value="xhigh">
              Muito alto — tarefas exigentes
            </SelectItem>
            <SelectItem className="text-xs" value="max">
              Máximo — investigação extensa
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label>Tamanho máximo da resposta</Label>
          <span className="text-xs font-medium text-muted-foreground">
            {draft.maxOutputTokens} tokens
          </span>
        </div>
        <Slider
          value={[draft.maxOutputTokens]}
          min={256}
          max={4096}
          step={128}
          onValueChange={([value]) =>
            setDraft({ ...draft, maxOutputTokens: value ?? draft.maxOutputTokens })
          }
        />
      </div>

      <div className="space-y-2">
        <Label>Verbosidade da resposta</Label>
        <Select
          value={draft.textVerbosity}
          onValueChange={(value) =>
            setDraft({ ...draft, textVerbosity: value as ChatSettings["textVerbosity"] })
          }
        >
          <SelectTrigger className="text-xs bg-white/90 shadow-[0_2px_8px_-5px_rgba(25,70,50,0.32)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="text-xs">
            <SelectItem className="text-xs" value="low">Baixa — mais concisa</SelectItem>
            <SelectItem className="text-xs" value="medium">Média — equilibrada</SelectItem>
            <SelectItem className="text-xs" value="high">Alta — mais detalhada</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Nível de detalhe do texto.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Formato da resposta</Label>
        <div className="grid grid-cols-2 gap-2">
          {RESPONSE_FORMATS.map((format) => {
            const selected = draft.responseFormat === format.id;
            return (
              <button
                className={
                  selected
                    ? "rounded-lg border border-primary bg-primary/8 px-3 py-2 text-left shadow-[0_2px_8px_-5px_rgba(25,70,50,0.32)]"
                    : "rounded-lg border border-border bg-white/90 px-3 py-2 text-left transition-colors hover:bg-primary/5"
                }
                key={format.id}
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    responseFormat: format.id as ResponseFormatId,
                    systemPrompt: systemPromptForFormat(format.id),
                  })
                }
              >
                <span className="block text-xs font-medium">{format.label}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  {format.description}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Prompt de sistema.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Prompt de sistema</Label>
        <Textarea
          className="text-[11px] leading-relaxed md:text-[11px] bg-white/90 shadow-[0_2px_8px_-5px_rgba(25,70,50,0.32)]"
          value={draft.systemPrompt}
          rows={5}
          onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value })}
          placeholder="Descreva como o ConsBOT deve se comportar..."
        />
      </div>
    </div>
  );
}
