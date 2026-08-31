import { describe, expect, it } from "vitest";

import { normalizeAgentSettings } from "@/agent";
import {
  DEFAULT_SETTINGS,
  normalizeSemanticContextLimit,
  settingsForProfile,
  settingsForPublicUser,
  withProfile,
} from "@/lib/chat-settings";

describe("chat settings", () => {
  it("inicializa novas conversas com o preset padrão de introdutor", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      profile: "introdutor",
      retrievalMode: "standard",
      model: "gpt-5.6-terra",
      reasoningEffort: "low",
      vectorMaxResults: 5,
      responseFormat: "chatgpt",
      responseDepth: "synthetic",
    });
    expect(DEFAULT_SETTINGS.agent).toEqual({
      enabled: true,
      prompt: "",
      presentation: "classic",
    });
  });

  it("mantém a busca padrão e inicia LO/DAC como fontes candidatas", () => {
    const settings = settingsForProfile("tutor");
    expect(settings.retrievalMode).toBe("standard");
    expect(settings.semanticSourceIds).toEqual(["lo", "dac"]);
    expect(settings.semanticContextLimit).toBe(8);
  });

  it("limita a recuperação documental ao intervalo de 1 a 200 citações", () => {
    expect(normalizeSemanticContextLimit(0)).toBe(1);
    expect(normalizeSemanticContextLimit(201)).toBe(200);
    expect(normalizeSemanticContextLimit(57.6)).toBe(58);
    expect(normalizeSemanticContextLimit(undefined)).toBe(8);
  });

  it("força modo padrão e remove fontes para usuário público", () => {
    const settings = settingsForPublicUser({
      ...DEFAULT_SETTINGS,
      retrievalMode: "standard",
      semanticSourceIds: ["lo", "dac"],
    });
    expect(settings.retrievalMode).toBe("standard");
    expect(settings.semanticSourceIds).toEqual([]);
  });

  it("também bloqueia Recupera Corpus para usuário público", () => {
    const settings = settingsForPublicUser({
      ...DEFAULT_SETTINGS,
      retrievalMode: "corpus",
      semanticSourceIds: ["lo"],
    });
    expect(settings.retrievalMode).toBe("standard");
    expect(settings.semanticSourceIds).toEqual([]);
  });

  it("preserva a recuperação documental ao trocar de perfil", () => {
    const settings = withProfile(
      { ...DEFAULT_SETTINGS, retrievalMode: "corpus", semanticSourceIds: ["lo"] },
      "preceptor",
    );
    expect(settings.retrievalMode).toBe("corpus");
    expect(settings.semanticSourceIds).toEqual(["lo"]);
  });

  it("normaliza conversas antigas para a apresentação Citações do Agent", () => {
    expect(normalizeAgentSettings({ enabled: true, prompt: "" }).presentation).toBe("citations");
  });
});
