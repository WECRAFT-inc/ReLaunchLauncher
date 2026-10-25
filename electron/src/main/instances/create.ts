// « Créer un WePack » > « Sur mesure » : nouvelle instance vide dans le dossier des instances de WeCraft.
// Même format que la version Python (wecraft.json lu par read_local_instance) : la version, le loader et sa
// version sont installés au premier lancement (lot E4). Rien n'est écrit ailleurs que dans le NOUVEAU dossier.
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSafeVersionId } from "../install/vanilla";
import { safeFolderName } from "../modpacks/modrinth";

export const CREATE_LOADERS = ["Vanilla", "Fabric", "NeoForge", "Forge", "Quilt"] as const;
export type CreateLoader = (typeof CREATE_LOADERS)[number];

export interface CustomInstance {
  name: string;
  mc: string;
  loader: CreateLoader;
  /** null : version stable choisie au lancement. */
  loaderVersion: string | null;
}

/** Version de loader sûre (chiffres, lettres, . + - _), sans « .. ». */
const LOADER_VERSION = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/;

/** Demande de l'interface vérifiée ; null si un champ est invalide. */
export function cleanCreate(input: unknown): CustomInstance | null {
  const o = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const name = typeof o["name"] === "string" ? o["name"].trim().slice(0, 60) : "";
  const mc = o["mc"];
  const loader = o["loader"];
  const lv = o["loaderVersion"];
  if (!name || typeof mc !== "string" || !isSafeVersionId(mc) || !(CREATE_LOADERS as readonly unknown[]).includes(loader)) return null;
  if (lv !== null && lv !== undefined && (typeof lv !== "string" || !LOADER_VERSION.test(lv) || lv.includes(".."))) return null;
  return { name, mc, loader: loader as CreateLoader, loaderVersion: loader === "Vanilla" ? null : ((lv as string | null | undefined) ?? null) };
}

/** Contenu de wecraft.json (le nom n'y est noté que s'il diffère du nom du dossier). */
export function wecraftJson(c: CustomInstance, folderName: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (c.name !== folderName) out["name"] = c.name;
  out["version"] = c.mc;
  if (c.loader !== "Vanilla") out["loader"] = c.loader;
  if (c.loaderVersion) out["loader_version"] = c.loaderVersion;
  return out;
}

export type CreateResult = { ok: true; folder: string } | { ok: false; reason: "exists"; name: string } | { ok: false; reason: "write-failed" };

/**
 * Crée le dossier (mkdir SANS « recursive » : échoue proprement s'il existe déjà, même apparu entre-temps)
 * puis wecraft.json. En cas d'échec, seul le dossier créé ici est retiré.
 */
export async function createCustomInstance(instancesDir: string, c: CustomInstance): Promise<CreateResult> {
  const folderName = safeFolderName(c.name);
  const folder = path.join(instancesDir, folderName);
  try {
    await mkdir(instancesDir, { recursive: true });
    await mkdir(folder);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") return { ok: false, reason: "exists", name: folderName };
    return { ok: false, reason: "write-failed" };
  }
  try {
    await mkdir(path.join(folder, "mods"));
    await writeFile(path.join(folder, "wecraft.json"), JSON.stringify(wecraftJson(c, folderName), null, 2), "utf8");
    return { ok: true, folder };
  } catch {
    await rm(folder, { recursive: true, force: true }).catch(() => undefined); // dossier créé à l'instant
    return { ok: false, reason: "write-failed" };
  }
}
