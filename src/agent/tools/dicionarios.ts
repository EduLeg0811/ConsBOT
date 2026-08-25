import { AGENT_SEARCH_LIMIT, AGENT_TARGETS } from "@/agent/config";
import { asArray, asRecord, get, href, markdown, plain } from "@/agent/tools/lib/api";
import type { AgentCardItem, AgentTool } from "@/agent/types";

/** Consulta aos dicionários de português. Ficha 4 de docs/agent-rules.docx.
 *
 * Sem `rule` de propósito: separar palavra comum de neologismo
 * conscienciológico — «ascender» sim, «pensene» não — exige conhecer o corpus,
 * e nenhum padrão resolve isso. Esta ferramenta só existe sob o classificador,
 * e é o exemplo de por que o plano B não cobre tudo. */
export const dicionarios: AgentTool = {
  name: "consulta_dicionarios",
  termRequired: true,

  describe: (english) =>
    english
      ? "consulta_dicionarios — the user asks for the meaning, etymology, synonyms, cognates, analogies, fields of use, or disambiguation of a word of COMMON PORTUGUESE. Do NOT use it when the word is a neologism or jargon of Conscientiology (pensene, cosmoética, holopensene, invéxis, tenepes, conscin, consciex, proéxis and the like) — there is no action in those cases. term holds the word; when two words are compared, both separated by a space."
      : "consulta_dicionarios — o usuário pergunta o significado, a etimologia, sinônimos, cognatos, analogias, áreas de uso ou a desambiguação de uma palavra da LÍNGUA PORTUGUESA COMUM. NÃO use quando a palavra for neologismo ou jargão próprio da Conscienciologia (pensene, cosmoética, holopensene, invéxis, tenepes, conscin, consciex, proéxis, paradireito, cosmovisão e afins) — nesses casos não há ação. Em term vai a palavra; havendo duas palavras comparadas, as duas separadas por espaço.",

  toAction: ({ term }, { host }) => ({
    id: "consulta_dicionarios",
    kind: "open-url",
    label: host.english
      ? `Search “${term}” in the dictionaries`
      : `Buscar “${term}” nos dicionários`,
    title: host.english ? "Opens the module in a new tab" : "Abre o módulo em nova aba",
    href: href(AGENT_TARGETS.consulta_dicionarios, term),
    meta: { term },
  }),

  execute: async ({ term }, { host }, signal) => {
    const data = asRecord(
      await get(
        host,
        // `mode=completo` traz sinônimos E analógico. Sem ele o servidor usa
        // `analogico`, e a metade sinonímica — que o `describe` promete ao
        // classificador — nunca voltava.
        `/api/dictionary/search?q=${encodeURIComponent(term)}&mode=completo&max_results=${AGENT_SEARCH_LIMIT}`,
        signal,
      ),
    );

    const items: AgentCardItem[] = [];
    for (const rawSection of asArray(data.sections)) {
      const section = asRecord(rawSection);
      const sectionTitle = plain(section.title, 40);

      for (const rawItem of asArray(section.items)) {
        const item = asRecord(rawItem);
        const first = asRecord(asArray(item.matches)[0]);
        const label = plain(item.titulo, 60);

        items.push({
          source: sectionTitle ? `${label} · ${sectionTitle}` : label,
          snippet: markdown(first.contexto) || markdown(item.classe, 120),
        });
      }
    }

    // Cada seção traz até `max_results`, então o teto real é múltiplo dele.
    return {
      intent: "consulta_dicionarios",
      term,
      total: items.length,
      saturated: items.length >= AGENT_SEARCH_LIMIT,
      items,
    };
  },
};
