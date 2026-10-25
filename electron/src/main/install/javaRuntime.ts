// Installation du Java fourni par Mojang (lot E3, audit X2 et X8), sans dépendance.
//
// Même source et même emplacement que minecraft_launcher_lib (version Python) et le launcher officiel :
//   <.minecraft>/runtime/<composant>/<plateforme>/<composant>/
// Chaîne de confiance : liste des Java (HTTPS, serveur Mojang) -> manifeste du composant (SHA-1 de la liste
// vérifié) -> chaque fichier (SHA-1 du manifeste vérifié après réception). Un fichier déjà présent n'est
// gardé que si son SHA-1 est bon. Aucun chemin du manifeste ne peut sortir du dossier du composant.
import * as fsp from "node:fs/promises";
import path from "node:path";
import { downloadVerified, fetchJson, fileSha1, IntegrityError, runLimited, type NetOptions } from "../net/download";

export const JAVA_RUNTIMES_URL =
  "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";

/** Plateforme Mojang pour ce système (null si non gérée). */
export function mojangPlatform(platform: NodeJS.Platform = process.platform, arch: string = process.arch): string | null {
  if (platform === "win32") return arch === "x64" ? "windows-x64" : arch === "arm64" ? "windows-arm64" : arch === "ia32" ? "windows-x86" : null;
  if (platform === "darwin") return arch === "arm64" ? "mac-os-arm64" : "mac-os";
  if (platform === "linux") return arch === "x64" ? "linux" : arch === "ia32" ? "linux-i386" : null;
  return null;
}

/** Composant Java demandé par un fichier de version Minecraft (« jre-legacy » si absent, comme mll). */
export function javaComponentOf(versionJson: unknown): string {
  if (typeof versionJson === "object" && versionJson !== null) {
    const jv = (versionJson as { javaVersion?: { component?: unknown } }).javaVersion;
    if (jv && typeof jv.component === "string" && /^[a-z0-9-]+$/.test(jv.component)) return jv.component;
  }
  return "jre-legacy";
}

const NAME = /^[a-z0-9][a-z0-9-]*$/;

export function runtimeDir(mcDir: string, component: string, platform: string): string {
  if (!NAME.test(component) || !NAME.test(platform)) throw new Error(`Composant Java invalide : ${component}/${platform}`);
  return path.join(mcDir, "runtime", component, platform, component);
}

/** Chemin de l'exécutable Java installé (java.exe sous Windows). */
export function javaExecutable(dir: string, platform: string): string {
  if (platform.startsWith("windows")) return path.join(dir, "bin", "java.exe");
  if (platform.startsWith("mac-os")) return path.join(dir, "jre.bundle", "Contents", "Home", "bin", "java");
  return path.join(dir, "bin", "java");
}

/** Noms que Windows réserve à des périphériques (CON, NUL, COM1…), avec ou sans extension. */
export const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;

/** Résout un chemin relatif du manifeste dans `root` ; refuse tout ce qui en sortirait. */
export function safeJoin(root: string, rel: string): string {
  if (rel === "" || rel.includes("\0") || rel.includes("\\") || path.posix.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) {
    throw new IntegrityError(rel, "chemin interdit dans le manifeste Java");
  }
  const parts = rel.split("/");
  // ni « .. », ni flux caché NTFS (« : »), ni nom réservé de Windows (CON, NUL…), ni point/espace final
  if (parts.some((p) => p === ".." || p === "." || p === "" || p.includes(":") || /[. ]$/.test(p) || WINDOWS_RESERVED.test(p))) {
    throw new IntegrityError(rel, "chemin interdit dans le manifeste Java");
  }
  const out = path.join(root, ...parts);
  const back = path.relative(root, out);
  if (back.startsWith("..") || path.isAbsolute(back)) throw new IntegrityError(rel, "chemin hors du dossier Java");
  return out;
}

interface Download {
  sha1: string;
  size: number;
  url: string;
}

interface RuntimeEntry {
  manifest: Download;
  version: { name: string };
}

interface ManifestFile {
  type: "file" | "directory" | "link";
  executable?: boolean;
  downloads?: { raw?: Download };
  target?: string;
}

function isDownload(d: unknown): d is Download {
  if (typeof d !== "object" || d === null) return false;
  const o = d as Record<string, unknown>;
  return typeof o["sha1"] === "string" && /^[0-9a-f]{40}$/i.test(o["sha1"]) && typeof o["size"] === "number" && typeof o["url"] === "string";
}

export interface JavaProgress {
  /** Fichiers traités / à traiter (réels). */
  filesDone: number;
  filesTotal: number;
  /** Octets téléchargés jusqu'ici (réels). */
  bytes: number;
}

export interface InstallJavaOptions extends NetOptions {
  platform?: string;
  onProgress?: (p: JavaProgress) => void;
  /** Téléchargements simultanés (8 par défaut). */
  parallel?: number;
}

export interface InstalledJava {
  component: string;
  version: string;
  dir: string;
  executable: string;
  downloaded: number;
}

/**
 * Installe (ou vérifie) le Java `component` de Mojang dans `mcDir`. Ne renvoie qu'une fois chaque fichier
 * vérifié ; en cas d'erreur, rien n'est déclaré prêt (les fichiers déjà vérifiés restent, ils sont valides).
 */
export async function installJavaRuntime(mcDir: string, component: string, opts: InstallJavaOptions = {}): Promise<InstalledJava> {
  const platform = opts.platform ?? mojangPlatform();
  if (!platform) throw new Error("Ce système n'a pas de Java fourni par Mojang.");
  const dir = runtimeDir(mcDir, component, platform);

  const all = await fetchJson<Record<string, Record<string, RuntimeEntry[]>>>(JAVA_RUNTIMES_URL, 2 * 1024 * 1024, {}, opts);
  const entry = all?.[platform]?.[component]?.[0];
  if (!entry || !isDownload(entry.manifest)) throw new Error(`Java « ${component} » indisponible pour ${platform}.`);
  const version = typeof entry.version?.name === "string" ? entry.version.name : "?";

  const manifest = await fetchJson<{ files?: Record<string, ManifestFile> }>(
    entry.manifest.url,
    16 * 1024 * 1024,
    { sha1: entry.manifest.sha1, size: entry.manifest.size },
    opts,
  );
  const files = manifest?.files;
  if (!files || typeof files !== "object") throw new IntegrityError(entry.manifest.url, "manifeste Java sans fichiers");

  // Dossiers d'abord, puis fichiers (tous les chemins contrôlés avant le moindre téléchargement)
  const dirs: string[] = [];
  const todo: { dest: string; dl: Download; executable: boolean }[] = [];
  for (const [rel, f] of Object.entries(files)) {
    const dest = safeJoin(dir, rel);
    if (f?.type === "directory") dirs.push(dest);
    else if (f?.type === "file") {
      const raw = f.downloads?.raw;
      if (!isDownload(raw)) throw new IntegrityError(rel, "fichier Java sans empreinte");
      todo.push({ dest, dl: raw, executable: f.executable === true });
    }
    // « link » : liens symboliques (macOS/Linux) ; non utilisés sous Windows, ignorés ici.
  }
  for (const d of dirs) await fsp.mkdir(d, { recursive: true });

  const progress: JavaProgress = { filesDone: 0, filesTotal: todo.length, bytes: 0 };
  let downloaded = 0;
  opts.onProgress?.({ ...progress });
  await runLimited(todo, opts.parallel ?? 8, async ({ dest, dl, executable }) => {
    if ((await fileSha1(dest)) !== dl.sha1.toLowerCase()) {
      const net: NetOptions & { onBytes: (n: number) => void } = {
        onBytes: (n) => {
          progress.bytes += n;
        },
      };
      if (opts.fetch) net.fetch = opts.fetch;
      if (opts.allowedHosts) net.allowedHosts = opts.allowedHosts;
      if (opts.signal) net.signal = opts.signal;
      await downloadVerified(dl.url, dest, { sha1: dl.sha1, size: dl.size }, net);
      downloaded++;
    }
    if (executable && process.platform !== "win32") await fsp.chmod(dest, 0o755);
    progress.filesDone++;
    opts.onProgress?.({ ...progress });
  });

  const executable = javaExecutable(dir, platform);
  try {
    await fsp.access(executable);
  } catch {
    throw new IntegrityError(entry.manifest.url, "java introuvable après installation");
  }
  return { component, version, dir, executable, downloaded };
}
