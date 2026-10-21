// Détection des instances (lot E2) : formats, réglages par instance, et comparaison avec la VRAIE version
// Python sur un même jeu d'instances de test (critère de validation du lot E2).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { applyMeta, detectExternal, instancesDir, isInside, launcherDirs, LocalScanner, metaKey, sortInstances } from "../src/main/instances/detect";
import { parseLoader, parseRam, readLocalInstance } from "../src/main/instances/formats";
import { InstanceService } from "../src/main/instances/service";
import { JsonStore } from "../src/main/storage/jsonStore";
import type { PathEnv } from "../src/main/paths";
import { tempDir } from "./helpers";

const REPO = path.join(__dirname, "..", "..", "..");
const PY = ["python3", "python"].find((cmd) => spawnSync(cmd, ["--version"]).status === 0);
if (!PY && process.env["CI"]) throw new Error("Python est introuvable : comparaison impossible en CI");

function envFor(home: string): PathEnv {
  return { platform: process.platform, env: { APPDATA: path.join(home, "AppData", "Roaming") }, home };
}

function w(file: string, content: string | object): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content), "utf8");
}

/** Jeu d'instances de test couvrant les quatre sources et les cas abîmés. */
async function buildWorld(home: string): Promise<PathEnv> {
  const e = envFor(home);
  const local = instancesDir(e);
  w(path.join(local, "Pack Prism", "mmc-pack.json"), { components: [{ uid: "net.minecraft", version: "1.20.1" }, { uid: "net.fabricmc.fabric-loader", version: "0.16.5" }] });
  mkdirSync(path.join(local, "Pack Prism", ".minecraft"), { recursive: true });
  w(path.join(local, "Pack CF", "minecraftinstance.json"), { name: "Nom CF", gameVersion: "1.19.2", baseModLoader: { name: "forge-43.2.0" } });
  w(path.join(local, "Export CF", "manifest.json"), { minecraft: { version: "1.21.1", modLoaders: [{ id: "neoforge-21.1.5" }, { id: "fabric-1", primary: true }] } });
  w(path.join(local, "Export MR", "modrinth.index.json"), { dependencies: { minecraft: "1.20.4", "quilt-loader": "0.26.0" } });
  w(path.join(local, "Perso", "wecraft.json"), { name: "Mon pack", version: "1.18.2", loader: "Forge", loader_version: "40.2.0", ram: "8" });
  w(path.join(local, "Abimé", "minecraftinstance.json"), "{pas du json");
  w(path.join(local, "Vanilla", "wecraft.json"), { loader: "Vanilla", loader_version: "x", ram: 99 });
  mkdirSync(path.join(local, "_ignoré"), { recursive: true });
  mkdirSync(path.join(local, ".caché"), { recursive: true });

  const d = launcherDirs(e);
  const cf = d.curseforge[0]!;
  w(path.join(cf, "Create", "minecraftinstance.json"), { name: "Create Above", baseModLoader: { name: "fabric-0.15.7-1.20.1", minecraftVersion: "1.20.1" } });
  w(path.join(cf, "Sans fichier", "mods", "a.jar"), "x");
  mkdirSync(path.join(cf, "Vide"), { recursive: true });
  w(path.join(d.curseforge[1]!, "Doc", "minecraftinstance.json"), { gameVersion: "1.12.2", baseModLoader: null });

  w(path.join(d.prism, "instances", "Inst1", "instance.cfg"), "[General]\r\nname=Belle instance\r\n");
  w(path.join(d.prism, "instances", "Inst1", "mmc-pack.json"), { components: [{ uid: "net.minecraft", version: "1.20.1" }, { uid: "net.neoforged", version: "47.1.0" }] });
  mkdirSync(path.join(d.prism, "instances", "Inst1", "minecraft"), { recursive: true });
  mkdirSync(path.join(d.prism, "instances", "SansJeu"), { recursive: true });
  w(path.join(d.prism, "instances", "Abimée", "mmc-pack.json"), "[");
  mkdirSync(path.join(d.prism, "instances", "Abimée", ".minecraft"), { recursive: true });

  const profiles = path.join(d.modrinth, "profiles");
  mkdirSync(path.join(profiles, "MonProfil"), { recursive: true });
  mkdirSync(path.join(profiles, "Autre"), { recursive: true });
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path.join(d.modrinth, "app.db"));
  db.exec("CREATE TABLE profiles (path TEXT, name TEXT, game_version TEXT, mod_loader TEXT, mod_loader_version TEXT)");
  const ins = db.prepare("INSERT INTO profiles VALUES (?, ?, ?, ?, ?)");
  ins.run("MonProfil", "Mon profil", "1.21", "fabric", "0.16.0");
  ins.run("Autre", "", "1.20.1", "vanilla", null);
  ins.run("../../evil", "Hors du dossier", "1.20", "forge", "1");
  ins.run("Absent", "Disparu", "1.20", "forge", "1");
  db.close();

  w(path.join(path.dirname(local), "instances_meta.json"), {
    [metaKey(path.join(local, "Perso"))]: { name: "  Renommé  ", fav: true, ram: "huit" },
    [metaKey(path.join(profiles, "MonProfil"))]: { hidden: true, loader: "Vanilla", version: "1.21.1" },
    [metaKey(path.join(cf, "Create"))]: "pas un objet",
  });
  return e;
}

interface Row {
  source: string; name: string; display: string; folder: string; path: string;
  version: string | null; loader: string | null; loader_version: string | null; ram: number | null; hidden: boolean; fav: boolean;
}

async function tsList(e: PathEnv): Promise<Row[]> {
  const local = await new LocalScanner(instancesDir(e)).scan();
  const ext = await detectExternal(e);
  const metaFile = path.join(path.dirname(instancesDir(e)), "instances_meta.json");
  const { readFileSync } = await import("node:fs");
  const meta = JSON.parse(readFileSync(metaFile, "utf8")) as Record<string, unknown>;
  return sortInstances(applyMeta([...local, ...ext], meta)).map((i) => ({
    source: i.source, name: i.name, display: i.display, folder: i.folder, path: i.path, version: i.version,
    loader: i.loader, loader_version: i.loaderVersion, ram: i.ram, hidden: i.hidden, fav: i.fav,
  }));
}

function pyList(e: PathEnv): Row[] {
  const code = [
    "import json, sys, os",
    `sys.path.insert(0, ${JSON.stringify(path.join(REPO, "tests"))})`,
    "from pathlib import Path",
    "from unittest import mock",
    "from _harness import load",
    "wl = load()",
    "wl.INSTANCES_DIR = Path(sys.argv[1])",
    "wl.META_FILE = Path(sys.argv[2])",
    "wl._QUARANTINED.clear()",
    "with mock.patch.object(Path, 'home', classmethod(lambda cls: Path(sys.argv[3]))):",
    "    insts = wl.apply_meta(wl.scan_instances() + wl.detect_external())",
    "insts.sort(key=lambda i: (wl.SOURCE_ORDER.get(i['source'], 9), i['display'].lower()))",
    "print(json.dumps([{'source': i['source'], 'name': i['name'], 'display': i['display'], 'folder': str(i['folder']),",
    "  'path': str(i['path']), 'version': i['version'], 'loader': i['loader'], 'loader_version': i['loader_version'],",
    "  'ram': i['ram'], 'hidden': i['hidden'], 'fav': i['fav']} for i in insts], ensure_ascii=False))",
  ].join("\n");
  const metaFile = path.join(path.dirname(instancesDir(e)), "instances_meta.json");
  const r = spawnSync(PY!, ["-c", code, instancesDir(e), metaFile, e.home], {
    cwd: REPO,
    encoding: "utf8",
    env: { ...process.env, APPDATA: e.env["APPDATA"], HOME: e.home, USERPROFILE: e.home, PYTHONIOENCODING: "utf-8" },
  });
  if (r.status !== 0) throw new Error(`Python : ${r.stderr}`);
  return JSON.parse(r.stdout) as Row[];
}

test("mêmes instances que la version Python sur un jeu de test (4 sources, cas abîmés, réglages)", { skip: PY ? false : "Python absent" }, async () => {
  const { dir, cleanup } = tempDir("e2-compare");
  try {
    const e = await buildWorld(dir);
    const ts = await tsList(e);
    const py = pyList(e);
    assert.deepEqual(ts, py);
    assert.ok(ts.length >= 13, `trop peu d'instances : ${ts.length}`);
  } finally {
    cleanup();
  }
});

test("résultats attendus (indépendamment de Python)", async () => {
  const { dir, cleanup } = tempDir("e2-expect");
  try {
    const e = await buildWorld(dir);
    const rows = await tsList(e);
    const by = (display: string) => rows.find((r) => r.display === display);
    assert.deepEqual(
      [by("Renommé")?.version, by("Renommé")?.loader, by("Renommé")?.loader_version, by("Renommé")?.ram, by("Renommé")?.fav],
      ["1.18.2", "Forge", "40.2.0", 8, true],
    );
    assert.deepEqual([by("Pack Prism")?.loader, by("Pack Prism")?.path.endsWith(".minecraft")], ["Fabric", true]);
    assert.deepEqual([by("Pack CF")?.version, by("Pack CF")?.loader, by("Pack CF")?.loader_version], ["1.19.2", "Forge", "43.2.0"]);
    assert.deepEqual([by("Export CF")?.loader, by("Export CF")?.loader_version], ["Fabric", "1"]);
    assert.deepEqual([by("Export MR")?.loader, by("Export MR")?.loader_version], ["Quilt", "0.26.0"]);
    assert.deepEqual([by("Vanilla")?.loader, by("Vanilla")?.loader_version, by("Vanilla")?.ram], [null, null, null]);
    assert.equal(by("Abimé")?.version, null);
    assert.deepEqual([by("Create Above")?.version, by("Create Above")?.loader_version], ["1.20.1", "0.15.7"]);
    assert.ok(by("Sans fichier") && !rows.some((r) => r.display === "Vide"));
    assert.deepEqual([by("Belle instance")?.loader, by("Belle instance")?.path.endsWith("minecraft")], ["NeoForge", true]);
    assert.ok(!rows.some((r) => r.display === "SansJeu" || r.display === "Hors du dossier" || r.display === "Disparu"));
    assert.deepEqual([by("Mon profil")?.hidden, by("Mon profil")?.loader, by("Mon profil")?.version], [true, null, "1.21.1"]);
    assert.equal(by("Autre")?.loader, null);
    assert.ok(!rows.some((r) => r.display.startsWith("_") || r.display.startsWith(".")));
    assert.deepEqual([...new Set(rows.map((r) => r.source))], ["WeCraft", "CurseForge", "Modrinth", "Prism"]);
  } finally {
    cleanup();
  }
});

test("Modrinth sans base lisible : simple liste des dossiers", async () => {
  const { dir, cleanup } = tempDir("e2-mr");
  try {
    const e = envFor(dir);
    mkdirSync(path.join(launcherDirs(e).modrinth, "profiles", "P1"), { recursive: true });
    w(path.join(launcherDirs(e).modrinth, "app.db"), "pas une base sqlite");
    const ext = await detectExternal(e);
    assert.deepEqual(ext.map((i) => [i.source, i.name]), [["Modrinth", "P1"]]);
  } finally {
    cleanup();
  }
});

test("cache : un dossier non modifié n'est pas relu ; un dossier supprimé disparaît", async () => {
  const { dir, cleanup } = tempDir("e2-cache");
  try {
    const root = path.join(dir, "instances");
    w(path.join(root, "A", "wecraft.json"), { name: "Avant" });
    const s = new LocalScanner(root);
    assert.equal((await s.scan())[0]?.name, "Avant");
    const { rmSync } = await import("node:fs");
    rmSync(path.join(root, "A"), { recursive: true });
    assert.deepEqual(await s.scan(), []);
  } finally {
    cleanup();
  }
});

test("isInside : liens et « .. » résolus, le dossier racine lui-même refusé", { skip: process.platform === "win32" ? "liens symboliques" : false }, async () => {
  const { dir, cleanup } = tempDir("e2-inside");
  try {
    const root = path.join(dir, "profiles");
    mkdirSync(path.join(root, "a"), { recursive: true });
    mkdirSync(path.join(dir, "dehors"), { recursive: true });
    symlinkSync(path.join(dir, "dehors"), path.join(root, "lien"));
    assert.equal(await isInside(path.join(root, "a"), root), true);
    assert.equal(await isInside(root, root), false);
    assert.equal(await isInside(path.join(root, "a", "..", ".."), root), false);
    assert.equal(await isInside(path.join(root, "lien"), root), false);
  } finally {
    cleanup();
  }
});

test("formats : parse_loader, parse_ram et wecraft.json prioritaire (tests Python portés)", async () => {
  assert.deepEqual(parseLoader("fabric-0.15.7-1.20.1", "1.20.1"), ["Fabric", "0.15.7"]);
  assert.deepEqual(parseLoader("neoforge-20.4.1"), ["NeoForge", "20.4.1"]);
  assert.deepEqual(parseLoader("rien"), [null, null]);
  assert.deepEqual([6, "8", "huit", null, 0, 999, 4.0].map(parseRam), [6, 8, null, null, null, null, 4]);
  const { dir, cleanup } = tempDir("e2-local");
  try {
    w(path.join(dir, "manifest.json"), { minecraft: { version: "1.19.2", modLoaders: [{ id: "forge-43.2.0", primary: true }] } });
    w(path.join(dir, "wecraft.json"), { name: "Mon pack", ram: "beaucoup" });
    const i = await readLocalInstance(dir);
    assert.deepEqual([i.name, i.version, i.loader, i.loaderVersion, i.ram], ["Mon pack", "1.19.2", "Forge", "43.2.0", null]);
  } finally {
    cleanup();
  }
});

test("service : liste sans chemins, favori enregistré seul dans instances_meta.json", async () => {
  const { readFileSync } = await import("node:fs");
  const { dir, cleanup } = tempDir("e2-service");
  try {
    const e = await buildWorld(dir);
    const svc = new InstanceService(new JsonStore(), e);
    const { instances, hidden } = await svc.list();
    assert.equal(hidden, 1);
    assert.ok(instances.every((i) => /^i[0-9a-f]{16}$/.test(i.id) && !JSON.stringify(i).includes(dir)));
    const perso = instances.find((i) => i.name === "Renommé")!;
    const before = JSON.parse(readFileSync(svc.metaFile, "utf8"));
    assert.deepEqual(await svc.setFavorite(perso.id, false), { ok: true });
    const after = JSON.parse(readFileSync(svc.metaFile, "utf8"));
    const key = metaKey(path.join(instancesDir(e), "Perso"));
    assert.deepEqual(after[key], { name: "  Renommé  ", ram: "huit" }); // seule la clé « fav » a changé
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
    const create = instances.find((i) => i.name === "Create Above")!;
    assert.deepEqual(await svc.setFavorite(create.id, true), { ok: true });
    assert.deepEqual(JSON.parse(readFileSync(svc.metaFile, "utf8"))[metaKey(path.join(launcherDirs(e).curseforge[0]!, "Create"))], { fav: true });
    assert.deepEqual(await svc.setFavorite("i0000000000000000", true), { ok: false, reason: "invalid" });
    assert.deepEqual(await svc.setFavorite(perso.id, "oui"), { ok: false, reason: "invalid" });
    assert.deepEqual(await svc.setFavorite("../../etc", true), { ok: false, reason: "invalid" });

    // Lot E4 : RAM de l'instance mise à jour seulement si elle en avait une (start_instance en Python)
    assert.equal(perso.ram, 8);
    await svc.rememberRam(perso.id, 6);
    assert.deepEqual(JSON.parse(readFileSync(svc.metaFile, "utf8"))[key], { name: "  Renommé  ", ram: 6 });
    assert.equal(svc.target(perso.id)?.ram, 6);
    const metaBefore = readFileSync(svc.metaFile, "utf8");
    await svc.rememberRam(create.id, 6); // pas de RAM propre : rien n'est écrit
    await svc.rememberRam("../../etc", 6);
    assert.equal(readFileSync(svc.metaFile, "utf8"), metaBefore);
    assert.equal(svc.target(42), null);
  } finally {
    cleanup();
  }
});
