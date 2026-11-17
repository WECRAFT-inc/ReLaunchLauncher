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
  const out = `4242:${Buffer.from(CMD, "utf8").toString("base64")}\r\n\r\nWARNING: texte\r\n`;
  assert.deepEqual(decodeProcs(out), [{ pid: 4242, cmd: CMD }]);
});

test("partie lancée par le launcher officiel : démarrage, puis suivi par numéro de processus jusqu'à la fermeture", async () => {
  let now = 0;
  let procs: { pid: number; cmd: string }[] | null = [];
  let alive = true;
  let lists = 0;
  const ev: string[] = [];
  const w = new OfficialGameWatch({
    list: async () => {
      lists++;
      return procs;
    },
    alive: (pid) => pid === 77 && alive,
    onStart: (t) => ev.push(`start ${t.gameDir}`),
    onExit: (t) => ev.push(`exit ${t.gameDir}`),
    now: () => now,
    timers: { set: () => 1, clear: () => undefined },
  });
  w.watch({ gameDir: DIR });
  await w.poll(); // le joueur n'a pas encore cliqué sur Jouer
  assert.deepEqual(ev, []);
  procs = [{ pid: 77, cmd: CMD }];
  await w.poll();
  assert.deepEqual(ev, [`start ${DIR}`]);
  const n = lists;
  procs = []; // liste vide pendant la partie (PC chargé) : ignorée, le processus existe toujours
  for (let i = 0; i < 10; i++) await w.poll();
  assert.equal(ev.length, 1);
  assert.equal(lists, n, "plus de lecture de la liste pendant la partie");
  alive = false;
  await w.poll(); // 1er passage sans le processus : on attend
  assert.equal(ev.length, 1);
  await w.poll();
  assert.deepEqual(ev, [`start ${DIR}`, `exit ${DIR}`]);
  // jamais lancé : abandon après le délai
  w.watch({ gameDir: "C:\\x" });
  now = 21 * 60 * 1000;
  await w.poll();
  procs = [{ pid: 9, cmd: "java --gameDir C:\\x" }];
  await w.poll();
  assert.equal(ev.length, 2);
});
