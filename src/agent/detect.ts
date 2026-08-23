import { AGENT_RULES } from "@/lib/agent/rules";
import type { AgentAction, AgentContext } from "@/lib/agent/types";

/** Teto de botões exibidos de uma vez. Mais que isso vira ruído e compete
 * visualmente com as ações nativas (copiar / compartilhar / tentar de novo). */
export const MAX_AGENT_ACTIONS = 2;

/** Avalia o catálogo de regras contra o contexto e devolve as ações sugeridas.
 *
 * Função pura e síncrona — dá para testar sem React e sem rede. É o modo de
 * detecção `rules`; o modo `llm` vive em `classify.ts` e devolve exatamente o
 * mesmo tipo, para que a UI não precise saber qual dos dois produziu o botão.
 *
 * Não checa `settings.agentMode`: quem liga e desliga o módulo é o componente,
 * num único lugar, para os dois modos.
 */
export function detectActions(ctx: AgentContext): AgentAction[] {
  if (!ctx.userText.trim()) return [];

  const actions: AgentAction[] = [];
  const seen = new Set<string>();

  for (const rule of AGENT_RULES) {
    if (actions.length >= MAX_AGENT_ACTIONS) break;
    if (seen.has(rule.id)) continue;

    try {
      const captures = rule.match(ctx);
      if (!captures) continue;

      const action = rule.build(captures, ctx);
      if (!action) continue;

      seen.add(rule.id);
      actions.push(action);
    } catch {
      // Uma regra quebrada nunca pode derrubar a conversa: ignora e segue.
    }
  }

  return actions;
}
