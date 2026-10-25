// Lot E5 : signature, versions, release, mise à jour en attente et retour arrière (comparés à la version Python).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { applyInstaller, cleanupLeftovers, files, markHealthy, readPending, restorePrevious, skippedVersion, startupCheck, type UpdateEnv } from "../src/main/update/pending";
import { downloadUpdate, fetchLatestRelease, type ReleaseInfo } from "../src/main/update/release";
import { checkUpdateSignature, isNewer, UPDATE_PUBLIC_KEY, updateSignedMessage, UpdateRefused, verifyUpdateSignature, versionKey } from "../src/main/update/signature";
import { JsonStore } from "../src/main/storage/jsonStore";
import { HttpError } from "../src/main/net/download";
import { explainUpdateError, UpdateService } from "../src/main/update/service";
import { fakeFetch } from "./fakeNet";
import { tempDir } from "./helpers";

const REPO = path.join(__dirname, "..", "..", "..");
const PY = ["python3", "python"].find((cmd) => spawnSync(cmd, ["--version"]).status === 0);
const HAS_CRYPTO = !!PY && spawnSync(PY, ["-c", "import cryptography"]).status === 0;

function py(code: string, ...args: string[]): string {
  const r = spawnSync(PY!, ["-c", code, ...args], { cwd: REPO, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim().split("\n").pop()!;
}
const HARNESS = ["import json, sys", `sys.path.insert(0, ${JSON.stringify(path.join(REPO, "tests"))})`, "from _harness import load", "wl = load()"];

/** Paire de clés de TEST (jamais la vraie clé de signature). */
function testKeys(): { pub: string; signer: (msg: Buffer) => string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(12);
  return { pub: raw.toString("base64"), signer: (m) => sign(null, m, privateKey).toString("base64") };
}

test("versions : même ordre que version_key en Python", { skip: PY ? false : "Python absent" }, () => {
  const vs = ["1.2.0", "1.2.1-rc1", "1.2.1", "v1.2.10", "1.10", "2.0.0-beta.2", "2.0.0-beta.10", "2.0.0", "1.2", "0.9.9.9", "1.2.1-rc2", "V2.0.0"];
  const pairs = vs.flatMap((a) => vs.map((b) => [a, b]));
  const expected = JSON.parse(py([...HARNESS, "print(json.dumps([wl.is_newer(a, b) for a, b in json.loads(sys.argv[1])]))"].join("\n"), JSON.stringify(pairs)));
  assert.deepEqual(pairs.map(([a, b]) => isNewer(a!, b!)), expected);
  assert.deepEqual(versionKey("1.2.1-rc1"), [[1, 2, 1, 0], 0, [1]]);
});

test("signature : même message que Python ; une signature Python est acceptée, une fausse refusée", { skip: HAS_CRYPTO ? false : "cryptography absent" }, () => {
  const sha = createHash("sha256").update("exe").digest("hex");
  const code = [
    ...HARNESS,
    "from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey",
    "from cryptography.hazmat.primitives import serialization as s",
    "import base64",
    "k = Ed25519PrivateKey.generate()",
    "pub = base64.b64encode(k.public_key().public_bytes(s.Encoding.Raw, s.PublicFormat.Raw)).decode()",
    "v, h = sys.argv[1], sys.argv[2]",
    "print(json.dumps({'pub': pub, 'sig': base64.b64encode(k.sign(wl.update_signed_message(v, h))).decode(), 'msg': wl.update_signed_message(v, h).decode()}))",
  ].join("\n");
  const r = JSON.parse(py(code, "2.0.0", sha.toUpperCase())) as { pub: string; sig: string; msg: string };
  assert.equal(updateSignedMessage("2.0.0", sha.toUpperCase()).toString("utf8"), r.msg);
  assert.equal(verifyUpdateSignature("2.0.0", sha, r.sig, r.pub), true);
  assert.equal(verifyUpdateSignature("2.0.1", sha, r.sig, r.pub), false, "autre version");
  assert.equal(verifyUpdateSignature("2.0.0", "0" + sha.slice(1), r.sig, r.pub), false, "autre fichier");
  assert.equal(verifyUpdateSignature("2.0.0", sha, r.sig, UPDATE_PUBLIC_KEY), false, "autre clé");
  for (const bad of ["", "pas*du*base64", r.sig.slice(4), `${r.sig}AAAA`]) assert.equal(verifyUpdateSignature("2.0.0", sha, bad, r.pub), false, bad);
  // la vraie clé publique intégrée est bien une clé Ed25519 de 32 octets (identique à Python)
  assert.equal(py([...HARNESS, "print(wl.UPDATE_PUBLIC_KEY)"].join("\n")), UPDATE_PUBLIC_KEY);
});

test("politique : release non signée ou mal signée refusée (messages de la version Python)", () => {
  assert.throws(() => checkUpdateSignature({ version: "2.0.0", signature: null }, "a".repeat(64)), (e: Error) => e instanceof UpdateRefused && /pas signée/.test(e.message));
  assert.throws(() => checkUpdateSignature({ version: "2.0.0", signature: "AAAA" }, "a".repeat(64)), /signature de cette mise à jour est invalide/);
});

const API = "https://api.github.com/repos/Rexidelamort/WeCraft-Releases/releases/latest";
const DL = "https://github.com/Rexidelamort/WeCraft-Releases/releases/download/v2.0.0/";

test("release : installeur ReLaunch-Setup-<version>.exe seulement, empreinte (digest ou .sha256), signature, notes", async () => {
  const sha = "b".repeat(64);
  const release = (digest?: string) => ({
    tag_name: "v2.0.0",
    body: "  Nouveautés  ",
    html_url: "https://github.com/Rexidelamort/WeCraft-Releases/releases/tag/v2.0.0",
    assets: [
      { name: "notes.txt", browser_download_url: `${DL}notes.txt` },
      { name: "WeCraft.exe", browser_download_url: `${DL}WeCraft.exe`, size: 99 },
      { name: "ReLaunch-Setup-2.0.0.exe", browser_download_url: `${DL}ReLaunch-Setup-2.0.0.exe`, size: 10, ...(digest ? { digest } : {}) },
      { name: "ReLaunch-Setup-2.0.0.exe.sha256", browser_download_url: `${DL}ReLaunch-Setup-2.0.0.exe.sha256` },
      { name: "ReLaunch-Setup-2.0.0.exe.sig", browser_download_url: `${DL}ReLaunch-Setup-2.0.0.exe.sig` },
    ],
  });
  const routes = {
    [`${DL}ReLaunch-Setup-2.0.0.exe.sha256`]: { body: `${sha}  ReLaunch-Setup-2.0.0.exe\n` },
    [`${DL}ReLaunch-Setup-2.0.0.exe.sig`]: { body: " SIG== \n" },
  };
  let info = await fetchLatestRelease({ fetch: fakeFetch({ ...routes, [API]: { body: JSON.stringify(release()) } }) });
  assert.deepEqual(info, { version: "2.0.0", notes: "Nouveautés", page: release().html_url, url: `${DL}ReLaunch-Setup-2.0.0.exe`, size: 10, sha256: sha, signature: "SIG==" });
  info = await fetchLatestRelease({ fetch: fakeFetch({ ...routes, [API]: { body: JSON.stringify(release(`sha256:${"C".repeat(64)}`)) } }) });
  assert.equal(info.sha256, "c".repeat(64));
  // jamais un autre .exe (WeCraft.exe de la version Python) ; tag qui ne donne pas un nom sûr = pas d'installeur
  const odd = { ...release(), tag_name: "v2.0.0/../../x" };
  assert.equal((await fetchLatestRelease({ fetch: fakeFetch({ ...routes, [API]: { body: JSON.stringify(odd) } }) })).url, null);
  const pyOnly = { ...release(), assets: [{ name: "WeCraft.exe", browser_download_url: `${DL}WeCraft.exe` }] };
  assert.equal((await fetchLatestRelease({ fetch: fakeFetch({ [API]: { body: JSON.stringify(pyOnly) } }) })).url, null);
  // adresse hors GitHub : refusée par la couche réseau
  const evil = { ...release(), assets: [{ name: "ReLaunch-Setup-2.0.0.exe", browser_download_url: "https://exemple.com/x.exe" }, { name: "ReLaunch-Setup-2.0.0.exe.sig", browser_download_url: "https://exemple.com/x.exe.sig" }] };
  await assert.rejects(fetchLatestRelease({ fetch: fakeFetch({ [API]: { body: JSON.stringify(evil) } }) }), /serveur non autorisé/);
});

test("téléchargement : signature vérifiée AVANT, empreinte ensuite ; rien de gardé en cas d'échec", async () => {
  const { dir, cleanup } = tempDir("e5-dl");
  try {
    const keys = testKeys();
    const body = Buffer.from("INSTALLEUR v2.0.0");
    const sha = createHash("sha256").update(body).digest("hex");
    const dest = path.join(dir, "ReLaunch-Setup-2.0.0.exe");
    const base: ReleaseInfo = { version: "2.0.0", notes: "", page: "", url: `${DL}ReLaunch-Setup.exe`, size: body.length, sha256: sha, signature: null };
    let calls = 0;
    const fetch = fakeFetch({ [`${DL}ReLaunch-Setup.exe`]: { body } });
    const counting: typeof fetch = (u, i) => {
      calls++;
      return fetch(u, i);
    };
    await assert.rejects(downloadUpdate(base, dest, { fetch: counting }), /pas signée/);
    assert.equal(calls, 0, "rien téléchargé sans signature");
    // signature valide pour la clé de test : la vraie clé intégrée la refuse
    await assert.rejects(downloadUpdate({ ...base, signature: keys.signer(updateSignedMessage("2.0.0", sha)) }, dest, { fetch: counting }), /invalide/);
    assert.equal(calls, 0);
    assert.equal(existsSync(dest), false);
  } finally {
    cleanup();
  }
});

// --------------------------------------------------------------- mise à jour en attente

function env(dir: string, over: Partial<UpdateEnv> = {}): UpdateEnv & { started: string[]; clock: { t: number } } {
  const started: string[] = [];
  const clock = { t: Date.UTC(2026, 9, 24, 20, 0, 0) };
  return {
    dataDir: path.join(dir, "wecraft"),
    execPath: path.join(dir, "Programs", "ReLaunch", "ReLaunch.exe"),
    version: "2.0.0",
    platform: "win32",
    packaged: true,
    store: new JsonStore(),
    start: async (f, a) => void started.push([f, ...a].join(" ")),
    now: () => new Date(clock.t),
    started,
    clock,
    ...over,
  };
}

const KEYS = testKeys();
const shaOf = (t: string) => createHash("sha256").update(t).digest("hex");
const signed = (version: string, content: string) => ({ sha256: shaOf(content), signature: KEYS.signer(updateSignedMessage(version, shaOf(content))) });
/** Installeur gardé avec sa preuve (comme après un téléchargement vérifié). */
function keep(file: string, version: string, content: string): void {
  writeFileSync(file, content);
  writeFileSync(`${file}.preuve.json`, JSON.stringify({ version, ...signed(version, content) }));
}

/** Passage depuis la version Python : WeCraft.exe (devenu l'installeur ReLaunch) + WeCraft.exe.old (Python). */
function passage(dir: string): { exe: string; old: string } {
  const app = path.join(dir, "WeCraft");
  mkdirSync(app, { recursive: true });
  const exe = path.join(app, "WeCraft.exe");
  writeFileSync(exe, "INSTALLEUR RELAUNCH 2.0.0");
  writeFileSync(`${exe}.old`, "PYTHON 1.2.7");
  writeFileSync(path.join(app, "WeCraft.exe.1729000000.old"), "vieux");
  writeFileSync(path.join(app, "autre.old"), "à garder");
  mkdirSync(path.join(dir, "wecraft"), { recursive: true });
  // écrit exactement comme apply_update en Python (json.dumps)
  writeFileSync(path.join(dir, "wecraft", "update_pending.json"), JSON.stringify({ exe, old: `${exe}.old`, from: "1.2.7", to: "2.0.0", starts: 0 }).replace(/,"/g, ', "').replace(/":/g, '": '));
  return { exe, old: `${exe}.old` };
}

test("passage Python → ReLaunch : 1ᵉʳ démarrage puis validation ; installeur gardé, ancienne version supprimée", async () => {
  const { dir, cleanup } = tempDir("e5-passage-ok");
  try {
    const { exe, old } = passage(dir);
    const e = env(dir, { publicKey: KEYS.pub, releaseProof: async (v) => signed(v, "INSTALLEUR RELAUNCH 2.0.0") });
    assert.equal(await startupCheck(e), null, "1ᵉʳ démarrage : rien à proposer");
    assert.equal(JSON.parse(readFileSync(files(e).pending, "utf8")).starts, 1);
    assert.equal(await markHealthy(e, true), false, "processus qui a passé la main : ne valide rien");
    assert.equal(await markHealthy(e), true);
    assert.equal(existsSync(files(e).pending), false);
    assert.equal(readFileSync(path.join(files(e).updates, "ReLaunch-Setup-2.0.0.exe"), "utf8"), "INSTALLEUR RELAUNCH 2.0.0");
    assert.ok(existsSync(path.join(files(e).updates, "ReLaunch-Setup-2.0.0.exe.preuve.json")), "installeur gardé avec sa preuve");
    assert.equal(existsSync(old), false);
    assert.equal(existsSync(path.join(path.dirname(exe), "WeCraft.exe.1729000000.old")), false);
    assert.equal(existsSync(path.join(path.dirname(exe), "autre.old")), true, "jamais un autre fichier");
    assert.equal(existsSync(exe), true, "WeCraft.exe (installeur) reste : les raccourcis continuent de marcher");
  } finally {
    cleanup();
  }
});

test("passage : installeur sans preuve (hors ligne, empreinte ou signature fausse) : pas gardé, validation quand même", async () => {
  for (const proof of [null, signed("2.0.0", "AUTRE FICHIER"), { ...signed("2.0.0", "INSTALLEUR RELAUNCH 2.0.0"), signature: KEYS.signer(Buffer.from("x")) }]) {
    const { dir, cleanup } = tempDir("e5-passage-sans-preuve");
    try {
      passage(dir);
      const e = env(dir, { publicKey: KEYS.pub, releaseProof: async () => proof });
      assert.equal(await markHealthy(e), true);
      assert.equal(existsSync(path.join(files(e).updates, "ReLaunch-Setup-2.0.0.exe")), false);
      assert.match(readFileSync(files(e).log, "utf8"), /non vérifié : pas gardé/);
    } finally {
      cleanup();
    }
  }
});

test("passage : 2ᵉ démarrage raté → retour à la version Python, version abandonnée ; double-clic ignoré", async () => {
  const { dir, cleanup } = tempDir("e5-passage-ko");
  try {
    const { exe } = passage(dir);
    const e = env(dir);
    assert.equal(await startupCheck(e), null);
    e.clock.t += 5_000;
    assert.equal(await startupCheck(e), null, "double-clic (< 30 s) : ne compte pas");
    assert.equal(JSON.parse(readFileSync(files(e).pending, "utf8")).starts, 1);
    e.clock.t += 60_000;
    const failed = await startupCheck(e);
    assert.ok(failed && failed.kind === "passage");
    await restorePrevious(e, failed);
    assert.equal(readFileSync(exe, "utf8"), "PYTHON 1.2.7");
    assert.equal(readdirSync(path.dirname(exe)).filter((n) => /^WeCraft\.exe\.\d{8}-\d{6}\.echec$/.test(n)).length, 1);
    assert.equal(existsSync(files(e).pending), false);
    assert.equal(await skippedVersion(e), "2.0.0");
    assert.deepEqual(e.started, [exe]);
  } finally {
    cleanup();
  }
});

test("passage : même comportement que la version Python sur le fichier qu'elle écrit (lecture croisée)", { skip: PY ? false : "Python absent" }, async () => {
  const { dir, cleanup } = tempDir("e5-croise");
  try {
    // la vraie fonction Python apply_update écrit update_pending.json ; ReLaunch le relit
    const app = path.join(dir, "WeCraft");
    mkdirSync(app, { recursive: true });
    writeFileSync(path.join(app, "WeCraft.exe"), "PYTHON");
    writeFileSync(path.join(app, "WeCraft_update.exe"), "INSTALLEUR");
    const code = [
      ...HARNESS,
      "from unittest import mock",
      "from pathlib import Path",
      "app, data = Path(sys.argv[1]), Path(sys.argv[2])",
      "with mock.patch.object(wl, 'FROZEN', True), mock.patch.object(sys, 'executable', str(app / 'WeCraft.exe')), \\",
      "     mock.patch.object(wl, 'MC_DIR', str(data)), mock.patch.object(wl, 'UPDATE_PENDING_FILE', data / 'update_pending.json'), \\",
      "     mock.patch.object(wl, 'APP_VERSION', '1.2.7'), mock.patch.object(wl.subprocess, 'Popen'):",
      "    data.mkdir(parents=True, exist_ok=True)",
      "    wl.apply_update(app / 'WeCraft_update.exe', '2.0.0')",
      "print('ok')",
    ].join("\n");
    py(code, app, path.join(dir, "wecraft"));
    const e = env(dir);
    const r = await readPending(e);
    assert.ok(r && r.kind === "passage" && r.data.from === "1.2.7");
    assert.equal(await markHealthy(e), true);
    assert.equal(existsSync(path.join(app, "WeCraft.exe.old")), false);
  } finally {
    cleanup();
  }
});

test("fichier de suivi modifié ou mal formé : ignoré, jamais de renommage ni de lancement", async () => {
  const { dir, cleanup } = tempDir("e5-piege");
  try {
    const e = env(dir);
    const { exe } = passage(dir);
    writeFileSync(path.join(dir, "victime.exe"), "x");
    const bad = [
      { exe, old: path.join(dir, "victime.exe"), from: "1", to: "2.0.0", starts: 5 }, // ancienne version ailleurs
      { exe, old: `${exe}.old`, from: "1", to: "1.9.9", starts: 5 }, // autre version
      { exe, old: null, to: "2.0.0", starts: 1 },
      { exe, old: "x", to: "2.0.0", starts: "1x" },
      { exe: e.execPath, old: path.join(dir, "victime.exe"), from: "1", to: "2.0.0", starts: 5 }, // pas un installeur gardé
      ["liste"],
    ];
    for (const b of bad) {
      writeFileSync(files(e).pending, JSON.stringify(b));
      assert.equal(await startupCheck(e), null, JSON.stringify(b));
      assert.equal(await markHealthy(e), false);
    }
    assert.equal(readFileSync(path.join(dir, "victime.exe"), "utf8"), "x");
    assert.deepEqual(e.started, []);
    assert.equal(await startupCheck(env(dir, { packaged: false })), null, "lancé depuis les sources : rien");
  } finally {
    cleanup();
  }
});

test("ReLaunch → ReLaunch : installeur lancé en silencieux, retour arrière avec l'installeur précédent", async () => {
  const { dir, cleanup } = tempDir("e5-electron");
  try {
    const e1 = env(dir, { version: "2.0.0", publicKey: KEYS.pub });
    mkdirSync(files(e1).updates, { recursive: true });
    const cur = path.join(files(e1).updates, "ReLaunch-Setup-2.0.0.exe");
    const next = path.join(files(e1).updates, "ReLaunch-Setup-2.1.0.exe");
    keep(cur, "2.0.0", "2.0.0");
    keep(next, "2.1.0", "2.1.0");
    await assert.rejects(applyInstaller(e1, path.join(dir, "ailleurs.exe"), "2.1.0"), /inattendu/);
    await assert.rejects(applyInstaller(e1, cur, "2.1.0"), /inattendu/, "installeur d'une autre version");
    // installeur remplacé après le téléchargement : refusé, rien lancé
    writeFileSync(next, "PIÉGÉ");
    await assert.rejects(applyInstaller(e1, next, "2.1.0"), /non vérifié/);
    assert.deepEqual(e1.started, []);
    keep(next, "2.1.0", "2.1.0");
    await applyInstaller(e1, next, "2.1.0");
    assert.deepEqual(e1.started, [`${next} /S --force-run`]);

    // nouvelle version : 2 démarrages ratés → l'installeur 2.0.0 est relancé
    const e2 = env(dir, { version: "2.1.0", publicKey: KEYS.pub });
    assert.equal(await startupCheck(e2), null);
    e2.clock.t += 60_000;
    const failed = await startupCheck(e2);
    assert.ok(failed && failed.kind === "electron");
    await restorePrevious(e2, failed);
    assert.deepEqual(e2.started, [`${cur} /S --force-run`]);
    assert.equal(await skippedVersion(e2), "2.1.0");
    assert.equal(existsSync(files(e2).pending), false);

    // installeur précédent remplacé : le retour arrière n'est ni proposé ni lancé
    await applyInstaller(e1, next, "2.1.0");
    writeFileSync(cur, "PIÉGÉ");
    const e2b = env(dir, { version: "2.1.0", publicKey: KEYS.pub });
    assert.equal(await startupCheck(e2b), null);
    e2b.clock.t += 60_000;
    assert.equal(await startupCheck(e2b), null, "pas proposé");
    const r = await readPending(e2b);
    await assert.rejects(restorePrevious(e2b, r!), /pas pu être vérifié/);
    assert.deepEqual(e2b.started, []);
    keep(cur, "2.0.0", "2.0.0");

    // l'installeur ne démarre pas : le suivi est remis en place, la version n'est pas abandonnée
    const e2c = env(dir, { version: "2.1.0", publicKey: KEYS.pub, start: async () => { throw new Error("refus"); } });
    await unlink(files(e2c).skip);
    await assert.rejects(restorePrevious(e2c, (await readPending(e2c))!), /refus/);
    assert.ok(existsSync(files(e2c).pending));
    assert.equal(await skippedVersion(e2c), null);

    // autre essai : validation, l'installeur inutile est supprimé, celui de la version en place gardé
    await applyInstaller(e1, next, "2.1.0");
    const e3 = env(dir, { version: "2.1.0", publicKey: KEYS.pub });
    assert.equal(await startupCheck(e3), null);
    assert.equal(await markHealthy(e3), true);
    assert.deepEqual(readdirSync(files(e3).updates).sort(), ["ReLaunch-Setup-2.1.0.exe", "ReLaunch-Setup-2.1.0.exe.preuve.json"]);
    await cleanupLeftovers(e3);
    assert.deepEqual(readdirSync(files(e3).updates).sort(), ["ReLaunch-Setup-2.1.0.exe", "ReLaunch-Setup-2.1.0.exe.preuve.json"]);
  } finally {
    cleanup();
  }
});

test("service : version abandonnée non reproposée au démarrage, message d'erreur clair en manuel, installation suivie", async () => {
  const { dir, cleanup } = tempDir("e5-service");
  try {
    const e = env(dir, { version: "2.0.0", publicKey: KEYS.pub });
    const info: ReleaseInfo = { version: "2.1.0", notes: "x".repeat(600), page: "https://github.com/Rexidelamort/WeCraft-Releases/releases/tag/v2.1.0", url: `${DL}ReLaunch-Setup-2.1.0.exe`, size: 4, ...signed("2.1.0", "2.1.0") };
    let quit = 0;
    const svc = new UpdateService({
      env: e,
      fetchLatest: async () => info,
      download: async (_i, dest, o) => {
        mkdirSync(path.dirname(dest), { recursive: true });
        writeFileSync(dest, "2.1.0");
        o?.onBytes?.(4);
        return "signature vérifiée";
      },
      quit: () => quit++,
    });
    const c = await svc.check(false);
    assert.ok(c.state === "available" && c.auto && c.notes.length === 503);
    mkdirSync(e.dataDir, { recursive: true });
    writeFileSync(files(e).skip, JSON.stringify({ version: "2.1.0" }));
    assert.equal((await svc.check(false)).state, "none", "abandonnée : pas reproposée au démarrage");
    assert.equal((await svc.check(true)).state, "available", "mais proposée si on vérifie à la main");
    assert.equal(svc.page(), info.page);
    assert.equal(svc.install(), true);
    assert.equal(svc.install(), false, "une seule à la fois");
    await new Promise((r) => setTimeout(r, 700));
    assert.equal(svc.status().phase, "restart");
    assert.equal(svc.handedOff, true);
    assert.equal(quit, 1);
    assert.deepEqual(e.started, [`${path.join(files(e).updates, "ReLaunch-Setup-2.1.0.exe")} /S --force-run`]);

    const off = new UpdateService({ env: env(dir), fetchLatest: async () => { throw new HttpError("u", 404); }, quit: () => undefined });
    assert.deepEqual(await off.check(false), { state: "none", current: "2.0.0", latest: null }, "silencieux au démarrage");
    const m = await off.check(true);
    assert.ok(m.state === "error" && /Aucune release trouvée/.test(m.message));
    assert.match(explainUpdateError(new HttpError("u", 429)), /Limite de requêtes/);
    const notPackaged = new UpdateService({ env: env(dir, { packaged: false }), fetchLatest: async () => info, quit: () => undefined });
    const np = await notPackaged.check(true);
    assert.ok(np.state === "available" && !np.auto);
    assert.equal(notPackaged.install(), false);
    const evilPage = new UpdateService({ env: env(dir), fetchLatest: async () => ({ ...info, page: "https://exemple.com/x" }), quit: () => undefined });
    await evilPage.check(true);
    assert.equal(evilPage.page(), null);
  } finally {
    cleanup();
  }
});
