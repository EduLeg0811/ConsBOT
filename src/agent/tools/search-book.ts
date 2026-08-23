import { AGENT_BOOK_IDS, AGENT_SEARCH_LIMIT, AGENT_TARGETS, agentBookLabel } from "@/agent/config";
import { asArray, asRecord, href, plain, post } from "@/agent/tools/lib/api";
import {
  BIBLIO_CONTEXT,
  BOOK_TARGET,
  detectBook,
  literalTerm,
  SEARCH_INTENT,
  VERBETE_TARGET,
} from "@/agent/tools/lib/text";
import type { AgentCardItem, AgentTool } from "@/agent/types";

/** Busca literal nos livros. Ficha 1 de docs/agent-rules.docx. */
export const searchBook: AgentTool = {
  name: "search_book",
  termRequired: true,

  parameters: {
    book: {
      type: "string",
      enum: ["", ...AGENT_BOOK_IDS],
      description:
        "Id da obra quando o usuário nomeia uma. String vazia para buscar em todas e para as outras intenções.",
    },
  },

  describe: (english) =>
    english
      ? [
          "search_book — the user wants to FIND a literal word or expression in the books: where it appears, in which works, on which pages, or to see the passages quoting it. Do NOT use it when they want the meaning, explanation, application or discussion of a concept, even if a technical term is mentioned. term holds only the word or expression being looked for.",
          "In this intent, book takes the id of the work when the user names one (for example: LO for Léxico de Ortopensatas, PROJ for Projeciologia, TNP for Manual da Tenepes). Leave book empty when no work is named, which searches all of them. The Encyclopedia of Conscientiology does not belong here: mentioning it means search_verbete.",
        ].join("\n")
      : [
          "search_book — o usuário quer ENCONTRAR uma palavra ou expressão literal nos livros: onde ela aparece, em quais obras, em que páginas, ou ver as citações em que ocorre. NÃO use quando ele quer o significado, a explicação, a aplicação ou a discussão de um conceito, ainda que cite um termo técnico. Em term vai apenas a palavra ou expressão procurada.",
          "Nesta intenção, book recebe o id da obra quando o usuário a nomeia (por exemplo: LO para o Léxico de Ortopensatas, PROJ para Projeciologia, TNP para o Manual da Tenepes). Deixe book vazio quando ele não nomear obra nenhuma, o que busca em todas. A Enciclopédia da Conscienciologia não entra aqui: quem a menciona quer search_verbete.",
        ].join("\n"),

  rule: ({ userText }) => {
    if (!SEARCH_INTENT.test(userText)) return null;
    if (BIBLIO_CONTEXT.test(userText)) return null;
    // Só nos verbetes: cala a busca em livros. Sem alvo declarado, fala.
    if (VERBETE_TARGET.test(userText) && !BOOK_TARGET.test(userText)) return null;

    const term = literalTerm(userText);
    if (!term) return null;

    return { intent: "search_book", term, book: detectBook(userText, term) };
  },

  toAction: ({ term, book }, { host }) => {
    // Nomear a obra muda a promessa do botão, então muda o rótulo: buscar em
    // 16 livros e buscar no Léxico não são a mesma oferta.
    const bookLabel = agentBookLabel(book);

    return {
      id: "search_book",
      kind: "open-url",
      label: bookLabel
        ? host.english
          ? `Search “${term}” in ${bookLabel}`
          : `Buscar “${term}” em ${bookLabel}`
        : host.english
          ? `Search “${term}” in books`
          : `Buscar “${term}” nos livros`,
      title: host.english ? "Opens the module in a new tab" : "Abre o módulo em nova aba",
      // `books` segue a mesma aposta do `q`: a página ainda não lê parâmetro
      // nenhum, mas o link já vai completo para funcionar quando ela ler.
      href: href(AGENT_TARGETS.search_book, term, book ? { books: book } : undefined),
      meta: { term, ...(book ? { book } : {}) },
    };
  },

  execute: async ({ term, book }, { host }, signal) => {
    // `sources` vazio busca em todo o corpus; com a obra nomeada, só nela.
    const data = asRecord(
      await post(
        host,
        "/api/lexical/search/multi",
        { term, limit: AGENT_SEARCH_LIMIT, sources: book ? [book] : [] },
        signal,
      ),
    );

    const items: AgentCardItem[] = asArray(data.results).map((raw) => {
      const row = asRecord(raw);
      const meta = asRecord(row.metadata);
      const page = meta.page ? `, p. ${String(meta.page)}` : "";

      return { source: `${String(row.source ?? "")}${page}`, snippet: plain(row.text) };
    });

    return { intent: "search_book", term, total: items.length, items };
  },
};
