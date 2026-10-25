// Mise à jour en attente de validation et retour arrière (lot E5), port de apply_update / read_update_pending /
// update_startup_check / mark_update_healthy / restore_previous_version / cleanup_update_leftovers.
//
// Mêmes fichiers et même sémantique que la version Python (%APPDATA%\.wecraft) :
// - update_pending.json : { exe, old, from, to, starts, last_start } ; compté à chaque démarrage de la NOUVELLE
//   version tant qu'elle n'est pas validée ; deux démarrages à moins de 30 s (double-clic) comptent pour un ;
//   au 2ᵉ démarrage non validé, le retour arrière est proposé (si l'ancienne version existe encore) ;
// - update_skip.json : { version } abandonnée après un retour arrière (plus proposée automatiquement) ;
// - update.log : même format, ~256 Ko puis « .1 ».
//
// Deux cas, reconnus sans rien deviner :
// - « passage » : la version Python a installé ReLaunch (WeCraft.exe remplacé par l'installeur ReLaunch,
//   l'ancien WeCraft.exe gardé en « WeCraft.exe.old ») ; retour arrière = remettre WeCraft.exe.old en place ;
// - « electron » : ReLaunch s'est mis à jour lui-même avec un installeur ; retour arrière = réinstaller la
//   version précédente avec SON installeur, gardé dans .wecraft\updates.
// Les chemins lus dans update_pending.json sont vérifiés (l'ancienne version doit être « <exe>.old » à côté de
// l'exe, ou un installeur de .wecraft\updates) : un fichier modifié ne peut pas faire renommer ou lancer
// n'importe quel programme.
// Un installeur gardé n'est JAMAIS lancé sans preuve : « <installeur>.preuve.json » (version, empreinte, signature
// de la release) est écrit après le téléchargement vérifié ; juste avant de lancer l'installeur, son empreinte est
// recalculée et la signature revérifiée (un installeur remplacé dans .wecraft\updates est refusé).
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { appendFile, copyFile, mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { JsonStore, stamp } from "../storage/jsonStore";
import { UPDATE_PUBLIC_KEY, verifyUpdateSignature } from "./signature";

export const INSTALLER_NAME = /^ReLaunch-Setup-(\d+(?:\.\d+){0,3}(?:-[0-9A-Za-z.]+)?)\.exe$/;
const DOUBLE_CLICK_S = 30;

export interface PendingData {
  exe: string;
  old: string;
  from: string;
  to: string;
  starts: number;
  last_start?: number;
  kind?: "electron";
  [k: string]: unknown;
}

export type PendingKind = "electron" | "passage";

export interface UpdateEnv {
  dataDir: string;
  execPath: string;
  version: string;
  platform: NodeJS.Platform;
  /** Application installée (pas lancée depuis les sources) : comme FROZEN en Python. */
  packaged: boolean;
  store: JsonStore;
  /** Lance un programme détaché. */
  start: (file: string, args: string[]) => Promise<void>;
  now?: () => Date;
  /** Empreinte et signature publiées pour une version (release GitHub) : sert au passage Python → ReLaunch. */
  releaseProof?: (version: string) => Promise<{ sha256: string; signature: string } | null>;
  /** Clé publique (tests uniquement ; sinon la clé intégrée). */
  publicKey?: string;
}

export interface InstallerProof {
  version: string;
  sha256: string;
  signature: string;
}

export const proofPath = (installer: string) => `${installer}.preuve.json`;

export const files = (e: UpdateEnv) => ({
  pending: path.join(e.dataDir, "update_pending.json"),
  skip: path.join(e.dataDir, "update_skip.json"),
  log: path.join(e.dataDir, "update.log"),
  updates: path.join(e.dataDir, "updates"),
});

const now = (e: UpdateEnv) => (e.now ?? (() => new Date()))();
// Chemins du système où tourne ReLaunch ; sous Windows, comparaison sans tenir compte des majuscules.
const p = (_e: UpdateEnv) => path;
const same = (e: UpdateEnv, a: string, b: string) =>
  e.platform === "win32" ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);

async function isFile(f: string): Promise<boolean> {
  try {
    return (await stat(f)).isFile();
  } catch {
    return false;
  }
}

export function sha256File(f: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(f)
      .on("data", (c) => h.update(c))
      .on("error", reject)
      .on("end", () => resolve(h.digest("hex")));
  });
}

/** Note la preuve d'un installeur téléchargé et vérifié (version, empreinte, signature de la release). */
export async function writeProof(e: UpdateEnv, installer: string, proof: InstallerProof): Promise<boolean> {
  return e.store.writeAtomic(proofPath(installer), JSON.stringify(proof));
}

/**
 * Installeur gardé et prouvé : bon dossier, nom « ReLaunch-Setup-<version>.exe », preuve de la même version,
 * empreinte RECALCULÉE identique, signature valide. Appelé juste avant chaque lancement d'installeur.
 */
export async function verifiedInstaller(e: UpdateEnv, f: string): Promise<boolean> {
  try {
    const m = INSTALLER_NAME.exec(path.basename(f));
    if (!m || !isKeptInstaller(e, f) || !(await isFile(f))) return false;
    const d = await e.store.read(proofPath(f));
    if (!d || d["version"] !== m[1] || typeof d["sha256"] !== "string" || typeof d["signature"] !== "string") return false;
    const sha = await sha256File(f);
    return sha === d["sha256"].toLowerCase() && verifyUpdateSignature(m[1]!, sha, d["signature"], e.publicKey ?? UPDATE_PUBLIC_KEY);
  } catch {
    return false;
  }
}

/** update_log : « AAAA-MM-JJ HH:MM:SS  texte », ~256 Ko puis update.log.1. Jamais d'erreur. */
export async function updateLog(e: UpdateEnv, text: string): Promise<void> {
  const f = files(e).log;
  const d = now(e);
  const two = (n: number) => String(n).padStart(2, "0");
  const line = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}  ${text}\n`;
  try {
    await mkdir(path.dirname(f), { recursive: true });
    try {
      if ((await stat(f)).size > 256_000) await rename(f, `${f}.1`);
    } catch {
      // pas encore de journal
    }
    await appendFile(f, line, "utf8");
  } catch {
    // journal impossible : sans conséquence
  }
}

/** int(data.get("starts") or 0) en Python ; null si invalide (« 1x »). */
function pyInt(v: unknown): number | null {
  if (v === undefined || v === null || v === false || v === 0 || v === "") return 0;
  if (v === true) return 1;
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : null;
  if (typeof v === "string" && /^\s*[+-]?\d+\s*$/.test(v)) return parseInt(v, 10);
  return null;
}

/** L'ancienne version est-elle bien « <exe>.old » (ou « <exe>.<chiffres>.old ») à côté de l'exe ? */
function oldBesideExe(e: UpdateEnv, exe: string, old: string): boolean {
  const lib = p(e);
  if (!same(e, lib.dirname(exe), lib.dirname(old))) return false;
  const base = lib.basename(exe);
  const o = lib.basename(old);
  const cmp = e.platform === "win32" ? (s: string) => s.toLowerCase() : (s: string) => s;
  return cmp(o) === cmp(`${base}.old`) || new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.\\d+\\.old$`, e.platform === "win32" ? "i" : "").test(o);
}

/** Installeur gardé dans .wecraft\updates (nom « ReLaunch-Setup-<version>.exe »). */
function isKeptInstaller(e: UpdateEnv, f: string): boolean {
  return same(e, p(e).dirname(f), files(e).updates) && INSTALLER_NAME.test(p(e).basename(f));
}

/** read_update_pending : mise à jour en attente qui concerne CETTE version ; fichier mal formé ignoré. */
export async function readPending(e: UpdateEnv): Promise<{ data: PendingData; kind: PendingKind } | null> {
  const raw = await e.store.read(files(e).pending);
  if (!raw) return null;
  if (typeof raw["exe"] !== "string" || !raw["exe"] || String(raw["to"]) !== e.version || typeof raw["old"] !== "string") return null;
  const starts = pyInt(raw["starts"]);
  if (starts === null) return null;
  const data = { ...raw, starts } as PendingData;
  if (same(e, data.exe, e.execPath)) {
    if (data.old && !isKeptInstaller(e, data.old)) return null;
    return { data, kind: "electron" };
  }
  if (e.platform === "win32" && /\.exe$/i.test(data.exe) && oldBesideExe(e, data.exe, data.old)) return { data, kind: "passage" };
  return null;
}

/**
 * update_startup_check : compte les démarrages non validés ; renvoie la mise à jour si un retour arrière doit
 * être proposé (2ᵉ démarrage et ancienne version présente), sinon null. Ne lève jamais d'erreur.
 */
export async function startupCheck(e: UpdateEnv): Promise<{ data: PendingData; kind: PendingKind } | null> {
  if (!e.packaged) return null;
  try {
    const r = await readPending(e);
    if (!r) return null;
    const t = now(e).getTime() / 1000;
    if (t - Number(r.data.last_start ?? 0) > DOUBLE_CLICK_S) r.data.starts += 1;
    r.data.last_start = t;
    await e.store.writeAtomic(files(e).pending, JSON.stringify(r.data));
    if (r.data.starts < 2 || !r.data.old || !(await isFile(r.data.old))) return null;
    if (r.kind === "electron" && !(await verifiedInstaller(e, r.data.old))) {
      await updateLog(e, `retour arrière impossible : l'installeur de v${r.data.from} n'a pas pu être vérifié`);
      return null;
    }
    return r;
  } catch (err) {
    await updateLog(e, `contrôle de mise à jour au démarrage impossible (${String(err)})`);
    return null;
  }
}

/** Fichiers laissés par une mise à jour validée (cleanup_update_leftovers + installeurs devenus inutiles). */
async function cleanup(e: UpdateEnv, r: { data: PendingData; kind: PendingKind } | null): Promise<void> {
  const keep = `ReLaunch-Setup-${e.version}.exe`;
  try {
    for (const n of await readdir(files(e).updates)) {
      const inst = n.toLowerCase().endsWith(".preuve.json") ? n.slice(0, -".preuve.json".length) : n;
      if (INSTALLER_NAME.test(inst) && inst.toLowerCase() !== keep.toLowerCase()) await unlink(path.join(files(e).updates, n)).catch(() => undefined);
    }
  } catch {
    // pas de dossier updates
  }
  if (r?.kind !== "passage") return;
  // Uniquement « <exe>.old », « <exe>.<chiffres>.old », « <exe>.<date>.echec » et l'ancien script de la
  // version Python, à côté de WeCraft.exe : jamais un autre fichier.
  const lib = p(e);
  const dir = lib.dirname(r.data.exe);
  const base = lib.basename(r.data.exe).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const spare = new RegExp(`^${base}\\.(\\d+\\.old|\\d{8}-\\d{6}\\.echec)$`, "i");
  const targets = [`${r.data.exe}.old`, lib.join(dir, "wecraft_update.bat")];
  try {
    for (const n of await readdir(dir)) if (spare.test(n)) targets.push(lib.join(dir, n));
  } catch {
    // dossier illisible
  }
  for (const f of targets) await unlink(f).catch(() => undefined);
}

/**
 * mark_update_healthy : la nouvelle version a affiché sa fenêtre ; la mise à jour est validée, l'ancienne
 * version supprimée. Au « passage », l'installeur ReLaunch (devenu WeCraft.exe) est d'abord copié dans
 * .wecraft\updates : il servira au retour arrière de la prochaine mise à jour.
 */
export async function markHealthy(e: UpdateEnv, handedOff = false): Promise<boolean> {
  if (!e.packaged || handedOff) return false;
  const r = await readPending(e);
  if (!r) return false;
  if (r.kind === "passage") {
    // L'installeur n'est gardé que si son empreinte est celle, signée, de la release de cette version.
    const kept = path.join(files(e).updates, `ReLaunch-Setup-${e.version}.exe`);
    let ok = false;
    try {
      await mkdir(files(e).updates, { recursive: true });
      await copyFile(r.data.exe, kept);
      const proof = await (e.releaseProof?.(e.version) ?? Promise.resolve(null)).catch(() => null);
      const sha = await sha256File(kept);
      if (proof && proof.sha256.toLowerCase() === sha && verifyUpdateSignature(e.version, sha, proof.signature, e.publicKey ?? UPDATE_PUBLIC_KEY)) {
        ok = await writeProof(e, kept, { version: e.version, sha256: sha, signature: proof.signature });
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      await unlink(kept).catch(() => undefined);
      await updateLog(e, `installeur de v${e.version} non vérifié : pas gardé (retour arrière de la prochaine mise à jour impossible)`);
    }
  }
  try {
    await unlink(files(e).pending).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") throw err;
    });
    await unlink(files(e).skip).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") throw err;
    });
  } catch {
    return false;
  }
  await updateLog(e, `v${e.version} a démarré correctement : ancienne version supprimée`);
  await cleanup(e, r);
  return true;
}

/** Nettoyage au démarrage quand aucune mise à jour n'attend (installeurs devenus inutiles). */
export async function cleanupLeftovers(e: UpdateEnv): Promise<void> {
  if (!e.packaged || (await readPending(e))) return;
  await cleanup(e, null);
}

export async function skippedVersion(e: UpdateEnv): Promise<string | null> {
  const d = await e.store.read(files(e).skip);
  return d && d["version"] ? String(d["version"]) : null;
}

/** restore_previous_version : remet l'ancienne version et la relance (l'appelant quitte ensuite ReLaunch). */
export async function restorePrevious(e: UpdateEnv, r: { data: PendingData; kind: PendingKind }): Promise<void> {
  const { data } = r;
  if (r.kind === "passage") {
    const cur = data.exe;
    const failed = `${cur}.${stamp(now(e))}.echec`;
    await rename(cur, failed);
    try {
      await rename(data.old, cur);
    } catch (err) {
      await rename(failed, cur);
      throw err;
    }
    await unlink(files(e).pending).catch(() => undefined);
    await e.store.writeAtomic(files(e).skip, JSON.stringify({ version: data.to })).catch(() => false);
    await updateLog(e, `retour à v${data.from} (v${data.to} ne démarrait pas, gardée : ${p(e).basename(failed)})`);
    await e.start(cur, []);
    return;
  }
  // electron : l'installeur de la version précédente (revérifié) réinstalle celle-ci par-dessus
  if (!(await verifiedInstaller(e, data.old))) throw new Error("L'installeur de la version précédente n'a pas pu être vérifié : retour arrière annulé.");
  // noté AVANT de lancer l'installeur (il peut fermer ReLaunch aussitôt) ; remis en place s'il ne démarre pas
  await unlink(files(e).pending).catch(() => undefined);
  await e.store.writeAtomic(files(e).skip, JSON.stringify({ version: data.to })).catch(() => false);
  try {
    await e.start(data.old, ["/S", "--force-run"]);
  } catch (err) {
    await e.store.writeAtomic(files(e).pending, JSON.stringify(data)).catch(() => false);
    await unlink(files(e).skip).catch(() => undefined);
    throw err;
  }
  await updateLog(e, `retour à v${data.from} (v${data.to} ne démarrait pas) avec ${p(e).basename(data.old)}`);
}

/**
 * apply_update (ReLaunch → ReLaunch) : note la mise à jour en attente puis lance l'installeur vérifié en mode
 * silencieux ; l'appelant quitte ensuite ReLaunch (l'installeur remplace les fichiers et relance l'appli).
 */
export async function applyInstaller(e: UpdateEnv, installer: string, to: string): Promise<void> {
  if (!isKeptInstaller(e, installer) || path.basename(installer).toLowerCase() !== `relaunch-setup-${to}.exe`.toLowerCase()) throw new Error("Installeur inattendu : mise à jour annulée.");
  if (!(await verifiedInstaller(e, installer))) throw new Error("Installeur non vérifié (empreinte ou signature) : mise à jour annulée.");
  const current = path.join(files(e).updates, `ReLaunch-Setup-${e.version}.exe`);
  const old = (await verifiedInstaller(e, current)) ? current : "";
  await e.store.writeAtomic(files(e).pending, JSON.stringify({ exe: e.execPath, old, from: e.version, to, starts: 0, kind: "electron" }));
  await updateLog(e, `mise à jour installée : v${e.version} -> v${to}${old ? ` (installeur de v${e.version} gardé pour un retour arrière)` : " (pas d'installeur de la version actuelle : retour arrière impossible)"}`);
  await e.start(installer, ["/S", "--force-run"]);
}
