import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentContext } from "@/agent/types";
import {
  listSources,
  sourceListAnswer,
  sourceListErrorAnswer,
} from "@/agent/tools/list-sources";

function context(vectorStoreId = "CONSTECA"): AgentContext {
  return {
    userText: "Quais as fontes de consulta você possui?",
    settings: {
      enabled: true,
      prompt: "",
      presentation: "citations",
    },
    host: {
      apiBase: "http://main-server.test",
      english: false,
      vectorStoreId,
      logEvent: () => undefined,
    },
    threadId: "thread-1",
  };
}

describe("list_sources", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reutiliza a leitura compartilhada do menu Fontes e remove extensões", async () => {
    const loadActiveSourceFiles = vi.fn().mockResolvedValue({
      totalFiles: 2,
      truncated: false,
      files: [
        { filename: "LO.pdf", status: "completed" },
        { filename: "DAC.docx", status: "completed" },
      ],
    });
    const ctx = { ...context(), host: { ...context().host, loadActiveSourceFiles } };

    const card = await listSources.execute({ intent: "list_sources", term: "" }, ctx);
    expect(loadActiveSourceFiles).toHaveBeenCalledOnce();
    expect(card).toMatchObject({
      total: 2,
      saturated: false,
      items: [
        { source: "LO", snippet: "Status: completed" },
        { source: "DAC", snippet: "Status: completed" },
      ],
    });
    expect(sourceListAnswer(card, false, true)).toContain("- LO\n- DAC");
  });

  it("explica que não há arquivos quando File Search está desativado", async () => {
    const card = await listSources.execute({ intent: "list_sources", term: "" }, context("none"));

    expect(card.items[0]?.source).toBe("Nenhuma base ativa");
    expect(sourceListAnswer(card, false, false)).toContain("RAG está desativada");
  });

  it("mantém os estados vazio e de erro na própria mensagem", () => {
    expect(
      sourceListAnswer(
        { intent: "list_sources", term: "", total: 0, saturated: false, items: [] },
        false,
        true,
      ),
    ).toContain("nenhum arquivo foi anexado");
    expect(sourceListErrorAnswer(false)).toContain("não foi possível carregar");
  });
});
