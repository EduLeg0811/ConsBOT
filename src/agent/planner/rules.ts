import { actionsFromMatches, AGENT_TOOLS } from "@/agent/tools/registry";
import type { AgentAction, AgentContext, AgentMatch } from "@/agent/types";

/** Detecção determinística — o plano B do planejador.
 *
 * Percorre as ferramentas que declaram `rule` e junta o que casar. Roda no
 * cliente, é síncrona, de custo zero e testável sem React nem rede; em troca,
 * não sabe decidir «se deve buscar» em frases que fogem dos padrões, e não
 * alcança capacidades que dependem de julgamento — `consulta_dicionarios` não
 * tem regra de propósito.
 *
 * Não checa `settings.enabled`: quem liga e desliga o módulo é o componente,
 * num único lugar, para os dois modos.
 */
export function detectActions(ctx: AgentContext): AgentAction[] {
  if (!ctx.userText.trim()) return [];

  const matches: AgentMatch[] = [];

  for (const tool of AGENT_TOOLS) {
    if (!tool.rule) continue;

    try {
      const match = tool.rule(ctx);
      if (match) matches.push(match);
    } catch {
      // Uma regra quebrada nunca pode derrubar a conversa: ignora e segue.
    }
  }

  return actionsFromMatches(matches, ctx);
}
