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
  "Ao extrair o term, corrija erro evidente de digitação: quem escreve «trnnsmentor» quer «Transmentor», e a busca é literal — o termo errado não encontra nada. Corrija apenas quando a palavra pretendida for inequívoca; na dúvida, mantenha o que o usuário escreveu. Jamais troque um neologismo BEM GRAFADO por palavra comum parecida: invéxis, proéxis, conscin, consciex, tenepes e holopensene vão como estão. Neologismo MAL grafado, porém, corrige-se para a forma correta do corpus: «holopnsene» vira «holopensene», «tenpes» vira «tenepes».",
].join("\n");

const PREAMBLE_EN = [
  "You classify the intent of ONE question asked to a Conscientiology assistant.",
  "Return `actions`: at most 2 actions, or an empty list when none applies. An empty list is the correct answer for the vast majority of questions.",
  "When in doubt return an empty list: an unwarranted button is worse than no button.",
  "When extracting term, fix obvious typos: someone who writes «trnnsmentor» means «Transmentor», and the lookup is literal — the misspelt term finds nothing. Only fix it when the intended word is unmistakable; when in doubt, keep what the user wrote. Never replace a CORRECTLY SPELLED neologism with a similar common word: invéxis, proéxis, conscin, consciex, tenepes and holopensene go through untouched. A MISSPELT neologism, however, is corrected to its proper form in the corpus: «holopnsene» becomes «holopensene».",
].join("\n");

const CLOSING_PT = [
  "Devolva duas ações apenas quando a pergunta realmente pedir as duas coisas. Não invente uma segunda para preencher a lista.",
  "Em delivery, card é o padrão e responde à maioria dos casos.",
  "Use context SOMENTE quando responder sem o dado exato produziria uma resposta ERRADA ou impossível de dar — o número da página, a ocorrência literal a ser transcrita, a referência bibliográfica a ser copiada. Se a resposta se sustenta sem a busca, e a ação é apenas comodidade para quem perguntou, é card.",
  "Pedir context custa segundos de espera antes de a resposta começar. Só vale quando o dado é indispensável, não quando é apenas útil.",
  "both é raro: exige que o dado seja indispensável à resposta E que a busca completa interesse por si.",
].join("\n");

const CLOSING_EN = [
  "Return two actions only when the question genuinely asks for both. Do not invent a second one to fill the list.",
  "In delivery, card is the default and covers most cases.",
  "Use context ONLY when answering without the exact datum would produce a WRONG or impossible answer — the page number, the literal occurrence to be transcribed, the bibliographic reference to be copied. If the answer stands without the lookup, and the action is merely a convenience for the reader, it is card.",
  "Asking for context costs seconds of waiting before the answer starts. It is only worth it when the datum is indispensable, not when it is merely useful.",
  "both is rare: it requires the datum to be indispensable to the answer AND the full search to be of interest on its own.",
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
