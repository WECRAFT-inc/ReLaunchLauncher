// Installation d'une version sans loader (lot E3).
// - Tests « logique » avec un xmcl simulé : toujours exécutés.
// - Test d'intégration avec la VRAIE bibliothèque xmcl et un réseau simulé : exécuté quand @xmcl/installer
//   est installé (CI Windows) ; ignoré sinon (poste sans accès au registre npm).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { crc32 } from "node:zlib";
import { IntegrityError } from "../src/main/net/download";
import { installVanilla, isSafeVersionId, VERSION_MANIFEST_URL } from "../src/main/install/vanilla";
import { loadXmcl, type InstallFile, type XmclApi } from "../src/main/install/xmcl";
import { fakeFetch, type Route } from "./fakeNet";
import { tempDir } from "./helpers";

const sha1 = (s: string | Uint8Array) => createHash("sha1").update(s).digest("hex");
const META = "https://piston-meta.mojang.com/v1/packages/";
const DATA = "https://piston-data.mojang.com/v1/objects/";
const LIB = "https://libraries.minecraft.net/";
const RES = "https://resources.download.minecraft.net/";

/** Petit zip valide (une entrée « stockée ») : xmcl vérifie que le jar du jeu est un zip non vide. */
function tinyZip(name: string, content: string): Buffer {
  const data = Buffer.from(content);
  const fname = Buffer.from(name);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(10, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(fname.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(10, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(fname.length, 28);
  const cdOffset = local.length + fname.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + fname.length, 12);
  end.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, fname, data, central, fname, end]);
}

/** Un « monde Mojang » minimal : liste, version, jar, une bibliothèque, un index et une ressource. */
function world(id: string, opts: { tamperJson?: boolean } = {}) {
  const jar = tinyZip("net/minecraft/Main.class", "JEU");
  const lib = tinyZip("a/A.class", "LIB");
  const sound = "SON";
  const index = JSON.stringify({ objects: { "minecraft/sounds/a.ogg": { hash: sha1(sound), size: sound.length } } });
  const versionJson = JSON.stringify({
    id,
    type: "release",
    time: "2026-01-01T00:00:00+00:00",
    releaseTime: "2026-01-01T00:00:00+00:00",
    minimumLauncherVersion: 21,
    mainClass: "net.minecraft.client.main.Main",
    arguments: { game: [], jvm: [] },
    assets: "99",
    assetIndex: { id: "99", sha1: sha1(index), size: index.length, totalSize: sound.length, url: `${META}index-99.json` },
    downloads: { client: { sha1: sha1(jar), size: jar.length, url: `${DATA}client.jar` } },
    javaVersion: { component: "java-runtime-delta", majorVersion: 21 },
    libraries: [
      {
        name: "com.example:lib:1.0",
        downloads: { artifact: { path: "com/example/lib/1.0/lib-1.0.jar", sha1: sha1(lib), size: lib.length, url: `${LIB}com/example/lib/1.0/lib-1.0.jar` } },
      },
    ],
  });
  const manifest = JSON.stringify({
    latest: { release: id, snapshot: id },
    versions: [{ id, type: "release", url: `${META}${id}.json`, sha1: sha1(opts.tamperJson ? "autre" : versionJson), time: "", releaseTime: "" }],
  });
  const routes: Record<string, Route> = {
    [VERSION_MANIFEST_URL]: { body: manifest },
    [`${META}${id}.json`]: { body: versionJson },
    [`${DATA}client.jar`]: { body: jar },
    [`${LIB}com/example/lib/1.0/lib-1.0.jar`]: { body: lib },
    [`${META}index-99.json`]: { body: index },
    [`${RES}${sha1(sound).slice(0, 2)}/${sha1(sound)}`]: { body: sound },
  };
  return { routes, jar, lib, sound };
}

/** xmcl simulé : enregistre les plans reçus et « exécute » en appelant le téléchargement fourni. */
function fakeXmcl(files: InstallFile[], assets: InstallFile[]): XmclApi & { plans: InstallFile[][] } {
  const plans: InstallFile[][] = [];
  let download: ((f: InstallFile[]) => Promise<void>) | null = null;
  return {
    plans,
    parseVersion: async (mc, id) => ({ id, minecraftVersion: id, minecraftDirectory: mc, libraries: [], assets: "99", javaVersion: { component: "java-runtime-delta", majorVersion: 21 } }),
    folder: (mc) => mc,
    resolveMinecraftJarInstallFile: () => files[0],
    resolveLibraryInstallFiles: () => files.slice(1),
    resolveAssetMetadataInstallFiles: () => [],
    resolveAssetObjectInstallFiles: async () => assets,
    createRuntime: (o) => {
      download = o.download;
      return o;
    },
    execute: async (plan) => {
      const fs = plan.tasks.flatMap((t) => t.files);
      plans.push(fs);
      await download?.(fs);
    },
  };
}

test("identifiants de version : noms de dossier sûrs seulement", () => {
  for (const ok of ["1.21.4", "24w14a", "1.20.1-pre1", "1.14.4 Pre-Release 1"]) assert.ok(isSafeVersionId(ok), ok);
  for (const bad of ["../x", "a/b", "a\\b", "", ".hidden", "x".repeat(80)]) assert.ok(!isSafeVersionId(bad), bad);
});

test("fichier de version modifié en route : refusé avant tout le reste", async () => {
  const { dir, cleanup } = tempDir("vanilla-json");
  try {
    const w = world("1.21.4", { tamperJson: true });
    const xmcl = fakeXmcl([], []);
    await assert.rejects(installVanilla(dir, "1.21.4", { xmcl, fetch: fakeFetch(w.routes) }), IntegrityError);
    assert.equal(existsSync(path.join(dir, "versions", "1.21.4", "1.21.4.json")), false);
    assert.equal(xmcl.plans.length, 0);
  } finally {
    cleanup();
  }
});

test("version inconnue : message clair", async () => {
  const { dir, cleanup } = tempDir("vanilla-none");
  try {
    const w = world("1.21.4");
    await assert.rejects(installVanilla(dir, "9.9.9", { xmcl: fakeXmcl([], []), fetch: fakeFetch(w.routes) }), /introuvable/);
  } finally {
    cleanup();
  }
});

test("plans de xmcl : passent par nos garde-fous (adresses filtrées, empreintes, pas de confiance sur la taille)", async () => {
  const { dir, cleanup } = tempDir("vanilla-plan");
  try {
    const w = world("1.21.4");
    const jarPath = path.join(dir, "versions", "1.21.4", "1.21.4.jar");
    const files: InstallFile[] = [
      { path: jarPath, urls: ["https://bmclapi2.bangbang93.com/x", `${DATA}client.jar`], size: w.jar.length, checksum: { algorithm: "sha1", value: sha1(w.jar) }, validator: "zip" },
    ];
    const soundPath = path.join(dir, "assets", "objects", "xx", "son");
    const assets: InstallFile[] = [
      { path: soundPath, urls: [`${RES}${sha1(w.sound).slice(0, 2)}/${sha1(w.sound)}`], size: 3, checksum: { algorithm: "sha1", value: sha1(w.sound) }, trustExistingSize: true, validatedAt: 1 },
    ];
    const xmcl = fakeXmcl(files, assets);
    const steps: string[] = [];
    const r = await installVanilla(dir, "1.21.4", { xmcl, fetch: fakeFetch(w.routes), onStep: (s) => steps.push(s.phase) });
    assert.deepEqual(r, { id: "1.21.4", javaComponent: "java-runtime-delta", javaMajor: 21 });
    assert.deepEqual(xmcl.plans[0]?.[0]?.urls, [`${DATA}client.jar`]);
    assert.equal(xmcl.plans[1]?.[0]?.trustExistingSize, undefined);
    assert.equal(xmcl.plans[1]?.[0]?.validatedAt, undefined);
    assert.deepEqual(readFileSync(jarPath), w.jar);
    assert.equal(readFileSync(soundPath, "utf8"), "SON");
    assert.ok(steps.includes("liste") && steps.includes("version") && steps.includes("fichiers") && steps.includes("ressources"));
  } finally {
    cleanup();
  }
});

let realXmcl: XmclApi | null = null;
let loadError = "";
try {
  realXmcl = loadXmcl();
} catch (e) {
  realXmcl = null;
  loadError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

// Sur la CI (variable CI définie), ce test n'est jamais ignoré : xmcl absent = échec.
const skipReal = realXmcl === null && !process.env["CI"] ? "@xmcl/installer non installé ici" : false;

test("intégration avec la vraie bibliothèque xmcl (réseau simulé)", { skip: skipReal }, async () => {
  assert.ok(realXmcl, `@xmcl/installer doit être chargé sur la CI (${loadError})`);
  const { dir, cleanup } = tempDir("vanilla-real");
  try {
    const id = "1.21.4";
    const w = world(id);
    const log: string[] = [];
    const r = await installVanilla(dir, id, { xmcl: realXmcl!, fetch: fakeFetch(w.routes, log) });
    assert.equal(r.javaComponent, "java-runtime-delta");
    assert.deepEqual(readFileSync(path.join(dir, "versions", id, `${id}.jar`)), w.jar);
    assert.deepEqual(readFileSync(path.join(dir, "libraries", "com", "example", "lib", "1.0", "lib-1.0.jar")), w.lib);
    assert.equal(readFileSync(path.join(dir, "assets", "objects", sha1(w.sound).slice(0, 2), sha1(w.sound)), "utf8"), "SON");
    assert.ok(existsSync(path.join(dir, "assets", "indexes", "99.json")));
    assert.ok(log.every((u) => u.startsWith("https://")));

    // Seconde fois : tout est déjà bon, seule la liste des versions est relue
    const log2: string[] = [];
    await installVanilla(dir, id, { xmcl: realXmcl!, fetch: fakeFetch(w.routes, log2) });
    assert.deepEqual(log2, [VERSION_MANIFEST_URL]);

    // Fichier abîmé localement : détecté par empreinte et retéléchargé
    const libPath = path.join(dir, "libraries", "com", "example", "lib", "1.0", "lib-1.0.jar");
    writeFileSync(libPath, Buffer.alloc(w.lib.length, 0));
    await installVanilla(dir, id, { xmcl: realXmcl!, fetch: fakeFetch(w.routes) });
    assert.deepEqual(readFileSync(libPath), w.lib);

    // Serveur qui renvoie un contenu piégé : échec, jamais « prêt »
    const piege = { ...w.routes, [`${LIB}com/example/lib/1.0/lib-1.0.jar`]: { body: Buffer.alloc(w.lib.length, 1) } };
    writeFileSync(libPath, "abîmé");
    mkdirSync(path.dirname(libPath), { recursive: true });
    await assert.rejects(installVanilla(dir, id, { xmcl: realXmcl!, fetch: fakeFetch(piege) }));
    assert.notDeepEqual(existsSync(libPath) ? readFileSync(libPath) : null, Buffer.alloc(w.lib.length, 1));
  } finally {
    cleanup();
  }
});
