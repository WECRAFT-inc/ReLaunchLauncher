// Lot E7 : modpacks Modrinth, comparés à la vraie version Python sur les mêmes données.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  applyModpackEdit,
  buildModpack,
  countModFiles,
  listPackMods,
  MODRINTH_CDN,
  modDownloader,
  packGraph,
  packNote,
  packRows,
  readModJar,
  resolveModpack,
  safeFolderName,
  safeModFilename,
  searchParams,
  shortCount,
  type Fetch,
  type ModpackMeta,
} from "../src/main/modpacks/modrinth";
import { IntegrityError } from "../src/main/net/download";
import { ModpackService } from "../src/main/modpacks/service";
import { InstanceService } from "../src/main/instances/service";
import { JsonStore } from "../src/main/storage/jsonStore";
import { instancesDir } from "../src/main/instances/detect";
import { fakeFetch } from "./fakeNet";
import { tempDir } from "./helpers";

const REPO = path.join(__dirname, "..", "..", "..");
const PY = ["python3", "python"].find((cmd) => spawnSync(cmd, ["--version"]).status === 0);
const skipPy = PY ? false : "Python absent";
const HARNESS = ["import json, sys", `sys.path.insert(0, ${JSON.stringify(path.join(REPO, "tests"))})`, "from _harness import load", "wl = load()"];

function py(lines: string[], ...args: string[]): unknown {
  const r = spawnSync(PY!, ["-c", [...HARNESS, ...lines].join("\n"), ...args], { cwd: REPO, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim().split("\n").pop()!);
}

// ---------------------------------------------------------------- un « Modrinth » simulé (partagé avec Python)
const cdn = MODRINTH_CDN;
const file = (name: string, sha = "a".repeat(128), url = cdn + name) => ({ primary: true, filename: name, url, size: 3, hashes: { sha512: sha, sha1: "b".repeat(40) } });
const WORLD: Record<string, unknown> = {
  "/project/create/version": [
    { id: "c-old", version_type: "release", version_number: "0.5", date_published: "2024-01-01", files: [file("create-0.5.jar")], dependencies: [] },
    { id: "c-new", version_type: "release", version_number: "0.6", date_published: "2025-01-01", files: [file("create-0.6.jar")], dependencies: [{ project_id: "flywheel", dependency_type: "required" }, { version_id: "v-api", dependency_type: "required" }, { project_id: "optifine", dependency_type: "incompatible" }] },
    { id: "c-beta", version_type: "beta", version_number: "0.7b", date_published: "2026-01-01", files: [file("create-0.7.jar")], dependencies: [] },
  ],
  "/project/flywheel/version": [{ id: "f1", version_type: "beta", version_number: "1.0b", date_published: "2025-01-01", files: [file("flywheel.jar")], dependencies: [] }],
  "/version/v-api": { project_id: "api" },
  "/project/api/version": [{ id: "a1", version_type: "release", version_number: "9", date_published: "2025", files: [file("api.jar")], dependencies: [] }],
  "/project/optifine/version": [{ id: "o1", version_type: "release", version_number: "1", date_published: "2025", files: [file("optifine.jar")], dependencies: [] }],
  "/project/sodium/version": [{ id: "s1", version_type: "release", version_number: "0.5", date_published: "2025", files: [file("sodium.jar")], dependencies: [{ project_id: "api", dependency_type: "required" }] }],
  "/project/douteux/version": [{ id: "d1", version_type: "release", date_published: "1", files: [file("x.jar:flux")], dependencies: [] }],
  "/project/horscdn/version": [{ id: "h1", version_type: "release", date_published: "1", files: [file("h.jar", "a".repeat(128), "https://evil.example/h.jar")], dependencies: [] }],
  "/project/sans512/version": [{ id: "n1", version_type: "release", date_published: "1", files: [{ primary: true, filename: "n.jar", url: cdn + "n.jar", hashes: { sha1: "c".repeat(40) } }], dependencies: [] }],
  "/project/vide/version": [],
  "/project/memefichier/version": [{ id: "m1", version_type: "release", date_published: "1", files: [file("api.jar")], dependencies: [] }],
  "/projects": [
    { id: "create", title: "Create" },
    { id: "flywheel", title: "Flywheel" },
    { id: "api", title: "Architectury API" },
    { id: "sodium", title: "Sodium" },
    { id: "optifine", title: "OptiFine" },
  ],
};
const fetchFrom =
  (world: Record<string, unknown>): Fetch =>
  async (p) => {
    if (p === "/project/panne/version") throw new Error("réseau coupé");
    return p in world ? world[p] : [];
  };
const PY_FETCH = [
  "world = json.loads(sys.argv[1])",
  "def fetch(path, params=None):",
  "    if path == '/project/panne/version': raise RuntimeError('réseau coupé')",
  "    return world.get(path, [])",
];

test("noms : fichiers de mods et dossiers d'instances, comme la version Python", { skip: skipPy }, () => {
  const mods = ["sodium-fabric-0.5.8+mc1.20.1.jar", "Create 1.0.JAR", "a.jar:flux", "..\\x.jar", "../x.jar", "x.exe", "NUL.jar", "", "mod.jar.", "com1.x.jar", "é😀.jar", "a".repeat(201) + ".jar", " .jar"];
  const folders = ["Mon modpack", "a<b>c:d", "CON", "  ..pack.. ", "", "x".repeat(80), "nul", "Pack é"];
  const expected = py(["d = json.loads(sys.argv[1])", "print(json.dumps([[wl.safe_mod_filename(n) for n in d['m']], [wl.safe_folder_name(n) for n in d['f']]]))"], JSON.stringify({ m: mods, f: folders })) as [boolean[], string[]];
  assert.deepEqual([mods.map(safeModFilename), folders.map(safeFolderName)], expected);
  assert.equal(safeModFilename(null), false);
  assert.deepEqual([shortCount(999), shortCount(1500), shortCount(2_340_000)], ["999", "2k", "2.3M"]);
  assert.equal(searchParams("", "1.20.1", "Quilt")["facets"], JSON.stringify([["project_type:mod"], ["versions:1.20.1"], ["categories:quilt", "categories:fabric"]]));
  assert.equal(searchParams("jei", "1.20.1", "Fabric", 0, 20, ["magic"], ["client"], null)["index"], "relevance");
});

const CASES: { name: string; loader: string; roots: { project_id: string; title: string }[] }[] = [
  { name: "dépendances", loader: "Fabric", roots: [{ project_id: "create", title: "Create" }, { project_id: "optifine", title: "OptiFine" }] },
  { name: "pièges", loader: "Quilt", roots: [{ project_id: "douteux", title: "Douteux" }, { project_id: "horscdn", title: "HorsCDN" }, { project_id: "sans512", title: "Sans512" }, { project_id: "vide", title: "Vide" }, { project_id: "panne", title: "Panne" }, { project_id: "sodium", title: "Sodium" }] },
  { name: "même fichier", loader: "Forge", roots: [{ project_id: "sodium", title: "Sodium" }, { project_id: "memefichier", title: "Même" }] },
];

for (const c of CASES) {
  test(`résolution des versions et dépendances : identique à Python (${c.name})`, { skip: skipPy }, async () => {
    const ts = await resolveModpack("1.20.1", c.loader, c.roots, fetchFrom(WORLD));
    const pyr = py([...PY_FETCH, "d = json.loads(sys.argv[2])", "plan, w = wl.resolve_modpack('1.20.1', d['loader'], d['roots'], fetch)", "print(json.dumps({'plan': plan, 'warnings': w}))"], JSON.stringify(WORLD), JSON.stringify(c)) as {
      plan: unknown[];
      warnings: string[];
    };
    assert.deepEqual(JSON.parse(JSON.stringify(ts)), pyr);
  });
}

test("graphe et lignes de « Mon modpack » : identiques à Python", { skip: skipPy }, () => {
  const old = [
    { project_id: "create", filename: "create.jar", title: "Create", dependency: false, required_by: [] },
    { project_id: "flywheel", filename: "fw.jar", title: "Flywheel", dependency: true, required_by: ["create"] },
    { project_id: "api", filename: "api.jar", title: "Architectury", dependency: true, required_by: ["create", "sodium"] },
    { project_id: "ancienne", filename: "old.jar", title: "Ancienne dépendance", dependency: true },
    { project_id: "sodium", filename: "sodium.jar", title: "Sodium", dependency: false, required_by: [] },
    { project_id: "iris", filename: "iris.jar", dependency: true, required_by: ["sodium"] },
  ];
  const scenarios = [
    { selected: [{ project_id: "create", title: "Create" }, { project_id: "sodium", title: "Sodium" }], items: null },
    { selected: [{ project_id: "sodium", title: "Sodium" }], items: null },
    { selected: [{ project_id: "create", title: "Create" }, { project_id: "jei", title: "JEI" }], items: { jei: { title: "JEI", required_by: [] }, apijei: { title: "API JEI", dependency: true, required_by: ["jei"] } } },
    { selected: [{ project_id: "neuf", title: "Neuf" }], items: {} },
    { selected: [{ project_id: "flywheel", title: "Flywheel" }], items: null },
  ];
  const expected = py(
    [
      "d = json.loads(sys.argv[1])",
      "out = []",
      "for s in d['sc']:",
      "    rows = wl.pack_rows(d['old'], s['selected'], s['items'])",
      "    alive, parents = wl.pack_graph(d['old'], [m['project_id'] for m in s['selected']], {k: v.get('required_by') or [] for k, v in (s['items'] or {}).items()})",
      "    out.append({'rows': rows, 'notes': [wl.pack_note(r)[0] for r in rows], 'alive': sorted(alive), 'parents': parents})",
      "print(json.dumps(out))",
    ],
    JSON.stringify({ old, sc: scenarios }),
  );
  const ts = scenarios.map((s) => {
    const rows = packRows(old, s.selected, s.items);
    const g = packGraph(old, s.selected.map((m) => m.project_id), Object.fromEntries(Object.entries(s.items ?? {}).map(([k, v]) => [k, (v as { required_by?: string[] }).required_by ?? []])));
    return { rows, notes: rows.map((r) => packNote(r).text), alive: [...g.alive].sort(), parents: g.parents };
  });
  assert.deepEqual(JSON.parse(JSON.stringify(ts)), expected);
});

// ---------------------------------------------------------------- création et modification sur le disque
const CONTENT = (u: string) => `contenu de ${u}`;
/** Téléchargement simulé : écrit le fichier (le même pour TS et Python) ; « panne.jar » échoue. */
const fakeDownload = async (url: string, dest: string) => {
  if (url.endsWith("panne-dl.jar")) throw new Error("réseau coupé");
  writeFileSync(dest, CONTENT(url));
};
const PY_DOWNLOAD = ["def download(url, dest, sha512=None, sha1=None):", "    if url.endswith('panne-dl.jar'): raise RuntimeError('réseau coupé')", "    open(dest, 'w', encoding='utf-8').write('contenu de ' + url)"];

function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string, rel: string) => {
    if (!existsSync(d)) return;
    for (const n of readdirSync(d, { withFileTypes: true })) {
      if (n.isDirectory()) walk(path.join(d, n.name), `${rel}${n.name}/`);
      // Python écrit ses JSON en mode texte : fins de ligne \r\n sous Windows, \n ailleurs (contenu identique).
      else out[`${rel}${n.name}`] = readFileSync(path.join(d, n.name), "utf8").replace(/\r\n/g, "\n");
    }
  };
  walk(dir, "");
  return out;
}

test("création puis modification d'un modpack : mêmes fichiers que la version Python", { skip: skipPy }, async () => {
  const { dir, cleanup } = tempDir("e7-pack");
  try {
    const world = { ...WORLD, "/project/jei/version": [{ id: "j1", version_type: "release", version_number: "15", date_published: "2025", files: [file("jei.jar")], dependencies: [] }] };
    const roots = [{ project_id: "create", title: "Create" }, { project_id: "sodium", title: "Sodium" }];
    // ReLaunch
    const tsDir = path.join(dir, "ts", "Mon pack");
    mkdirSync(path.dirname(tsDir), { recursive: true });
    const progress: string[] = [];
    const r1 = await buildModpack(tsDir, "Mon pack", "1.20.1", "Fabric", roots, (d, t, m) => progress.push(`${d}/${t} ${m}`), fetchFrom(world), fakeDownload);
    const meta = JSON.parse(readFileSync(path.join(tsDir, "wecraft_modpack.json"), "utf8")) as ModpackMeta;
    const sel = [{ project_id: "create", title: "Create" }, { project_id: "jei", title: "JEI" }]; // Sodium retiré, JEI ajouté
    const r2 = await applyModpackEdit(tsDir, meta, sel, () => undefined, fetchFrom(world), fakeDownload);
    // Python
    const pyDir = path.join(dir, "py", "Mon pack");
    mkdirSync(path.dirname(pyDir), { recursive: true });
    const pyr = py(
      [
        ...PY_FETCH,
        ...PY_DOWNLOAD,
        "from pathlib import Path",
        "d = json.loads(sys.argv[2])",
        "f = Path(d['dir'])",
        "r1 = wl.build_modpack(f, 'Mon pack', '1.20.1', 'Fabric', d['roots'], fetch=fetch, download=download)",
        "meta = json.loads((f / 'wecraft_modpack.json').read_text(encoding='utf-8'))",
        "r2 = wl.apply_modpack_edit(f, meta, d['sel'], fetch=fetch, download=download)",
        "print(json.dumps([r1, r2]))",
      ],
      JSON.stringify(world),
      JSON.stringify({ dir: pyDir, roots, sel }),
    );
    assert.deepEqual([r1, r2], pyr);
    assert.deepEqual(snapshot(tsDir), snapshot(pyDir));
    assert.ok(snapshot(tsDir)["mods/jei.jar"]);
    assert.equal(snapshot(tsDir)["mods/sodium.jar"], undefined, "mod retiré");
    assert.ok(progress[0]!.startsWith("0/0 Recherche"));
  } finally {
    cleanup();
  }
});

test("échecs : instance existante refusée, création annulée sans reste, modification sans rien supprimer (comme Python)", async () => {
  const { dir, cleanup } = tempDir("e7-echec");
  try {
    const world = { ...WORLD, "/project/panneDL/version": [{ id: "p1", version_type: "release", date_published: "1", files: [file("panne-dl.jar")], dependencies: [] }] };
    const f = path.join(dir, "Pack");
    await assert.rejects(buildModpack(f, "Pack", "1.20.1", "Fabric", [{ project_id: "panneDL", title: "Panne" }, { project_id: "sodium", title: "Sodium" }], () => undefined, fetchFrom(world), fakeDownload), /réseau coupé/);
    assert.equal(existsSync(f), false, "pas d'instance à moitié créée");
    await assert.rejects(buildModpack(f, "Pack", "1.20.1", "Fabric", [{ project_id: "vide", title: "Vide" }], () => undefined, fetchFrom(world), fakeDownload), /Aucun de ces mods/);
    mkdirSync(path.join(f, "mods"), { recursive: true });
    await assert.rejects(buildModpack(f, "Pack", "1.20.1", "Fabric", [{ project_id: "sodium", title: "Sodium" }], () => undefined, fetchFrom(world), fakeDownload), /existe déjà/);
    // test Python porté : un téléchargement qui échoue ne modifie rien
    writeFileSync(path.join(f, "mods", "ancien.jar"), "x");
    const meta: ModpackMeta = { minecraft: "1.20.1", loader: "Fabric", mods: [{ project_id: "ancien", filename: "ancien.jar", title: "Ancien", dependency: false }] };
    writeFileSync(path.join(f, "wecraft_modpack.json"), JSON.stringify(meta));
    await assert.rejects(applyModpackEdit(f, meta, [{ project_id: "panneDL", title: "Nouveau" }], () => undefined, fetchFrom(world), fakeDownload), /réseau coupé/);
    assert.deepEqual(readdirSync(path.join(f, "mods")), ["ancien.jar"]);
    assert.deepEqual(JSON.parse(readFileSync(path.join(f, "wecraft_modpack.json"), "utf8")), meta);
    // un fichier hors modpack n'est jamais supprimé ; un fichier au nom déjà pris n'est pas écrasé
    writeFileSync(path.join(f, "mods", "sodium.jar"), "mien");
    const r = await applyModpackEdit(f, meta, [{ project_id: "sodium", title: "Sodium" }], () => undefined, fetchFrom(world), fakeDownload);
    assert.equal(readFileSync(path.join(f, "mods", "sodium.jar"), "utf8"), "mien");
    assert.ok(r.warnings.some((w) => w.includes("existe déjà")));
  } finally {
    cleanup();
  }
});

test("téléchargement d'un mod : CDN Modrinth seulement, SHA-512 vérifié avant de garder le fichier", async () => {
  const { dir, cleanup } = tempDir("e7-dl");
  try {
    const body = Buffer.from("MOD");
    const sha512 = createHash("sha512").update(body).digest("hex");
    const url = `${cdn}data/x/sodium.jar`;
    const dl = modDownloader("ReLaunch/test", { fetch: fakeFetch({ [url]: { body } }) });
    await dl(url, path.join(dir, "ok.jar"), sha512, null);
    assert.deepEqual(readFileSync(path.join(dir, "ok.jar")), body);
    await assert.rejects(dl(url, path.join(dir, "ko.jar"), "0".repeat(128), null), IntegrityError);
    assert.equal(existsSync(path.join(dir, "ko.jar")), false);
    await assert.rejects(dl("https://evil.example/x.jar", path.join(dir, "e.jar"), sha512, null), /non autorisée/);
    await assert.rejects(dl(url, path.join(dir, "n.jar"), null, null), /corrompu/);
  } finally {
    cleanup();
  }
});

test("liste des mods d'un modpack et lecture des .jar : identiques à Python (zip compressés)", { skip: skipPy }, async () => {
  const { dir, cleanup } = tempDir("e7-liste");
  try {
    const game = path.join(dir, "Pack");
    mkdirSync(path.join(game, "mods"), { recursive: true });
    // .jar créés par le module zipfile de Python (compression deflate), contenus variés
    py(
      [
        "import zipfile, os",
        "m = sys.argv[1]",
        "def jar(n, files, comp=zipfile.ZIP_DEFLATED):",
        "    with zipfile.ZipFile(os.path.join(m, n), 'w', comp) as z:",
        "        for k, v in files.items(): z.writestr(k, v)",
        "jar('fabric.jar', {'fabric.mod.json': json.dumps({'name': 'Sodium', 'version': '0.5.8'})})",
        "jar('quilt.jar', {'quilt.mod.json': json.dumps({'quilt_loader': {'version': '2.1', 'metadata': {'name': 'QSL'}}})})",
        "jar('neo.jar', {'META-INF/neoforge.mods.toml': 'modLoader=\"javafml\"\\n[[mods]]\\nmodId=\"x\"\\nversion=\"${file.jarVersion}\"\\ndisplayName=\"Apotheosis\"\\n'})",
        "jar('forge.jar.disabled', {'META-INF/mods.toml': '[[mods]]\\n  displayName = \"Create\"\\n  version = \"0.5.1\"\\n'}, zipfile.ZIP_STORED)",
        "jar('vieux.jar', {'mcmod.info': json.dumps({'modList': [{'name': 'OldMod', 'version': '1.0'}]})})",
        "jar('rien.jar', {'a.txt': 'x'})",
        "open(os.path.join(m, 'casse.jar'), 'wb').write(b'pas un zip')",
        "open(os.path.join(m, 'notes.txt'), 'w').write('x')",
        "print('1')",
      ],
      path.join(game, "mods"),
    );
    writeFileSync(
      path.join(game, "wecraft_modpack.json"),
      JSON.stringify({ mods: [{ project_id: "c", filename: "connu.jar", title: "Connu", version: "3", dependency: false }, { project_id: "d", filename: "dep.jar", title: "Dépendance", dependency: true, required_by: ["c", "absent"] }] }),
    );
    writeFileSync(path.join(game, "mods", "connu.jar"), "x");
    writeFileSync(path.join(game, "mods", "dep.jar"), "x");
    const expected = py(["from pathlib import Path", "p = Path(sys.argv[1])", "print(json.dumps([wl.list_pack_mods(p, p), wl.count_mod_files(p)]))"], game);
    assert.deepEqual([await listPackMods(game, game), await countModFiles(game)], expected);
    assert.deepEqual(await readModJar(path.join(game, "mods", "fabric.jar")), { name: "Sodium", version: "0.5.8" });
    assert.deepEqual(await readModJar(path.join(dir, "absent.jar")), { name: "absent", version: "" });
  } finally {
    cleanup();
  }
});

test("service : recherche vérifiée, création et modification suivies, refus clairs", async () => {
  const { dir, cleanup } = tempDir("e7-service");
  try {
    const env = { platform: "linux" as NodeJS.Platform, env: { HOME: dir }, home: dir };
    const inst = new InstanceService(new JsonStore(), env);
    const calls: { p: string; params?: unknown }[] = [];
    const world: Record<string, unknown> = {
      ...WORLD,
      "/search": { total_hits: 2, hits: [{ project_id: "sodium", title: "Sodium", author: "jelly", description: "Rapide", downloads: 10, categories: ["optimization"], slug: "sodium" }, { project_id: "../evil", title: "x" }] },
    };
    const svc = new ModpackService({
      instancesDir: instancesDir(env),
      instances: inst,
      userAgent: "test",
      fetch: async (p, params) => {
        calls.push({ p, params });
        return fetchFrom(world)(p, params);
      },
      download: fakeDownload,
      versions: async () => ["1.21.4", "1.20.1"],
    });
    assert.deepEqual(await svc.mcVersions(), ["1.21.4", "1.20.1"]);
    const s = await svc.search({ query: "sod", mc: "1.20.1", loader: "Fabric", categories: ["optimization", "<script>"], envs: ["client", "x"], sort: "downloads" });
    assert.ok(s.ok && s.hits.length === 1 && s.hits[0]!.id === "sodium", "identifiant douteux ignoré");
    assert.equal(JSON.parse(String((calls[0]!.params as Record<string, unknown>)["facets"])).length, 5, "catégorie et environnement inconnus ignorés");
    assert.deepEqual(await svc.search({ mc: "../x", loader: "Fabric" }), { ok: false, message: "Version de Minecraft ou loader invalide." });

    assert.deepEqual(await svc.create({ name: "", mc: "1.20.1", loader: "Fabric", roots: [] }), { ok: false, reason: "invalid" });
    assert.deepEqual(await svc.create({ name: "P", mc: "1.20.1", loader: "Fabric", roots: [] }), { ok: false, reason: "empty" });
    assert.deepEqual(await svc.create({ name: "P", mc: "1.20.1", loader: "Fabric", roots: [{ project_id: "../x", title: "x" }] }), { ok: false, reason: "invalid" });
    const r = await svc.create({ name: "Mon <pack>", mc: "1.20.1", loader: "Fabric", roots: [{ project_id: "sodium", title: "Sodium" }] });
    assert.ok(r.ok);
    assert.deepEqual(await svc.create({ name: "x", mc: "1.20.1", loader: "Fabric", roots: [{ project_id: "sodium", title: "Sodium" }] }), { ok: false, reason: "busy" });
    for (let i = 0; i < 1000 && svc.status(r.job)?.phase === "en-cours"; i++) await new Promise((res) => setTimeout(res, 10));
    const st = svc.status(r.job)!;
    assert.equal(st.phase, "termine", st.message);
    assert.match(st.message, /« Mon pack » créée avec 2 mods \(dont 1 dépendances/);
    assert.ok(existsSync(path.join(instancesDir(env), "Mon pack", "mods", "sodium.jar")));
    assert.deepEqual(await svc.create({ name: "Mon pack", mc: "1.20.1", loader: "Fabric", roots: [{ project_id: "sodium", title: "Sodium" }] }), { ok: false, reason: "exists", name: "Mon pack" });

    const list = (await inst.list(true)).instances;
    const pack = list.find((i) => i.name === "Mon pack")!;
    assert.equal(pack.modpack, true);
    const info = (await svc.editInfo(pack.id))!;
    assert.deepEqual([info.mc, info.loader, info.selected], ["1.20.1", "Fabric", [{ project_id: "sodium", title: "Sodium" }]]);
    const rows = await svc.rows(pack.id, info.selected);
    assert.deepEqual(rows.map((x) => [x.title, x.kind, x.note]), [["Sodium", "root", ""], ["Architectury API", "dep", "(dépendance de Sodium)"]]);
    assert.deepEqual(await svc.edit(pack.id, info.selected), { ok: false, reason: "unchanged" });
    assert.deepEqual(await svc.edit(pack.id, []), { ok: false, reason: "empty" });
    assert.deepEqual(await svc.edit("inconnu", info.selected), { ok: false, reason: "invalid" });
    const e = await svc.edit(pack.id, [{ project_id: "create", title: "Create" }]);
    assert.ok(e.ok);
    for (let i = 0; i < 1000 && svc.status(e.job)?.phase === "en-cours"; i++) await new Promise((res) => setTimeout(res, 10));
    assert.match(svc.status(e.job)!.message, /mis à jour : 1 mod ajouté \(\+ 1 dépendance\), 1 retiré/);
    assert.equal(await svc.editInfo("inconnu"), null);
    assert.equal(svc.status("autre"), null);
  } finally {
    cleanup();
  }
});
