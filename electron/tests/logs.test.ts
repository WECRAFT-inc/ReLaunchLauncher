// Réglages > Logs : formats lus, niveaux, lecture limitée, masquage des données sensibles.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { appLogger, levelOf, LOG_TAIL_BYTES, logSources, parseLine, readLogs, redact } from "../src/main/logs/logs";
import { tempDir } from "./helpers";

test("masquage : jetons, identifiants de session, mots de passe, nom d'utilisateur Windows", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
  const s = redact(`accessToken=abc123 "clientToken": "zz" Bearer abcdefghijk token ${jwt} https://x.org/a?token=SECRET&b=1 --accessToken XYZ C:\\Users\\lesci\\AppData\\Roaming\\.wecraft /home/bob/.wecraft password: hunter2`);
  for (const bad of ["abc123", '"zz"', "abcdefghijk", jwt, "SECRET", "XYZ", "lesci", "bob", "hunter2"]) assert.ok(!s.includes(bad), bad);
  assert.ok(s.includes("C:\\Users\\[utilisateur]\\AppData") && s.includes("b=1"));
  assert.equal(redact("sha256 3f5a… ok, version 2.0.0"), "sha256 3f5a… ok, version 2.0.0", "le reste est intact");
});

test("lignes : trois formats, niveau écrit ou déduit, lignes inconnues ignorées", () => {
  assert.deepEqual(parseLine("2026-10-25T01:02:03.456Z [ERREUR] [modpacks:install-version] Réseau coupé", "x"), { time: "2026-10-25T01:02:03.456Z", level: "error", origin: "modpacks:install-version", text: "Réseau coupé", guessed: false });
  const l = parseLine("2026-10-24T20:55:00.000Z Terminé : launcher officiel NON ouvert.", "Lancement")!;
  assert.deepEqual([l.level, l.origin, l.guessed], ["warn", "Lancement", true]);
  const u = parseLine("2026-10-19 15:30:01  v1.2.1 : mise à jour refusée (signature invalide)", "Mises à jour")!;
  assert.deepEqual([u.level, u.origin], ["error", "Mises à jour"]);
  assert.equal(levelOf("Erreur (installation) : x"), "error");
  assert.equal(levelOf("Profil écrit : WECRAFT - A"), "info");
  assert.equal(levelOf("Paquet Store/Xbox : lecture impossible (x)"), "warn");
  assert.equal(parseLine("n'importe quoi", "x"), null);
});

test("lecture : fin des fichiers seulement, toutes sources mélangées par date, journal de l'application masqué", async () => {
  const { dir, cleanup } = tempDir("logs");
  try {
    mkdirSync(path.join(dir, "logs"), { recursive: true });
    const big = Array.from({ length: 9000 }, (_, i) => `2026-10-24T10:${String(Math.floor(i / 60) % 60).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z ligne ${i} ${"x".repeat(30)}`).join("\n");
    writeFileSync(path.join(dir, "logs", "lancement.log"), big + "\n");
    writeFileSync(path.join(dir, "update.log"), "2026-10-24 23:00:00  v2.0.0 a démarré correctement : ancienne version supprimée\n");
    const log = appLogger(path.join(dir, "logs", "relaunch.log"), () => new Date("2026-10-25T00:00:00.000Z"));
    await log.error("Modpacks", "Échec\navec accessToken=abc et C:\\Users\\lesci\\x");
    const raw = readFileSync(path.join(dir, "logs", "relaunch.log"), "utf8");
    assert.ok(!raw.includes("abc") && !raw.includes("lesci") && !raw.includes("\nwith"), "masqué avant écriture, une seule ligne");
    const r = await readLogs(logSources(dir));
    assert.equal(r.truncated, true);
    assert.ok(Buffer.byteLength(big) > LOG_TAIL_BYTES);
    assert.equal(r.entries[0]!.origin, "Modpacks", "origine écrite dans le journal de l'application");
    assert.equal(r.entries[0]!.level, "error");
    assert.equal(r.entries[1]!.origin, "Mises à jour");
    assert.ok(r.entries.length <= 3000);
    assert.ok(r.entries.every((e) => e.text.length > 0));
  } finally {
    cleanup();
  }
});
