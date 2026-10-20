// Compatibilité croisée avec la VRAIE version Python (wecraft_launcher.py, chargé par tests/_harness.py
// dans un bac à sable) : chaque version doit lire ce que l'autre écrit, et reconnaître ses copies.
// Ignoré si Python n'est pas installé, sauf en CI où son absence fait échouer les tests.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { JsonStore } from "../src/main/storage/jsonStore";
import { tempDir } from "./helpers";

const REPO = path.join(__dirname, "..", "..", "..");
const PY = ["python3", "python"].find((cmd) => spawnSync(cmd, ["--version"]).status === 0);

function py(code: string, ...args: string[]): string {
  const prelude = [
    "import json, sys",
    `sys.path.insert(0, ${JSON.stringify(path.join(REPO, "tests"))})`,
    "from _harness import load",
    "wl = load()",
  ].join("\n");
  const r = spawnSync(PY!, ["-c", `${prelude}\n${code}`, ...args], { cwd: REPO, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`Python : ${r.stderr}`);
  return r.stdout.trim();
}

// En CI, Python est obligatoire : ces tests ne doivent jamais être ignorés en silence.
if (!PY && process.env["CI"]) throw new Error("Python est introuvable : tests de compatibilité impossibles en CI");
const skip = PY ? false : "Python absent";

test("Python lit les réglages écrits par Electron (accents, objets imbriqués)", { skip }, async () => {
  const { dir, cleanup } = tempDir("compat1");
  try {
    const f = path.join(dir, "launcher_config.json");
    writeFileSync(f, JSON.stringify({ ram: 6, instance_name: "Créa été ✨" }), "utf8");
    await new JsonStore().update(f, (d) => ({ ...d, theme: "glace", meta: { a: [1, 2] } }));
    const out = JSON.parse(py("print(json.dumps(wl.read_json_file(sys.argv[1])))", f));
    assert.deepEqual(out, { ram: 6, instance_name: "Créa été ✨", theme: "glace", meta: { a: [1, 2] } });
  } finally {
    cleanup();
  }
});

test("Electron lit les réglages écrits par Python (atomic_write_text, ensure_ascii=False)", { skip }, async () => {
  const { dir, cleanup } = tempDir("compat2");
  try {
    const f = path.join(dir, "launcher_config.json");
    py("wl.atomic_write_text(sys.argv[1], json.dumps({'theme': 'aurore', 'nom': 'Créa été'}, ensure_ascii=False))", f);
    assert.deepEqual(await new JsonStore().read(f), { theme: "aurore", nom: "Créa été" });
  } finally {
    cleanup();
  }
});

test("une copie mise de côté par l'une est reconnue par l'autre (pas de doublon)", { skip }, async () => {
  const { dir, cleanup } = tempDir("compat3");
  try {
    const a = path.join(dir, "a.json");
    writeFileSync(a, '{"cassé": ', "utf8");
    py("wl.read_json_file(sys.argv[1])", a); // Python met de côté
    await new JsonStore().read(a); // Electron ne doit pas refaire de copie
    assert.equal(readdirSync(dir).filter((n) => n.startsWith("a.json.invalide-")).length, 1);

    const b = path.join(dir, "b.json");
    writeFileSync(b, "[1, 2]", "utf8");
    await new JsonStore().read(b); // Electron met de côté
    py("wl.read_json_file(sys.argv[1])", b); // Python ne doit pas refaire de copie
    const copies = readdirSync(dir).filter((n) => n.startsWith("b.json.invalide-"));
    assert.equal(copies.length, 1);
    assert.equal(readFileSync(path.join(dir, copies[0]!), "utf8"), "[1, 2]");
  } finally {
    cleanup();
  }
});
