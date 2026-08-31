import { asArray, asRecord, get, plain } from "@/agent/tools/lib/api";
import type { AgentCard, AgentCardItem, AgentTool } from "@/agent/types";

function filenameWithoutExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot > 0 ? filename.slice(0, lastDot) : filename;
}

export function sourceListAnswer(card: AgentCard, english: boolean, hasActiveBase: boolean): string {
  if (!hasActiveBase) {
    return english
      ? "RAG search is currently disabled (no source base is selected), so there are no documentary files available for consultation.\n\nSelect a File Search source in Settings to activate consultation sources."
      : "Atualmente a busca com RAG está desativada (nenhuma base selecionada), portanto não há arquivos documentais carregados para consulta.\n\nPara ativar fontes de consulta, selecione uma base de File Search em Config.";
  }

  if (card.items.length === 0) {
    return english
      ? "The active consultation base has no files attached at the moment."
      : "A base de consulta ativa está selecionada, porém nenhum arquivo foi anexado a ela até o momento.";
  }

  const intro = english
    ? `The currently loaded consultation sources are listed below (${card.total} file${card.total === 1 ? "" : "s"}):`
    : `As fontes de consulta atualmente carregadas estão listadas abaixo (${card.total} ${card.total === 1 ? "arquivo" : "arquivos"}):`;
  return `${intro}\n\n${card.items.map((item) => `- ${item.source}`).join("\n")}`;
}

export function sourceListErrorAnswer(english: boolean): string {
  return english
    ? "The active consultation source is selected, but its file list could not be loaded right now."
    : "A base de consulta ativa está selecionada, mas não foi possível carregar sua lista de arquivos agora.";
}

/** Lista a mesma base OpenAI que o menu Fontes mostra, sem duplicar o cache da sessão. */
export const listSources: AgentTool = {
  name: "list_sources",
  termRequired: false,

  describe: (english) =>
    english
      ? "list_sources — the user asks which consultation sources, files or documents are currently available to the assistant, or asks to list/show them. Return this action with an empty term. The app writes the loaded filenames directly in the conversation; this is not a request to explain their contents."
      : "list_sources — o usuário pergunta quais fontes, arquivos ou documentos de consulta estão atualmente disponíveis ao assistente, ou pede para listá-los/mostrá-los. Devolva esta ação com term vazio. O aplicativo escreve os nomes dos arquivos carregados diretamente na conversa; não é um pedido para explicar o conteúdo das fontes.",

  toAction: (_match, { host }) => ({
    id: "list_sources",
    kind: "inline-result",
    label: host.english ? "Consultation sources" : "Fontes de consulta",
    title: host.english
      ? "Shows the files in the active source base"
      : "Mostra os arquivos da base ativa",
    href: "#",
  }),

  execute: async (_match, { host }, signal) => {
    if (!host.vectorStoreId || host.vectorStoreId === "none") {
      return {
        intent: "list_sources",
        term: "",
        total: 1,
        saturated: false,
        items: [
          {
            source: host.english ? "No active source base" : "Nenhuma base ativa",
            snippet: host.english
              ? "Select a File Search source in Settings to list its files."
              : "Selecione uma base de File Search em Config para listar os arquivos.",
          },
        ],
      };
    }

    const data = host.loadActiveSourceFiles
      ? await host.loadActiveSourceFiles()
      : asRecord(
          await get(host, `/api/vector-stores/${encodeURIComponent(host.vectorStoreId)}/files`, signal),
        );
    const files = asArray(data.files);
    const items: AgentCardItem[] = files.map((raw) => {
      const file = asRecord(raw);
      const status = plain(file.status, 32);
      return {
        source: filenameWithoutExtension(plain(file.filename, 180)),
        snippet: status ? `Status: ${status}` : "",
      };
    });

    return {
      intent: "list_sources",
      term: "",
      total: typeof data.totalFiles === "number" ? data.totalFiles : items.length,
      saturated: Boolean(data.truncated),
      items,
    };
  },
};
