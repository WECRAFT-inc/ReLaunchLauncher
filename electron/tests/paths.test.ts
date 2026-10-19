// Les chemins doivent être identiques à ceux de la version Python (sinon les réglages « disparaissent »).
// Valeurs attendues obtenues avec le code Python (sibling_dir + get_minecraft_directory).
import assert from "node:assert/strict";
import { test } from "node:test";
import { configFile, minecraftDir, siblingDir, wecraftDataDir } from "../src/main/paths";

test("Windows : %APPDATA%\\.wecraft", () => {
  const e = { platform: "win32" as const, env: { APPDATA: "C:\\Users\\alex\\AppData\\Roaming" }, home: "C:\\Users\\alex" };
  assert.equal(minecraftDir(e), "C:\\Users\\alex\\AppData\\Roaming\\.minecraft");
  assert.equal(wecraftDataDir(e), "C:\\Users\\alex\\AppData\\Roaming\\.wecraft");
  assert.equal(configFile(e), "C:\\Users\\alex\\AppData\\Roaming\\.wecraft\\launcher_config.json");
});

test("Windows : nom d'utilisateur contenant « minecraft » non modifié (constat S8)", () => {
  const e = { platform: "win32" as const, env: { APPDATA: "C:\\Users\\minecraftfan\\AppData\\Roaming" }, home: "C:\\Users\\minecraftfan" };
  assert.equal(wecraftDataDir(e), "C:\\Users\\minecraftfan\\AppData\\Roaming\\.wecraft");
});

test("Windows : APPDATA absent -> dossier par défaut du profil", () => {
  const e = { platform: "win32" as const, env: {}, home: "C:\\Users\\alex" };
  assert.equal(wecraftDataDir(e), "C:\\Users\\alex\\AppData\\Roaming\\.wecraft");
});

test("Linux et macOS", () => {
  assert.equal(wecraftDataDir({ platform: "linux", env: {}, home: "/home/alex" }), "/home/alex/.wecraft");
  assert.equal(
    wecraftDataDir({ platform: "darwin", env: {}, home: "/Users/alex" }),
    "/Users/alex/Library/Application Support/wecraft",
  );
});

test("siblingDir ne renomme que le dernier dossier", () => {
  assert.equal(siblingDir("/minecraft/x/.minecraft", "wecraft", "linux"), "/minecraft/x/.wecraft");
  assert.equal(siblingDir("/a/minecraft", "wecraft", "linux"), "/a/wecraft");
});
