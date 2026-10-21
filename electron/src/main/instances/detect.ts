// Détection des instances (lot E2), port de launcher_dirs, detect_instances, scan_instances,
// detect_external, apply_meta et is_inside (wecraft_launcher.py). Lecture seule.
//
// Sources : dossier « instances » de WeCraft (%APPDATA%\.wecraft\instances), CurseForge (2 emplacements),
// Modrinth (base app.db en lecture seule, sinon simple liste des dossiers), Prism.
// Les réglages par instance (nom affiché, masquage, favori, version/loader/RAM forcés) viennent de
// instances_meta.json, partagé avec la version Python (même clé : os.path.normcase du dossier).
import { opendir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { minecraftDir, wecraftDataDir, type PathEnv } from "../paths";
import {
  firstDir,
  isDir,
  isLoader,
  loaderFromKey,
  parseRam,
  readCurseforge,
  readLocalInstance,
  readPrism,
  type Instance,
  type LoaderName,
  type Source,
} from "./formats";

export const SOURCE_ORDER: Record<Source, number> = { WeCraft: 0, CurseForge: 1, Modrinth: 2, Prism: 3 };

function lib(platform: NodeJS.Platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

export interface LauncherDirs {
  curseforge: string[];
  prism: string;
  modrinth: string;
}

/** Dossiers habituels des autres launchers (launcher_dirs en Python). */
export function launcherDirs({ platform, env, home }: PathEnv): LauncherDirs {
  const p = lib(platform);
  let prism: string;
  let modrinth: string;
  if (platform === "win32") {
    const appData = env["APPDATA"] || p.join(home, "AppData", "Roaming");
    prism = p.join(appData, "PrismLauncher");
    modrinth = p.join(appData, "ModrinthApp");
  } else if (platform === "darwin") {
    const support = p.join(home, "Library", "Application Support");
    prism = p.join(support, "PrismLauncher");
    modrinth = p.join(support, "com.modrinth.theseus");
  } else {
    const share = p.join(home, ".local", "share");
    prism = p.join(share, "PrismLauncher");
    modrinth = p.join(share, "ModrinthApp");
  }
  const curseforge = [p.join(home, "curseforge", "minecraft", "Instances"), p.join(home, "Documents", "curseforge", "minecraft", "Instances")];
  return { curseforge, prism, modrinth };
}

export function instancesDir(e: PathEnv): string {
  return lib(e.platform).join(wecraftDataDir(e), "instances");
}

/** Dossiers qui CONTIENNENT des instances (instance_roots en Python). */
export function instanceRoots(e: PathEnv): string[] {
  const d = launcherDirs(e);
  const p = lib(e.platform);
  return [instancesDir(e), ...d.curseforge, p.join(d.prism, "instances"), p.join(d.modrinth, "profiles")];
}

/** Clé de instances_meta.json : os.path.normcase(str(dossier)) (Windows : minuscules et « \ »). */
export function metaKey(folder: string, platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? folder.replace(/\//g, "\\").toLowerCase() : folder;
}

/** True si `child` est STRICTEMENT dans `root`, liens et « .. » résolus (is_inside en Python). */
export async function isInside(child: string, root: string): Promise<boolean> {
  try {
    const [c, r] = await Promise.all([realpath(child), realpath(root)]);
    const rel = path.relative(r, c);
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  } catch {
    return false;
  }
}

/** Sous-dossiers triés par nom (comme sorted(iterdir())), sans planter si le dossier est absent. */
async function subdirs(dir: string): Promise<string[]> {
  const out: string[] = [];
  try {
    const d = await opendir(dir);
    for await (const e of d) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() || (e.isSymbolicLink() && (await isDir(full)))) out.push(e.name);
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map((n) => path.join(dir, n));
}

export interface ModrinthProfile {
  folder: string;
  name: string;
  version: string | null;
  loader: LoaderName | null;
  loaderVersion: string | null;
}

/** Base SQLite de l'app Modrinth, ouverte en LECTURE SEULE (read_modrinth_db en Python). */
export async function readModrinthDb(dbFile: string, profilesDir: string): Promise<ModrinthProfile[]> {
  await stat(dbFile); // absent : erreur -> repli sur la liste des dossiers
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const rows = db.prepare("SELECT * FROM profiles").all() as Record<string, unknown>[];
    return rows.map((r) => {
      const get = (k: string) => (k in r ? r[k] : null);
      const lv = get("mod_loader_version");
      const p = get("path") ?? "None"; // str(None) en Python
      return {
        folder: path.join(profilesDir, String(p)),
        name: String(get("name") || p),
        version: get("game_version") == null ? null : String(get("game_version")),
        loader: loaderFromKey(get("mod_loader")),
        loaderVersion: lv === null || lv === undefined || lv === "" || lv === "None" ? null : String(lv),
      };
    });
  } finally {
    db.close();
  }
}

const ANY = ["mods", "saves", "options.txt"];

/** Instances CurseForge, Modrinth et Prism (detect_instances + detect_external en Python). */
export async function detectExternal(e: PathEnv): Promise<Instance[]> {
  const d = launcherDirs(e);
  const found: Instance[] = [];
  const add = (source: Source, name: string, folder: string, game: string, r?: { version: string | null; loader: LoaderName | null; loaderVersion: string | null }) =>
    found.push({ name, folder, path: game, version: r?.version ?? null, loader: r?.loader ?? null, loaderVersion: r?.loaderVersion ?? null, ram: null, source });

  for (const cf of d.curseforge) {
    for (const inst of await subdirs(cf)) {
      try {
        const r = await readCurseforge(inst);
        add("CurseForge", r.name, inst, inst, r);
      } catch {
        if ((await Promise.all(ANY.map((n) => exists(path.join(inst, n))))).some(Boolean)) add("CurseForge", path.basename(inst), inst, inst);
      }
    }
  }

  const profilesDir = path.join(d.modrinth, "profiles");
  try {
    for (const p of await readModrinthDb(path.join(d.modrinth, "app.db"), profilesDir)) {
      if ((await isDir(p.folder)) && (await isInside(p.folder, profilesDir))) add("Modrinth", p.name, p.folder, p.folder, p);
    }
  } catch {
    for (const inst of await subdirs(profilesDir)) add("Modrinth", path.basename(inst), inst, inst);
  }

  for (const inst of await subdirs(path.join(d.prism, "instances"))) {
    const game = await firstDir(inst, ["minecraft", ".minecraft"]);
    if (!game) continue;
    try {
      const r = await readPrism(inst);
      add("Prism", r.name, inst, game, r);
    } catch {
      add("Prism", path.basename(inst), inst, game);
    }
  }
  return found;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Dossiers du « instances » de WeCraft, avec cache par date de modification (scan_instances). */
export class LocalScanner {
  private readonly cache = new Map<string, { mtime: bigint; inst: Instance }>();

  constructor(private readonly dir: string) {}

  clear(): void {
    this.cache.clear();
  }

  async scan(): Promise<Instance[]> {
    let names: string[];
    try {
      const d = await opendir(this.dir);
      names = [];
      for await (const e of d) if (e.isDirectory() && !e.name.startsWith(".") && !e.name.startsWith("_")) names.push(e.name);
    } catch {
      return [];
    }
    names.sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0));
    const out: Instance[] = [];
    const seen = new Set<string>();
    for (const n of names) {
      const full = path.join(this.dir, n);
      let mtime: bigint;
      try {
        mtime = (await stat(full, { bigint: true })).mtimeNs;
      } catch {
        continue;
      }
      seen.add(full);
      const hit = this.cache.get(full);
      if (hit && hit.mtime === mtime) out.push({ ...hit.inst });
      else {
        const inst = await readLocalInstance(full);
        this.cache.set(full, { mtime, inst: { ...inst } });
        out.push(inst);
      }
    }
    for (const k of [...this.cache.keys()]) if (!seen.has(k)) this.cache.delete(k);
    return out;
  }
}

export interface ListedInstance extends Instance {
  display: string;
  hidden: boolean;
  fav: boolean;
}

/** Applique instances_meta.json (apply_meta) ; une entrée abîmée n'empêche pas d'afficher les autres. */
export function applyMeta(instances: Instance[], meta: Record<string, unknown> | null, platform: NodeJS.Platform = process.platform): ListedInstance[] {
  return instances.map((i0) => {
    const i: Instance = { ...i0 };
    const raw = meta?.[metaKey(i.folder, platform)];
    const m = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    if (m["version"]) i.version = String(m["version"]);
    if ("loader" in m) i.loader = m["loader"] as LoaderName | null;
    if ("loader_version" in m) i.loaderVersion = m["loader_version"] ? String(m["loader_version"]) : null;
    if (parseRam(m["ram"])) i.ram = parseRam(m["ram"]);
    if (!isLoader(i.loader)) i.loader = null;
    if (!i.loader) i.loaderVersion = null;
    const display = String(m["name"] ?? "").trim() || i.name;
    return { ...i, display, hidden: Boolean(m["hidden"]), fav: Boolean(m["fav"]) };
  });
}

/** Ordre d'affichage de la version Python : source, puis nom affiché (minuscules). */
export function sortInstances(list: ListedInstance[]): ListedInstance[] {
  return [...list].sort((a, b) => {
    const s = SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source];
    if (s) return s;
    const x = a.display.toLowerCase();
    const y = b.display.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

/** Dossier « .minecraft » officiel (jamais listé comme instance, gardé pour E4). */
export { minecraftDir };
