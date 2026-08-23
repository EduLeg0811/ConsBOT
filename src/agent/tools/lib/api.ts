import { AGENT_SEARCH_PARAM } from "@/agent/config";
import type { AgentHost } from "@/agent/host";

/* Acesso ao Main-Server e normalização de texto, compartilhados pelas
 * ferramentas. Cada endpoint tem forma própria; a redução para `AgentCard`
 * mora no arquivo da ferramenta, junto do resto do que ela sabe. */

export async function post(host: AgentHost, path: string, body: unknown, signal?: AbortSignal) {
  const response = await fetch(`${host.apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    signal,
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json() as Promise<unknown>;
}

export async function get(host: AgentHost, path: string, signal?: AbortSignal) {
  const response = await fetch(`${host.apiBase}${path}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json() as Promise<unknown>;
}

/** Tira a marcação do corpus e normaliza o espaço. Para rótulos — fonte,
 * título de verbete —, onde markdown viraria ruído visual. */
export function plain(text: unknown, max = 260): string {
  if (typeof text !== "string") return "";

  const clean = text.replace(/\*+/gu, "").replace(/\s+/gu, " ").trim();

  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** Preserva a marcação do corpus, para o card renderizar como markdown.
 *
 * O corte por tamanho pode partir um par de marcadores ao meio — «**Defino»
 * sem o fechamento vaza asteriscos na tela e ainda contamina o resto do
 * bloco. Marcador ímpar é fechado antes de devolver.
 *
 * Quebras de linha viram espaço de propósito: o trecho é uma citação curta
 * dentro de uma lista, não um documento. */
export function markdown(text: unknown, max = 260): string {
  if (typeof text !== "string") return "";

  const clean = text.replace(/\s+/gu, " ").trim();
  if (clean.length <= max) return clean;

  let cut = `${clean.slice(0, max - 1).trimEnd()}…`;
  if ((cut.match(/\*\*/gu) ?? []).length % 2 === 1) cut += "**";
  if ((cut.replace(/\*\*/gu, "").match(/\*/gu) ?? []).length % 2 === 1) cut += "*";

  return cut;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Monta a URL do módulo externo. Sem termo, abre a página sem filtro — é o
 * caso previsto em pedidos genéricos ("como citar as obras do Waldo"). */
export function href(target: string, term: string, extra?: Record<string, string>) {
  if (!term) return target;

  // encodeURIComponent, e não URLSearchParams: este último codifica espaço
  // como «+», e o contrato combinado com o Cons-ia usa «%20».
  const parts = [`${AGENT_SEARCH_PARAM}=${encodeURIComponent(term)}`];
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value) parts.push(`${key}=${encodeURIComponent(value)}`);
  }

  return `${target}?${parts.join("&")}`;
}
