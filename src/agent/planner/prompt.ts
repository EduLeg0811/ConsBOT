import { AGENT_TOOLS } from "@/agent/tools/registry";

/* As instruções do planejador são GERADAS do registro de ferramentas.
 *
 * Antes existia um texto fixo em config.ts que precisava concordar com o enum
 * do classificador e com os fetchers — três lugares, três chances de divergir.
 * Agora o bloco de cada ferramenta vem do `describe` dela, no arquivo dela. */

const PREAMBLE_PT = [
  "Você classifica a intenção de UMA pergunta feita a um assistente de Conscienciologia.",
  "Devolva `actions`: no máximo 2 ações, ou lista vazia quando nenhuma se aplicar. Lista vazia é a resposta correta na grande maioria das perguntas.",
  "Na dúvida, devolva lista vazia: um botão indevido atrapalha mais do que a ausência dele.",
].join("\n");

const PREAMBLE_EN = [
  "You classify the intent of ONE question asked to a Conscientiology assistant.",
  "Return `actions`: at most 2 actions, or an empty list when none applies. An empty list is the correct answer for the vast majority of questions.",
  "When in doubt return an empty list: an unwarranted button is worse than no button.",
].join("\n");

const CLOSING_PT = [
  "Devolva duas ações apenas quando a pergunta realmente pedir as duas coisas. Não invente uma segunda para preencher a lista.",
  "Em delivery, diga como o resultado deve chegar: context quando a resposta DEPENDE do dado exato (uma ocorrência literal, uma página, uma referência bibliográfica); card quando a ação é só uma conveniência e a resposta se sustenta sem ela; both quando as duas coisas valem. Na dúvida, card.",
].join("\n");

const CLOSING_EN = [
  "Return two actions only when the question genuinely asks for both. Do not invent a second one to fill the list.",
  "In delivery, say how the result should arrive: context when the answer DEPENDS on the exact datum (a literal occurrence, a page, a bibliographic reference); card when the action is a convenience and the answer stands without it; both when both are worth it. When in doubt, card.",
].join("\n");

/** Instruções completas do planejador, no idioma da base ativa.
 *
 * É o texto que o menu de configuração mostra em «Agent Prompt» e que
 * `ChatSettings.agent.prompt`, quando preenchido, substitui na sessão. */
export function agentInstructionsFor(english: boolean): string {
  const blocks = AGENT_TOOLS.map((tool) => tool.describe(english));

  return [english ? PREAMBLE_EN : PREAMBLE_PT, ...blocks, english ? CLOSING_EN : CLOSING_PT].join(
    "\n\n",
  );
}
