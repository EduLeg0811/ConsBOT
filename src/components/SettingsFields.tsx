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
  effectiveMaxOutputTokens,
  MODELS,
  normalizeMaxOutputTokens,
  normalizeVectorMaxResults,
  RAG_RESULTS_MAX,
  RAG_RESULTS_MIN,
  RESPONSE_FORMATS,
  RESPONSE_LENGTH_VALUES,
  withResponseFormat,
  type ChatSettings,
  type ModelId,
  type ResponseFormatId,
} from "@/lib/chat-settings";

/** O valor da lista que o slider deve apontar. Uma thread antiga pode trazer
 *  um `maxOutputTokens` fora da escala; cai no padrão em vez de somar um
 *  degrau extra ao slider. */
function lengthValue(draft: ChatSettings) {
  return normalizeMaxOutputTokens(draft.maxOutputTokens) as (typeof RESPONSE_LENGTH_VALUES)[number];
}

type Props = {
  value: ChatSettings;
  onChange: (settings: ChatSettings) => void;
  /** Com ACCESS_LEVEL=0 o painel existe, mas só com verbosidade e formato:
   *  modelo, raciocínio, tamanho e prompt de sistema são de admin. Os valores
   *  ocultos vêm de DEFAULT_SETTINGS — ver effectiveSettings em ThreadPage. */
  isAdmin: boolean;
};

export function SettingsFields({ value: draft, onChange: setDraft, isAdmin }: Props) {
  return (
    <div className="space-y-6">
      {isAdmin ? (
        <>
          <div className="space-y-2">
            <Label>Modelo</Label>
            <Select
              value={draft.model}
              onValueChange={(value) => setDraft({ ...draft, model: value as ModelId })}
            >
              <SelectTrigger className="bg-card/90 text-xs shadow-[0_2px_8px_-5px_rgba(25,70,50,0.32)]">
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
              <SelectTrigger className="bg-card/90 text-xs shadow-[0_2px_8px_-5px_rgba(25,70,50,0.32)]">
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
            {/* O slider anda por índice, não por token: com `step` livre ele
                produzia valores fora de RESPONSE_LENGTH_VALUES, que
                normalizeMaxOutputTokens depois descartava — a escolha valia na
                sessão e sumia ao recarregar a conversa. */}
            <Slider
              value={[Math.max(0, RESPONSE_LENGTH_VALUES.indexOf(lengthValue(draft)))]}
              min={0}
              max={RESPONSE_LENGTH_VALUES.length - 1}
              step={1}
              onValueChange={([index]) =>
                setDraft({
                  ...draft,
                  maxOutputTokens: RESPONSE_LENGTH_VALUES[index ?? 0] ?? draft.maxOutputTokens,
                })
              }
            />
            <div className="flex justify-between px-0.5 text-[10px] tabular-nums text-muted-foreground">
              {RESPONSE_LENGTH_VALUES.map((value) => (
                <span key={value}>{value}</span>
              ))}
            </div>
            {/* Sem isto o slider diria 1024 enquanto a requisição manda 4096:
                um piso silencioso sobre um valor que o admin escolheu à mão. */}
            {effectiveMaxOutputTokens(draft) > lengthValue(draft) ? (
              <p className="text-[11px] leading-relaxed text-amber-700">
                A verbosidade alta eleva o envio para {effectiveMaxOutputTokens(draft)} tokens — 20
                parágrafos não cabem em {lengthValue(draft)}.
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Max RAG Results</Label>
              <span className="text-xs font-medium text-muted-foreground">
                {draft.vectorMaxResults} trechos
              </span>
            </div>
            <Slider
              value={[draft.vectorMaxResults]}
              min={RAG_RESULTS_MIN}
              max={RAG_RESULTS_MAX}
              step={1}
              onValueChange={([value]) =>
                setDraft({
                  ...draft,
                  vectorMaxResults: normalizeVectorMaxResults(value ?? draft.vectorMaxResults),
                })
              }
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Trechos que a busca RAG devolve por consulta (`max_num_results`).
            </p>
          </div>
        </>
      ) : null}

      <div className="space-y-2">
        <Label>Verbosidade da resposta</Label>
        <Select
          value={draft.textVerbosity}
          onValueChange={(value) =>
            setDraft({ ...draft, textVerbosity: value as ChatSettings["textVerbosity"] })
          }
        >
          <SelectTrigger className="bg-card/90 text-xs shadow-[0_2px_8px_-5px_rgba(25,70,50,0.32)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="text-xs">
            <SelectItem className="text-xs" value="low">
              Baixa — mais concisa
            </SelectItem>
            <SelectItem className="text-xs" value="medium">
              Média — equilibrada
            </SelectItem>
            <SelectItem className="text-xs" value="high">
              Alta — mais detalhada
            </SelectItem>
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
                    : "rounded-lg border border-border bg-card/90 px-3 py-2 text-left transition-colors hover:bg-primary/5"
                }
                key={format.id}
                type="button"
                onClick={() => setDraft(withResponseFormat(draft, format.id as ResponseFormatId))}
              >
                <span className="block text-xs font-medium">{format.label}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  {format.description}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">Prompt de sistema.</p>
      </div>

      {isAdmin ? (
        <div className="space-y-2">
          <Label>Prompt de sistema</Label>
          <Textarea
            className="bg-card/90 text-[11px] leading-relaxed shadow-[0_2px_8px_-5px_rgba(25,70,50,0.32)] md:text-[11px]"
            value={draft.systemPrompt}
            rows={5}
            // `systemPromptCustom` protege o texto escrito aqui de ser
            // recalculado a partir do formato ao recarregar a conversa.
            onChange={(event) =>
              setDraft({ ...draft, systemPrompt: event.target.value, systemPromptCustom: true })
            }
            placeholder="Descreva como o ConsBOT deve se comportar..."
          />
        </div>
      ) : null}
    </div>
  );
}
