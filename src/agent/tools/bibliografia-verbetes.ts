import { AGENT_SEARCH_LIMIT, AGENT_TARGETS } from "@/agent/config";
import { asArray, asRecord, href, markdown, plain, post } from "@/agent/tools/lib/api";
import {
  BOOK_TARGET,
  cleanTerm,
  detectBook,
  isUsableTerm,
  QUOTED_TERM,
  VERBETE_TARGET,
} from "@/agent/tools/lib/text";
import type { AgentCardItem, AgentTool } from "@/agent/types";

/** Âncoras de pedido bibliográfico. */
const BIBLIO_INTENT =
  /\b(?:bibliografia\w*|refer[êe]ncias?\s+bibliogr[áa]fic\w*|como\s+citar|\bBEE\b|cit(?:ar|e)\s+(?:o|a|os|as)?\s*(?:verbetes?|enciclop[ée]dia\w*))/iu;

/** Captura o termo após «verbetes (de/do/da/sobre/por)». */
const TERM_AFTER_VERBETE =
  /\b(?:verbetes?|enciclop[ée]dia\w*)\s+(?:de\s+|da\s+|do\s+|dos\s+|das\s+|sobre\s+|por\s+|escritos?\s+por\s+)?([^?.,;:!\r\n]{2,80})/iu;

/** Captura com conjunção que representa enumeração vaga. */
const VAGUE_TERM = /\b(?:ou|e)\b/iu;

function verbeteBiblioTerm(text: string): string {
  const quoted = cleanTerm(QUOTED_TERM.exec(text)?.[1]);
  if (isUsableTerm(quoted)) return quoted;

  const afterVerbete = cleanTerm(TERM_AFTER_VERBETE.exec(text)?.[1]);
  if (isUsableTerm(afterVerbete) && !VAGUE_TERM.test(afterVerbete)) return afterVerbete;

  // Pedido genérico: sem termo, o botão abre a bibliografia de verbetes completa.
  return "";
}

/** Referência bibliográfica ou bibliografia de verbetes da Enciclopédia. */
export const bibliografiaVerbetes: AgentTool = {
  name: "bibliografia_verbetes",
  termRequired: false,

  describe: (english) =>
    english
      ? "bibliografia_verbetes — the user asks for the bibliography, bibliographic references, or how to cite VERBETES / the Encyclopedia of Conscientiology (or verbetes by an author/area). Do NOT use it for books (use bibliografia_livros instead) or literal content search inside verbetes (use search_verbete). term holds the verbete title, author name or topic; leave term empty when the request is generic."
      : "bibliografia_verbetes — o usuário pede a bibliografia, referências bibliográficas ou como citar VERBETES da Enciclopédia da Conscienciologia (ou verbetes de um autor, tema ou especialidade). NÃO use para livros (use bibliografia_livros) nem para busca literal dentro do texto dos verbetes (use search_verbete). Em term vai o título do verbete, autor ou tema; deixe term vazio quando o pedido for genérico.",

  rule: ({ userText }) => {
    if (!BIBLIO_INTENT.test(userText)) return null;

    // Se o alvo não for verbete, ou se for explicitamente um livro sem citar verbetes, ignora
    const isVerbete = VERBETE_TARGET.test(userText);
    const isBook = BOOK_TARGET.test(userText) || Boolean(detectBook(userText, ""));
    if (!isVerbete && isBook) return null;
    if (!isVerbete) return null;

    return { intent: "bibliografia_verbetes", term: verbeteBiblioTerm(userText) };
  },

  toAction: ({ term }, { host }) => ({
    id: "bibliografia_verbetes",
    kind: "open-url",
    label: term
      ? host.english
        ? `Verbetes bibliography: “${term}”`
        : `Bibliografia dos verbetes: “${term}”`
      : host.english
        ? "Verbetes bibliography"
        : "Bibliografia dos verbetes",
    title: host.english ? "Opens the module in a new tab" : "Abre o módulo em nova aba",
    href: href(AGENT_TARGETS.bibliografia_verbetes, term),
    meta: { term },
  }),

  execute: async ({ term }, { host }, signal) => {
    try {
      if (!term) {
        return {
          intent: "bibliografia_verbetes",
          term,
          total: 0,
          saturated: false,
          items: [],
        };
      }

      // Consulta no Main-Server por autor ou título de verbete
      const data = asRecord(
        await post(
          host,
          "/api/lexical/verbetes/search",
          { author: term, limit: AGENT_SEARCH_LIMIT },
          signal,
        ),
      );

      let rawResults = asArray(data.results);
      // Se não encontrou por autor, tenta busca geral
      if (rawResults.length === 0) {
        const textData = asRecord(
          await post(
            host,
            "/api/lexical/verbetes/search",
            { text: term, limit: AGENT_SEARCH_LIMIT },
            signal,
          ),
        );
        rawResults = asArray(textData.results);
      }

      const items: AgentCardItem[] = rawResults.map((raw) => {
        const row = asRecord(raw);
        const meta = asRecord(row.data);
        const source = [plain(row.title, 80), plain(meta.author, 40), plain(meta.area, 40)]
          .filter(Boolean)
          .join(" · ");

        return { source, snippet: markdown(row.text) };
      });

      return {
        intent: "bibliografia_verbetes",
        term,
        total: typeof data.totalFound === "number" ? data.totalFound : items.length,
        saturated: false,
        items,
      };
    } catch {
      return {
        intent: "bibliografia_verbetes",
        term,
        total: 0,
        saturated: false,
        items: [],
      };
    }
  },
};
