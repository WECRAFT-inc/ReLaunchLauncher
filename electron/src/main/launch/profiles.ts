// Profil « WECRAFT - <instance> » dans le launcher officiel (lot E4), port EXACT de set_profile,
// backup_profiles_file, default_instance_name et profile_name_for (wecraft_launcher.py, lots 1 et 1b).
//
// Sécurités (identiques à la version Python) :
// - sauvegarde horodatée AVANT chaque écriture (15 gardées, sans les jetons des anciens launchers) et
//   première sauvegarde historique « .bak_wecraft » conservée ;
// - écriture atomique puis relecture de contrôle ;
// - le profil de WeCraft est retrouvé par son identifiant mémorisé (managed_profiles.json), jamais en
//   devinant d'après un nom choisi par l'utilisateur ; les autres profils ne sont jamais modifiés ;
// - un fichier illisible n'est jamais réécrit (erreur claire à la place).
// Les jetons de connexion ne sont jamais lus ni copiés ailleurs (§6 du prompt maître).
//
// Seule différence connue avec Python : une clé purement numérique et courte (ex. « 123 ») est remise en
// tête de son objet par JavaScript. Le contenu est identique (l'ordre des clés n'a pas de sens en JSON) ;
// les identifiants du launcher officiel (32 caractères hexadécimaux) ne sont pas concernés.
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { metaKey } from "../instances/detect";
import { JsonStore, stamp } from "../storage/jsonStore";

export const PROFILE_NAME = "WECRAFT";
export const PROFILE_FILES = ["launcher_profiles.json", "launcher_profiles_microsoft_store.json"] as const;
export const PROFILE_BACKUPS_KEPT = 15;
const SECRET_KEYS = ["authenticationDatabase", "clientToken", "selectedUser", "authenticationDatabaseV2"];
/** Noms que WeCraft a pu donner à son profil (actuel et anciens) ; « WeCraft Survie » ne correspond PAS. */
const OUR_PROFILE_NAME = /^(?:WECRAFT|[Mm][Oo][Nn] [Ll][Aa][Nn][Cc][Ee][Uu][Rr])(?: - [\s\S]*)?$/;

export class ProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileError";
  }
}

/** Nom d'instance déduit du dossier de jeu (default_instance_name). */
export function defaultInstanceName(gameDir: string, platform: NodeJS.Platform = process.platform): string {
  const p = platform === "win32" ? path.win32 : path.posix;
  const base = p.basename(gameDir);
  const parent = p.basename(p.dirname(gameDir));
  if (["minecraft", ".minecraft"].includes(base.toLowerCase()) && parent) return parent;
  return base.replace(/^\.+/, "") || base;
}

export function profileNameFor(instanceName: string): string {
  return `${PROFILE_NAME} - ${instanceName}`;
}

/** Date au format du launcher officiel, comme strftime("%Y-%m-%dT%H:%M:%S.000Z") en UTC. */
export function launcherDate(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

/** Python : datetime.now().strftime("%Y%m%d-%H%M%S-%f") (heure locale, microsecondes). */
function backupStamp(d: Date): string {
  return `${stamp(d)}-${String(d.getMilliseconds()).padStart(3, "0")}000`;
}

function decodeUtf8Sig(raw: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(raw);
}

export interface ProfileDeps {
  store: JsonStore;
  /** %APPDATA%\.wecraft\managed_profiles.json */
  idsFile: string;
  /** %APPDATA%\.wecraft\backups\launcher_profiles */
  backupDir: string;
  now?: () => Date;
  platform?: NodeJS.Platform;
}

/** Sauvegarde horodatée avant écriture (backup_profiles_file). Renvoie le chemin de la copie. */
export async function backupProfilesFile(f: string, deps: ProfileDeps): Promise<string> {
  const now = deps.now ?? (() => new Date());
  const legacy = `${f}.bak_wecraft`;
  try {
    await stat(legacy);
  } catch {
    await copyFile(f, legacy);
  }
  await mkdir(deps.backupDir, { recursive: true });
  const stem = path.basename(f, ".json");
  const dest = path.join(deps.backupDir, `${stem}.${backupStamp(now())}.json`);
  try {
    const data: unknown = JSON.parse(decodeUtf8Sig(await readFile(f)));
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      for (const k of SECRET_KEYS) delete (data as Record<string, unknown>)[k];
    }
    await deps.store.writeAtomic(dest, JSON.stringify(data, null, 2));
  } catch {
    await copyFile(f, dest);
  }
  const old = (await readdir(deps.backupDir)).filter((n) => n.startsWith(`${stem}.`) && n.endsWith(".json")).sort();
  for (const extra of old.slice(0, Math.max(0, old.length - PROFILE_BACKUPS_KEPT))) {
    await unlink(path.join(deps.backupDir, extra)).catch(() => undefined);
  }
  return dest;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
/** « not x » en Python pour une valeur JSON ([] et {} sont faux en Python, vrais en JavaScript). */
const pyFalsy = (v: unknown): boolean =>
  !v || (Array.isArray(v) && v.length === 0) || (isObj(v) && Object.keys(v).length === 0);

/**
 * Crée ou met à jour le profil de WeCraft dans chaque fichier de profils présent (set_profile).
 * Renvoie le nombre de fichiers mis à jour.
 */
export async function setProfile(baseDir: string, name: string, versionId: string, gameDir: string, ram: number, deps: ProfileDeps): Promise<number> {
  const platform = deps.platform ?? process.platform;
  const files: string[] = [];
  for (const n of PROFILE_FILES) {
    try {
      await stat(path.join(baseDir, n));
      files.push(path.join(baseDir, n));
    } catch {
      // absent
    }
  }
  if (files.length === 0) {
    throw new ProfileError("Profils du launcher officiel introuvables.\nOuvrez une fois le launcher officiel de Minecraft, fermez-le, puis réessayez.");
  }
  const now = launcherDate((deps.now ?? (() => new Date()))());
  const ids = (await deps.store.read(deps.idsFile)) ?? {};
  const updates: Record<string, string> = {};
  for (const f of files) {
    let data: Obj;
    let profiles: Obj;
    try {
      const parsed: unknown = JSON.parse(decodeUtf8Sig(await readFile(f)));
      if (!isObj(parsed)) throw new Error("format inattendu");
      data = parsed;
      if (!("profiles" in data)) data["profiles"] = {};
      if (!isObj(data["profiles"])) throw new Error("format inattendu");
      profiles = data["profiles"];
    } catch (e) {
      throw new ProfileError(
        `Le fichier ${path.basename(f)} du launcher officiel est illisible (${(e as Error).message}).\n` +
          "WeCraft ne l'a pas modifié. Ouvrez le launcher officiel une fois pour qu'il le répare, puis réessayez.",
      );
    }
    let key: string | null = typeof ids[metaKey(f, platform)] === "string" ? (ids[metaKey(f, platform)] as string) : null;
    if (key === null || !(key in profiles) || !isObj(profiles[key])) {
      key = Object.keys(profiles).find((k) => isObj(profiles[k]) && (profiles[k] as Obj)["name"] === name) ?? null;
    }
    if (key === null) {
      const legacy = Object.entries(profiles).filter(([, p]) => isObj(p) && OUR_PROFILE_NAME.test(String((p as Obj)["name"] ?? "")));
      if (legacy.length) {
        key = legacy.reduce((best, cur) => (String((cur[1] as Obj)["lastUsed"] ?? "") > String((best[1] as Obj)["lastUsed"] ?? "") ? cur : best))[0];
      }
    }
    if (key === null) {
      key = randomUUID().replace(/-/g, "");
      profiles[key] = { name, created: now };
    }
    const prof = profiles[key] as Obj;
    prof["name"] = name;
    Object.assign(prof, { type: "custom", lastVersionId: versionId, gameDir, lastUsed: now });
    // La RAM n'est modifiée que si les arguments Java sont absents ou sont ceux de ce launcher
    if (pyFalsy(prof["javaArgs"]) || /^-Xmx\p{Nd}+G$/u.test(String(prof["javaArgs"]))) prof["javaArgs"] = `-Xmx${ram}G`;
    await backupProfilesFile(f, deps);
    await deps.store.writeAtomic(f, JSON.stringify(data, null, 2));
    const check = (JSON.parse(await readFile(f, "utf8")) as Obj)["profiles"] as Obj | undefined;
    const c = isObj(check?.[key]) ? (check![key] as Obj) : {};
    if (c["lastVersionId"] !== versionId || c["gameDir"] !== gameDir) {
      throw new ProfileError(`Le profil n'a pas pu être vérifié après écriture dans ${path.basename(f)}.\nUne sauvegarde se trouve dans ${deps.backupDir}.`);
    }
    updates[metaKey(f, platform)] = key;
  }
  await deps.store.update(deps.idsFile, (d) => ({ ...d, ...updates }));
  return files.length;
}
