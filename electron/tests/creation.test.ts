// Grosse mise à jour : création « Sur mesure », réglages d'instance, icônes et fonds (instances_meta.json),
// liste des versions de loader. Comparés à la vraie version Python quand c'est possible.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { cleanCreate, createCustomInstance, wecraftJson } from "../src/main/instances/create";
import { instancesDir, parseIconMeta } from "../src/main/instances/detect";
import { InstanceService } from "../src/main/instances/service";
import { loaderVersionList } from "../src/main/install/loaderList";
import { cleanEdit, cleanIcon } from "../src/main/ipcLook";
import { JsonStore } from "../src/main/storage/jsonStore";
import { tempDir } from "./helpers";

const REPO = path.join(__dirname, "..", "..", "..");
const PY = ["python3", "python"].find((cmd) => spawnSync(cmd, ["--version"]).status === 0);

test("création : valeurs vérifiées, Vanilla sans loader, nom long coupé", () => {
  assert.deepEqual(cleanCreate({ name: "  Mon pack  ", mc: "1.21.1", loader: "Fabric", loaderVersion: null }), { name: "Mon pack", mc: "1.21.1", loader: "Fabric", loaderVersion: null });
  assert.deepEqual(cleanCreate({ name: "V", mc: "1.20.1", loader: "Vanilla", loaderVersion: "0.1" }), { name: "V", mc: "1.20.1", loader: "Vanilla", loaderVersion: null });
  assert.equal(cleanCreate({ name: "x".repeat(99), mc: "1.21", loader: "Quilt" })!.name.length, 60);
  for (const bad of [
    { name: "", mc: "1.21", loader: "Fabric" },
    { name: "a", mc: "../1.21", loader: "Fabric" },
    { name: "a", mc: "1.21 ", loader: "Fabric" },
    { name: "a", mc: "1.21", loader: "OptiFine" },
    { name: "a", mc: "1.21", loader: "Fabric", loaderVersion: "../x" },
    { name: "a", mc: "1.21", loader: "Fabric", loaderVersion: 5 },
    null,
  ])
    assert.equal(cleanCreate(bad), null, JSON.stringify(bad));
});

test("création : dossier + wecraft.json lus EXACTEMENT comme la version Python ; dossier existant refusé sans rien toucher", { skip: PY ? false : "Python absent" }, async () => {
  const { dir, cleanup } = tempDir("creation");
  try {
    const inst = path.join(dir, "instances");
    const cases = [
      { name: "Survie : FR", mc: "1.21.1", loader: "Fabric" as const, loaderVersion: "0.16.9" },
      { name: "Vanilla 1.20.1", mc: "1.20.1", loader: "Vanilla" as const, loaderVersion: null },
      { name: "Forge pack", mc: "1.20.1", loader: "Forge" as const, loaderVersion: null },
    ];
    const folders: string[] = [];
    for (const c of cases) {
      const r = await createCustomInstance(inst, c);
      assert.ok(r.ok);
      folders.push(r.folder);
      assert.ok(existsSync(path.join(r.folder, "mods")));
    }
    assert.equal(path.basename(folders[0]!), "Survie  FR", "caractères interdits retirés du nom du dossier");
    assert.deepEqual(JSON.parse(readFileSync(path.join(folders[0]!, "wecraft.json"), "utf8")), wecraftJson(cases[0]!, "Survie  FR"));
    // la vraie fonction Python lit ces dossiers
    const code = [
      "import json, sys",
      `sys.path.insert(0, ${JSON.stringify(path.join(REPO, "tests"))})`,
      "from _harness import load",
      "from pathlib import Path",
      "wl = load()",
      "out = [wl.read_local_instance(Path(f)) for f in json.loads(sys.argv[1])]",
      "print(json.dumps([[i['name'], i['version'], i['loader'], i['loader_version']] for i in out]))",
    ].join("\n");
    const r = spawnSync(PY!, ["-c", code, JSON.stringify(folders)], { cwd: REPO, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout.trim().split("\n").pop()!), [
      ["Survie : FR", "1.21.1", "Fabric", "0.16.9"],
      ["Vanilla 1.20.1", "1.20.1", null, null],
      ["Forge pack", "1.20.1", "Forge", null],
    ]);
    // même nom : refus, le dossier existant n'est pas modifié
    writeFileSync(path.join(folders[1]!, "mods", "mien.jar"), "x");
    assert.deepEqual(await createCustomInstance(inst, cases[1]!), { ok: false, reason: "exists", name: "Vanilla 1.20.1" });
    assert.equal(readFileSync(path.join(folders[1]!, "mods", "mien.jar"), "utf8"), "x");
  } finally {
    cleanup();
  }
});

test("réglages d'instance et apparence : seul instances_meta.json change, clés de la version Python gardées", async () => {
  const { dir, cleanup } = tempDir("reglages");
  try {
    const env = { platform: process.platform, env: { APPDATA: path.join(dir, "AppData"), HOME: dir }, home: dir };
    const r = await createCustomInstance(instancesDir(env), { name: "Pack", mc: "1.20.1", loader: "Forge", loaderVersion: "47.2.0" });
    assert.ok(r.ok);
    const store = new JsonStore();
    const svc = new InstanceService(store, env);
    const list = await svc.list(true);
    const id = list.instances.find((i) => i.name === "Pack")!.id;
    await svc.setFavorite(id, true);
    const wj = readFileSync(path.join(r.folder, "wecraft.json"), "utf8");
    // version Python : configure_instance (version + loader + loader_version None) puis nom
    assert.deepEqual(await svc.edit(id, { name: "Mon beau pack", mc: "1.21.1", loader: "NeoForge", loaderVersion: null, ram: 6 }), { ok: true });
    assert.deepEqual(await svc.setLook(id, { icon: { c: ["#fb7185", "#be185d"], sym: "epee" }, background: "a".repeat(64) + ".jpg" }), { ok: true });
    const meta = JSON.parse(readFileSync(svc.metaFile, "utf8")) as Record<string, Record<string, unknown>>;
    const entry = Object.values(meta)[0]!;
    assert.deepEqual(entry, { fav: true, version: "1.21.1", loader: "NeoForge", loader_version: null, name: "Mon beau pack", ram: 6, icon: { c: ["#fb7185", "#be185d"], sym: "epee" }, background: "a".repeat(64) + ".jpg" });
    assert.equal(readFileSync(path.join(r.folder, "wecraft.json"), "utf8"), wj, "le dossier de l'instance n'est pas modifié");
    const v = (await svc.list()).instances.find((i) => i.id === id)!;
    assert.deepEqual([v.name, v.version, v.loader, v.loaderVersion, v.ram], ["Mon beau pack", "1.21.1", "NeoForge", null, 6]);
    assert.deepEqual(v.icon, { kind: "gen", c: ["#fb7185", "#be185d"], sym: "epee" });
    assert.equal(v.background, `app://wecraft/user/backgrounds/${"a".repeat(64)}.jpg`);
    // Vanilla, nom d'origine, RAM par défaut : clés retirées ; apparence remise par défaut
    await svc.edit(id, { name: "", mc: "1.21.1", loader: "Vanilla", loaderVersion: "x", ram: null });
    await svc.setLook(id, { icon: null, background: null });
    const e2 = Object.values(JSON.parse(readFileSync(svc.metaFile, "utf8")) as Record<string, Record<string, unknown>>)[0]!;
    assert.deepEqual(e2, { fav: true, version: "1.21.1", loader: "Vanilla", loader_version: null });
    const v2 = (await svc.list()).instances.find((i) => i.id === id)!;
    assert.deepEqual([v2.name, v2.loader, v2.icon, v2.background], ["Pack", null, null, null]);
    assert.deepEqual(await svc.edit("inconnu", { name: "", mc: "1.21", loader: "Vanilla", loaderVersion: null, ram: null }), { ok: false, reason: "invalid" });
  } finally {
    cleanup();
  }
});

test("icône et réglages reçus de l'interface : seules des valeurs sûres passent", () => {
  assert.deepEqual(cleanIcon({ c: ["#000000", "#FFFFFF"], sym: "pioche" }), { c: ["#000000", "#FFFFFF"], sym: "pioche" });
  assert.deepEqual(cleanIcon({ file: "b".repeat(64) + ".png" }), { file: "b".repeat(64) + ".png" });
  assert.equal(cleanIcon(null), null);
  for (const bad of [{ file: "../x.png" }, { file: "C:\\x.png" }, { c: ["red", "#000000"] }, { c: ["#000000"] }, { c: ["#000000", "#000000"], sym: "<b>" }, "x", 3])
    assert.equal(cleanIcon(bad), undefined, JSON.stringify(bad));
  assert.equal(parseIconMeta({ c: ["#000000", "#111111"], sym: "a".repeat(40) }), null);
  assert.deepEqual(cleanEdit({ name: " A ", mc: "1.20.1", loader: "Fabric", loaderVersion: null, ram: 8 }), { name: "A", mc: "1.20.1", loader: "Fabric", loaderVersion: null, ram: 8 });
  assert.deepEqual(cleanEdit({ name: "", mc: "1.20.1", loader: "Vanilla", loaderVersion: null, ram: null }), { name: "", mc: "1.20.1", loader: "Vanilla", loaderVersion: null, ram: null });
  for (const bad of [{ name: "A", mc: "1.20.1", loader: "Fabric", ram: 99 }, { name: "A", mc: "x/y", loader: "Fabric", ram: null }, { name: 3, mc: "1.20.1", loader: "Fabric", ram: null }])
    assert.equal(cleanEdit(bad), null, JSON.stringify(bad));
});

test("versions de loader : combinaisons impossibles expliquées, formes courtes pour Forge, la plus récente d'abord", async () => {
  const simple = async () => [
    { version: "0.17.0-beta.1", stable: false },
    { version: "0.16.9", stable: true },
    { version: "0.16.8", stable: true },
  ];
  const r = await loaderVersionList("Fabric", "1.21.1", {}, { simple });
  assert.ok(r.ok && r.versions[0]!.version === "0.17.0-beta.1" && r.versions.find((v) => v.recommended)!.version === "0.16.9");
  const forge = async () => ({ available: ["1.20.1-47.1.0", "1.20.1-47.2.0", "1.20.1-47.3.0-beta"], preferred: "1.20.1-47.2.0" });
  const f = await loaderVersionList("Forge", "1.20.1", {}, { forge });
  assert.ok(f.ok);
  assert.deepEqual(
    f.versions.map((v) => [v.version, v.stable, v.recommended]),
    [
      ["47.3.0-beta", false, false],
      ["47.2.0", true, true],
      ["47.1.0", true, false],
    ],
  );
  assert.deepEqual(await loaderVersionList("Forge", "1.12.2", {}, { forge }), { ok: false, message: "Forge pour Minecraft 1.12.2 (avant 1.13) n'est pas pris en charge par ReLaunch." });
  assert.match((await loaderVersionList("NeoForge", "1.19.2", {}, { forge })) .ok ? "" : "NeoForge n'existe pas", /n'existe pas/);
  assert.deepEqual(await loaderVersionList("Quilt", "1.21.1", {}, { simple: async () => [] }), { ok: false, message: "Quilt n'existe pas pour Minecraft 1.21.1." });
  const off = await loaderVersionList("Fabric", "1.21.1", {}, { simple: async () => { throw new TypeError("fetch failed"); } });
  assert.ok(!off.ok && /inaccessible/.test(off.message));
});
