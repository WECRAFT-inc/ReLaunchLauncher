// Skin ReLink en jeu : au lancement d'une instance moddée (Fabric, Quilt, Forge, NeoForge), ReLaunch installe
// le mod de skins CustomSkinLoader (Modrinth, SHA-512 vérifié) s'il existe pour cette version de Minecraft et ce
// loader, et le règle pour lire d'abord les skins ReLink, puis ceux de Mojang. Réglage « relaunch_skin_mod »,
// activé par défaut ; désactivé, le mod installé par ReLaunch (et seulement celui-là) part à la corbeille.
// Jamais pour un modpack d'événement (il a son propre mod de skins), jamais en vanilla (pas de mod possible).
// Un échec ne bloque jamais le lancement.
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Download, Fetch } from "../modpacks/modrinth";

export const SKIN_MOD_SLUG = "customskinloader";
const MARK = ".relaunch_skinmod.json";
const CSL_DIR = "CustomSkinLoader";
const CSL_FILE = "CustomSkinLoader.json";
const LOADER_IDS: Record<string, string[]> = { Fabric: ["fabric"], Quilt: ["quilt", "fabric"], Forge: ["forge"], NeoForge: ["neoforge", "forge"] };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});

export interface SkinModDeps {
  api: Fetch;
  download: Download;
  trash: (file: string) => Promise<void>;
  /** Adresse CustomSkinAPI de ReLink (se termine par « / »). */
  apiRoot: string;
}

/** Ajoute ReLink en tête de la liste des sources de skins de CustomSkinLoader (fichier créé s'il n'existe pas). */
async function configure(gameDir: string, root: string): Promise<void> {
  const dir = path.join(gameDir, CSL_DIR);
  const file = path.join(dir, CSL_FILE);
  const entry = { name: "ReLink", type: "CustomSkinAPI", root };
  let cfg: Obj = {};
  try {
    cfg = obj(JSON.parse(await readFile(file, "utf8")));
  } catch {
    cfg = { enable: true };
  }
  const list = Array.isArray(cfg["loadlist"]) ? (cfg["loadlist"] as unknown[]).filter((e) => obj(e)["name"] !== "ReLink") : [{ name: "Mojang", type: "MojangAPI" }];
  cfg["loadlist"] = [entry, ...list];
  await mkdir(dir, { recursive: true });
  await writeFile(file, JSON.stringify(cfg, null, 2), "utf8");
}

/**
 * Installe ou retire le mod de skins selon le réglage. Renvoie une phrase pour le journal (ou null : rien fait).
 */
export async function syncSkinMod(gameDir: string, mc: string, loader: string | null, enabled: boolean, d: SkinModDeps): Promise<string | null> {
  const modsDir = path.join(gameDir, "mods");
  const markFile = path.join(gameDir, MARK);
  const mark = obj(await readFile(markFile, "utf8").then((t) => JSON.parse(t) as unknown, () => ({})));
  const ours = typeof mark["file"] === "string" && /^[^/\\:*?"<>|]{1,200}\.jar$/.test(mark["file"]) ? mark["file"] : null;
  if (!enabled || !loader || !(loader in LOADER_IDS)) {
    if (ours && (await stat(path.join(modsDir, ours)).then(() => true, () => false))) {
      await d.trash(path.join(modsDir, ours));
      await rm(markFile, { force: true });
      return `mod de skins retiré (${ours})`;
    }
    return null;
  }
  // déjà présent (installé par ReLaunch ou par le joueur) : seulement le réglage ReLink
  const present = (await readdir(modsDir).catch(() => [] as string[])).find((n) => /customskinloader/i.test(n) && /\.jar$/i.test(n));
  if (present) {
    await configure(gameDir, d.apiRoot);
    return null;
  }
  const vs = await d.api(`/project/${SKIN_MOD_SLUG}/version`, { game_versions: JSON.stringify([mc]), loaders: JSON.stringify(LOADER_IDS[loader]) });
  const list = Array.isArray(vs) ? (vs as unknown[]).map(obj) : [];
  const best = list.find((v) => v["version_type"] === "release") ?? list[0];
  if (!best) return `pas de mod de skins compatible avec Minecraft ${mc} (${loader})`;
  const files = Array.isArray(best["files"]) ? (best["files"] as unknown[]).map(obj) : [];
  const f = files.find((x) => x["primary"] === true) ?? files[0];
  const name = typeof f?.["filename"] === "string" ? f["filename"] : "";
  const sha512 = typeof obj(f?.["hashes"])["sha512"] === "string" ? (obj(f!["hashes"])["sha512"] as string).toLowerCase() : null;
  if (!f || !/^[A-Za-z0-9._+-]{1,200}\.jar$/.test(name) || typeof f["url"] !== "string" || !sha512 || !/^[0-9a-f]{128}$/.test(sha512)) return "mod de skins : fichier non vérifiable sur Modrinth";
  await mkdir(modsDir, { recursive: true });
  await d.download(f["url"], path.join(modsDir, name), sha512, null); // cdn.modrinth.com seulement, SHA-512 vérifié
  await writeFile(markFile, JSON.stringify({ file: name, note: "Mod de skins installé par ReLaunch (Réglages > Jeu > Skin ReLink en jeu)." }, null, 2), "utf8");
  await configure(gameDir, d.apiRoot);
  return `mod de skins installé (${name})`;
}
