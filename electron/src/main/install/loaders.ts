// Loaders Fabric et Quilt (lot E3), équivalent de ensure_loader en Python (mll.mod_loader).
//
// Fabric et Quilt ne demandent aucun programme à exécuter : leur « profil » (fichier de version qui hérite
// de la version de Minecraft) vient de leur serveur officiel en HTTPS, puis toutes les bibliothèques sont
// installées avec les mêmes garde-fous que la version de base (empreinte obligatoire, .sha1 Maven sinon).
// Le nom de version est celui de l'installeur officiel, comme minecraft_launcher_lib :
// « fabric-loader-<loader>-<minecraft> », « quilt-loader-<loader>-<minecraft> ».
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchJson, IntegrityError, type NetOptions } from "../net/download";
import { ensureVanillaJson, installVersionFiles, isSafeVersionId, net, type InstalledVersion, type InstallVanillaOptions } from "./vanilla";

export type SimpleLoader = "Fabric" | "Quilt";

const META: Record<SimpleLoader, { list: (mc: string) => string; profile: (mc: string, v: string) => string }> = {
  Fabric: {
    list: (mc) => `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mc)}`,
    profile: (mc, v) => `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mc)}/${encodeURIComponent(v)}/profile/json`,
  },
  Quilt: {
    list: (mc) => `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mc)}`,
    profile: (mc, v) => `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mc)}/${encodeURIComponent(v)}/profile/json`,
  },
};

export interface LoaderChoice {
  version: string;
  /** Version demandée par l'instance introuvable : la plus récente est utilisée (message pour l'utilisateur). */
  note: string | null;
}

/** Versions du loader disponibles pour cette version de Minecraft, la plus récente d'abord. */
export async function loaderVersions(loader: SimpleLoader, mc: string, opts: NetOptions = {}): Promise<{ version: string; stable: boolean }[]> {
  const list = await fetchJson<unknown>(META[loader].list(mc), 4 * 1024 * 1024, {}, opts);
  if (!Array.isArray(list)) throw new IntegrityError(META[loader].list(mc), "liste des versions illisible");
  const out: { version: string; stable: boolean }[] = [];
  for (const item of list) {
    const l = (item as { loader?: { version?: unknown; stable?: unknown } })?.loader;
    if (typeof l?.version !== "string" || !/^[0-9A-Za-z.+_-]{1,64}$/.test(l.version)) continue;
    const stable = typeof l.stable === "boolean" ? l.stable : !/beta|alpha|pre|rc/i.test(l.version);
    out.push({ version: l.version, stable });
  }
  return out;
}

/** Choix de version comme ensure_loader : version exacte de l'instance si elle existe, sinon la plus récente stable. */
export function chooseLoaderVersion(loader: SimpleLoader, available: { version: string; stable: boolean }[], wanted: string | null, mc: string): LoaderChoice {
  if (available.length === 0) throw new Error(`${loader} ne supporte pas Minecraft ${mc}.`);
  let note: string | null = null;
  if (wanted) {
    const hit = available.find((a) => a.version === wanted || a.version.endsWith("-" + wanted));
    if (hit) return { version: hit.version, note: null };
    note = `${loader} ${wanted} introuvable : dernière version utilisée.`;
  }
  const best = available.find((a) => a.stable) ?? available[0]!;
  return { version: best.version, note };
}

/** Profil du loader, vérifié dans sa forme avant d'être écrit. */
export async function fetchLoaderProfile(loader: SimpleLoader, mc: string, version: string, opts: NetOptions = {}): Promise<Record<string, unknown>> {
  const url = META[loader].profile(mc, version);
  const p = await fetchJson<Record<string, unknown>>(url, 2 * 1024 * 1024, {}, opts);
  const id = p?.["id"];
  if (typeof id !== "string" || !isSafeVersionId(id)) throw new IntegrityError(url, "identifiant de version invalide");
  if (p["inheritsFrom"] !== mc) throw new IntegrityError(url, "le profil n'hérite pas de la bonne version de Minecraft");
  if (!Array.isArray(p["libraries"])) throw new IntegrityError(url, "profil sans bibliothèques");
  for (const lib of p["libraries"] as unknown[]) {
    const name = (lib as { name?: unknown })?.name;
    if (typeof name !== "string" || !/^[\w.+-]+:[\w.+-]+:[\w.+-]+(:[\w.+-]+)?(@\w+)?$/.test(name)) {
      throw new IntegrityError(url, "bibliothèque au nom invalide");
    }
  }
  return p;
}

/** Écrit le fichier de version de façon atomique, seulement s'il a changé. */
async function writeVersionJson(mcDir: string, id: string, content: string): Promise<void> {
  const dir = path.join(mcDir, "versions", id);
  const file = path.join(dir, `${id}.json`);
  try {
    if ((await readFile(file, "utf8")) === content) return;
  } catch {
    // absent
  }
  await mkdir(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, content, { encoding: "utf8", flag: "w" });
  try {
    await rename(tmp, file);
  } catch (e) {
    await unlink(tmp).catch(() => undefined);
    throw e;
  }
}

export interface LoaderInstallOptions extends InstallVanillaOptions {
  onNote?: (note: string) => void;
}

/**
 * Installe Minecraft `mc` puis le loader Fabric/Quilt (version de l'instance si possible) ; renvoie
 * l'identifiant de version à lancer. Tout est vérifié avant de rendre la main.
 */
export async function installSimpleLoader(
  mcDir: string,
  loader: SimpleLoader,
  mc: string,
  wanted: string | null,
  opts: LoaderInstallOptions,
): Promise<InstalledVersion> {
  const n = net(opts);
  await ensureVanillaJson(mcDir, mc, opts);
  await installVersionFiles(mcDir, mc, opts);
  const choice = chooseLoaderVersion(loader, await loaderVersions(loader, mc, n), wanted, mc);
  if (choice.note) opts.onNote?.(choice.note);
  const profile = await fetchLoaderProfile(loader, mc, choice.version, n);
  const id = profile["id"] as string;
  await writeVersionJson(mcDir, id, JSON.stringify(profile, null, 2));
  return installVersionFiles(mcDir, id, opts);
}

// ---------------------------------------------------------------- hors ligne

/** Versions déjà installées (dossiers de versions/ contenant leur fichier .json). */
export async function installedVersionIds(mcDir: string): Promise<string[]> {
  const dir = path.join(mcDir, "versions");
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const n of names) {
    try {
      await readFile(path.join(dir, n, `${n}.json`), { flag: "r" });
      out.push(n);
    } catch {
      // pas une version installée
    }
  }
  return out.sort();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Loaders déjà installés pour EXACTEMENT cette version de Minecraft (installed_loader_ids en Python) :
 * 1.20.1 ne correspond pas à 1.20.10, et « forge » ne correspond pas à « neoforge ».
 */
export function installedLoaderIds(installed: Iterable<string>, loaderKey: string, version: string): string[] {
  const ver = new RegExp(`(?<![\\w.])${escape(version)}(?![\\w.])`);
  const key = new RegExp(`(?<![a-z])${escape(loaderKey)}`);
  const out: string[] = [];
  for (const i of installed) {
    const low = i.toLowerCase();
    if (!ver.test(i)) continue;
    if (loaderKey === "forge" && low.includes("neoforge")) continue;
    if (key.test(low)) out.push(i);
  }
  return out.sort();
}
