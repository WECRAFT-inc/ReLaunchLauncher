// Couche réseau sûre (lot E3) : HTTPS, serveurs autorisés, redirections, tailles, empreintes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  checkUrl,
  downloadVerified,
  fetchJson,
  HttpError,
  IntegrityError,
  runLimited,
  TooLargeError,
  UnsafeUrlError,
} from "../src/main/net/download";
import { fakeFetch } from "./fakeNet";
import { tempDir } from "./helpers";

const sha1 = (s: string | Uint8Array) => createHash("sha1").update(s).digest("hex");
const sha256 = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
const M = "https://piston-data.mojang.com/";

test("adresses : HTTPS et serveurs autorisés seulement", () => {
  assert.equal(checkUrl(`${M}a.jar`).hostname, "piston-data.mojang.com");
  for (const bad of [
    "http://piston-data.mojang.com/a.jar",
    "http://files.minecraftforge.net/maven/x.jar", // constat X3
    "https://evil.example/a.jar",
    "https://piston-data.mojang.com.evil.example/a",
    "https://user:pw@piston-data.mojang.com/a",
    "https://piston-data.mojang.com:8443/a",
    "file:///C:/Windows/system32/calc.exe",
    "pas une adresse",
  ]) {
    assert.throws(() => checkUrl(bad), UnsafeUrlError, bad);
  }
});

test("redirection vers HTTP ou un autre serveur : refusée (constat X5)", async () => {
  for (const loc of ["http://piston-data.mojang.com/b", "https://evil.example/b"]) {
    const f = fakeFetch({ [`${M}a`]: { status: 302, headers: { location: loc } } });
    await assert.rejects(fetchJson(`${M}a`, 1000, {}, { fetch: f }), UnsafeUrlError);
  }
});

test("redirection autorisée suivie, relative comprise ; boucle stoppée", async () => {
  const f = fakeFetch({
    [`${M}a`]: { status: 301, headers: { location: "/b" } },
    [`${M}b`]: { body: '{"ok":true}' },
  });
  assert.deepEqual(await fetchJson(`${M}a`, 1000, {}, { fetch: f }), { ok: true });
  const loop = fakeFetch({ [`${M}l`]: { status: 302, headers: { location: `${M}l` } } });
  await assert.rejects(fetchJson(`${M}l`, 1000, {}, { fetch: loop }), HttpError);
});

test("réponse non 200 : erreur", async () => {
  await assert.rejects(fetchJson(`${M}x`, 1000, {}, { fetch: fakeFetch({}) }), HttpError);
});

test("document trop gros : refusé (annoncé ou réel)", async () => {
  const big = "x".repeat(2000);
  await assert.rejects(fetchJson(`${M}a`, 1000, {}, { fetch: fakeFetch({ [`${M}a`]: { body: big } }) }), TooLargeError);
  const lying = fakeFetch({ [`${M}a`]: { body: big, headers: { "content-length": "10" } } });
  await assert.rejects(fetchJson(`${M}a`, 1000, {}, { fetch: lying }), (e) => e instanceof TooLargeError || e instanceof TypeError);
});

test("document JSON : empreinte vérifiée", async () => {
  const body = '{"v":1}';
  const f = fakeFetch({ [`${M}a`]: { body } });
  assert.deepEqual(await fetchJson(`${M}a`, 1000, { sha1: sha1(body) }, { fetch: f }), { v: 1 });
  await assert.rejects(fetchJson(`${M}a`, 1000, { sha1: sha1("autre") }, { fetch: f }), IntegrityError);
});

test("téléchargement vérifié : fichier installé, aucun temporaire, progression réelle", async () => {
  const { dir, cleanup } = tempDir("dl");
  try {
    const body = "contenu du jar";
    const dest = path.join(dir, "sous", "a.jar");
    let bytes = 0;
    await downloadVerified(`${M}a`, dest, { sha1: sha1(body), size: body.length }, {
      fetch: fakeFetch({ [`${M}a`]: { body } }),
      onBytes: (n) => (bytes += n),
    });
    assert.equal(readFileSync(dest, "utf8"), body);
    assert.equal(bytes, body.length);
    assert.deepEqual(readdirSync(path.dirname(dest)), ["a.jar"]);
  } finally {
    cleanup();
  }
});

test("empreinte fausse : le fichier existant n'est pas touché, temporaire supprimé (constat X1)", async () => {
  const { dir, cleanup } = tempDir("dl-bad");
  try {
    const dest = path.join(dir, "a.jar");
    writeFileSync(dest, "ancien", "utf8");
    const f = fakeFetch({ [`${M}a`]: { body: "modifié en route" } });
    await assert.rejects(downloadVerified(`${M}a`, dest, { sha1: sha1("attendu") }, { fetch: f }), IntegrityError);
    await assert.rejects(downloadVerified(`${M}a`, dest, { sha256: sha256("attendu") }, { fetch: f }), IntegrityError);
    await assert.rejects(
      downloadVerified(`${M}a`, dest, { sha1: sha1("modifié en route"), size: 3 }, { fetch: f }),
      (e) => e instanceof TooLargeError || e instanceof IntegrityError,
    );
    assert.equal(readFileSync(dest, "utf8"), "ancien");
    assert.deepEqual(readdirSync(dir), ["a.jar"]);
  } finally {
    cleanup();
  }
});

test("téléchargement sans empreinte connue : refusé sans contacter le serveur", async () => {
  const { dir, cleanup } = tempDir("dl-none");
  try {
    const log: string[] = [];
    const dest = path.join(dir, "a.jar");
    await assert.rejects(downloadVerified(`${M}a`, dest, {}, { fetch: fakeFetch({}, log) }), IntegrityError);
    assert.deepEqual(log, []);
    assert.equal(existsSync(dest), false);
  } finally {
    cleanup();
  }
});

test("tâches limitées : toutes faites, première erreur remontée", async () => {
  let active = 0;
  let peak = 0;
  const done: number[] = [];
  await runLimited([1, 2, 3, 4, 5, 6], 2, async (n) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 2));
    done.push(n);
    active--;
  });
  assert.equal(done.length, 6);
  assert.ok(peak <= 2);
  await assert.rejects(runLimited([1, 2, 3], 2, async (n) => { if (n === 2) throw new Error("x"); }), /x/);
});
