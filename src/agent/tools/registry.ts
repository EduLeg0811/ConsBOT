import { bibliografia } from "@/agent/tools/bibliografia";
import { dicionarios } from "@/agent/tools/dicionarios";
import { searchBook } from "@/agent/tools/search-book";
import { searchVerbete } from "@/agent/tools/search-verbete";
import type {
  AgentAction,
  AgentContext,
  AgentIntentId,
  AgentMatch,
  AgentTool,
} from "@/agent/types";

/** O catálogo de capacidades do agente.
 *
 * Acrescentar uma capacidade é escrever um arquivo em `tools/` e listá-lo
 * aqui — mais nada. O prompt do planejador, o JSON Schema, o botão e a
 * consulta saem todos daqui, então não há um segundo lugar para esquecer de
 * atualizar.
 *
 * A ORDEM importa em dois pontos: é a ordem de avaliação das regras e, em
 * empate, a ordem em que os botões aparecem. */
export const AGENT_TOOLS: AgentTool[] = [searchBook, searchVerbete, bibliografia, dicionarios];

export function agentTool(name: string): AgentTool | undefined {
  return AGENT_TOOLS.find((tool) => tool.name === name);
}

/** Teto de botões exibidos de uma vez. Mais que isso vira ruído e compete
 * visualmente com as ações nativas (copiar / compartilhar / tentar de novo).
 *
 * Duas é de propósito: quando a pergunta não diz o alvo ("onde aparece a
 * palavra X?"), o módulo oferece as duas buscas possíveis em vez de escolher
 * uma por precedência arbitrária. */
export const MAX_AGENT_ACTIONS = 2;

/** Converte pares (intenção, parâmetros) em botões, deduplicando por intenção
 * e respeitando o teto. Ponto de encontro dos dois modos de detecção. */
export function actionsFromMatches(matches: AgentMatch[], ctx: AgentContext): AgentAction[] {
  const actions: AgentAction[] = [];
  const seen = new Set<AgentIntentId>();

  for (const match of matches) {
    if (actions.length >= MAX_AGENT_ACTIONS) break;
    if (seen.has(match.intent)) continue;

    const tool = agentTool(match.intent);
    if (!tool) continue;
    if (tool.termRequired && !match.term) continue;

    seen.add(match.intent);
    actions.push(tool.toAction(match, ctx));
  }

  return actions;
}

/** Executa a consulta da ferramenta correspondente (modo «Buscar aqui»).
 *
 * Diferente do planejamento, aqui o erro SOBE: a consulta é resposta a um
 * clique, e engolir a falha deixaria o usuário olhando para um botão que não
 * fez nada. O componente mostra a mensagem e oferece o módulo externo. */
export function executeAgentAction(action: AgentAction, ctx: AgentContext, signal?: AbortSignal) {
  const tool = agentTool(action.id);
  if (!tool) return Promise.reject(new Error(`Ferramenta desconhecida: ${action.id}`));

  const match: AgentMatch = {
    intent: action.id,
    term: action.meta?.term ?? "",
    field: action.meta?.field as AgentMatch["field"],
    book: action.meta?.book,
  };

  return tool.execute(match, ctx, signal);
}
