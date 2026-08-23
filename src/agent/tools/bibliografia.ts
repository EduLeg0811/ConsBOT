import { AGENT_TARGETS } from "@/agent/config";
import { asRecord, href, plain, post } from "@/agent/tools/lib/api";
import { cleanTerm, isUsableTerm, QUOTED_TERM } from "@/agent/tools/lib/text";
import type { AgentCardItem, AgentTool } from "@/agent/types";

/** Âncoras de pedido bibliográfico. «citar» sozinho não entra — casaria com
 * «cite trechos com a palavra invéxis», que é busca literal. */
const BIBLIO_INTENT =
  /\b(?:bibliografia\w*|refer[êe]ncias?\s+bibliogr[áa]fic\w*|como\s+citar|\bBEE\b|cit(?:ar|e)\s+(?:o|a|os|as)\s+(?:livro|obra|l[ée]xico|manual|dicion[áa]rio))/iu;

/** Título após o substantivo. Para «livro/obra» o título é o que vem depois;
 * para «léxico/manual/dicionário» a própria palavra faz parte do título
 * («Léxico de Ortopensatas»), então ela entra na captura. */
const TITLE_AFTER_NOUN = /\b(?:livros?|obras?)\s+(?:de\s+|da\s+|do\s+)?([^?.,;:!\r\n]{3,80})/iu;
const TITLE_WITH_NOUN = /\b((?:l[ée]xico|manual|dicion[áa]rio)\s+[^?.,;:!\r\n]{3,70})/iu;

/** Captura com conjunção não é título, é enumeração vaga («os livros da
 * Conscienciologia ou do Waldo»). Nesse caso o botão abre sem filtro. */
const VAGUE_TITLE = /\b(?:ou|e)\b/iu;

function bookTitle(text: string): string {
  const quoted = cleanTerm(QUOTED_TERM.exec(text)?.[1]);
  if (isUsableTerm(quoted)) return quoted;

  const withNoun = cleanTerm(TITLE_WITH_NOUN.exec(text)?.[1]);
  if (isUsableTerm(withNoun) && !VAGUE_TITLE.test(withNoun)) return withNoun;

  const afterNoun = cleanTerm(TITLE_AFTER_NOUN.exec(text)?.[1]);
  if (isUsableTerm(afterNoun) && !VAGUE_TITLE.test(afterNoun)) return afterNoun;

  // Pedido genérico: sem título, o botão abre a bibliografia completa.
  return "";
}

/** Referência bibliográfica de um livro. Ficha 3 de docs/agent-rules.docx. */
export const bibliografia: AgentTool = {
  name: "bibliografia_livros",
  // Sem título o botão continua útil: abre a bibliografia inteira.
  termRequired: false,

  describe: (english) =>
    english
      ? "bibliografia_livros — the user asks for the bibliography, the bibliographic reference, or how to CITE a book. Do NOT use it when they want the book's content, summary or analysis, where to buy it, or a literal search inside it. term holds the book title; leave term empty when the request is generic, with no identifiable title."
      : "bibliografia_livros — o usuário pede a bibliografia, a referência bibliográfica ou como CITAR um livro (BEE). NÃO use quando ele quer o conteúdo, o resumo, a análise do livro, onde comprá-lo, ou uma busca literal dentro dele. Em term vai o título do livro; deixe term vazio quando o pedido for genérico, sem título identificável.",

  rule: ({ userText }) => {
    if (!BIBLIO_INTENT.test(userText)) return null;

    return { intent: "bibliografia_livros", term: bookTitle(userText) };
  },

  toAction: ({ term }, { host }) => ({
    id: "bibliografia_livros",
    kind: "open-url",
    // O rótulo muda sem título para não prometer um filtro que não existe.
    label: term
      ? host.english
        ? `Bibliography: “${term}”`
        : `Bibliografia: “${term}”`
      : host.english
        ? "Books bibliography"
        : "Bibliografia dos livros",
    title: host.english ? "Opens the module in a new tab" : "Abre o módulo em nova aba",
    href: href(AGENT_TARGETS.bibliografia_livros, term),
    meta: { term },
  }),

  execute: async ({ term }, { host }, signal) => {
    const data = asRecord(await post(host, "/api/biblio/wv/reference", { book: term }, signal));
    const reference = plain(data.text, 600);
    const items: AgentCardItem[] = reference
      ? [{ source: plain(data.book_title, 80) || term, snippet: reference }]
      : [];

    return { intent: "bibliografia_livros", term, total: items.length, items };
  },
};
