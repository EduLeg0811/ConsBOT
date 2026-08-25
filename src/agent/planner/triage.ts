import { planAgent } from "@/agent/planner/plan";
import { prepareAgentContext } from "@/agent/planner/context";
import type { AgentContext } from "@/agent/types";

/** O que o hospedeiro precisa saber antes de enviar a mensagem. */
export type AgentTriage = {
  /** `direct`: não chame o modelo completo; mostre `answer` e os pills.
   *  `full`: siga o caminho de sempre. É o padrão em qualquer dúvida. */
  mode: "direct" | "full";
  /** A resposta curta, quando `mode` é `direct`. Vazia em `full`. */
  answer: string;
  /** Bloco a anexar ao systemPrompt daquele turno — só o modo «Alimentar LLM»
   * devolve algo aqui. Vazio nos demais. */
  context: string;
};

const BYPASS: AgentTriage = { mode: "full", answer: "", context: "" };

/** Triagem: roda ANTES do envio e decide quem responde a mensagem.
 *
 * É o único ponto do módulo que interfere no fluxo do ConsBOT, e por isso tem
 * uma regra acima de todas: **com o módulo desligado, devolve BYPASS sem tocar
 * em rede nenhuma**. `AGENT_MODE=0` precisa restaurar o comportamento antigo
 * por inteiro, e é aqui que essa promessa se cumpre ou se quebra.
 *
 * Falha em silêncio como o resto do módulo: se a triagem cair, a mensagem
 * segue pelo caminho completo, que é o comportamento de sempre.
 */
export async function triageAgent(ctx: AgentContext): Promise<AgentTriage> {
  if (!ctx.settings.enabled) return BYPASS;
  // Sob a detecção por Regras não há triagem: elas classificam intenção, não
  // decidem quem responde. O caminho segue completo, como antes.
  if (ctx.settings.detection !== "llm") return BYPASS;

  // Dois modos precisam do plano ANTES do envio: «Alimentar LLM», que anexa o
  // resultado da consulta ao prompt, e a resposta via pill, que precisa saber
  // se a triagem responde sozinha. Em qualquer outro arranjo — e o padrão é um
  // deles — o plano só serve à barra de botões, que aparece DEPOIS da
  // resposta: esperar por ele atrasaria toda pergunta para nada.
  //
  // O disparo sem `await` não é fogo-e-esquece: `planAgent` guarda a promessa,
  // e é dela que a barra de botões se serve segundos depois. A chamada
  // acontece igual; o que deixa de existir é a espera.
  const needsPlan = ctx.settings.action === "context" || ctx.settings.fullAnswer === "pill";
  if (!needsPlan) {
    void planAgent(ctx).catch(() => {
      // Telemetria de agente nunca interrompe a conversa — nem quando ninguém
      // está esperando por ela.
    });
    return BYPASS;
  }

  try {
    const plan = await planAgent(ctx);
    // `prepareAgentContext` reaproveita este mesmo plano — `planAgent` guarda o
    // último, então não há segunda chamada de planejamento aqui.
    const context = await prepareAgentContext(ctx);

    return { mode: plan.answerMode, answer: plan.answer, context };
  } catch {
    return BYPASS;
  }
}
