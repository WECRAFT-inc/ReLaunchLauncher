/**
 * Image propre à une instance, trouvée chez le launcher qui l'a créée (pour la reconnaître d'un coup d'œil) :
 *   - CurseForge : image du profil choisie dans l'app (profileImagePath), sinon vignette du modpack
 *     (installedModpack.thumbnailUrl, sur le CDN de CurseForge) ;
 *   - Modrinth App : icône du profil (colonne icon_path de app.db) ;
 *   - Prism / MultiMC : icône choisie (iconKey de instance.cfg, fichier du dossier « icons » du launcher) ;
 *   - n'importe quelle instance : icon.png dans son dossier.
 * Rien n'est modifié. Un fichier n'est servi à l'interface qu'après contrôle de ses premiers octets (media.ts).
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Instance } from "./formats";

export interface InstanceArt {
  /** Fichier image local (chemin absolu). */
  file?: string;
  /** Adresse HTTPS d'une image (CDN de CurseForge). */
  url?: string;
}

const IMG_EXT = /\.(png|jpe?g|gif|webp)$/i;
const MAX = 8 * 1024 * 1024;

async function isImageFile(p: unknown): Promise<string | null> {
  if (typeof p !== "string" || !p || p.length > 1024 || !path.isAbsolute(p) || !IMG_EXT.test(p)) return null;
  try {
    const s = await stat(p);
    return s.isFile() && s.size > 0 && s.size <= MAX ? p : null;
  } catch {
    return null;
  }
}

/** Vignette CurseForge acceptée : HTTPS, CDN de CurseForge, image. */
export function curseforgeThumb(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 1024) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" || u.hostname !== "media.forgecdn.net" || u.port || u.username || !IMG_EXT.test(u.pathname)) return null;
    return u.href;
  } catch {
    return null;
  }
}

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try {
    const s = await stat(file);
    if (!s.isFile() || s.size > 20 * 1024 * 1024) return null;
    const v = JSON.parse((await readFile(file, "utf8")).replace(/^﻿/, "")) as unknown;
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Icône Prism / MultiMC : clé lue dans instance.cfg, fichier dans `<launcher>/icons` (les icônes intégrées n'ont pas de fichier). */
async function prismIcon(instDir: string, prismDir: string | null): Promise<string | null> {
  let key = "";
  try {
    const text = (await readFile(path.join(instDir, "instance.cfg"), "utf8")).replace(/\r\n/g, "\n");
    key = /^iconKey=(.*)$/m.exec(text)?.[1]?.trim() ?? "";
  } catch {
    return null;
  }
  if (!/^[A-Za-z0-9 _.()-]{1,100}$/.test(key) || key.includes("..")) return null;
  const dirs = [prismDir ? path.join(prismDir, "icons") : null, instDir].filter((x): x is string => !!x);
  for (const d of dirs) for (const ext of [".png", ".jpg", ".jpeg", ".gif", ".webp"]) {
    const f = await isImageFile(path.join(d, key + ext));
    if (f) return f;
  }
  return null;
}

/** Image d'une instance (première trouvée), ou null. `modrinthIcon` : icon_path lu dans app.db. */
export async function findArt(i: Instance, opts: { prismDir?: string | null; modrinthIcon?: string | null } = {}): Promise<InstanceArt | null> {
  const cf = await readJson(path.join(i.folder, "minecraftinstance.json"));
  if (cf) {
    const own = await isImageFile(cf["profileImagePath"]);
    if (own) return { file: own };
    const mp = cf["installedModpack"];
    const thumb = curseforgeThumb(typeof mp === "object" && mp !== null ? (mp as Record<string, unknown>)["thumbnailUrl"] : null);
    if (thumb) return { url: thumb };
  }
  if (i.source === "Modrinth") {
    const f = await isImageFile(opts.modrinthIcon ?? i.iconHint);
    if (f) return { file: f };
  }
  // format Prism / MultiMC (instances Prism, et instances ReLaunch créées dans ce format)
  const pf = await prismIcon(i.folder, opts.prismDir ?? null);
  if (pf) return { file: pf };
  const own = await isImageFile(path.join(i.folder, "icon.png"));
  return own ? { file: own } : null;
}
