import { AGENT_TOOLS } from "@/agent/tools/registry";

/** JSON Schema do planejador, gerado do registro.
 *
 * Cada ferramenta contribui com o próprio nome no enum de `intent` e com os
 * parâmetros extras que declarar. O item é PLANO — `intent`, `term` e a união
 * de todos os extras — porque o modo estrito da Responses API não aceita
 * `oneOf` por variante nem propriedades opcionais: tudo entra em `required`, e
 * quem não se aplica vem como string vazia.
 *
 * O custo dessa planificação é o modelo ver `field` e `book` em toda ação; as
 * descrições dizem a qual intenção cada um pertence, e o cliente descarta o
 * que não couber.
 */
function buildSchema() {
  const names = AGENT_TOOLS.map((tool) => tool.name);
  const extras: Record<string, unknown> = {};
  for (const tool of AGENT_TOOLS) Object.assign(extras, tool.parameters ?? {});

  const properties = {
    intent: {
      type: "string",
      enum: names,
      description: "A intenção reconhecida, conforme as instruções.",
    },
    term: {
      type: "string",
      description:
        "O termo da ação, sem aspas e sem as palavras do pedido. String vazia quando não houver termo identificável.",
    },
    ...extras,
  };

  return {
    type: "object",
    properties: {
      actions: {
        type: "array",
        description:
          "As ações que a pergunta justifica, no máximo duas. Lista vazia quando nenhuma se aplica.",
        items: {
          type: "object",
          properties,
          required: Object.keys(properties),
          additionalProperties: false,
        },
      },
      route: {
        type: "string",
        enum: ["direct", "full", "corpus", "clarify"],
        description:
          "direct responde apenas mensagens simples; full encaminha ao modelo principal; corpus recupera e exibe trechos, sem chamar o modelo principal; clarify faz uma pergunta curta quando falta informação material.",
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confiança de 0 a 1 na rota e nas ações; em dúvida, use valor baixo e route full.",
      },
      reason: {
        type: "string",
        description: "Rótulo curto e factual do motivo da rota, sem cadeia de raciocínio.",
      },
      answer: {
        type: "string",
        description: "Resposta breve em direct ou orientação em corpus. String vazia em full.",
      },
    },
    required: ["actions", "route", "confidence", "reason", "answer"],
    additionalProperties: false,
  };
}

export const AGENT_PLANNER_SCHEMA = buildSchema();
