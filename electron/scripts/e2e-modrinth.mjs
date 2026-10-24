// Essai RÉEL sur la CI Windows (lot E7) : recherche sur Modrinth, création d'un WePack (Sodium + dépendances)
// puis modification (ajout d'un mod, retrait d'un autre), dans un dossier jetable, avec tous les garde-fous
// de ReLaunch (API et CDN Modrinth seulement, SHA-512 vérifié). Rien n'est écrit ailleurs.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dist = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "dist", "src", "main", "modpacks");
const m = require(path.join(dist, "modrinth.js"));
const UA = "Rexidelamort/WeCraft-Launcher (ReLaunch, essai CI)";
const fetch = m.modrinthFetcher(UA);
const download = m.modDownloader(UA);
const root = mkdtempSync(path.join(process.env.RUNNER_TEMP || tmpdir(), "relaunch-mp-"));
const folder = path.join(root, "Essai");
let ok = true;
const check = (cond, msg) => {
  console.log(`${cond ? "OK  " : "ÉCHEC"} ${msg}`);
  if (!cond) ok = false;
};
try {
  const s = await fetch("/search", m.searchParams("sodium", "1.20.1", "Fabric"));
  const hit = s.hits.find((h) => h.slug === "sodium");
  check(!!hit, `recherche : ${s.total_hits} résultats, Sodium trouvé`);
  const lithium = (await fetch("/search", m.searchParams("lithium", "1.20.1", "Fabric"))).hits.find((h) => h.slug === "lithium");
  const r = await m.buildModpack(folder, "Essai", "1.20.1", "Fabric", [{ project_id: hit.project_id, title: hit.title }], (d, t, msg) => t && console.log(`  ${d}/${t} ${msg}`), fetch, download);
  check(r.count >= 1, `création : ${r.count} mods (${r.deps} dépendances), avertissements : ${JSON.stringify(r.warnings)}`);
  const meta = JSON.parse(readFileSync(path.join(folder, "wecraft_modpack.json"), "utf8"));
  check(readdirSync(path.join(folder, "mods")).length === r.count, "fichiers présents = modpack");
  const e = await m.applyModpackEdit(folder, meta, [{ project_id: lithium.project_id, title: lithium.title }], () => undefined, fetch, download);
  check(e.added === 1 && e.removed === 1, `modification : ${JSON.stringify(e)}`);
  const mods = await m.listPackMods(folder, folder);
  check(mods.some((x) => /lithium/i.test(x.name)) && !mods.some((x) => /sodium/i.test(x.name)), `liste : ${mods.map((x) => x.name).join(", ")}`);
  check(existsSync(path.join(folder, "wecraft.json")), "wecraft.json écrit");
} catch (e) {
  check(false, e && e.stack ? e.stack : String(e));
} finally {
  rmSync(root, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
