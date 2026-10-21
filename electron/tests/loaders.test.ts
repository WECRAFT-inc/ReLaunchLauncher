// Loaders Fabric / Quilt (lot E3) et choix hors ligne (port de installed_loader_ids, comparé à Python).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { chooseLoaderVersion, fetchLoaderProfile, installedLoaderIds, installedVersionIds, installSimpleLoader, mavenPath, profileHashes } from "../src/main/install/loaders";
import { IntegrityError } from "../src/main/net/download";
import { loadXmcl, type XmclApi } from "../src/main/install/xmcl";
import { fakeFetch, type Route } from "./fakeNet";
import { sha1, tinyZip, world } from "./fakeWorld";
import { tempDir } from "./helpers";

const REPO = path.join(__dirname, "..", "..", "..");
const PY = ["python3", "python"].find((cmd) => spawnSync(cmd, ["--version"]).status === 0);
const FM = "https://meta.fabricmc.net/v2/versions/loader/";
const FMAVEN = "https://maven.fabricmc.net/";

test("hors ligne : loader de EXACTEMENT cette version (tests Python portés)", () => {
  const installed = ["fabric-loader-0.16.5-1.20.1", "fabric-loader-0.16.9-1.20.10", "1.20.1-forge-47.2.0", "neoforge-20.1.0-1.20.1", "1.20.1", "quilt-loader-0.26-1.20.1"];
  assert.deepEqual(installedLoaderIds(installed, "fabric", "1.20.1"), ["fabric-loader-0.16.5-1.20.1"]);
  assert.deepEqual(installedLoaderIds(installed, "fabric", "1.20.10"), ["fabric-loader-0.16.9-1.20.10"]);
  assert.deepEqual(installedLoaderIds(installed, "forge", "1.20.1"), ["1.20.1-forge-47.2.0"]);
  assert.deepEqual(installedLoaderIds(installed, "neoforge", "1.20.1"), ["neoforge-20.1.0-1.20.1"]);
});

test("hors ligne : mêmes résultats que la version Python sur de nombreux noms", { skip: PY ? false : "Python absent" }, () => {
  const ids = [
    "fabric-loader-0.16.5-1.20.1", "fabric-loader-0.16.9-1.20.10", "1.20.1-forge-47.2.0", "1.20.10-forge-1", "neoforge-20.1.0-1.20.1",
    "1.20.1", "quilt-loader-0.26-1.20.1", "Fabric-Loader-0.15-1.20.1", "xfabric-1.20.1", "1.20.1-OptiFine_HD", "forge-1.20.1", "1.20.1.2-fabric",
    "neoforge-21.1.5", "1.21-neoforge", "quilt-loader-0.20-1.20", "my.1.20.1-fabric",
  ];
  const cases: [string, string][] = [];
  for (const k of ["fabric", "forge", "neoforge", "quilt"]) for (const v of ["1.20.1", "1.20.10", "1.20", "1.21"]) cases.push([k, v]);
  const code = [
    "import json, sys",
    `sys.path.insert(0, ${JSON.stringify(path.join(REPO, "tests"))})`,
    "from _harness import load",
    "wl = load()",
    "ids, cases = json.loads(sys.argv[1]), json.loads(sys.argv[2])",
    "print(json.dumps([wl.installed_loader_ids(set(ids), k, v) for k, v in cases]))",
  ].join("\n");
  const r = spawnSync(PY!, ["-c", code, JSON.stringify(ids), JSON.stringify(cases)], { cwd: REPO, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(cases.map(([k, v]) => installedLoaderIds(ids, k, v)), JSON.parse(r.stdout));
});

test("choix de version : exacte si elle existe, sinon la plus récente stable avec un message", () => {
  const av = [
    { version: "0.17.0-beta.1", stable: false },
    { version: "0.16.9", stable: true },
    { version: "0.16.5", stable: true },
  ];
  assert.deepEqual(chooseLoaderVersion("Fabric", av, "0.16.5", "1.20.1"), { version: "0.16.5", note: null });
  assert.deepEqual(chooseLoaderVersion("Fabric", av, null, "1.20.1"), { version: "0.16.9", note: null });
  assert.equal(chooseLoaderVersion("Fabric", av, "9.9.9", "1.20.1").note, "Fabric 9.9.9 introuvable : dernière version utilisée.");
  assert.throws(() => chooseLoaderVersion("Quilt", [], null, "1.2.5"), /ne supporte pas Minecraft 1\.2\.5/);
});

test("chemins Maven et empreintes du profil", () => {
  assert.equal(mavenPath("net.fabricmc:fabric-loader:0.16.9"), "net/fabricmc/fabric-loader/0.16.9/fabric-loader-0.16.9.jar");
  assert.equal(mavenPath("org.lwjgl:lwjgl:3.3.3:natives-windows"), "org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar");
  assert.equal(mavenPath("a.b:c:1@zip"), "a/b/c/1/c-1.zip");
  for (const bad of ["a:b", "a:..:1", "a:b:..", "a/b:c:1", "a:b:1:../x"]) assert.equal(mavenPath(bad), null, bad);
  const h = profileHashes({ libraries: [{ name: "org.ow2.asm:asm:9.7", url: FMAVEN, sha1: "a".repeat(40), size: 3 }, { name: "x:y:1", url: FMAVEN }] });
  assert.deepEqual([...h.entries()], [[`${FMAVEN}org/ow2/asm/asm/9.7/asm-9.7.jar`, { sha1: "a".repeat(40), size: 3 }]]);
});

test("profil du loader : forme vérifiée (identifiant, version de base, noms de bibliothèques)", async () => {
  const url = `${FM}1.20.1/0.16.5/profile/json`;
  const ok = { id: "fabric-loader-0.16.5-1.20.1", inheritsFrom: "1.20.1", libraries: [{ name: "net.fabricmc:fabric-loader:0.16.5", url: FMAVEN }] };
  assert.equal((await fetchLoaderProfile("Fabric", "1.20.1", "0.16.5", { fetch: fakeFetch({ [url]: { body: JSON.stringify(ok) } }) }))["id"], ok.id);
  for (const bad of [
    { ...ok, id: "../../evil" },
    { ...ok, inheritsFrom: "1.12.2" },
    { ...ok, libraries: [{ name: "../x" }] },
    { id: ok.id, inheritsFrom: "1.20.1" },
  ]) {
    await assert.rejects(fetchLoaderProfile("Fabric", "1.20.1", "0.16.5", { fetch: fakeFetch({ [url]: { body: JSON.stringify(bad) } }) }), IntegrityError);
  }
});

let realXmcl: XmclApi | null = null;
try {
  realXmcl = loadXmcl();
} catch {
  realXmcl = null;
}
const skipReal = realXmcl === null && !process.env["CI"] ? "@xmcl/installer non installé ici" : false;

test("Fabric avec la vraie bibliothèque xmcl (réseau simulé) : profil + bibliothèques vérifiées", { skip: skipReal }, async () => {
  assert.ok(realXmcl, "@xmcl/installer doit être chargé sur la CI");
  const { dir, cleanup } = tempDir("fabric-real");
  try {
    const mc = "1.21.4";
    const w = world(mc);
    const loaderJar = tinyZip("net/fabricmc/loader/Main.class", "FABRIC");
    const asm = tinyZip("org/objectweb/asm/A.class", "ASM");
    const profile = {
      id: `fabric-loader-0.16.9-${mc}`,
      inheritsFrom: mc,
      type: "release",
      mainClass: "net.fabricmc.loader.impl.launch.knot.KnotClient",
      arguments: { game: [], jvm: [] },
      libraries: [
        { name: "net.fabricmc:fabric-loader:0.16.9", url: FMAVEN }, // sans empreinte : .sha1 Maven
        { name: "org.ow2.asm:asm:9.7", url: FMAVEN, sha1: sha1(asm), size: asm.length },
      ],
    };
    const routes: Record<string, Route> = {
      ...w.routes,
      [`${FM}${mc}`]: { body: JSON.stringify([{ loader: { version: "0.16.9", stable: true } }, { loader: { version: "0.16.5", stable: true } }]) },
      [`${FM}${mc}/0.16.9/profile/json`]: { body: JSON.stringify(profile) },
      [`${FMAVEN}net/fabricmc/fabric-loader/0.16.9/fabric-loader-0.16.9.jar`]: { body: loaderJar },
      [`${FMAVEN}net/fabricmc/fabric-loader/0.16.9/fabric-loader-0.16.9.jar.sha1`]: { body: sha1(loaderJar) },
      [`${FMAVEN}org/ow2/asm/asm/9.7/asm-9.7.jar`]: { body: asm },
    };
    const notes: string[] = [];
    const r = await installSimpleLoader(dir, "Fabric", mc, "9.9", { xmcl: realXmcl!, fetch: fakeFetch(routes), onNote: (n) => notes.push(n) });
    assert.equal(r.id, `fabric-loader-0.16.9-${mc}`);
    assert.deepEqual(notes, ["Fabric 9.9 introuvable : dernière version utilisée."]);
    assert.deepEqual(readFileSync(path.join(dir, "libraries", "net", "fabricmc", "fabric-loader", "0.16.9", "fabric-loader-0.16.9.jar")), loaderJar);
    assert.deepEqual(readFileSync(path.join(dir, "libraries", "org", "ow2", "asm", "asm", "9.7", "asm-9.7.jar")), asm);
    assert.ok(existsSync(path.join(dir, "versions", r.id, `${r.id}.json`)));
    assert.deepEqual(await installedVersionIds(dir), [mc, r.id].sort());

    // Bibliothèque modifiée en route : échec, jamais « prêt »
    const { rmSync } = await import("node:fs");
    rmSync(path.join(dir, "libraries", "org"), { recursive: true });
    const piege = { ...routes, [`${FMAVEN}org/ow2/asm/asm/9.7/asm-9.7.jar`]: { body: tinyZip("x/X.class", "PIEGE") } };
    await assert.rejects(installSimpleLoader(dir, "Fabric", mc, "0.16.9", { xmcl: realXmcl!, fetch: fakeFetch(piege) }));
  } finally {
    cleanup();
  }
});
