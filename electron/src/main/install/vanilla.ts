// Installation d'une version de Minecraft sans loader (lot E3), dans le dossier .minecraft donné.
// Équivalent de mll.install.install_minecraft_version (version Python), avec vérification systématique :
//   1. liste officielle des versions (Mojang, HTTPS) ;
//   2. fichier de version vérifié par l'empreinte donnée dans cette liste ;
//   3. jeu, bibliothèques, index des ressources : planifiés par xmcl, téléchargés et vérifiés par nous ;
//   4. ressources (sons, textures…) : idem, à partir de l'index vérifié.
// Rien n'est déclaré prêt tant que chaque fichier n'a pas l'empreinte attendue (§10.4 du prompt maître).
import path from "node:path";
import { downloadVerified, fetchJson, fileSha1, IntegrityError, type NetOptions } from "../net/download";
import { javaComponentOf } from "./javaRuntime";
import {
  allowedUrls,
  hardenFiles,
  refuseJava,
  safeDownloader,
  type DownloadProgress,
  type ResolvedLibraryLike,
  type XmclApi,
} from "./xmcl";

export const VERSION_MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

export interface VersionEntry {
  id: string;
  type: string;
  url: string;
  sha1: string;
  releaseTime?: string;
}

/** Identifiant de version utilisable comme nom de dossier (pas de « .. », pas de séparateur). */
export function isSafeVersionId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._+ -]{0,63}$/.test(id) && !id.includes("..");
}

export async function fetchVersionList(opts: NetOptions = {}): Promise<VersionEntry[]> {
  const data = await fetchJson<{ versions?: unknown }>(VERSION_MANIFEST_URL, 8 * 1024 * 1024, {}, opts);
  if (!Array.isArray(data?.versions)) throw new IntegrityError(VERSION_MANIFEST_URL, "liste des versions illisible");
  const out: VersionEntry[] = [];
  for (const v of data.versions as Record<string, unknown>[]) {
    if (typeof v?.["id"] !== "string" || typeof v["url"] !== "string" || typeof v["sha1"] !== "string") continue;
    if (!/^[0-9a-f]{40}$/i.test(v["sha1"]) || !isSafeVersionId(v["id"])) continue;
    const entry: VersionEntry = { id: v["id"], type: String(v["type"] ?? ""), url: v["url"], sha1: v["sha1"].toLowerCase() };
    if (typeof v["releaseTime"] === "string") entry.releaseTime = v["releaseTime"];
    out.push(entry);
  }
  return out;
}

export type VanillaStep =
  | { phase: "liste" }
  | { phase: "version" }
  | { phase: "fichiers"; progress: DownloadProgress }
  | { phase: "ressources"; progress: DownloadProgress };

export interface InstallVanillaOptions extends NetOptions {
  xmcl: XmclApi;
  /** Ressources (sons, textures) : installées par défaut ; false seulement pour l'essai réseau de la CI. */
  withAssets?: boolean;
  /** Empreintes connues par adresse (bibliothèques des profils Fabric/Quilt). */
  knownHashes?: ReadonlyMap<string, { sha1: string; size?: number }>;
  onStep?: (step: VanillaStep) => void;
  /** Liste déjà récupérée (évite un second téléchargement). */
  versions?: VersionEntry[];
}

export interface InstalledVersion {
  id: string;
  javaComponent: string;
  javaMajor: number | null;
}

function net(opts: NetOptions): NetOptions {
  const n: NetOptions = {};
  if (opts.fetch) n.fetch = opts.fetch;
  if (opts.allowedHosts) n.allowedHosts = opts.allowedHosts;
  if (opts.signal) n.signal = opts.signal;
  return n;
}

/**
 * Télécharge et vérifie les fichiers d'une version DÉJÀ décrite dans versions/<id>/<id>.json (vanilla ou
 * loader qui en hérite) : jeu, bibliothèques, index des ressources, puis ressources.
 */
export async function installVersionFiles(mcDir: string, id: string, opts: InstallVanillaOptions): Promise<InstalledVersion> {
  const n = net(opts);
  const { xmcl } = opts;
  const version = await xmcl.parseVersion(mcDir, id);
  const folder = xmcl.folder(mcDir);
  const libraryHost = (lib: ResolvedLibraryLike) => allowedUrls(lib.download.url ? [lib.download.url] : [], n);
  const runtimeFor = (phase: "fichiers" | "ressources") => {
    const runtime: Parameters<XmclApi["createRuntime"]>[0] = {
      download: safeDownloader({ ...n, onProgress: (progress) => opts.onStep?.({ phase, progress }) }),
      runJava: refuseJava,
    };
    if (opts.signal) runtime.signal = opts.signal;
    return xmcl.createRuntime(runtime);
  };
  const execOpts: { attempts: number; signal?: AbortSignal } = { attempts: 3 };
  if (opts.signal) execOpts.signal = opts.signal;

  const jar = xmcl.resolveMinecraftJarInstallFile(version);
  const planned = [
    ...(jar ? [jar] : []),
    ...xmcl.resolveLibraryInstallFiles(version.libraries, folder, { libraryHost }),
    ...xmcl.resolveAssetMetadataInstallFiles(version, folder),
  ];
  const files = await hardenFiles(planned, n, opts.knownHashes);
  await xmcl.execute({ schemaVersion: 1, tasks: [{ id: "version-files", type: "files", files }] }, runtimeFor("fichiers"), execOpts);

  if (opts.withAssets !== false) {
    const assets = await hardenFiles(await xmcl.resolveAssetObjectInstallFiles(version, folder), n);
    await xmcl.execute({ schemaVersion: 1, tasks: [{ id: "asset-objects", type: "files", files: assets }] }, runtimeFor("ressources"), execOpts);
  }

  const major = version.javaVersion?.majorVersion;
  return { id, javaComponent: javaComponentOf(version), javaMajor: typeof major === "number" ? major : null };
}

/** Fichier de version Mojang vérifié par l'empreinte de la liste officielle. */
export async function ensureVanillaJson(mcDir: string, id: string, opts: InstallVanillaOptions): Promise<void> {
  if (!isSafeVersionId(id)) throw new Error(`Identifiant de version invalide : ${id}`);
  const n = net(opts);
  opts.onStep?.({ phase: "liste" });
  const versions = opts.versions ?? (await fetchVersionList(n));
  const entry = versions.find((v) => v.id === id);
  if (!entry) throw new Error(`Version ${id} introuvable dans la liste officielle de Mojang.`);
  opts.onStep?.({ phase: "version" });
  const jsonPath = path.join(mcDir, "versions", id, `${id}.json`);
  if ((await fileSha1(jsonPath)) !== entry.sha1) {
    await downloadVerified(entry.url, jsonPath, { sha1: entry.sha1 }, { ...n, maxBytes: 4 * 1024 * 1024 });
  }
}

/** Installe (ou répare) la version `id` dans `mcDir`. Ne rend la main qu'une fois tout vérifié. */
export async function installVanilla(mcDir: string, id: string, opts: InstallVanillaOptions): Promise<InstalledVersion> {
  await ensureVanillaJson(mcDir, id, opts);
  return installVersionFiles(mcDir, id, opts);
}

export { net };
