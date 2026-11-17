import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeProcs, OfficialGameWatch, runsIn } from "../src/main/launch/gameWatch";

const DIR = "C:\\Users\\Élodie\\AppData\\Roaming\\.wecraft\\instances\\Créa";
const CMD = `"C:\\Program Files\\Java\\javaw.exe" -Xmx4G net.minecraft.client.main.Main --username Rexi --gameDir "${DIR}" --assetsDir x`;

test("partie : « --gameDir » reconnu (guillemets, barres, majuscules), autre dossier refusé", () => {
  assert.ok(runsIn(CMD, DIR));
  assert.ok(runsIn(CMD.replace(`"${DIR}"`, DIR.replace(/\\/g, "/").toUpperCase()), DIR));
  assert.ok(!runsIn(CMD, `${DIR}2`));
  assert.ok(!runsIn(CMD, "C:\\Users\\Élodie\\AppData\\Roaming\\.wecraft\\instances"));
  assert.ok(!runsIn("java -jar autre.jar", DIR));
});

test("partie : sortie PowerShell en base64 UTF-8 (accents intacts)", () => {
  const out = `${Buffer.from(CMD, "utf8").toString("base64")}\r\n\r\nWARNING: texte\r\n`;
  assert.deepEqual(decodeProcs(out), [CMD]);
});

test("partie lancée par le launcher officiel : démarrage puis fermeture détectés", async () => {
  let now = 0;
  let procs: string[] | null = [];
  const ev: string[] = [];
  const w = new OfficialGameWatch({ list: async () => procs, onStart: (t) => ev.push(`start ${t.gameDir}`), onExit: (t) => ev.push(`exit ${t.gameDir}`), now: () => now, timers: { set: () => 1, clear: () => undefined } });
  w.watch({ gameDir: DIR });
  await w.poll(); // le joueur n'a pas encore cliqué sur Jouer
  assert.deepEqual(ev, []);
  procs = [CMD];
  await w.poll();
  assert.deepEqual(ev, [`start ${DIR}`]);
  procs = null; // lecture ratée : rien ne change
  await w.poll();
  procs = [];
  await w.poll(); // 1er passage sans le jeu : on attend
  assert.equal(ev.length, 1);
  await w.poll();
  assert.deepEqual(ev, [`start ${DIR}`, `exit ${DIR}`]);
  // jamais lancé : abandon après le délai
  w.watch({ gameDir: "C:\\x" });
  now = 21 * 60 * 1000;
  await w.poll();
  procs = ["java --gameDir C:\\x"];
  await w.poll();
  assert.equal(ev.length, 2);
});
