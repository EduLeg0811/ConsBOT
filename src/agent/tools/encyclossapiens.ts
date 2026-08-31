import { AGENT_TARGETS } from "@/agent/config";
import type { AgentTool } from "@/agent/types";

/** Critérios de detecção local (contingência quando o classificador LLM não estiver disponível). */
const ENCYCLOSSAPIENS_PATTERNS = [
  /\bencyclossapiens\b/iu,
  /\bcrit[ée]rios?\s+(?:de\s+)?escrita\b/iu,
  /\bdiretrizes?\s+(?:d[oe]s?\s+)?verbet\w*/iu,
  /\b(?:aplicar|ajustar|adaptar|formatar)\s+.*(?:[àa]\s+)?forma\s+(?:d[oe]s?\s+)?verbet\w*/iu,
  /\b(?:forma|estrutura|padr[ãa]o|normas?)\s+(?:d[oe]s?\s+)?verbet\w*/iu,
];

/** Encaminhamento para a página da Encyclossapiens.
 *
 * Acionado quando o usuário pergunta sobre critérios de escrita de verbetes,
 * diretrizes dos verbetes, pede para aplicar ou ajustar um texto à forma de
 * verbetes, ou pergunta sobre a Encyclossapiens.
 *
 * Importante: consultas e buscas textuais de conteúdo em verbetes pertencem a
 * `search_verbete` (cons-ia.org), e não a esta ferramenta.
 */
export const encyclossapiens: AgentTool = {
  name: "encyclossapiens",
  termRequired: false,

  describe: (english) =>
    english
      ? "encyclossapiens — the user asks about verbete writing criteria, guidelines for verbetes, asks to apply or adjust text to the verbete form/structure, or asks about Encyclossapiens. Suggest visiting the Encyclossapiens page to obtain complete information about verbetes. Do NOT use search_verbete in these cases. (Important: when the user explicitly asks to consult, search or locate information inside verbetes, use search_verbete instead)."
      : "encyclossapiens — o usuário pergunta sobre os critérios de escrita do verbete, diretrizes dos verbetes, pede para aplicar ao texto ou ajustar o texto à forma/estrutura dos verbetes, ou pergunta sobre a Encyclossapiens. Sugira visitar a página da Encyclossapiens para obter informações completas sobre os verbetes. NÃO use search_verbete nesses casos. (Importante: quando o usuário pedir para consultar, buscar ou localizar alguma informação nos verbetes, use search_verbete).",

  rule: ({ userText }) => {
    for (const pattern of ENCYCLOSSAPIENS_PATTERNS) {
      if (pattern.test(userText)) {
        return { intent: "encyclossapiens", term: "" };
      }
    }
    return null;
  },

  toAction: (_match, { host }) => ({
    id: "encyclossapiens",
    kind: "open-url",
    label: host.english ? "Encyclossapiens" : "Encyclossapiens",
    title: host.english
      ? "Opens Encyclossapiens in a new tab"
      : "Abre a Encyclossapiens em nova aba",
    href: AGENT_TARGETS.encyclossapiens,
  }),

  execute: async (_match, { host }) => ({
    intent: "encyclossapiens",
    term: "",
    total: 1,
    saturated: false,
    items: [
      {
        source: "Encyclossapiens",
        snippet: host.english
          ? "Visit [Encyclossapiens](https://encyclossapiens.org/) for complete information, guidelines and criteria on writing verbetes."
          : "Visite a [Encyclossapiens](https://encyclossapiens.org/) para obter informações completas sobre critérios de escrita, diretrizes e confecção de verbetes.",
      },
    ],
  }),
};
