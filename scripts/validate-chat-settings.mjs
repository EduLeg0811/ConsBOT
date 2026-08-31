import { readFile } from "node:fs/promises";
import ts from "typescript";

const path = new URL("../src/lib/chat-settings.ts", import.meta.url);
const rawSource = await readFile(path, "utf8");
const source = rawSource.replace(
  /^import \{ AGENT_SETTINGS_DEFAULT, normalizeAgentSettings, type AgentSettings \} from "@\/agent";$/m,
  `const AGENT_SETTINGS_DEFAULT = {
    enabled: false,
    prompt: "",
    presentation: "classic",
  };
  const normalizeAgentSettings = (value) => ({
    enabled: typeof value?.enabled === "boolean" ? value.enabled : AGENT_SETTINGS_DEFAULT.enabled,
    prompt: typeof value?.prompt === "string" ? value.prompt : "",
    presentation: value?.presentation === "classic" ? "classic" : "citations",
  });`,
);

const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const settingsModule = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);

const moduleMarkers = ["## Núcleo comum", "## Formato:", "## Perfil:", "## Aprofundamento:"];
let combinations = 0;

for (const profile of settingsModule.PROFILES) {
  for (const depth of settingsModule.RESPONSE_DEPTHS) {
    for (const format of settingsModule.RESPONSE_FORMATS) {
      const settings = {
        ...settingsModule.settingsForProfile(profile.id),
        responseDepth: depth.id,
        responseFormat: format.id,
      };
      const prompt = settingsModule.buildSystemPrompt(settings);

      for (const marker of moduleMarkers) {
        const occurrences = prompt.split(marker).length - 1;
        if (occurrences !== 1) {
          throw new Error(
            `${profile.id}/${depth.id}/${format.id}: ${marker} apareceu ${occurrences} vez(es)`,
          );
        }
      }

      if (settingsModule.verbosityForDepth(depth.id) !== depth.verbosity) {
        throw new Error(`${depth.id}: verbosity derivada incorretamente`);
      }
      combinations += 1;
    }
  }
}

const customised = {
  ...settingsModule.settingsForProfile("tutor"),
  depthWordTargets: { synthetic: 300, balanced: 800, complete: 1800 },
  additionalInstructions: "Teste administrativo",
};
const changedProfile = settingsModule.withProfile(customised, "escritor");
if (
  changedProfile.depthWordTargets.complete !== 1800 ||
  changedProfile.additionalInstructions !== "Teste administrativo"
) {
  throw new Error("A troca de perfil não preservou os ajustes administrativos da sessão");
}

console.log(`${combinations} combinações modulares validadas com sucesso.`);
