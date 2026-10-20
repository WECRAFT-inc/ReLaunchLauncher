// Couche réseau sûre du lot E3 (audit docs/AUDIT_E3_INSTALLATEUR.md, constats X1, X3, X5, X9).
//
// - HTTPS uniquement, vers une liste fermée de serveurs ; chaque redirection est revérifiée.
// - Taille maximale ; réponse 200 exigée.
// - Téléchargement dans un fichier temporaire du même dossier, empreinte calculée pendant la réception et
//   VÉRIFIÉE avant le remplacement : un fichier dont l'empreinte ne correspond pas n'est jamais installé.
// - Progression réelle (octets reçus), jamais simulée (§10.4 du prompt maître).
import { createHash } from "node:crypto";
import * as fsp from "node:fs/promises";
import path from "node:path";

/** Serveurs officiels autorisés (Mojang, Fabric, Quilt, Forge, NeoForge). */
export const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  "piston-meta.mojang.com",
  "piston-data.mojang.com",
  "launchermeta.mojang.com",
  "launcher.mojang.com",
  "libraries.minecraft.net",
  "resources.download.minecraft.net",
  "meta.fabricmc.net",
  "maven.fabricmc.net",
  "meta.quiltmc.org",
  "maven.quiltmc.org",
  "maven.minecraftforge.net",
  "files.minecraftforge.net",
  "maven.neoforged.net",
]);

export class UnsafeUrlError extends Error {
  constructor(readonly url: string, why: string) {
    super(`Adresse refusée (${why}) : ${url}`);
    this.name = "UnsafeUrlError";
  }
}

export class HttpError extends Error {
  constructor(readonly url: string, readonly status: number) {
    super(`Réponse ${status} pour ${url}`);
    this.name = "HttpError";
  }
}

export class IntegrityError extends Error {
  constructor(readonly url: string, what: string) {
    super(`Fichier refusé (${what}) : ${url}`);
    this.name = "IntegrityError";
  }
}

export class TooLargeError extends Error {
  constructor(readonly url: string, readonly limit: number) {
    super(`Fichier plus gros que prévu (> ${limit} octets) : ${url}`);
    this.name = "TooLargeError";
  }
}

/** Fonction fetch (remplaçable dans les tests). */
export type FetchFn = (url: string, init: { redirect: "manual"; signal?: AbortSignal }) => Promise<Response>;

export interface NetOptions {
  fetch?: FetchFn;
  allowedHosts?: ReadonlySet<string>;
  signal?: AbortSignal;
  maxRedirects?: number;
}

/** Vérifie qu'une adresse est en HTTPS, vers un serveur autorisé, sans identifiants ni port exotique. */
export function checkUrl(url: string, hosts: ReadonlySet<string> = ALLOWED_HOSTS): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new UnsafeUrlError(url, "adresse invalide");
  }
  if (u.protocol !== "https:") throw new UnsafeUrlError(url, "pas en HTTPS");
  if (u.username || u.password) throw new UnsafeUrlError(url, "identifiants dans l'adresse");
  if (u.port !== "" && u.port !== "443") throw new UnsafeUrlError(url, "port non standard");
  if (!hosts.has(u.hostname.toLowerCase())) throw new UnsafeUrlError(url, "serveur non autorisé");
  return u;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** Requête GET avec redirections vérifiées une à une. Renvoie une réponse 200. */
export async function getChecked(url: string, opts: NetOptions = {}): Promise<Response> {
  const doFetch: FetchFn = opts.fetch ?? ((u, init) => fetch(u, init));
  const hosts = opts.allowedHosts ?? ALLOWED_HOSTS;
  const max = opts.maxRedirects ?? 5;
  let current = checkUrl(url, hosts).href;
  for (let hop = 0; ; hop++) {
    const init: { redirect: "manual"; signal?: AbortSignal } = { redirect: "manual" };
    if (opts.signal) init.signal = opts.signal;
    const res = await doFetch(current, init);
    if (REDIRECTS.has(res.status)) {
      const loc = res.headers.get("location");
      await res.body?.cancel().catch(() => undefined);
      if (!loc || hop >= max) throw new HttpError(current, res.status);
      current = checkUrl(new URL(loc, current).href, hosts).href;
      continue;
    }
    if (res.status !== 200) {
      await res.body?.cancel().catch(() => undefined);
      throw new HttpError(current, res.status);
    }
    return res;
  }
}

/** Empreintes attendues (hexadécimal). Au moins une doit être fournie pour un fichier installé. */
export interface Expected {
  sha1?: string;
  sha256?: string;
  size?: number;
}

function hexEq(a: string, b: string): boolean {
  return a.toLowerCase() === b.trim().toLowerCase();
}

/** Lit une réponse en mémoire, avec limite de taille et vérification des empreintes. */
export async function readBytes(res: Response, url: string, maxBytes: number, expected: Expected = {}): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw new TooLargeError(url, maxBytes);
  }
  const chunks: Buffer[] = [];
  let total = 0;
  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new TooLargeError(url, maxBytes);
      }
      chunks.push(Buffer.from(value));
    }
  }
  const buf = Buffer.concat(chunks);
  verifyBuffer(buf, url, expected);
  return buf;
}

export function verifyBuffer(buf: Uint8Array, url: string, expected: Expected): void {
  if (expected.size !== undefined && expected.size >= 0 && buf.byteLength !== expected.size) {
    throw new IntegrityError(url, `taille ${buf.byteLength} au lieu de ${expected.size}`);
  }
  if (expected.sha1 && !hexEq(createHash("sha1").update(buf).digest("hex"), expected.sha1)) {
    throw new IntegrityError(url, "empreinte SHA-1 différente");
  }
  if (expected.sha256 && !hexEq(createHash("sha256").update(buf).digest("hex"), expected.sha256)) {
    throw new IntegrityError(url, "empreinte SHA-256 différente");
  }
}

/** Récupère un petit document (JSON, empreinte publiée…) en mémoire. */
export async function fetchBytes(url: string, maxBytes: number, expected: Expected = {}, opts: NetOptions = {}): Promise<Buffer> {
  return readBytes(await getChecked(url, opts), url, maxBytes, expected);
}

export async function fetchJson<T = unknown>(url: string, maxBytes: number, expected: Expected = {}, opts: NetOptions = {}): Promise<T> {
  const buf = await fetchBytes(url, maxBytes, expected, opts);
  try {
    return JSON.parse(buf.toString("utf8")) as T;
  } catch {
    throw new IntegrityError(url, "JSON invalide");
  }
}

/** Empreinte SHA-1 d'un fichier local, ou null s'il n'existe pas / est illisible. */
export async function fileSha1(file: string): Promise<string | null> {
  try {
    const h = createHash("sha1");
    const fh = await fsp.open(file, "r");
    try {
      for await (const chunk of fh.createReadStream()) h.update(chunk as Buffer);
    } finally {
      await fh.close().catch(() => undefined);
    }
    return h.digest("hex");
  } catch {
    return null;
  }
}

export interface DownloadOptions extends NetOptions {
  /** Appelé avec le nombre d'octets reçus depuis le dernier appel (progression réelle). */
  onBytes?: (n: number) => void;
  /** Taille maximale acceptée (par défaut : 512 Mo). */
  maxBytes?: number;
}

let tmpCounter = 0;

/**
 * Télécharge `url` vers `dest`. Exige au moins une empreinte (sha1 ou sha256). Le fichier final n'est
 * remplacé qu'une fois la taille et l'empreinte vérifiées ; sinon le temporaire est supprimé et rien ne change.
 */
export async function downloadVerified(url: string, dest: string, expected: Expected, opts: DownloadOptions = {}): Promise<void> {
  if (!expected.sha1 && !expected.sha256) throw new IntegrityError(url, "aucune empreinte connue");
  const maxBytes = expected.size !== undefined && expected.size >= 0 ? expected.size : (opts.maxBytes ?? 512 * 1024 * 1024);
  const res = await getChecked(url, opts);
  const declared = Number(res.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw new TooLargeError(url, maxBytes);
  }
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const tmp = path.join(path.dirname(dest), `.${path.basename(dest)}.${process.pid}.${++tmpCounter}.part`);
  const sha1 = createHash("sha1");
  const sha256 = createHash("sha256");
  let total = 0;
  let renamed = false;
  const fh = await fsp.open(tmp, "wx");
  try {
    try {
      if (res.body) {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) {
            await reader.cancel().catch(() => undefined);
            throw new TooLargeError(url, maxBytes);
          }
          sha1.update(value);
          sha256.update(value);
          await fh.write(value);
          opts.onBytes?.(value.byteLength);
        }
      }
      await fh.sync();
    } finally {
      await fh.close();
    }
    if (expected.size !== undefined && expected.size >= 0 && total !== expected.size) {
      throw new IntegrityError(url, `taille ${total} au lieu de ${expected.size}`);
    }
    if (expected.sha1 && !hexEq(sha1.digest("hex"), expected.sha1)) throw new IntegrityError(url, "empreinte SHA-1 différente");
    if (expected.sha256 && !hexEq(sha256.digest("hex"), expected.sha256)) throw new IntegrityError(url, "empreinte SHA-256 différente");
    await fsp.rename(tmp, dest);
    renamed = true;
  } finally {
    if (!renamed) await fsp.unlink(tmp).catch(() => undefined);
  }
}

/** Exécute des tâches avec un nombre limité en parallèle ; s'arrête à la première erreur. */
export async function runLimited<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failed: unknown = null;
  let hasFailed = false;
  const worker = async () => {
    while (!hasFailed && next < items.length) {
      const item = items[next++] as T;
      try {
        await work(item);
      } catch (e) {
        if (!hasFailed) {
          hasFailed = true;
          failed = e;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (hasFailed) throw failed;
}
