import { type ReactNode, useEffect, useState } from "react";
import {
  Brain,
  Bot,
  ChevronRight,
  Database,
  FileSearch,
  Gauge,
  LoaderCircle,
  Quote,
  RefreshCw,
  SlidersHorizontal,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { AgentSettingsSection } from "@/agent";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  isEnglishVectorStore,
  DEPTH_WORD_STEP,
  MODELS,
  normalizeDepthWordTarget,
  normalizeSemanticContextLimit,
  normalizeVectorMaxResults,
  PROFILES,
  RAG_RESULTS_MAX,
  RAG_RESULTS_MIN,
  RAG_RESULTS_STEP,
  RESPONSE_FORMATS,
  RESPONSE_DEPTHS,
  SEMANTIC_CONTEXT_RESULTS_MAX,
  SEMANTIC_CONTEXT_RESULTS_MIN,
  withProfile,
  withResponseDepth,
  withResponseFormat,
  type ChatSettings,
  type ModelId,
  type ProfileId,
  type ResponseDepthId,
  type ResponseFormatId,
} from "@/lib/chat-settings";
import { fetchSemanticIndexes, type SemanticIndex } from "@/lib/semantic-context";

type Props = {
  value: ChatSettings;
  onChange: (settings: ChatSettings) => void;
  /** Com ACCESS_LEVEL=0 o painel mostra perfil e formato.
   *  Os parâmetros técnicos ocultos vêm do preset do perfil. */
  isAdmin: boolean;
};

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function SettingsGroup({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-border/70 bg-secondary/[0.18] p-4">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 rounded-lg bg-primary/10 p-1.5 text-primary">
          <Icon className="size-3.5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SemanticSourceSettings({
  draft,
  setDraft,
}: {
  draft: ChatSettings;
  setDraft: (settings: ChatSettings) => void;
}) {
  const [indexes, setIndexes] = useState<SemanticIndex[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentSourcesOpen, setAgentSourcesOpen] = useState(false);

  const load = (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    void fetchSemanticIndexes(forceRefresh)
      .then(setIndexes)
      .catch((reason: unknown) => {
        setIndexes(null);
        setError(reason instanceof Error ? reason.message : "Não foi possível carregar as fontes.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!indexes) return;
    const available = new Set(indexes.map((index) => index.id));
    const current = (draft.semanticSourceIds ?? []).filter((id) => available.has(id));
    const fallback = ["lo", "dac"].filter((id) => available.has(id));
    const normalized = current.length > 0 ? current : fallback;
    if (!sameIds(normalized, draft.semanticSourceIds ?? [])) {
      setDraft({ ...draft, semanticSourceIds: normalized });
    }
  }, [draft, indexes, setDraft]);

  const selectedIds = draft.semanticSourceIds ?? [];
  const semanticUnavailable = loading || Boolean(error) || !indexes?.length;
  const isManualCorpus = (draft.retrievalMode ?? "standard") === "corpus";
  const operationMode = isManualCorpus ? "corpus" : draft.agent.enabled ? "agent" : "standard";
  const isClassicAgent = operationMode === "agent" && draft.agent.presentation === "classic";
  const showSources = operationMode === "corpus" || (operationMode === "agent" && !isClassicAgent);
  const toggleSource = (id: string, checked: boolean) => {
    if (!checked && selectedIds.length === 1 && selectedIds[0] === id) return;
    const next = checked
      ? [...new Set([...selectedIds, id])]
      : selectedIds.filter((sourceId) => sourceId !== id);
    setDraft({ ...draft, semanticSourceIds: next });
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border/75 bg-secondary/20 p-4">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 rounded-lg bg-primary/10 p-1.5 text-primary">
          <Database className="size-3.5" />
        </div>
        <div>
          <p className="text-xs font-semibold text-foreground">Modo de operação</p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
            Escolha como cada pergunta será processada nesta conversa.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {(
          [
            ["standard", "Busca padrão", "LLM + File Search", FileSearch],
            ["agent", "Modo Agent", "Luna roteia o turno", Bot],
            ["corpus", "Recupera Corpus", "Somente trechos", Quote],
          ] as const
        ).map(([mode, label, description, Icon]) => {
          const selected = operationMode === mode;
          const disabled = mode === "corpus" && semanticUnavailable;
          return (
            <button
              className={
                selected
                  ? "rounded-xl border border-primary/70 bg-card px-3 py-3 text-left shadow-[0_2px_10px_-6px_oklch(0.3_0.03_155/0.35)]"
                  : "rounded-xl border border-border/70 bg-card/80 px-3 py-3 text-left transition-colors hover:border-border hover:bg-card disabled:cursor-not-allowed disabled:opacity-50"
              }
              disabled={disabled}
              key={mode}
              type="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  retrievalMode: mode === "corpus" ? "corpus" : "standard",
                  agent: { ...draft.agent, enabled: mode === "agent" },
                  semanticSourceIds: mode === "corpus" ? selectedIds : draft.semanticSourceIds,
                })
              }
            >
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                <Icon className="size-3.5 text-primary" aria-hidden="true" />
                {label}
              </span>
              <span className="mt-1 block text-[10px] leading-snug text-muted-foreground">
                {description}
              </span>
              <span className="mt-2 block text-[9px] font-medium uppercase tracking-wide text-muted-foreground/75">
                {mode === "standard"
                  ? "Pergunta → LLM"
                  : mode === "agent"
                    ? "Pergunta → Luna → rota"
                    : "Pergunta → Corpus → Citações"}
              </span>
            </button>
          );
        })}
      </div>

      <div
        className={
          isManualCorpus
            ? "rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5"
            : "rounded-xl border border-border/60 bg-card/60 px-3 py-2.5"
        }
      >
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {operationMode === "corpus" ? (
            <>
              <span className="font-medium text-foreground">Modo manual ativo.</span> Luna, Terra e
              File Search não são acionados nesta conversa.
            </>
          ) : operationMode === "agent" ? (
            <>
              <span className="font-medium text-foreground">Roteamento ativo.</span>{" "}
              {isClassicAgent
                ? "Luna direciona para módulos externos ou para o modelo principal."
                : "Luna decide entre resposta direta, módulo, corpus ou modelo principal."}
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">Resposta direta ativa.</span> Toda
              pergunta segue para o modelo principal com File Search.
            </>
          )}
        </p>
      </div>

      {operationMode === "agent" ? (
        <div className="space-y-2 border-t border-border/60 pt-3">
          <div>
            <p className="text-[11px] font-medium text-foreground">Apresentação do Agent</p>
            <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">
              Define se Luna pode consultar o corpus ou somente direcionar para módulos.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {(
              [
                ["citations", "Citações", "Luna pode recuperar trechos e abrir o painel direito."],
                [
                  "classic",
                  "Clássico",
                  "Mostra apenas pills externos; fontes carregadas mantêm o card interno.",
                ],
              ] as const
            ).map(([presentation, label, description]) => {
              const selected = (draft.agent.presentation ?? "citations") === presentation;
              return (
                <button
                  key={presentation}
                  type="button"
                  className={
                    selected
                      ? "rounded-xl border border-primary/65 bg-primary/5 px-3 py-2.5 text-left shadow-[0_2px_8px_-6px_oklch(0.3_0.03_155/0.3)]"
                      : "rounded-xl border border-border/65 bg-card/70 px-3 py-2.5 text-left transition-colors hover:bg-card"
                  }
                  onClick={() =>
                    setDraft({
                      ...draft,
                      agent: { ...draft.agent, presentation },
                    })
                  }
                >
                  <span className="block text-[11px] font-medium text-foreground">{label}</span>
                  <span className="mt-0.5 block text-[9px] leading-snug text-muted-foreground">
                    {description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {showSources ? (
        <div className="space-y-2 border-t border-border/60 pt-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5">
            <div>
              <p className="text-[11px] font-medium text-foreground">
                Limite de citações do corpus
              </p>
              <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">
                Máximo de trechos recuperados e exibidos no painel (1–200).
              </p>
            </div>
            <Input
              aria-label="Limite de citações do corpus"
              className="h-8 w-16 bg-card px-2 text-right text-xs tabular-nums"
              max={SEMANTIC_CONTEXT_RESULTS_MAX}
              min={SEMANTIC_CONTEXT_RESULTS_MIN}
              type="number"
              value={normalizeSemanticContextLimit(draft.semanticContextLimit)}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  semanticContextLimit: normalizeSemanticContextLimit(Number(event.target.value)),
                })
              }
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            {operationMode === "agent" ? (
              <button
                type="button"
                onClick={() => setAgentSourcesOpen((open) => !open)}
                className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
                aria-expanded={agentSourcesOpen}
              >
                <ChevronRight
                  className={`mt-0.5 size-3 shrink-0 text-muted-foreground transition-transform ${
                    agentSourcesOpen ? "rotate-90" : ""
                  }`}
                  aria-hidden="true"
                />
                <span>
                  <span className="block text-[11px] font-medium text-foreground">
                    Fontes do corpus para o Agent
                  </span>
                  <span className="mt-0.5 block text-[9px] text-muted-foreground">
                    Usadas somente se Luna escolher a rota Corpus.
                  </span>
                </span>
              </button>
            ) : (
              <div>
                <p className="text-[11px] font-medium text-foreground">Fontes a recuperar</p>
                <p className="mt-0.5 text-[9px] text-muted-foreground">
                  Usadas em toda consulta deste modo.
                </p>
              </div>
            )}
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {selectedIds.length} selecionada{selectedIds.length === 1 ? "" : "s"}
            </span>
          </div>

          {operationMode === "agent" && !agentSourcesOpen ? null : loading ? (
            <div className="flex items-center gap-2 rounded-lg bg-card/70 px-3 py-2 text-[10px] text-muted-foreground">
              <LoaderCircle className="size-3 animate-spin" />
              Carregando índices disponíveis…
            </div>
          ) : error ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300/60 bg-amber-50/70 px-3 py-2 dark:border-amber-800/60 dark:bg-amber-950/20">
              <span className="text-[10px] leading-snug text-amber-800 dark:text-amber-200">
                {error}
              </span>
              <Button
                aria-label="Tentar carregar fontes novamente"
                size="icon-sm"
                variant="ghost"
                onClick={() => load(true)}
              >
                <RefreshCw className="size-3" />
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {indexes?.map((index) => {
                const checked = selectedIds.includes(index.id);
                return (
                  <label
                    className={
                      checked
                        ? "flex cursor-pointer items-start gap-2 rounded-lg border border-primary/50 bg-primary/5 p-2.5"
                        : "flex cursor-pointer items-start gap-2 rounded-lg border border-border/70 bg-card/75 p-2.5 transition-colors hover:bg-card"
                    }
                    key={index.id}
                  >
                    <Checkbox
                      aria-label={`Selecionar ${index.label}`}
                      checked={checked}
                      className="mt-0.5"
                      disabled={checked && selectedIds.length === 1}
                      onCheckedChange={(value) => toggleSource(index.id, value === true)}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-medium text-foreground">
                        {index.label}
                      </span>
                      <span className="block text-[9px] tabular-nums text-muted-foreground">
                        Disponível · {index.sourceRows.toLocaleString("pt-BR")} registros
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {(operationMode !== "agent" || agentSourcesOpen) &&
          !loading &&
          !error &&
          selectedIds.length === 0 ? (
            <p className="text-[10px] leading-relaxed text-destructive">
              Selecione ao menos uma fonte para usar a recuperação documental.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function SettingsFields({ value: draft, onChange: setDraft, isAdmin }: Props) {
  return (
    <div className="space-y-4">
      {isAdmin ? (
        <>
          <SettingsGroup
            icon={Bot}
            title="Modelo e recuperação RAG"
            description="Defina a capacidade do modelo e a quantidade de trechos do File Search."
          >
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
                <Label>Max RAG Results</Label>
                <span className="text-xs font-medium text-muted-foreground">
                  {draft.vectorMaxResults} trechos
                </span>
              </div>
              <Slider
                value={[draft.vectorMaxResults]}
                min={RAG_RESULTS_MIN}
                max={RAG_RESULTS_MAX}
                step={RAG_RESULTS_STEP}
                onValueChange={([value]) =>
                  setDraft({
                    ...draft,
                    vectorMaxResults: normalizeVectorMaxResults(value ?? draft.vectorMaxResults),
                  })
                }
              />
              <div className="flex justify-between px-0.5 text-[10px] tabular-nums text-muted-foreground">
                {[5, 10, 15, 20].map((value) => (
                  <span key={value}>{value}</span>
                ))}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Trechos que a busca RAG devolve por consulta (`max_num_results`).
              </p>
            </div>
          </SettingsGroup>
        </>
      ) : null}

      <SettingsGroup
        icon={UserRound}
        title="Perfil da IA"
        description="Escolha a voz, a postura e o estilo predominantes da resposta."
      >
        <div className="space-y-2">
          <Label>Perfil</Label>
          <div className="grid grid-cols-2 gap-2">
            {PROFILES.map((profile) => {
              const selected = (draft.profile ?? "tutor") === profile.id;
              return (
                <button
                  className={
                    selected
                      ? "rounded-lg border border-primary bg-primary/8 px-3 py-2 text-left shadow-[0_2px_8px_-5px_rgba(25,70,50,0.32)]"
                      : "rounded-lg border border-border bg-card/90 px-3 py-2 text-left transition-colors hover:bg-primary/5"
                  }
                  key={profile.id}
                  type="button"
                  onClick={() => setDraft(withProfile(draft, profile.id))}
                >
                  <span className="block text-xs font-medium">{profile.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {profile.description}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Tom e estilo da resposta.
          </p>
        </div>
      </SettingsGroup>

      {isAdmin ? (
        <SettingsGroup
          icon={Gauge}
          title="Aprofundamento"
          description="Controle a extensão e o nível de detalhe esperado em cada resposta."
        >
          <div className="space-y-2">
            <Label>Aprofundamento</Label>
            <div className="grid grid-cols-3 gap-2">
              {RESPONSE_DEPTHS.map((depth) => {
                const selected = draft.responseDepth === depth.id;
                const target = draft.depthWordTargets[depth.id];
                return (
                  <button
                    className={
                      selected
                        ? "rounded-lg border border-primary bg-primary/8 px-2 py-2 text-center shadow-[0_2px_8px_-5px_rgba(25,70,50,0.32)]"
                        : "rounded-lg border border-border bg-card/90 px-2 py-2 text-center transition-colors hover:bg-primary/5"
                    }
                    key={depth.id}
                    type="button"
                    title={depth.description}
                    onClick={() => setDraft(withResponseDepth(draft, depth.id))}
                  >
                    <span className="block text-xs font-medium">{depth.label}</span>
                    <span className="mt-0.5 block text-[10px] tabular-nums text-muted-foreground">
                      ~{target.toLocaleString("pt-BR")} palavras
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Define a extensão e o nível de detalhe da resposta.
            </p>

            <div className="rounded-xl border border-border/80 bg-secondary/35 p-3">
              <p className="mb-2 text-[11px] font-medium text-foreground">Metas desta sessão</p>
              <div className="grid grid-cols-3 gap-2">
                {RESPONSE_DEPTHS.map((depth) => (
                  <div className="space-y-1" key={depth.id}>
                    <Label className="text-[10px]" htmlFor={`depth-${depth.id}`}>
                      {depth.label}
                    </Label>
                    <Input
                      className="h-8 bg-card px-2 text-xs tabular-nums"
                      id={`depth-${depth.id}`}
                      type="number"
                      min={depth.minWords}
                      max={depth.maxWords}
                      step={DEPTH_WORD_STEP}
                      value={draft.depthWordTargets[depth.id]}
                      onChange={(event) => {
                        const id = depth.id as ResponseDepthId;
                        setDraft({
                          ...draft,
                          depthWordTargets: {
                            ...draft.depthWordTargets,
                            [id]: normalizeDepthWordTarget(id, Number(event.target.value)),
                          },
                        });
                      }}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                Passo de {DEPTH_WORD_STEP} palavras; o prompt aceita variação aproximada de 20%.
              </p>
            </div>
          </div>
        </SettingsGroup>
      ) : null}

      <SettingsGroup
        icon={Brain}
        title="Formato da resposta"
        description="Defina a organização e as convenções de apresentação do texto."
      >
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
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Organização e convenções textuais da resposta.
          </p>
        </div>
      </SettingsGroup>

      {isAdmin ? (
        <SettingsGroup
          icon={SlidersHorizontal}
          title="Instruções adicionais"
          description="Orientações suplementares para esta conversa, sem substituir as regras do sistema."
        >
          <div className="space-y-2">
            <Label>Instruções adicionais</Label>
            <Textarea
              className="bg-card/90 text-[11px] leading-relaxed shadow-[0_2px_8px_-5px_rgba(25,70,50,0.32)] md:text-[11px]"
              value={draft.additionalInstructions}
              rows={5}
              onChange={(event) =>
                setDraft({ ...draft, additionalInstructions: event.target.value })
              }
              placeholder="Acrescente orientações específicas sem substituir os módulos canônicos..."
            />
          </div>
        </SettingsGroup>
      ) : null}

      {isAdmin ? (
        <>
          <SemanticSourceSettings draft={draft} setDraft={setDraft} />

          {(draft.retrievalMode ?? "standard") === "standard" && draft.agent.enabled ? (
            <AgentSettingsSection
              value={draft.agent}
              onChange={(agent) => setDraft({ ...draft, agent })}
              isAdmin={isAdmin}
              english={isEnglishVectorStore(draft.vectorStoreId)}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
