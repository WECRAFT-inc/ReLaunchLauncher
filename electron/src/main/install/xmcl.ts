// Pont vers @xmcl/installer et @xmcl/core (lot E3, décision D9 = A : bibliothèque encadrée).
//
// On n'utilise de xmcl que la PLANIFICATION (quels fichiers, à quel endroit, avec quelle empreinte) et
// l'exécution des plans. Tous les téléchargements passent par NOTRE couche réseau (net/download.ts) :
// HTTPS + serveurs officiels seulement, empreinte vérifiée avant installation. Aucun fichier sans empreinte
// n'est accepté : s'il en manque une, l'empreinte publiée par le dépôt Maven (« .sha1 ») est récupérée,
// sinon le fichier est refusé.
//
// Les types ci-dessous décrivent seulement ce que ReLaunch utilise ; le module est chargé avec require()
// pour que le reste du code ne dépende pas des types internes de la bibliothèque.
import path from "node:path";
import {
  checkUrl,
  downloadVerified,
  fetchBytes,
  HttpError,
  IntegrityError,
  runLimited,
  UnsafeUrlError,
  type NetOptions,
} from "../net/download";

/** Fichier à installer, tel que planifié par xmcl (`InstallFile`). */
export interface InstallFile {
  path: string;
  urls: string[];
  size?: number;
  checksum?: { algorithm: string; value: string };
  validator?: "file" | "zip" | "json";
  trustExistingSize?: boolean;
  replace?: boolean;
  validatedAt?: number;
}

export interface FilesTask {
  id: string;
  type: "files";
  files: InstallFile[];
  dependsOn?: string[];
}

export interface InstallManifest {
  schemaVersion: 1;
  tasks: FilesTask[];
}

/** Étape d'un « workflow » xmcl : un plan à exécuter, ou le résultat final. */
export type WorkflowStep<T> = { done: false; plan: { schemaVersion: 1; tasks: unknown[] } } | { done: true; result: T };
export interface Workflow<T> {
  next(): Promise<WorkflowStep<T>>;
}

export interface ModernForgeWorkflowOptions {
  id: string;
  minecraftDir: string;
  minecraftVersion: string;
  installer: InstallFile;
  artifactVersion: string;
  java: string;
}

export interface ResolvedLibraryLike {
  name: string;
  download: { path: string; url: string; sha1: string; size: number };
}

export interface ResolvedVersionLike {
  id: string;
  minecraftVersion: string;
  minecraftDirectory: string;
  libraries: ResolvedLibraryLike[];
  assets: string;
  javaVersion?: { component?: string; majorVersion?: number };
}

export interface JavaCommand {
  executable: string;
  args: string[];
  cwd?: string;
}

/** Sous-ensemble de @xmcl/core et @xmcl/installer utilisé par ReLaunch. */
export interface XmclApi {
  parseVersion(minecraftDir: string, id: string): Promise<ResolvedVersionLike>;
  folder(minecraftDir: string): unknown;
  resolveMinecraftJarInstallFile(version: ResolvedVersionLike): InstallFile | undefined;
  resolveLibraryInstallFiles(
    libraries: ResolvedLibraryLike[],
    folder: unknown,
    options: { libraryHost: (lib: ResolvedLibraryLike) => string[] },
  ): InstallFile[];
  resolveAssetMetadataInstallFiles(version: ResolvedVersionLike, folder: unknown): InstallFile[];
  resolveAssetObjectInstallFiles(version: ResolvedVersionLike, folder: unknown): Promise<InstallFile[]>;
  createRuntime(options: {
    download: (files: InstallFile[]) => Promise<void>;
    runJava: (command: JavaCommand) => Promise<void>;
    signal?: AbortSignal;
  }): unknown;
  execute(plan: InstallManifest, runtime: unknown, options: { attempts: number; signal?: AbortSignal }): Promise<unknown>;
  createModernForgeWorkflow(options: ModernForgeWorkflowOptions): Workflow<{ version: string }>;
  /** Démarre le jeu (sans le launcher officiel) : bibliothèques et natives vérifiées par xmcl avant. */
  launchGame?(options: GameLaunchOptions): Promise<GameProcess>;
}

export interface GameLaunchOptions {
  gamePath: string;
  resourcePath: string;
  javaPath: string;
  version: string;
  maxMemory: number;
  minMemory: number;
  gameProfile: { name: string; id: string };
  accessToken: string;
  launcherName: string;
  launcherBrand: string;
  /** Type de compte transmis au jeu (« msa » par défaut ; « legacy » pour un compte hors-ligne). */
  userType?: "msa" | "legacy" | "mojang";
  /** Options JVM supplémentaires. */
  extraJVMArgs?: string[];
  /** Arguments du jeu supplémentaires (connexion automatique à un serveur). */
  extraMCArgs?: string[];
}
export interface GameProcess {
  pid?: number | undefined;
  once(event: "exit" | "error", cb: (code: number | null) => void): unknown;
  unref(): void;
}

/** Charge la vraie bibliothèque (processus principal uniquement). */
export function loadXmcl(): XmclApi {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const core = require("@xmcl/core") as {
    Version: { parse(mc: string, id: string): Promise<ResolvedVersionLike> };
    MinecraftFolder: { from(mc: string): unknown };
    launch(o: Record<string, unknown>): Promise<GameProcess>;
  };
  const inst = require("@xmcl/installer") as {
    resolveMinecraftJarInstallFile(v: ResolvedVersionLike): InstallFile | undefined;
    resolveLibraryInstallFiles(l: ResolvedLibraryLike[], f: unknown, o: unknown): InstallFile[];
    resolveAssetMetadataInstallFiles(v: ResolvedVersionLike, f: unknown): InstallFile[];
    resolveAssetObjectInstallFiles(v: ResolvedVersionLike, f: unknown): Promise<InstallFile[]>;
    createNodeInstallRuntime(o: unknown): unknown;
    executeInstallManifest(p: InstallManifest, r: unknown, o: unknown): Promise<unknown>;
    createModernForgeInstallWorkflow(o: unknown): Workflow<{ version: string }>;
  };
  return {
    parseVersion: (mc, id) => core.Version.parse(mc, id),
    folder: (mc) => core.MinecraftFolder.from(mc),
    resolveMinecraftJarInstallFile: (v) => inst.resolveMinecraftJarInstallFile(v),
    resolveLibraryInstallFiles: (l, f, o) => inst.resolveLibraryInstallFiles(l, f, o),
    resolveAssetMetadataInstallFiles: (v, f) => inst.resolveAssetMetadataInstallFiles(v, f),
    resolveAssetObjectInstallFiles: (v, f) => inst.resolveAssetObjectInstallFiles(v, f),
    createRuntime: (o) => inst.createNodeInstallRuntime(o),
    execute: (p, r, o) => inst.executeInstallManifest(p, r, o),
    launchGame: (o) =>
      core.launch({
        ...o,
        userType: o.userType ?? "msa",
        extraExecOption: { detached: true, stdio: "ignore", windowsHide: false },
      }),
    createModernForgeWorkflow: (o) =>
      inst.createModernForgeInstallWorkflow({
        id: o.id,
        minecraft: core.MinecraftFolder.from(o.minecraftDir),
        minecraftVersion: o.minecraftVersion,
        installer: o.installer,
        artifactVersion: o.artifactVersion,
        java: o.java,
        installOptions: {},
        side: "client",
      }),
  };
}

/** Garde seulement les adresses autorisées (HTTPS, serveurs officiels). */
export function allowedUrls(urls: readonly string[], opts: NetOptions = {}): string[] {
  const out: string[] = [];
  for (const u of urls) {
    try {
      out.push(checkUrl(u, opts.allowedHosts).href);
    } catch {
      // adresse refusée : ignorée (miroirs, HTTP…)
    }
  }
  return [...new Set(out)];
}

/**
 * Prépare des fichiers planifiés par xmcl pour une installation vérifiée :
 * - adresses limitées aux serveurs autorisés (un fichier sans adresse autorisée est refusé) ;
 * - aucune confiance « sur la taille » ou « sur la date » : chaque fichier existant est revérifié par empreinte ;
 * - fichier sans empreinte : empreinte « .sha1 » publiée par le dépôt Maven, sinon refus.
 */
/** `p` est-il dans `root` (après résolution) ? */
export function inside(root: string, p: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(p));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export async function hardenFiles(
  files: readonly InstallFile[],
  opts: NetOptions = {},
  known: ReadonlyMap<string, { sha1: string; size?: number }> = new Map(),
  /** Dossier dont aucun fichier ne doit sortir (.minecraft). */
  root?: string,
): Promise<InstallFile[]> {
  const out: InstallFile[] = [];
  for (const f of files) {
    if (root !== undefined && !inside(root, f.path)) throw new UnsafeUrlError(f.path, "fichier hors du dossier .minecraft");
    const urls = allowedUrls(f.urls, opts);
    if (urls.length === 0) throw new UnsafeUrlError(f.urls[0] ?? f.path, "aucune adresse autorisée pour ce fichier");
    const copy: InstallFile = { path: f.path, urls };
    if (f.size !== undefined && f.size >= 0) copy.size = f.size;
    if (f.validator) copy.validator = f.validator;
    if (f.replace) copy.replace = true;
    const sha1 = f.checksum?.algorithm.toLowerCase() === "sha1" ? f.checksum.value.toLowerCase() : null;
    const fromProfile = urls.map((u) => known.get(u)).find((k) => k && /^[0-9a-f]{40}$/i.test(k.sha1));
    if (sha1 && /^[0-9a-f]{40}$/.test(sha1)) {
      copy.checksum = { algorithm: "sha1", value: sha1 };
    } else if (fromProfile) {
      // empreinte donnée par le profil du loader (format { name, url, sha1 } que xmcl ne lit pas)
      copy.checksum = { algorithm: "sha1", value: fromProfile.sha1.toLowerCase() };
      if (copy.size === undefined && fromProfile.size !== undefined && fromProfile.size >= 0) copy.size = fromProfile.size;
    } else {
      copy.checksum = { algorithm: "sha1", value: await publishedSha1(urls, opts) };
    }
    out.push(copy);
  }
  return out;
}

/** Empreinte SHA-1 publiée à côté d'un fichier Maven (`<adresse>.sha1`). */
export async function publishedSha1(urls: readonly string[], opts: NetOptions = {}): Promise<string> {
  let lastError: unknown = null;
  for (const u of urls) {
    try {
      const text = (await fetchBytes(`${u}.sha1`, 256, {}, opts)).toString("utf8").trim();
      const digest = text.split(/\s+/)[0]?.toLowerCase() ?? "";
      if (/^[0-9a-f]{40}$/.test(digest)) return digest;
      lastError = new IntegrityError(`${u}.sha1`, "empreinte publiée illisible");
    } catch (e) {
      lastError = e;
    }
  }
  if (lastError instanceof IntegrityError) throw lastError;
  throw new IntegrityError(urls[0] ?? "?", "aucune empreinte publiée pour ce fichier");
}

export interface DownloadProgress {
  filesDone: number;
  filesTotal: number;
  bytes: number;
}

/**
 * Fonction de téléchargement donnée à xmcl : chaque fichier est téléchargé par notre couche réseau, avec son
 * empreinte SHA-1 obligatoire, en essayant ses adresses autorisées dans l'ordre.
 */
export function safeDownloader(
  opts: NetOptions & { parallel?: number; onProgress?: (p: DownloadProgress) => void } = {},
): (files: InstallFile[]) => Promise<void> {
  return async (files) => {
    const progress: DownloadProgress = { filesDone: 0, filesTotal: files.length, bytes: 0 };
    opts.onProgress?.({ ...progress });
    await runLimited(files, opts.parallel ?? 16, async (f) => {
      const sha1 = f.checksum?.algorithm.toLowerCase() === "sha1" ? f.checksum.value : undefined;
      if (!sha1) throw new IntegrityError(f.urls[0] ?? f.path, "aucune empreinte connue");
      const urls = allowedUrls(f.urls, opts);
      if (urls.length === 0) throw new UnsafeUrlError(f.urls[0] ?? f.path, "aucune adresse autorisée pour ce fichier");
      const expected: { sha1: string; size?: number } = { sha1 };
      if (f.size !== undefined && f.size >= 0) expected.size = f.size;
      let lastError: unknown = null;
      for (const u of urls) {
        try {
          const net: NetOptions & { onBytes: (n: number) => void } = { onBytes: (n) => (progress.bytes += n) };
          if (opts.fetch) net.fetch = opts.fetch;
          if (opts.allowedHosts) net.allowedHosts = opts.allowedHosts;
          if (opts.signal) net.signal = opts.signal;
          await downloadVerified(u, f.path, expected, net);
          lastError = null;
          break;
        } catch (e) {
          lastError = e;
          if (opts.signal?.aborted) break;
          if (!(e instanceof HttpError || e instanceof IntegrityError || e instanceof TypeError)) break;
        }
      }
      if (lastError) throw lastError;
      progress.filesDone++;
      opts.onProgress?.({ ...progress });
    });
  };
}

/** Aucune commande Java n'est attendue (version de base) : toute demande est refusée. */
export async function refuseJava(command: JavaCommand): Promise<void> {
  throw new Error(`Commande Java inattendue refusée : ${command.executable}`);
}
