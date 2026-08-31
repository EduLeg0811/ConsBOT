import { planAgent } from "@/agent/planner/plan";
import type { AgentAction, AgentContext, AgentPlanOrigin, AgentRoute } from "@/agent/types";

export type AgentTriage = {
  mode: AgentRoute;
  answer: string;
  actions: AgentAction[];
  confidence: number;
  reason: string;
  origin: AgentPlanOrigin;
  proposedRoute?: AgentRoute;
  durationMs?: number;
  classifierResponse?: string;
};

const BYPASS: AgentTriage = {
  mode: "full",
  answer: "",
  actions: [],
  confidence: 0,
  reason: "agent_disabled",
  origin: "bypass",
};

/** O Agent é um roteador fixo: Luna sempre decide o turno quando está ligado;
 * qualquer falha cai no caminho completo já configurado no ConsBOT. */
export async function triageAgent(ctx: AgentContext): Promise<AgentTriage> {
  if (!ctx.settings.enabled) return BYPASS;
  const plan = await planAgent(ctx);
  return {
    mode: plan.route,
    answer: plan.answer,
    actions: plan.actions,
    confidence: plan.confidence,
    reason: plan.reason,
    origin: plan.origin,
    proposedRoute: plan.proposedRoute,
    durationMs: plan.durationMs,
    classifierResponse: plan.classifierResponse,
  };
}
