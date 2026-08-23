import { isEnglishVectorStore } from "@/lib/chat-settings";
import { SEARCH_BOOK_PARAM, SEARCH_BOOK_URL } from "@/lib/agent/config";
import type { AgentAction, AgentContext, AgentRule } from "@/lib/agent/types";

/** Monta a ação de busca em livros a partir do termo já extraído.
 *
 * Compartilhada pelos dois modos de detecção: a regra abaixo e o classificador
 * LLM (`classify.ts`) só diferem em COMO acham o termo — o botão resultante é
 * o mesmo, e assim o rótulo e a URL têm um único lugar para mudar. */
export function buildSearchBookAction(term: string, { settings }: AgentContext): AgentAction {
  const english = isEnglishVectorStore(settings.vectorStoreId);

  return {
    id: "search-book",
    kind: "open-url",
    label: english ? `Search “${term}” in books` : `Buscar “${term}” nos livros`,
    title: english
      ? "Opens the Cons-ia.org book search in a new tab"
      : "Abre a busca em livros do Cons-ia.org em nova aba",
    href: `${SEARCH_BOOK_URL}?${SEARCH_BOOK_PARAM}=${encodeURIComponent(term)}`,
    meta: { term },
  };
}

/** Verbos/locuções que indicam pedido de LOCALIZAÇÃO literal, não de explicação.
 * Sozinho não basta para disparar: é preciso também identificar QUAL termo. */
const SEARCH_INTENT =
  /\b(?:localiz\w*|procur\w*|encontr\w*|bus(?:c|qu)\w*|pesquis\w*|cit\w*|onde\s+(?:aparece\w*|est[áa]|consta|surge)|search\w*|find|locate|look\s+for|where\s+(?:does|do|is|are|can))\b/iu;

/** Termo entre aspas — o sinal mais forte e o caminho preferencial. */
const QUOTED_TERM = /["“«‘]\s*([^"”»’\r\n]{2,80}?)\s*["”»’]/u;

/** Substantivo-âncora seguido de UMA palavra: «a palavra consciex».
 * Um token só, de propósito: capturar frase inteira sem aspas produz
 * termo errado com frequência alta demais para valer a pena. */
const NOUN_ANCHOR =
  /\b(?:palavras?|termos?|express[ãa]o|express[õo]es|pensatas?|ortopensatas?|verbetes?|vocábulos?|words?|terms?|expressions?)\s+(?:sobre\s+|de\s+|do\s+|da\s+)?([\p{L}\p{N}][\p{L}\p{N}-]{2,40})\b/iu;

/** Palavras vazias que, capturadas sozinhas, nunca são o termo procurado. */
const STOPWORDS = new Set([
  "que",
  "qual",
  "quais",
  "como",
  "para",
  "com",
  "sem",
  "por",
  "sobre",
  "isso",
  "esse",
  "essa",
  "este",
  "esta",
  "the",
  "that",
  "this",
  "what",
  "which",
  "about",
  "with",
]);

export function cleanTerm(raw: string | undefined): string {
  if (!raw) return "";

  return raw
    .replace(/[\s"'“”«»‘’.,;:!?]+$/u, "")
    .replace(/^[\s"'“”«»‘’.,;:!?]+/u, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 80);
}

export function isUsableTerm(term: string): boolean {
  return term.length >= 3 && !STOPWORDS.has(term.toLowerCase());
}

/** CATÁLOGO DE REGRAS — o único arquivo a editar para acrescentar comportamento.
 * A ordem importa: `detectActions` mantém a primeira ação de cada id. */
export const AGENT_RULES: AgentRule[] = [
  {
    id: "search-book",
    match: ({ userText }) => {
      if (!SEARCH_INTENT.test(userText)) return null;

      const quoted = cleanTerm(QUOTED_TERM.exec(userText)?.[1]);
      if (isUsableTerm(quoted)) return { term: quoted };

      const anchored = cleanTerm(NOUN_ANCHOR.exec(userText)?.[1]);
      if (isUsableTerm(anchored)) return { term: anchored };

      return null;
    },
    build: ({ term = "" }, ctx) => buildSearchBookAction(term, ctx),
  },
];
