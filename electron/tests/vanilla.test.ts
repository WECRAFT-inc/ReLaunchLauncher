// Installation d'une version sans loader (lot E3).
// - Tests « logique » avec un xmcl simulé : toujours exécutés.
// - Test d'intégration avec la VRAIE bibliothèque xmcl et un réseau simulé : exécuté quand @xmcl/installer
//   est installé (CI Windows) ; ignoré sinon (poste sans accès au registre npm).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { IntegrityError } from "../src/main/net/download";
import { installVanilla, isSafeVersionId, VERSION_MANIFEST_URL } from "../src/main/install/vanilla";
import { loadXmcl, type InstallFile, type XmclApi } from "../src/main/install/xmcl";
import { fakeFetch } from "./fakeNet";
import { DATA, LIB, RES, world } from "./fakeWorld";
import { tempDir } from "./helpers";

const sha1 = (s: string | Uint8Array) => createHash("sha1").update(s).digest("hex");

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
    createModernForgeWorkflow: () => {
      throw new Error("non utilisé");
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
  for (const bad of ["../x", "a/b", "a\\b", "", ".hidden", "x".repeat(80), "1.20 ", "1.20.", "CON", "nul.txt", "COM1", "lpt9"]) assert.ok(!isSafeVersionId(bad), bad);
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
