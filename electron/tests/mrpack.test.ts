// Modpacks .mrpack : chemins, hôtes, empreintes, overrides, nouvelle instance seulement.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { installMrpack, planMrpack, safeRelPath } from "../src/main/modpacks/mrpack";
import { fakeFetch } from "./fakeNet";
import { tempDir } from "./helpers";

/** Petite archive ZIP (méthode « deflate ») écrite à la main pour les tests. */
function zip(files: Record<string, Buffer | string>): Buffer {
  const loc: Buffer[] = [];
  const cen: Buffer[] = [];
  let off = 0;
  for (const [name, d0] of Object.entries(files)) {
    const data = Buffer.isBuffer(d0) ? d0 : Buffer.from(d0);
    const comp = deflateRawSync(data);
    const n = Buffer.from(name);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(n.length, 28);
    ch.writeUInt32LE(off, 42);
    loc.push(lh, n, comp);
    cen.push(ch, n);
    off += 30 + n.length + comp.length;
  }
  const cd = Buffer.concat(cen);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(off, 16);
  return Buffer.concat([...loc, cd, end]);
}
const sha512 = (b: Buffer | string) => createHash("sha512").update(b).digest("hex");

test("chemins des fichiers d'un modpack : seulement des chemins relatifs sûrs, jamais d'exécutable Windows", () => {
  for (const ok of ["mods/sodium.jar", "config/a b/c.toml", "kubejs/server_scripts/x.js", "resourcepacks/Faithful.zip"]) assert.equal(safeRelPath(ok), ok);
  for (const bad of ["../x.jar", "mods/../../x", "/etc/x", "C:/x", "mods\\x.jar", "mods//x", "mods/./x", "mods/x.jar:flux", "mods/CON", "mods/nul.txt", "mods/x.", "config/evil.exe", "a.bat", "x.ps1", "x.lnk", "", "a\0b"])
    assert.equal(safeRelPath(bad), null, bad);
});

test("plan : version, loader, fichiers vérifiés ; fichiers dangereux ou non vérifiables ignorés et signalés", () => {
  const h = sha512("x");
  const plan = planMrpack({
    formatVersion: 1,
    game: "minecraft",
    versionId: "6.4.0",
    name: "Fabulously Optimized",
    dependencies: { minecraft: "1.21.1", "fabric-loader": "0.16.9" },
    files: [
      { path: "mods/sodium.jar", hashes: { sha512: h, sha1: "a".repeat(40) }, downloads: ["https://cdn.modrinth.com/data/a/sodium.jar"], fileSize: 1 },
      { path: "mods/serveur.jar", env: { client: "unsupported", server: "required" }, hashes: { sha512: h }, downloads: ["https://cdn.modrinth.com/x"] },
      { path: "../evil.jar", hashes: { sha512: h }, downloads: ["https://cdn.modrinth.com/x"] },
      { path: "mods/sans-hash.jar", hashes: { sha1: "a".repeat(40) }, downloads: ["https://cdn.modrinth.com/x"] },
      { path: "mods/ailleurs.jar", hashes: { sha512: h }, downloads: ["https://evil.example/x.jar", "http://cdn.modrinth.com/x"] },
      { path: "mods/github.jar", hashes: { sha512: h }, downloads: ["https://evil.example/x", "https://github.com/o/r/releases/download/v1/x.jar"] },
    ],
  });
  assert.deepEqual([plan.mc, plan.loader, plan.loaderVersion, plan.name], ["1.21.1", "Fabric", "0.16.9", "Fabulously Optimized"]);
  assert.deepEqual(plan.files.map((f) => [f.path, f.url]), [
    ["mods/sodium.jar", "https://cdn.modrinth.com/data/a/sodium.jar"],
    ["mods/github.jar", "https://github.com/o/r/releases/download/v1/x.jar"],
  ]);
  assert.equal(plan.warnings.length, 3);
  assert.throws(() => planMrpack({ formatVersion: 2, game: "minecraft" }), /format inconnu/);
  assert.throws(() => planMrpack({ formatVersion: 1, game: "minecraft", dependencies: { minecraft: "../1" } }), /Minecraft/);
  assert.equal(planMrpack({ formatVersion: 1, game: "minecraft", dependencies: { minecraft: "1.20.1", neoforge: "47.1.0", forge: "x" } }).loader, "NeoForge");
});

test("installation : nouvelle instance, fichiers vérifiés (SHA-512), overrides copiés, rien hors du dossier ; échec = dossier retiré", async () => {
  const { dir, cleanup } = tempDir("mrpack");
  try {
    const jar = Buffer.from("SODIUM");
    const index = {
      formatVersion: 1,
      game: "minecraft",
      versionId: "1.0",
      name: "Pack : test",
      dependencies: { minecraft: "1.20.1", forge: "47.2.0" },
      files: [{ path: "mods/sodium.jar", hashes: { sha512: sha512(jar) }, downloads: ["https://cdn.modrinth.com/data/a/sodium.jar"], fileSize: jar.length }],
    };
    const archive = path.join(dir, "pack.mrpack");
    writeFileSync(archive, zip({ "modrinth.index.json": JSON.stringify(index), "overrides/config/a.toml": "x=1", "client-overrides/options.txt": "fov:90", "overrides/../evil.txt": "non", "overrides/run.bat": "non" }));
    const inst = path.join(dir, "instances");
    const fetch = fakeFetch({ "https://cdn.modrinth.com/data/a/sodium.jar": { body: jar } });
    const progress: string[] = [];
    const r = await installMrpack(archive, inst, null, (d, t, m) => progress.push(`${d}/${t} ${m}`), { fetch, userAgent: "test" });
    assert.equal(path.basename(r.folder), "Pack  test");
    assert.equal(readFileSync(path.join(r.folder, "mods", "sodium.jar"), "utf8"), "SODIUM");
    assert.equal(readFileSync(path.join(r.folder, "config", "a.toml"), "utf8"), "x=1");
    assert.equal(readFileSync(path.join(r.folder, "options.txt"), "utf8"), "fov:90");
    assert.equal(existsSync(path.join(inst, "evil.txt")) || existsSync(path.join(dir, "evil.txt")), false);
    assert.equal(existsSync(path.join(r.folder, "run.bat")), false);
    assert.equal(r.warnings.length, 2);
    assert.deepEqual(JSON.parse(readFileSync(path.join(r.folder, "wecraft.json"), "utf8")), { name: "Pack : test", version: "1.20.1", loader: "Forge", loader_version: "47.2.0" });
    assert.ok(progress.includes("1/1 sodium.jar"));
    // même nom : refus, rien de touché
    await assert.rejects(installMrpack(archive, inst, null, () => undefined, { fetch, userAgent: "t" }), /existe déjà/);
    assert.equal(readFileSync(path.join(r.folder, "mods", "sodium.jar"), "utf8"), "SODIUM");
    // fichier modifié en route : refus, dossier neuf retiré
    const bad = fakeFetch({ "https://cdn.modrinth.com/data/a/sodium.jar": { body: Buffer.from("PIÉGÉ") } });
    await assert.rejects(installMrpack(archive, inst, "Autre", () => undefined, { fetch: bad, userAgent: "t" }));
    assert.equal(existsSync(path.join(inst, "Autre")), false);
    // pas un modpack
    mkdirSync(path.join(dir, "x"));
    writeFileSync(path.join(dir, "x", "faux.mrpack"), zip({ "a.txt": "x" }));
    await assert.rejects(installMrpack(path.join(dir, "x", "faux.mrpack"), inst, null, () => undefined, { fetch, userAgent: "t" }), /modrinth.index.json absent/);
  } finally {
    cleanup();
  }
});
