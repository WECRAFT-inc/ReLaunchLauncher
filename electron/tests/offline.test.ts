import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { isOfflineName, joinArgs, OFFLINE_JVM_ARGS, OFFLINE_NAME_COOLDOWN_MS, offlineLockedUntil, offlineSession, offlineUuid, parseServerAddress } from "../src/main/auth/offline";
import { Settings } from "../src/main/config";
import { decodeEvent } from "../src/main/relink/worker";
import { JsonStore } from "../src/main/storage/jsonStore";
import { tempDir } from "./helpers";

test("UUID hors-ligne : mêmes valeurs que Minecraft Java (vecteurs de Cubic)", () => {
  assert.equal(offlineUuid("Steve"), "5627dd98-e6be-3c21-b8a8-e92344183641");
  assert.equal(offlineUuid("Alex"), "36532b5e-c442-3dbb-a24c-c7e55d0f979a");
  assert.equal(offlineUuid("Notch"), "b50ad385-829d-3141-a216-7e7d7539ba7f");
  assert.equal(offlineUuid("Steve"), offlineUuid("Steve"));
  assert.notEqual(offlineUuid("Steve"), offlineUuid("steve")); // sensible à la casse
});

test("pseudo : 3 à 16 caractères, lettres, chiffres ou _", () => {
  for (const ok of ["abc", "Steve_01", "A".repeat(16)]) assert.equal(isOfflineName(ok), true, ok);
  for (const bad of ["", "ab", "A".repeat(17), "a b", "é_é_é", "a-b", " Steve", "Steve\n", null, 3, {}]) assert.equal(isOfflineName(bad), false, String(bad));
});

test("session hors-ligne : UUID sans tirets, jeton factice, refus d'un pseudo invalide", () => {
  assert.deepEqual(offlineSession("Notch"), { name: "Notch", uuid: "b50ad385829d3141a2167e7d7539ba7f", accessToken: "0" });
  assert.equal(offlineSession("x"), null);
  assert.ok(OFFLINE_JVM_ARGS.includes("-Dminecraft.api.env=custom"));
  assert.ok(OFFLINE_JVM_ARGS.every((a) => a.startsWith("-Dminecraft.api.")));
});

test("réglages : pseudo enregistré, activé, coupé, oublié ; autres réglages conservés", async () => {
  const { dir, cleanup } = tempDir("offline");
  try {
    const f = path.join(dir, "launcher_config.json");
    writeFileSync(f, '{"ram": 8, "theme": "aurore"}', "utf8");
    const s = new Settings(new JsonStore(), f);
    assert.deepEqual(await s.offlineAccount(), { name: null, active: false, changedAt: null });
    assert.equal(await s.setOfflineActive(true), false); // rien à activer
    assert.equal(await s.setOfflineAccount("pas valide!"), false);
    assert.equal(await s.setOfflineAccount("Steve_01", true, 1000), true);
    assert.deepEqual(await s.offlineAccount(), { name: "Steve_01", active: true, changedAt: 1000 });
    assert.equal(await s.setOfflineActive(false), true);
    assert.deepEqual(await s.offlineAccount(), { name: "Steve_01", active: false, changedAt: 1000 }); // le délai n'est pas touché
    assert.equal(await s.setOfflineAccount(null), true);
    assert.deepEqual(await s.offlineAccount(), { name: null, active: false, changedAt: null });
    assert.deepEqual(JSON.parse(readFileSync(f, "utf8")), { ram: 8, theme: "aurore" });
  } finally {
    cleanup();
  }
});

test("réglages : pseudo corrompu dans le fichier ignoré", async () => {
  const { dir, cleanup } = tempDir("offline-bad");
  try {
    const f = path.join(dir, "launcher_config.json");
    writeFileSync(f, '{"relaunch_offline_name": "x y", "relaunch_offline_active": true}', "utf8");
    assert.deepEqual(await new Settings(new JsonStore(), f).offlineAccount(), { name: null, active: false, changedAt: null });
  } finally {
    cleanup();
  }
});

test("délai de 90 jours (affichage de la copie locale ; le Worker applique la règle)", () => {
  const t0 = 1_700_000_000_000;
  assert.equal(OFFLINE_NAME_COOLDOWN_MS, 90 * 24 * 3600 * 1000);
  assert.equal(offlineLockedUntil(null, t0), null); // aucun pseudo choisi : libre
  assert.equal(offlineLockedUntil(t0, t0), t0 + OFFLINE_NAME_COOLDOWN_MS);
  assert.equal(offlineLockedUntil(t0, t0 + OFFLINE_NAME_COOLDOWN_MS - 1), t0 + OFFLINE_NAME_COOLDOWN_MS);
  assert.equal(offlineLockedUntil(t0, t0 + OFFLINE_NAME_COOLDOWN_MS), null); // les 90 jours sont écoulés
  assert.equal(offlineLockedUntil(Number.NaN, t0), null);
});

test("réglages : la date de choix survit au redémarrage de l'activation et disparaît avec « oublier »", async () => {
  const { dir, cleanup } = tempDir("offline-lock");
  try {
    const f = path.join(dir, "launcher_config.json");
    writeFileSync(f, "{}", "utf8");
    const s = new Settings(new JsonStore(), f);
    await s.setOfflineAccount("Steve_01", true, 5000);
    await s.setOfflineActive(false);
    await s.setOfflineActive(true);
    assert.equal((await s.offlineAccount()).changedAt, 5000);
    await s.setOfflineAccount(null);
    assert.deepEqual(JSON.parse(readFileSync(f, "utf8")), {});
  } finally {
    cleanup();
  }
});

test("adresse du serveur d'event : domaine[:port], port 25565 par défaut, le reste est refusé", () => {
  assert.deepEqual(parseServerAddress("Play.Exemple.fr:25570"), { host: "play.exemple.fr", port: 25570 });
  assert.deepEqual(parseServerAddress("1.2.3.4"), { host: "1.2.3.4", port: 25565 });
  for (const bad of ["", "a b", "x:0", "x:70000", "-a.fr", "a..b", "http://x.fr", "x.fr:25565:1", null, 5]) assert.equal(parseServerAddress(bad), null, String(bad));
});

test("connexion automatique : Quick Play dès la 1.20, --server/--port avant", () => {
  assert.deepEqual(joinArgs("1.20.1", "play.exemple.fr"), ["--quickPlayMultiplayer", "play.exemple.fr:25565"]);
  assert.deepEqual(joinArgs("1.21.4", "play.exemple.fr:25570"), ["--quickPlayMultiplayer", "play.exemple.fr:25570"]);
  assert.deepEqual(joinArgs("26.1", "play.exemple.fr"), ["--quickPlayMultiplayer", "play.exemple.fr:25565"]);
  assert.deepEqual(joinArgs("1.19.4", "play.exemple.fr:25570"), ["--server", "play.exemple.fr", "--port", "25570"]);
  assert.deepEqual(joinArgs("1.12.2", "1.2.3.4"), ["--server", "1.2.3.4", "--port", "25565"]);
  assert.deepEqual(joinArgs("1.21", "adresse invalide!"), []);
});

test("event : comptes hors-ligne acceptés seulement avec une adresse de serveur valide", () => {
  const base = { id: "ev1", n: "Event", requireMicrosoft: false };
  assert.deepEqual(pickOffline(decodeEvent({ ...base, allowOffline: true, offlineHost: "play.exemple.fr:25570" })), { allowOffline: true, offlineHost: "play.exemple.fr:25570" });
  assert.deepEqual(pickOffline(decodeEvent({ ...base, allowOffline: true, offlineHost: "play.exemple.fr" })), { allowOffline: true, offlineHost: "play.exemple.fr" });
  assert.deepEqual(pickOffline(decodeEvent({ ...base, allowOffline: true })), { allowOffline: false, offlineHost: "" }); // pas d'adresse = refusé
  assert.deepEqual(pickOffline(decodeEvent({ ...base, allowOffline: true, offlineHost: "x y" })), { allowOffline: false, offlineHost: "" });
  assert.deepEqual(pickOffline(decodeEvent({ ...base, offlineHost: "play.exemple.fr" })), { allowOffline: false, offlineHost: "" }); // non autorisé = refusé
});

function pickOffline(e: ReturnType<typeof decodeEvent>) {
  return { allowOffline: e?.allowOffline, offlineHost: e?.offlineHost };
}
