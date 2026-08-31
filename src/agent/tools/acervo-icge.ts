import { AGENT_TARGETS } from "@/agent/config";
import { BIBLIO_CONTEXT, BOOK_TARGET, SEARCH_INTENT, VERBETE_TARGET } from "@/agent/tools/lib/text";
import type { AgentTool } from "@/agent/types";

/** Padrões locais de detecção sobre o acervo da Conscienciologia / ICGE. */
const ACERVO_PATTERNS = [
  /\bacervo\w*\s+(?:d[aeo]\s+)?conscienciologia\b/iu,
  /\b(?:acervo\s+geral|acervo\s+hist[óo]rico|acervo\s+do\s+ceaec|acervo\s+do\s+icge|acervo\s+holotec[áa]rio)\b/iu,
  /\b(?:holoteca|hemeroteca|gibiteca|filacoteca|artefatos?\s+hist[óo]ricos?)\b/iu,
  /\b(?:informa[çc][õo]es?\s+sobre\s+o\s+acervo|conserva[çc][ãa]o\s+do\s+acervo)\b/iu,
  /\b(?:site\s+d[oe]\s+)?icge\b/iu,
];

/** Encaminhamento para o site do ICGE (informações sobre o acervo da Conscienciologia).
 *
 * Acionado quando o usuário pergunta alguma informação sobre o acervo da
 * Conscienciologia, acervo holotecário, artefatos ou arquivo histórico que não
 * seja busca de termos em livros/verbetes nem bibliografia.
 *
 * A LLM deve responder normalmente na rota full, com o pill exibido.
 */
export const acervoIcge: AgentTool = {
  name: "acervo_icge",
  termRequired: false,

  describe: (english) =>
    english
      ? "acervo_icge — the user asks for information about the Conscientiology collection/archive (holotheca, historical collection, artifacts, physical archive, preservation, ICGE) that is NOT a direct term search in books or verbetes, nor a bibliographic reference request. The main model should answer normally (route full), accompanied by this action to display the pill linking to the ICGE website."
      : "acervo_icge — o usuário pergunta alguma informação sobre o acervo da Conscienciologia (holoteca, acervo histórico, artefatos, arquivo físico, conservação documental, ICGE) que NÃO seja busca textual em livros ou verbetes nem pedido de referências bibliográficas. O modelo principal deve responder normalmente (route full), acompanhado desta ação para exibir o pill com o link do site do ICGE.",

  rule: ({ userText }) => {
    // Não interfere em buscas literais em livros ou verbetes nem em bibliografia
    if (BIBLIO_CONTEXT.test(userText)) return null;
    if (SEARCH_INTENT.test(userText) && (BOOK_TARGET.test(userText) || VERBETE_TARGET.test(userText))) {
      return null;
    }

    for (const pattern of ACERVO_PATTERNS) {
      if (pattern.test(userText)) {
        return { intent: "acervo_icge", term: "" };
      }
    }
    return null;
  },

  toAction: (_match, { host }) => ({
    id: "acervo_icge",
    kind: "open-url",
    label: host.english ? "More information on the ICGE website" : "Mais informações no site do ICGE",
    title: host.english ? "Opens the ICGE website in a new tab" : "Abre o site do ICGE em nova aba",
    href: AGENT_TARGETS.acervo_icge,
  }),

  execute: async (_match, { host }) => ({
    intent: "acervo_icge",
    term: "",
    total: 1,
    saturated: false,
    items: [
      {
        source: "ICGE",
        snippet: host.english
          ? "For more information about the Conscientiology collection and archives, visit [ICGE](https://www.icge.org.br)."
          : "Para mais informações sobre o acervo da Conscienciologia, visite o site do [ICGE](https://www.icge.org.br).",
      },
    ],
  }),
};
