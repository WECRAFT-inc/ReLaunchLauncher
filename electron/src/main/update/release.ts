// Dernière release et téléchargement vérifié (lot E5), port de fetch_latest_release / download_update.
//
// Ordre des contrôles (plus strict que la version Python, même résultat pour une release valide) :
//   1. signature Ed25519 de (version, empreinte publiée) vérifiée AVANT de télécharger ;
//   2. téléchargement en fichier temporaire, empreinte SHA-256 vérifiée avant de garder le fichier.
// Une release sans empreinte ou sans signature est refusée. Serveurs GitHub en HTTPS uniquement.
import { unlink } from "node:fs/promises";
import { downloadVerified, fetchBytes, fetchJson, type NetOptions } from "../net/download";
import { INSTALLER_NAME } from "./pending";
import { checkUpdateSignature, UpdateRefused } from "./signature";

export const GITHUB_REPO = "Rexidelamort/WeCraft-Releases";
export const UPDATE_HOSTS: ReadonlySet<string> = new Set([
  "api.github.com",
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);

export interface ReleaseInfo {
  version: string;
  notes: string;
  page: string;
  url: string | null;
  size: number;
  sha256: string | null;
  signature: string | null;
}

const net = (opts: NetOptions): NetOptions => ({ ...opts, allowedHosts: UPDATE_HOSTS });
const HEX64 = /^[0-9a-f]{64}$/i;

interface Asset {
  name?: unknown;
  browser_download_url?: unknown;
  size?: unknown;
  digest?: unknown;
}

async function readSmall(url: string, opts: NetOptions): Promise<string> {
  return (await fetchBytes(url, 4096, {}, net(opts))).toString("utf8");
}

/**
 * Dernière release publiée : version, notes, installeur, son empreinte SHA-256 et sa signature.
 * Seul l'installeur « ReLaunch-Setup-<version>.exe » de la version du tag est retenu (jamais un autre .exe,
 * par exemple le WeCraft.exe de la version Python) ; un tag qui ne donne pas un nom sûr = pas d'installeur.
 */
export async function fetchLatestRelease(opts: NetOptions = {}, repo: string = GITHUB_REPO): Promise<ReleaseInfo> {
  const d = await fetchJson<Record<string, unknown>>(`https://api.github.com/repos/${repo}/releases/latest`, 2 * 1024 * 1024, {}, net(opts));
  return parseRelease(d, opts, repo);
}

/** Empreinte et signature publiées pour UNE version (release « v<version> »), sinon null. */
export async function fetchReleaseProof(version: string, opts: NetOptions = {}, repo: string = GITHUB_REPO): Promise<{ sha256: string; signature: string } | null> {
  if (!INSTALLER_NAME.test(`ReLaunch-Setup-${version}.exe`)) return null;
  const d = await fetchJson<Record<string, unknown>>(`https://api.github.com/repos/${repo}/releases/tags/v${version}`, 2 * 1024 * 1024, {}, net(opts));
  const r = await parseRelease(d, opts, repo);
  return r.version === version && r.sha256 && r.signature ? { sha256: r.sha256, signature: r.signature } : null;
}

async function parseRelease(d: Record<string, unknown>, opts: NetOptions, repo: string): Promise<ReleaseInfo> {
  const assets = (Array.isArray(d["assets"]) ? d["assets"] : []) as Asset[];
  const nameOf = (a: Asset) => (typeof a.name === "string" ? a.name.toLowerCase() : "");
  const tag0 = typeof d["tag_name"] === "string" ? d["tag_name"] : "";
  const want = `ReLaunch-Setup-${tag0.replace(/^[vV]+/, "")}.exe`;
  const exe = INSTALLER_NAME.test(want) ? (assets.find((a) => nameOf(a) === want.toLowerCase()) ?? null) : null;
  let sha: string | null = null;
  let sig: string | null = null;
  if (exe) {
    const digest = typeof exe.digest === "string" ? exe.digest : "";
    if (digest.startsWith("sha256:")) sha = digest.slice(7);
    else {
      const side = assets.find((a) => nameOf(a) === `${nameOf(exe)}.sha256`);
      if (side && typeof side.browser_download_url === "string") sha = (await readSmall(side.browser_download_url, opts)).split(/\s+/).filter(Boolean)[0] ?? null;
    }
    const sigAsset = assets.find((a) => nameOf(a) === `${nameOf(exe)}.sig`);
    if (sigAsset && typeof sigAsset.browser_download_url === "string") sig = (await readSmall(sigAsset.browser_download_url, opts)).trim() || null;
  }
  const tag = typeof d["tag_name"] === "string" ? d["tag_name"] : "";
  return {
    version: tag.replace(/^[vV]+/, ""),
    notes: (typeof d["body"] === "string" ? d["body"] : "").trim(),
    page: typeof d["html_url"] === "string" ? d["html_url"] : `https://github.com/${repo}/releases`,
    url: exe && typeof exe.browser_download_url === "string" ? exe.browser_download_url : null,
    size: exe && typeof exe.size === "number" ? exe.size : 0,
    sha256: sha && HEX64.test(sha) ? sha.toLowerCase() : null,
    signature: sig,
  };
}

/**
 * Télécharge la mise à jour dans `dest` (signature puis empreinte vérifiées) ; renvoie la note de signature.
 * En cas d'échec, `dest` n'existe pas.
 */
export async function downloadUpdate(info: ReleaseInfo, dest: string, opts: NetOptions & { onBytes?: (n: number) => void } = {}): Promise<string> {
  if (!info.url) throw new UpdateRefused("Cette release ne contient pas d'installeur.");
  if (!info.sha256) throw new UpdateRefused("Cette release n'a pas d'empreinte SHA-256 : mise à jour annulée par sécurité.");
  const note = checkUpdateSignature(info, info.sha256); // refus AVANT tout téléchargement
  try {
    const expected: { sha256: string; size?: number } = { sha256: info.sha256 };
    if (info.size > 0) expected.size = info.size;
    await downloadVerified(info.url, dest, expected, { ...net(opts), maxBytes: 1024 * 1024 * 1024, ...(opts.onBytes ? { onBytes: opts.onBytes } : {}) });
  } catch (e) {
    await unlink(dest).catch(() => undefined);
    throw e;
  }
  return note;
}
