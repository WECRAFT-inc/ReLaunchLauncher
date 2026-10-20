import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { legacyDataDirs } from "../src/main/paths";
import { migrateOldSettings } from "../src/main/storage/migrate";
import { tempDir } from "./helpers";

test("anciens dossiers : mêmes candidats qu'en Python", () => {
  // Nom d'utilisateur contenant « minecraft » : l'ancien calcul (bug S8) donnait d'autres dossiers.
  const e = { platform: "win32" as const, env: { APPDATA: "C:\\Users\\minecraftfan\\AppData\\Roaming" }, home: "C:\\Users\\minecraftfan" };
  assert.deepEqual(legacyDataDirs(e), [
    "C:\\Users\\wecraftfan\\AppData\\Roaming\\.wecraft",
    "C:\\Users\\mon_launcherfan\\AppData\\Roaming\\.mon_launcher",
    "C:\\Users\\minecraftfan\\AppData\\Roaming\\.mon_launcher",
  ]);
  // Cas courant : l'ancien calcul donnait déjà le bon dossier -> seul « .mon_launcher » reste.
  const e2 = { platform: "win32" as const, env: { APPDATA: "C:\\Users\\alex\\AppData\\Roaming" }, home: "C:\\Users\\alex" };
  assert.deepEqual(legacyDataDirs(e2), ["C:\\Users\\alex\\AppData\\Roaming\\.mon_launcher"]);
});

test("reprise par COPIE depuis un ancien dossier, original conservé", async () => {
  const { dir, cleanup } = tempDir("migr");
  try {
    const data = path.join(dir, ".wecraft");
    const old = path.join(dir, "ancien");
    mkdirSync(old);
    writeFileSync(path.join(old, "launcher_config.json"), '{"ram": 6}', "utf8");
    const done = await migrateOldSettings(data, [path.join(dir, "absent"), old]);
    assert.equal(done.length, 1);
    assert.deepEqual(JSON.parse(readFileSync(path.join(data, "launcher_config.json"), "utf8")), { ram: 6 });
    assert.ok(existsSync(path.join(old, "launcher_config.json")), "l'original ne doit pas être supprimé");
    assert.ok(!existsSync(path.join(data, "instances_meta.json")));
  } finally {
    cleanup();
  }
});

test("réglages déjà présents : jamais écrasés par la reprise", async () => {
  const { dir, cleanup } = tempDir("migr-keep");
  try {
    const data = path.join(dir, ".wecraft");
    const old = path.join(dir, "ancien");
    mkdirSync(data);
    mkdirSync(old);
    writeFileSync(path.join(data, "launcher_config.json"), '{"ram": 8}', "utf8");
    writeFileSync(path.join(old, "launcher_config.json"), '{"ram": 2}', "utf8");
    writeFileSync(path.join(old, "instances_meta.json"), '{"x": {}}', "utf8");
    const done = await migrateOldSettings(data, [old]);
    assert.deepEqual(done.map((d) => path.basename(d.file)), ["instances_meta.json"]);
    assert.equal(readFileSync(path.join(data, "launcher_config.json"), "utf8"), '{"ram": 8}');
  } finally {
    cleanup();
  }
});
