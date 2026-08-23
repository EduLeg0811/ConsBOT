import { AGENT_DELIVERIES } from "@/agent/config";
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
      delivery: {
        type: "string",
        enum: [...AGENT_DELIVERIES],
        description:
          "Como entregar: card (botão ao lado da resposta), context (o resultado alimenta a resposta) ou both.",
      },
    },
    required: ["actions", "delivery"],
    additionalProperties: false,
  };
}

export const AGENT_PLANNER_SCHEMA = buildSchema();
