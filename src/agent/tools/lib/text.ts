import { AGENT_BOOKS } from "@/agent/config";

/* Extração de termo e de alvo, compartilhada pelas regras das ferramentas.
 *
 * Só o que serve a mais de uma ferramenta mora aqui. Padrão que pertence a uma
 * intenção só (o gatilho de bibliografia, por exemplo) fica no arquivo dela —
 * é o que mantém a promessa de «uma capacidade, um arquivo». */

/** Termo entre aspas — o sinal mais forte e o caminho preferencial. */
export const QUOTED_TERM = /["“«‘]\s*([^"”»’\r\n]{2,80}?)\s*["”»’]/u;

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
  "livro",
  "livros",
  "obra",
  "obras",
  "ajuda",
  "mais",
  "meu",
  "minha",
  "tudo",
  "algo",
  "informacoes",
  "informações",
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

/** Verbos/locuções que indicam pedido de LOCALIZAÇÃO literal, não de
 * explicação. Sozinho não basta para disparar: é preciso também identificar
 * QUAL termo. */
export const SEARCH_INTENT =
  /\b(?:localiz\w*|procur\w*|encontr\w*|bus(?:c|qu)\w*|pesquis\w*|cit\w*|t[íi]tulos?|onde\s+(?:aparece\w*|est[áa]|consta|surge)|em\s+qu(?:e|ais)\s+(?:p[áa]ginas?|obras?|livros?|trechos?|verbetes?)|search\w*|find|locate|look\s+for|where\s+(?:does|do|is|are|can))\b/iu;

/** Substantivo-âncora seguido de UMA palavra: «a palavra consciex».
 * Um token só, de propósito: capturar frase inteira sem aspas produz termo
 * errado com frequência alta demais para valer a pena. */
const NOUN_ANCHOR =
  /\b(?:palavras?|termos?|express[ãa]o|express[õo]es|pensatas?|ortopensatas?|verbetes?|vocábulos?|words?|terms?|expressions?)\s+(?:sobre\s+|de\s+|do\s+|da\s+)?([\p{L}\p{N}][\p{L}\p{N}-]{2,40})\b/iu;

/** Verbo de busca seguido direto do termo: «Buscar a tenepes no livro X».
 *
 * Restrito a buscar/localizar/procurar de propósito. Incluir «encontrar» ou
 * «pesquisar» aqui quebraria dois negativos das fichas — «Preciso de ajuda
 * para encontrar meu caminho evolutivo» e «Quero pesquisar mais sobre
 * evolução da consciência» —, que são pedidos de conversa, não de busca.
 *
 * O artigo exige espaço depois: sem isso, «buscar autorrevezamento» perdia o
 * «a» inicial e virava o termo «utorrevezamento». */
const VERB_TERM =
  /\b(?:bus(?:c|qu)\w*|localiz\w*|procur\w*)\s+(?:(?:a|o|as|os|pela|pelo|por)\s+)?([\p{L}][\p{L}\p{N}-]{2,40})\b/iu;

/** Extrai o termo da busca literal, na ordem de confiança: aspas, âncora
 * («a palavra X»), verbo seguido do termo. */
export function literalTerm(text: string): string {
  const quoted = cleanTerm(QUOTED_TERM.exec(text)?.[1]);
  if (isUsableTerm(quoted)) return quoted;

  const anchored = cleanTerm(NOUN_ANCHOR.exec(text)?.[1]);
  if (isUsableTerm(anchored)) return anchored;

  const afterVerb = cleanTerm(VERB_TERM.exec(text)?.[1]);
  if (isUsableTerm(afterVerb)) return afterVerb;

  return "";
}

/** Qualificadores que dizem ONDE procurar. Quando a pergunta não traz nenhum
 * dos dois, as duas buscas são oferecidas lado a lado, em vez de escolher uma
 * por precedência arbitrária — decisão registrada em docs/agent-rules.docx. */
export const BOOK_TARGET = /\b(?:livros?|obras?|p[áa]ginas?|books?|works?|pages?)\b/iu;
export const VERBETE_TARGET = /\b(?:verbetes?|enciclop[ée]dia\w*|definologia|encyclopedia)\b/iu;

/** Pedido de bibliografia usa os mesmos verbos ("citar"), mas é outra coisa.
 * Sem esta exclusão, «Como citar o livro "700 Experimentos"?» ofereceria
 * também a busca literal — dois botões para um pedido que é claramente um só. */
export const BIBLIO_CONTEXT =
  /\b(?:bibliografia\w*|bibliogr[áa]fic\w*|refer[êe]ncias?|como\s+citar|\bBEE\b)\b/iu;

/** Minúsculas e sem acento, para «Léxico» casar com «lexico». */
function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/gu, "").toLowerCase();
}

/** Apelidos do maior para o menor: «projeciologia 1986» precisa ser testado
 * antes de «projeciologia», senão a obra de 1986 nunca seria alcançada. */
const BOOK_ALIASES = AGENT_BOOKS.flatMap((book) =>
  book.aliases.map((alias) => ({ id: book.id, alias: fold(alias) })),
).sort((a, b) => b.alias.length - a.alias.length);

/** Qual obra a pergunta nomeia, se nomeia alguma.
 *
 * O termo procurado é descontado antes: em «buscar a palavra Zéfiro nos
 * livros» o usuário quer a palavra, não a obra Zéfiro. Sem isso o escopo
 * silenciosamente reduziria a busca a um único livro. */
export function detectBook(text: string, term: string): string | undefined {
  const haystack = fold(text);
  const needle = fold(term);

  for (const { id, alias } of BOOK_ALIASES) {
    if (!haystack.includes(alias)) continue;
    if (needle && alias.includes(needle)) continue;
    return id;
  }

  // Sigla só em maiúsculas: «LO» é o Léxico, «lo» é sílaba de qualquer palavra.
  for (const book of AGENT_BOOKS) {
    if (book.sigla && new RegExp(`\\b${book.sigla}\\b`).test(text)) return book.id;
  }

  return undefined;
}
