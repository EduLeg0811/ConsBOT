import { AGENT_SEARCH_LIMIT, AGENT_TARGETS, AGENT_VERBETE_FIELDS } from "@/agent/config";
import { asArray, asRecord, href, markdown, plain, post } from "@/agent/tools/lib/api";
import {
  BIBLIO_CONTEXT,
  BOOK_TARGET,
  detectBook,
  literalTerm,
  SEARCH_INTENT,
  VERBETE_TARGET,
} from "@/agent/tools/lib/text";
import type { AgentCardItem, AgentTool, AgentVerbeteField } from "@/agent/types";

/** Campos pelos quais se pergunta sobre um verbete. Contam como pedido de
 * busca mesmo sem verbo («Quem é o autor do verbete "X"?»). */
const FIELD_QUERY =
  /\b(?:autor\w*|verbet[óo]graf\w*|especialidades?|frases?\s+enf[áa]tica|defesa|apresenta[çc][ãa]o)\b/iu;

/** Qual campo o usuário nomeou. A ordem resolve frases que citam mais de um:
 * quem pergunta pelo autor quer o autor, ainda que diga «verbete de título». */
const FIELD_PATTERNS: Array<[AgentVerbeteField, RegExp]> = [
  ["autor", /\b(?:autor\w*|verbet[óo]graf\w*|quem\s+escreveu)\b/iu],
  ["especialidade", /\bespecialidades?\b/iu],
  ["titulo", /\bt[íi]tulos?\b/iu],
];

/** `field` do planejador → coluna do endpoint. Vazio busca na Definologia. */
const COLUMN: Record<string, "author" | "title" | "area" | "text"> = {
  autor: "author",
  titulo: "title",
  especialidade: "area",
};

const FIELD_LABELS: Record<string, { pt: string; en: string } | undefined> = {
  titulo: { pt: "título", en: "title" },
  autor: { pt: "autor", en: "author" },
  especialidade: { pt: "especialidade", en: "speciality" },
};

function detectField(text: string): AgentVerbeteField | undefined {
  for (const [field, pattern] of FIELD_PATTERNS) {
    if (pattern.test(text)) return field;
  }
  return undefined;
}

/** Busca literal nos verbetes da Enciclopédia. Ficha 2 de docs/agent-rules.docx.
 *
 * A página externa faz busca léxica na Definologia com a base fixa na
 * Enciclopédia e não filtra por campo; o endpoint do Main-Server filtra. Por
 * isso o `field` só tem efeito no modo «Buscar aqui» — decisão registrada no
 * documento, não descuido. */
export const searchVerbete: AgentTool = {
  name: "search_verbete",
  termRequired: true,

  parameters: {
    field: {
      type: "string",
      enum: [...AGENT_VERBETE_FIELDS],
      description:
        "Só para search_verbete: por qual campo procurar. String vazia para busca no texto e para todas as outras intenções.",
    },
  },

  describe: (english) =>
    english
      ? [
          "search_verbete — same as search_book, but in the VERBETES of the Encyclopedia of Conscientiology: the user says verbete, verbetes, Enciclopédia or Definologia. When they do not say where to look, return both search_book and search_verbete. term holds only the word or expression being looked for.",
          "In this intent, field says which column to search: titulo when the user asks about the title or names the verbete; autor when they ask who wrote it; especialidade when they ask about the area or speciality. Leave field empty for a search in the Definologia text, which is the common case. In the other three intents field is always empty.",
          "Here too the term is not always quoted, and the absence of quotes changes nothing.",
        ].join("\n")
      : [
          "search_verbete — igual a search_book, mas nos VERBETES da Enciclopédia da Conscienciologia: o usuário diz verbete, verbetes, Enciclopédia ou Definologia. Quando ele não disser onde procurar, devolva as duas: search_book e search_verbete. Em term vai apenas a palavra ou expressão procurada.",
          "Nesta intenção, field diz por qual campo procurar: titulo quando o usuário pergunta pelo título ou nomeia o verbete; autor quando pergunta quem escreveu ou pelo verbetógrafo; especialidade quando pergunta pela área ou especialidade. Deixe field vazio para busca no texto da Definologia, que é o caso comum. Nas outras três intenções field é sempre vazio.",
          "Aqui também o termo procurado nem sempre vem entre aspas, e a falta delas não muda nada.",
        ].join("\n"),

  rule: ({ userText }) => {
    // Perguntar pelo autor ou pela especialidade é pedido de busca tanto
    // quanto «localize»; só não traz verbo.
    const byField = VERBETE_TARGET.test(userText) && FIELD_QUERY.test(userText);
    if (!byField && !SEARCH_INTENT.test(userText)) return null;
    if (BIBLIO_CONTEXT.test(userText)) return null;

    const term = literalTerm(userText);
    if (!term) return null;

    // Simétrico da regra de search_book: só nos livros, cala a busca em
    // verbetes. Nomear uma obra vale como dizer «livros».
    const named = BOOK_TARGET.test(userText) || Boolean(detectBook(userText, term));
    if (named && !VERBETE_TARGET.test(userText)) return null;

    return { intent: "search_verbete", term, field: detectField(userText) };
  },

  toAction: ({ term, field }, { host }) => {
    // O campo aparece no rótulo porque «Buscar verbetes: autor "Waldo"» é bem
    // diferente de procurar "Waldo" no texto.
    const label = FIELD_LABELS[field ?? ""];
    const scoped = label ? `${host.english ? label.en : label.pt} ` : "";

    return {
      id: "search_verbete",
      kind: "open-url",
      label: host.english
        ? `Search verbetes: ${scoped}“${term}”`
        : `Buscar verbetes: ${scoped}“${term}”`,
      title: host.english ? "Opens the module in a new tab" : "Abre o módulo em nova aba",
      href: href(AGENT_TARGETS.search_verbete, term),
      meta: { term, ...(field ? { field } : {}) },
    };
  },

  execute: async ({ term, field }, { host }, signal) => {
    const column = COLUMN[field ?? ""] ?? "text";
    const data = asRecord(
      await post(
        host,
        "/api/lexical/verbetes/search",
        { [column]: term, limit: AGENT_SEARCH_LIMIT },
        signal,
      ),
    );

    const items: AgentCardItem[] = asArray(data.results).map((raw) => {
      const row = asRecord(raw);
      return { source: plain(row.title, 80), snippet: markdown(row.text) };
    });

    // `totalFound` é o total no corpus (saturado em 200 pelo servidor);
    // `items` traz só o lote pedido.
    const total = typeof data.totalFound === "number" ? data.totalFound : items.length;
    return { intent: "search_verbete", term, total, items };
  },
};
