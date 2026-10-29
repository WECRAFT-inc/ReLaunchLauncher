// Modpacks d'événements (section ReLaunch) : le joueur peut changer SES packs de ressources et SES shaders,
// JAMAIS les mods, le loader ni la configuration imposée.
//
// Séparation fiable : un modpack d'événement est un dossier d'instance qui contient « wecraft_event.json »
// (fourni par le staff avec l'événement). Ce fichier liste les fichiers OFFICIELS (chemin + empreinte SHA-256).
// Tout le reste du dossier est au joueur. Les contrôles sont faits ICI, dans le processus principal, sur des
// noms vérifiés : l'interface ne peut ni fournir un chemin, ni viser un autre dossier que resourcepacks/ ou
// shaderpacks/, ni retirer un fichier officiel, ni écrire dans mods/ — même en appelant les canaux IPC à la main.
//
// État actuel : aucun événement n'est encore distribué (ils arriveront avec les comptes ReLink). Ce module
// reconnaît déjà leurs dossiers et protège leurs fichiers dès qu'ils existent.
import { mkdir, readFile, readdir, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeRelPath } from "../modpacks/mrpack";

export const EVENT_FILE = "wecraft_event.json";
export const EDITABLE: Record<"resourcepack" | "shader", string> = { resourcepack: "resourcepacks", shader: "shaderpacks" };
export type EditableKind = keyof typeof EDITABLE;

export interface EventManifest {
  id: string;
  name: string;
  /** Fichiers officiels, chemins relatifs au dossier de l'instance (« / »), en minuscules pour comparer. */
  official: Set<string>;
  /** Shader choisi par l'événement (affiché comme valeur par défaut). */
  defaultShader: string | null;
  /** Dossiers que le joueur peut modifier (« resourcepacks », « shaderpacks ») ; un pack ReLaunch verrouillé : shaders seulement. */
  editable: Set<string>;
}

export class EventLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventLockError";
  }
}

/** Manifeste vérifié ; null si le dossier n'est pas un modpack d'événement (ou si le manifeste est invalide). */
export async function readEventManifest(folder: string): Promise<EventManifest | null> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path.join(folder, EVENT_FILE), "utf8"));
  } catch {
    return null;
  }
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  if (typeof o["id"] !== "string" || !/^[a-z0-9-]{1,64}$/.test(o["id"])) return null;
  const official = new Set<string>();
  for (const f of Array.isArray(o["files"]) ? (o["files"] as unknown[]) : []) {
    const p = safeRelPath((f as Record<string, unknown>)?.["path"]);
    if (p) official.add(p.toLowerCase());
  }
  official.add(EVENT_FILE);
  const ds = o["defaultShader"];
  const ed = Array.isArray(o["editable"]) ? new Set((o["editable"] as unknown[]).filter((x): x is string => x === "resourcepacks" || x === "shaderpacks")) : new Set(["resourcepacks", "shaderpacks"]);
  return {
    editable: ed,
    id: o["id"],
    name: typeof o["name"] === "string" && o["name"].trim() ? o["name"].trim().slice(0, 80) : o["id"],
    official,
    defaultShader: typeof ds === "string" && /^[^/\\:*?"<>|\x00-\x1f]{1,200}$/.test(ds) ? ds : null,
  };
}

/** Nom de pack sûr : un simple nom de fichier ou de dossier (.zip ou dossier), sans chemin ni nom réservé. */
export function safePackName(n: unknown): n is string {
  return typeof n === "string" && safeRelPath(n) === n && !n.includes("/") && n !== EVENT_FILE;
}

/**
 * Fichier d'un pack modifiable, vérifié : genre resourcepack/shader seulement, nom simple, et le chemin réel
 * reste dans resourcepacks/ ou shaderpacks/ de CETTE instance (un lien symbolique vers mods/ est refusé).
 */
export async function editablePath(folder: string, kind: unknown, name: unknown): Promise<{ file: string; rel: string }> {
  if (kind !== "resourcepack" && kind !== "shader") throw new EventLockError("Seuls les packs de ressources et les shaders peuvent être modifiés.");
  if (!safePackName(name)) throw new EventLockError("Nom de pack refusé.");
  const dir = path.join(folder, EDITABLE[kind]);
  const file = path.join(dir, name);
  try {
    const real = await realpath(file);
    const realDir = await realpath(dir);
    const rel = path.relative(realDir, real);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel) || rel.includes(path.sep)) throw new EventLockError("Ce fichier sort du dossier des packs : refusé.");
  } catch (e) {
    if (e instanceof EventLockError) throw e;
    // fichier absent : le nom seul est vérifié (il ne peut pas sortir du dossier)
  }
  return { file, rel: `${EDITABLE[kind]}/${name}` };
}

/** Refuse une modification d'un genre de pack que l'événement n'ouvre pas au joueur. */
export function assertKindEditable(m: EventManifest, kind: EditableKind): void {
  if (!m.editable.has(EDITABLE[kind])) throw new EventLockError(kind === "resourcepack" ? "Pack d'event : les packs de ressources sont imposés, seuls les shaders peuvent être changés." : "Pack d'event : les shaders sont imposés.");
}

/** Refuse toute opération sur un fichier officiel de l'événement. */
export function assertNotOfficial(m: EventManifest, rel: string): void {
  if (m.official.has(rel.toLowerCase())) throw new EventLockError("Ce fichier fait partie du modpack officiel de l'événement : il ne peut pas être retiré ni remplacé.");
}

export interface EventPack {
  name: string;
  official: boolean;
  enabled: boolean;
}

/** Packs de ressources ou shaders d'une instance d'événement (officiels et ajoutés par le joueur). */
export async function listPacks(folder: string, m: EventManifest, kind: EditableKind): Promise<EventPack[]> {
  const names = (await readdir(path.join(folder, EDITABLE[kind])).catch(() => [] as string[])).filter((n) => safePackName(n));
  const enabled = kind === "resourcepack" ? await enabledResourcePacks(folder) : [await currentShader(folder)].filter((x): x is string => !!x);
  return names.sort((a, b) => a.localeCompare(b)).map((name) => ({ name, official: m.official.has(`${EDITABLE[kind]}/${name}`.toLowerCase()), enabled: kind === "resourcepack" ? enabled.includes(`file/${name}`) : enabled.includes(name) }));
}

// ---------------------------------------------------------------- réglages du jeu (packs actifs)
/** Ligne « resourcePacks:[...] » de options.txt (packs actifs, du plus faible au plus fort). */
export async function enabledResourcePacks(folder: string): Promise<string[]> {
  const text = await readFile(path.join(folder, "options.txt"), "utf8").catch(() => "");
  const m = /^resourcePacks:(\[.*\])\s*$/m.exec(text);
  if (!m) return [];
  try {
    const v = JSON.parse(m[1]!) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function writeKeep(file: string, text: string): Promise<void> {
  const tmp = `${file}.relaunch.tmp`;
  await writeFile(tmp, text, "utf8");
  await rename(tmp, file);
}

/** Active ou désactive un pack de ressources (options.txt) ; seule la ligne resourcePacks change. */
export async function setResourcePack(folder: string, m: EventManifest, name: unknown, on: boolean): Promise<void> {
  // désactiver un pack officiel ne change que options.txt du joueur (affichage) : le fichier reste en place
  assertKindEditable(m, "resourcepack");
  await editablePath(folder, "resourcepack", name);
  const f = path.join(folder, "options.txt");
  const text = await readFile(f, "utf8").catch(() => "");
  const list = (await enabledResourcePacks(folder)).filter((x) => x !== `file/${name as string}`);
  if (on) list.push(`file/${name as string}`);
  const line = `resourcePacks:${JSON.stringify(list)}`;
  const next = /^resourcePacks:.*$/m.test(text) ? text.replace(/^resourcePacks:.*$/m, line) : `${text}${text && !text.endsWith("\n") ? "\n" : ""}${line}\n`;
  await writeKeep(f, next);
}

/** Shader actif (Iris/Oculus : config/iris.properties). */
export async function currentShader(folder: string): Promise<string | null> {
  const text = await readFile(path.join(folder, "config", "iris.properties"), "utf8").catch(() => "");
  const m = /^shaderPack=(.*)$/m.exec(text);
  return m && m[1]!.trim() ? m[1]!.trim() : null;
}

/** Choisit le shader (ou aucun) ; seules les lignes shaderPack / enableShaders changent. */
export async function setShader(folder: string, name: unknown): Promise<void> {
  if (name !== null) await editablePath(folder, "shader", name);
  const f = path.join(folder, "config", "iris.properties");
  let text = await readFile(f, "utf8").catch(() => "");
  const set = (k: string, v: string) => {
    text = new RegExp(`^${k}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`) : `${text}${text && !text.endsWith("\n") ? "\n" : ""}${k}=${v}\n`;
  };
  set("shaderPack", name === null ? "" : (name as string));
  set("enableShaders", name === null ? "false" : "true");
  await mkdir(path.dirname(f), { recursive: true });
  await writeKeep(f, text);
}

/** Retire (corbeille) un pack AJOUTÉ par le joueur ; un pack officiel est refusé. */
export async function removePack(folder: string, m: EventManifest, kind: unknown, name: unknown, trash: (file: string) => Promise<void>): Promise<void> {
  const { file, rel } = await editablePath(folder, kind, name);
  assertKindEditable(m, kind as EditableKind);
  assertNotOfficial(m, rel);
  await trash(file);
}

/**
 * Garde générale pour les autres opérations du launcher sur une instance (réglages de version/loader, mods,
 * fond officiel) : refusées pour un modpack d'événement.
 */
export async function assertNotEvent(folder: string, what: string): Promise<void> {
  if (await readEventManifest(folder)) throw new EventLockError(`${what} : impossible pour un modpack d'événement (configuration imposée par l'événement).`);
}
