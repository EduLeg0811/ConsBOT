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

/** Teto de contagem do endpoint: `search_verbetes` para de contar em
 * MAX_BOOK_SEARCH (200) e devolve `totalFound` saturado. Bater nesse número
 * significa «pelo menos 200», nunca «exatamente 200». */
const VERBETE_TOTAL_CAP = 200;

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

/** Termo entre aspas logo depois de «verbete» é o TÍTULO dele.
 *
 * Desfaz a confusão entre o que se procura e o que se quer saber: em «Quem é
 * o autor do verbete "Sursum Conscientia"?» o termo é o título, e o autor é a
 * resposta. Buscar por autor="Sursum Conscientia" devolve zero.
 *
 * O «sobre» fica de fora de propósito: «verbetes sobre "tenepes"» é busca no
 * texto, não pelo título. */
const TITLE_QUOTED = /\bverbetes?\s+(?:de\s+t[íi]tulo\s+)?["“«]/iu;

function detectField(text: string): AgentVerbeteField | undefined {
  if (TITLE_QUOTED.test(text)) return "titulo";

  for (const [field, pattern] of FIELD_PATTERNS) {
    if (pattern.test(text)) return field;
  }
  return undefined;
}

/** Busca literal nos verbetes da Enciclopédia. Ficha 2 de docs/agent-rules.docx.
 *
 * A página externa faz busca léxica na Definologia com a base fixa na
 * Enciclopédia e não filtra por campo; o endpoint do Main-Server filtra. Por
 * isso o `field` só tem efeito no modo «Busca Integrada» — decisão registrada no
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
          "Use search_verbete strictly when the user asks to consult, search or locate information inside verbetes.",
          "Do NOT use it when they want the content of a verbete they name themselves: «What does the verbete “X” say?», «Summarise the verbete “X”» and «Compare the verbetes “X” and “Y”» are requests for explanation, and the answer does not depend on a lookup.",
          "Do NOT use it for verbete writing criteria, applying or adjusting text to the verbete form, verbete guidelines, or questions about Encyclossapiens (use encyclossapiens instead).",
          "In this intent, field says which column to SEARCH the term in — not what the user wants to find out. titulo when the term is the name of a verbete; autor when the term is a person name; especialidade when the term is an area. Leave field empty to search the Definologia text, which is the common case.",
          "Beware the inversion: in «Who wrote the verbete “Sursum Conscientia”?» the term is Sursum Conscientia and field is titulo — the author is the answer, and it comes back in the search result. field would be autor only if the term were the person name, as in «which verbetes did Waldo Vieira write?». In the other three intents field is always empty.",
          "Here too the term is not always quoted, and the absence of quotes changes nothing.",
        ].join("\n")
      : [
          "search_verbete — igual a search_book, mas nos VERBETES da Enciclopédia da Conscienciologia: o usuário diz verbete, verbetes, Enciclopédia ou Definologia. Quando ele não disser onde procurar, devolva as duas: search_book e search_verbete. Em term vai apenas a palavra ou expressão procurada.",
          "Use search_verbete exclusivamente quando o usuário pedir para consultar, buscar ou localizar alguma informação nos verbetes.",
          "NÃO use quando ele quer o conteúdo de um verbete que ele mesmo nomeia: «Sobre o que o verbete “X” fala?», «Resuma o verbete “X”», «Discuta o verbete “X”» e «Compare os verbetes “X” e “Y”» são pedidos de explicação, e a resposta não depende de busca.",
          "NÃO use para critérios de escrita do verbete, aplicar ao texto ou ajustar texto à forma dos verbetes, diretrizes dos verbetes ou dúvidas sobre a Encyclossapiens (use encyclossapiens para esses casos).",
          "Nesta intenção, field diz em qual coluna PROCURAR o term — não o que o usuário quer descobrir. titulo quando o term é o nome de um verbete; autor quando o term é o nome de uma pessoa; especialidade quando o term é uma área. Deixe field vazio para procurar no texto da Definologia, que é o caso comum.",
          "Cuidado com a inversão: em «Quem é o autor do verbete “Sursum Conscientia”?» o term é Sursum Conscientia e field é titulo — o autor é a resposta, e vem no resultado da busca. field seria autor só se o term fosse o nome da pessoa, como em «que verbetes o Waldo Vieira escreveu?». Nas outras três intenções field é sempre vazio.",
          "Aqui também o termo procurado nem sempre vem entre aspas, e a falta delas não muda nada.",
        ].join("\n"),

  rule: ({ userText }) => {
    if (/\b(?:encyclossapiens|crit[ée]rios?\s+(?:de\s+)?escrita|diretrizes?\s+(?:d[oe]s?\s+)?verbet\w*|(?:aplicar|ajustar|adaptar|formatar)\s+.*(?:[àa]\s+)?forma\s+(?:d[oe]s?\s+)?verbet\w*)\b/iu.test(userText)) {
      return null;
    }

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
      const meta = asRecord(row.data);

      // Autor e especialidade entram na linha da fonte porque muitas vezes SÃO
      // a resposta: quem pergunta «quem escreveu o verbete X» procura pelo
      // título e quer o autor de volta. Sem isto, o card acha o verbete certo
      // e ainda assim não responde.
      const source = [plain(row.title, 80), plain(meta.author, 40), plain(meta.area, 40)]
        .filter(Boolean)
        .join(" · ");

      return { source, snippet: markdown(row.text) };
    });

    // `totalFound` é o total no corpus (saturado em 200 pelo servidor);
    // `items` traz só o lote pedido.
    const total = typeof data.totalFound === "number" ? data.totalFound : items.length;
    // O servidor satura `totalFound` em 200; acima disso o número também é um
    // piso, e o card avisa.
    return {
      intent: "search_verbete",
      term,
      total,
      saturated:
        typeof data.totalFound === "number"
          ? total >= VERBETE_TOTAL_CAP
          : items.length >= AGENT_SEARCH_LIMIT,
      items,
    };
  },
};
