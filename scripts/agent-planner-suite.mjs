/**
 * Suíte do planejador — roda os exemplos das fichas contra o classificador
 * REAL e mede acerto, estabilidade e entrega escolhida.
 *
 *   npm run agent:suite                  → 3 execuções por caso
 *   npm run agent:suite -- --runs 1      → passada rápida
 *   npm run agent:suite -- --ficha 4     → só uma ficha (1..4 ou geral)
 *
 * Precisa do Main-Server no ar (VITE_MAIN_SERVER_URL ou 127.0.0.1:8000).
 *
 * Por que existe: as regras determinísticas já têm suíte, mas elas são o
 * plano B. O planejador é o caminho principal, é não-determinístico, e o
 * prompt dele é GERADO do registro de ferramentas — mexer no `describe` de
 * uma ferramenta muda o comportamento das outras. Sem isto, a regressão só
 * aparece no uso.
 *
 * O prompt e o schema vêm do próprio módulo, empacotados na hora: a suíte
 * mede o que o app manda, não uma cópia que envelhece.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { rolldown } from "rolldown";

import { CASES } from "./agent-planner-cases.mjs";

const ROOT = process.cwd();
const API_BASE = (process.env.VITE_MAIN_SERVER_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const MODEL = "gpt-5.6-luna";
/** Chamadas em paralelo. Baixo de propósito: a suíte não deve competir com o
 * uso normal do servidor nem estourar limite de taxa. */
const CONCURRENCY = 4;

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const RUNS = Number(arg("runs", 3));
const FICHA = arg("ficha", "");

/** Empacota prompt e schema do módulo, resolvendo o alias `@/` e o
 * `import.meta.env` que o Vite injeta em produção. */
async function loadPlanner() {
  const dir = await mkdtemp(join(tmpdir(), "agent-suite-"));
  const entry = join(dir, "entry.ts");
  const out = join(dir, "planner.mjs");

  await writeFile(
    entry,
    [
      'export { agentInstructionsFor } from "@/agent/planner/prompt";',
      'export { AGENT_PLANNER_SCHEMA } from "@/agent/planner/schema";',
      'export { AGENT_TOOLS } from "@/agent/tools/registry";',
    ].join("\n"),
  );

  const bundle = await rolldown({
    input: entry,
    resolve: { alias: { "@": join(ROOT, "src") } },
    plugins: [
      {
        // O Vite injeta import.meta.env no build; fora dele a expressão é
        // undefined e o módulo quebra ao ler VITE_*. Trocar por {} deixa
        // tudo cair no padrão, que é o que a suíte quer medir.
        name: "vite-env-shim",
        transform(code) {
          return code.includes("import.meta.env")
            ? code.replaceAll("import.meta.env", "({})")
            : null;
        },
      },
    ],
    platform: "node",
  });
  await bundle.write({ file: out, format: "esm" });
  await bundle.close();

  const planner = await import(pathToFileURL(out).href);
  return { planner, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

async function classify(instructions, schema, question) {
  const response = await fetch(`${API_BASE}/api/llm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: `${instructions}\n\n---\n${question}` }],
      model: MODEL,
      reasoningEffort: "none",
      verbosity: "low",
      responseSchema: schema,
      responseSchemaName: "agent_intent",
    }),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const { content } = await response.json();
  const parsed = JSON.parse(content ?? "{}");
  const actions = Array.isArray(parsed.actions) ? parsed.actions : [];

  return {
    intents: actions.map((a) => a.intent).filter(Boolean),
    delivery: parsed.delivery ?? "—",
    args: actions.map((a) => ({ term: a.term, field: a.field || "", book: a.book || "" })),
  };
}

const same = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

async function pool(items, worker) {
  const results = new Array(items.length);
  let next = 0;

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index], index);
      }
    }),
  );

  return results;
}

function pct(part, total) {
  return total === 0 ? "—" : `${Math.round((part / total) * 100)}%`;
}

async function main() {
  const health = await fetch(`${API_BASE}/api/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`Main-Server fora do ar em ${API_BASE}. Suba com: npm run dev:silent`);
    process.exit(1);
  }

  const { planner, cleanup } = await loadPlanner();
  const instructions = planner.agentInstructionsFor(false);
  const schema = planner.AGENT_PLANNER_SCHEMA;

  const cases = FICHA ? CASES.filter((c) => String(c.ficha) === FICHA) : CASES;
  console.log(
    `${cases.length} casos × ${RUNS} execuções = ${cases.length * RUNS} chamadas ao ${MODEL}`,
  );
  console.log(`${planner.AGENT_TOOLS.length} ferramentas no registro · ${API_BASE}\n`);

  const started = Date.now();
  const rows = await pool(cases, async (testCase) => {
    const runs = [];
    for (let i = 0; i < RUNS; i += 1) {
      try {
        runs.push(await classify(instructions, schema, testCase.q));
      } catch (error) {
        runs.push({ intents: ["<erro>"], delivery: "—", args: [], error: String(error.message) });
      }
    }

    const hits = runs.filter((run) => same(run.intents, testCase.expect)).length;
    return { testCase, runs, hits };
  });

  const elapsed = ((Date.now() - started) / 1000).toFixed(0);

  /* ── por caso ── */
  let lastFicha = null;
  for (const { testCase, runs, hits } of rows) {
    if (testCase.ficha !== lastFicha) {
      lastFicha = testCase.ficha;
      const title = testCase.ficha === "geral" ? "GERAL · uso comum" : `FICHA ${testCase.ficha}`;
      console.log(`\n── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`);
    }

    const status = hits === RUNS ? "PASS" : hits === 0 ? "FAIL" : "VARIA";
    const observed = runs[0].intents.join("+") || "—";
    const deliveries = [...new Set(runs.map((r) => r.delivery))].join("/");
    const flags = [];

    // Parâmetro esperado que não veio é falha silenciosa: o botão aparece,
    // mas buscando na obra errada ou no campo errado.
    if (testCase.book && !runs.every((r) => r.args.some((a) => a.book === testCase.book))) {
      flags.push(`book≠${testCase.book}`);
    }
    if (testCase.field && !runs.every((r) => r.args.some((a) => a.field === testCase.field))) {
      flags.push(`field≠${testCase.field}`);
    }

    console.log(
      `${status.padEnd(6)}${`${hits}/${RUNS}`.padEnd(5)}${observed.padEnd(34)}${deliveries.padEnd(14)}${flags.join(" ")}  ${testCase.q}`,
    );

    if (status !== "PASS")
      console.log(`${" ".repeat(11)}esperado: ${testCase.expect.join("+") || "—"}`);
  }

  /* ── resumo ── */
  const stable = rows.filter((r) => r.hits === RUNS).length;
  const partial = rows.filter((r) => r.hits > 0 && r.hits < RUNS).length;
  const failed = rows.filter((r) => r.hits === 0).length;

  console.log(`\n${"═".repeat(64)}`);
  console.log(`${stable} estáveis · ${partial} instáveis · ${failed} falhas   (${elapsed}s)`);

  for (const ficha of [1, 2, 3, 4, "geral"]) {
    const group = rows.filter((r) => r.testCase.ficha === ficha);
    if (group.length === 0) continue;
    const ok = group.filter((r) => r.hits === RUNS).length;
    const label = ficha === "geral" ? "geral" : `ficha ${ficha}`;
    console.log(`  ${String(label).padEnd(10)} ${ok}/${group.length}  ${pct(ok, group.length)}`);
  }

  /* ── risco de latência: com que frequência o planejador pede `context` ──
   * Só importa no modo «Alimentar resposta», onde `context` significa buscar
   * ANTES de responder. Pedir context onde não há ação é inofensivo; pedir em
   * pergunta comum COM ação é o que atrasa a conversa à toa. */
  const wanted = rows.flatMap((r) => r.runs.filter((run) => run.intents.length > 0));
  const asContext = wanted.filter((run) => run.delivery === "context" || run.delivery === "both");
  const noise = rows
    .filter((r) => r.testCase.expect.length === 0)
    .flatMap((r) => r.runs)
    .filter((run) => run.intents.length > 0);

  console.log(`\nEntrega, quando há ação:`);
  for (const kind of ["card", "context", "both"]) {
    const n = wanted.filter((run) => run.delivery === kind).length;
    console.log(`  ${kind.padEnd(10)} ${String(n).padStart(3)}  ${pct(n, wanted.length)}`);
  }
  console.log(
    `  → ${pct(asContext.length, wanted.length)} das ações atrasariam a resposta no modo «Alimentar resposta»`,
  );
  console.log(
    `\nAções indevidas (casos que não deviam disparar): ${noise.length} em ${rows.filter((r) => r.testCase.expect.length === 0).length * RUNS} execuções`,
  );

  await cleanup();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
