// Essai RÉEL sur la CI Windows (réseau, serveurs officiels) : installe dans un dossier jetable une version
// de base, Fabric, Forge et NeoForge, avec le Java de Mojang, en passant par tous les garde-fous de ReLaunch.
// Les ressources (sons, textures, plusieurs centaines de Mo) ne sont pas téléchargées ici : elles sont
// couvertes par les tests avec réseau simulé. Rien n'est écrit en dehors du dossier jetable.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dist = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "dist", "src", "main", "install");
const { loadXmcl } = require(path.join(dist, "xmcl.js"));
const { installSimpleLoader } = require(path.join(dist, "loaders.js"));
const { installForgeLike } = require(path.join(dist, "forge.js"));

const mc = mkdtempSync(path.join(process.env.RUNNER_TEMP || tmpdir(), "relaunch-e2e-"));
const xmcl = loadXmcl();
const opts = { xmcl, withAssets: false, onNote: (n) => console.log("  note :", n) };
const results = [];
async function step(name, fn) {
  const t = Date.now();
  try {
    const r = await fn();
    results.push(`OK   ${name} -> ${r.id} (${Math.round((Date.now() - t) / 1000)} s)`);
  } catch (e) {
    results.push(`ÉCHEC ${name} : ${e && e.stack ? e.stack : e}`);
  }
  console.log(results[results.length - 1]);
}
try {
  await step("Fabric 1.20.1 (+ Minecraft 1.20.1)", () => installSimpleLoader(mc, "Fabric", "1.20.1", null, opts));
  await step("Quilt 1.20.1", () => installSimpleLoader(mc, "Quilt", "1.20.1", null, opts));
  await step("Forge 1.20.1 (recommandée, Java de Mojang, processeurs)", () => installForgeLike(mc, "Forge", "1.20.1", null, opts));
  await step("NeoForge 1.21.1", () => installForgeLike(mc, "NeoForge", "1.21.1", null, opts));
  // Seconde passe : tout est déjà présent et vérifié
  await step("Forge 1.20.1 (seconde passe)", () => installForgeLike(mc, "Forge", "1.20.1", null, opts));
} finally {
  rmSync(mc, { recursive: true, force: true });
}
const failed = results.filter((r) => r.startsWith("ÉCHEC"));
console.log(`\n${results.length - failed.length}/${results.length} réussies`);
process.exit(failed.length ? 1 : 0);
