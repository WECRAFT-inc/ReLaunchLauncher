// Lecture des formats d'instances (lot E2), port EXACT des fonctions Python :
// parse_loader, parse_ram, read_curseforge, read_prism, read_local_instance (wecraft_launcher.py).
// Lecture seule : rien n'est jamais écrit dans un dossier d'instance.
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";

export type LoaderName = "Fabric" | "Forge" | "NeoForge" | "Quilt";
export type Source = "WeCraft" | "CurseForge" | "Modrinth" | "Prism";

/** Ordre de test important : « neoforge » avant « forge ». */
const LOADER_NAMES: readonly [string, LoaderName][] = [
  ["neoforge", "NeoForge"],
  ["forge", "Forge"],
  ["fabric", "Fabric"],
  ["quilt", "Quilt"],
];
export const LOADERS: readonly LoaderName[] = ["Fabric", "Forge", "NeoForge", "Quilt"];

export function isLoader(v: unknown): v is LoaderName {
  return typeof v === "string" && (LOADERS as readonly string[]).includes(v);
}

/** Nom de loader en minuscules (« fabric ») -> nom affiché, comme LOADER_NAMES.get() en Python. */
export function loaderFromKey(key: unknown): LoaderName | null {
  const k = String(key ?? "").toLowerCase();
  return LOADER_NAMES.find(([kk]) => kk === k)?.[1] ?? null;
}

/** 'forge-47.2.0' -> ['Forge', '47.2.0'] ; 'fabric-0.15.7-1.20.1' (mc 1.20.1) -> ['Fabric', '0.15.7']. */
export function parseLoader(text: unknown, mcVersion?: string | null): [LoaderName | null, string | null] {
  const t = (typeof text === "string" ? text : "").trim().toLowerCase();
  for (const [key, nice] of LOADER_NAMES) {
    if (t.startsWith(key)) {
      let ver: string | null = t.slice(key.length).replace(/^[-_ ]+/, "") || null;
      if (ver && mcVersion && ver.endsWith("-" + mcVersion)) ver = ver.slice(0, -mcVersion.length - 1);
      return [nice, ver];
    }
  }
  return [null, null];
}

/** RAM en Go, entier de 1 à 64 ; toute autre valeur -> null (comme parse_ram : int(value)). */
export function parseRam(value: unknown): number | null {
  let n: number;
  if (typeof value === "number") n = Math.trunc(value);
  else if (typeof value === "string" && /^\s*[+-]?\d+\s*$/.test(value)) n = parseInt(value, 10);
  else if (typeof value === "boolean") n = value ? 1 : 0;
  else return null;
  if (!Number.isFinite(n)) return null;
  return n >= 1 && n <= 64 ? n : null;
}

/** Lecture JSON stricte comme json.loads(read_text(encoding="utf-8")) : BOM ou octets invalides = erreur. */
export async function readJsonStrict(file: string): Promise<unknown> {
  const raw = await readFile(file);
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(raw);
  return JSON.parse(text);
}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
/** Équivalent de « x or y » en Python pour des valeurs JSON. */
function truthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}
const or = (a: unknown, b: unknown): unknown => (truthy(a) ? a : b);
/** str() Python d'une valeur JSON simple (None reste null). */
function pyStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? "True" : "False";
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : JSON.stringify(v);
}

export interface ReadInfo {
  name: string;
  version: string | null;
  loader: LoaderName | null;
  loaderVersion: string | null;
}

export async function readCurseforge(folder: string): Promise<ReadInfo> {
  const d = asObj(await readJsonStrict(path.join(folder, "minecraftinstance.json")));
  const base = asObj(or(d["baseModLoader"], {}));
  const mc = pyStr(or(d["gameVersion"], base["minecraftVersion"]));
  const [loader, lv] = parseLoader(base["name"], mc);
  return { name: pyStr(or(d["name"], path.basename(folder))) ?? path.basename(folder), version: mc || null, loader, loaderVersion: lv };
}

const PRISM_UIDS: Record<string, LoaderName> = {
  "net.minecraftforge": "Forge",
  "net.neoforged": "NeoForge",
  "net.fabricmc.fabric-loader": "Fabric",
  "org.quiltmc.quilt-loader": "Quilt",
};

export async function readPrism(instDir: string): Promise<ReadInfo> {
  const pack = asObj(await readJsonStrict(path.join(instDir, "mmc-pack.json")));
  let mc: string | null = null;
  let loader: LoaderName | null = null;
  let lv: string | null = null;
  const comps = Array.isArray(pack["components"]) ? pack["components"] : [];
  for (const c of comps) {
    const comp = asObj(c);
    const uid = comp["uid"];
    if (uid === "net.minecraft") mc = pyStr(comp["version"]);
    else if (typeof uid === "string" && PRISM_UIDS[uid]) {
      loader = PRISM_UIDS[uid]!;
      lv = pyStr(comp["version"]);
    }
  }
  let name = path.basename(instDir);
  try {
    const cfg = await readFile(path.join(instDir, "instance.cfg"));
    const text = new TextDecoder("utf-8", { fatal: true }).decode(cfg);
    const m = /^name=(.*)$/m.exec(text.replace(/\r\n/g, "\n"));
    if (m) name = m[1]!.trim();
  } catch {
    // pas de instance.cfg lisible : nom du dossier
  }
  return { name, version: mc, loader, loaderVersion: lv };
}

export interface Instance {
  name: string;
  /** Dossier de l'instance (clé des réglages par instance). */
  folder: string;
  /** Dossier de jeu (sous-dossier « minecraft » pour Prism). */
  path: string;
  version: string | null;
  loader: LoaderName | null;
  loaderVersion: string | null;
  ram: number | null;
  source: Source;
}

/** Comme Path.exists() : fichier OU dossier. */
export async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** Premier sous-dossier existant parmi `names` (ex. « minecraft » puis « .minecraft »). */
export async function firstDir(base: string, names: readonly string[]): Promise<string | null> {
  for (const n of names) {
    try {
      if ((await stat(path.join(base, n))).isDirectory()) return path.join(base, n);
    } catch {
      // absent
    }
  }
  return null;
}

/** Instance déposée dans « instances/ » (port de read_local_instance). */
export async function readLocalInstance(folder: string): Promise<Instance> {
  const inst: Instance = {
    name: path.basename(folder),
    folder,
    path: folder,
    version: null,
    loader: null,
    loaderVersion: null,
    ram: null,
    source: "WeCraft",
  };
  try {
    if (await exists(path.join(folder, "mmc-pack.json"))) {
      const r = await readPrism(folder);
      Object.assign(inst, { version: r.version, loader: r.loader, loaderVersion: r.loaderVersion });
      const game = await firstDir(folder, ["minecraft", ".minecraft"]);
      if (game) inst.path = game;
    } else if (await exists(path.join(folder, "minecraftinstance.json"))) {
      const r = await readCurseforge(folder);
      Object.assign(inst, { version: r.version, loader: r.loader, loaderVersion: r.loaderVersion });
    } else if (await exists(path.join(folder, "manifest.json"))) {
      const mcd = asObj(asObj(await readJsonStrict(path.join(folder, "manifest.json")))["minecraft"]);
      const loaders = Array.isArray(mcd["modLoaders"]) ? mcd["modLoaders"] : [];
      const main = asObj(loaders.find((l) => truthy(asObj(l)["primary"])) ?? (loaders.length ? loaders[0] : {}));
      const mcv = pyStr(mcd["version"]);
      const [loader, lv] = parseLoader(main["id"], mcv);
      Object.assign(inst, { version: mcv, loader, loaderVersion: lv });
    } else if (await exists(path.join(folder, "modrinth.index.json"))) {
      const deps = asObj(asObj(await readJsonStrict(path.join(folder, "modrinth.index.json")))["dependencies"]);
      inst.version = pyStr(deps["minecraft"]);
      for (const [key, nice] of [
        ["neoforge", "NeoForge"],
        ["forge", "Forge"],
        ["fabric-loader", "Fabric"],
        ["quilt-loader", "Quilt"],
      ] as const) {
        if (key in deps) {
          inst.loader = nice;
          inst.loaderVersion = pyStr(deps[key]);
          break;
        }
      }
    }
  } catch {
    // format illisible : on garde ce qui a été lu
  }
  try {
    const cfg = asObj(await readJsonStrict(path.join(folder, "wecraft.json")));
    if (truthy(cfg["name"])) inst.name = pyStr(cfg["name"])!;
    if (truthy(cfg["version"])) inst.version = pyStr(cfg["version"]);
    if ("loader" in cfg) inst.loader = cfg["loader"] as LoaderName | null;
    if ("loader_version" in cfg) inst.loaderVersion = truthy(cfg["loader_version"]) ? pyStr(cfg["loader_version"]) : null;
    if (parseRam(cfg["ram"])) inst.ram = parseRam(cfg["ram"]);
  } catch {
    // pas de wecraft.json lisible
  }
  if (!isLoader(inst.loader)) inst.loader = null;
  if (!inst.loader) inst.loaderVersion = null;
  return inst;
}
