// Modpacks au format Modrinth (.mrpack) : import d'un fichier du PC, ou installation depuis Découvrir.
// Format officiel : archive ZIP contenant modrinth.index.json (liste des fichiers à télécharger, avec empreintes)
// et des dossiers « overrides » / « client-overrides » copiés tels quels dans l'instance.
// Garde-fous :
// - chaque fichier listé : chemin relatif vérifié (pas de « .. », pas de chemin absolu, pas de nom réservé
//   Windows, pas de flux caché), aucune extension exécutable Windows, SHA-512 OBLIGATOIRE et vérifié avant de
//   garder le fichier, téléchargé seulement depuis les hôtes autorisés par le format Modrinth ;
// - fichiers « overrides » : mêmes contrôles de chemin, tailles bornées (pas de « bombe » ZIP) ;
// - nouvelle instance seulement (dossier créé ici, jamais un dossier existant) ; en cas d'échec, seul ce
//   nouveau dossier est retiré.
import { mkdir, open, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { downloadVerified, runLimited, type NetOptions } from "../net/download";
import { safeFolderName } from "./modrinth";

/** Hôtes autorisés par la documentation du format .mrpack (+ redirections de GitHub). */
export const MRPACK_HOSTS: ReadonlySet<string> = new Set([
  "cdn.modrinth.com",
  "github.com",
  "raw.githubusercontent.com",
  "gitlab.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);
const WIN_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
const EXEC_EXT = /\.(exe|bat|cmd|com|ps1|psm1|vbs|vbe|wsf|wsh|msi|msp|scr|lnk|reg|dll|sys|cpl|hta|pif)$/i; // .js gardé : scripts de mods (KubeJS), jamais lancés par Windows
const MAX_FILES = 5000;
const MAX_OVERRIDE_ENTRY = 64 * 1024 * 1024;
const MAX_OVERRIDES_TOTAL = 1024 * 1024 * 1024;

/** Chemin relatif sûr (séparateur « / »), sinon null. */
export function safeRelPath(p: unknown): string | null {
  if (typeof p !== "string" || p.length === 0 || p.length > 400 || p.includes("\0") || p.includes("\\") || p.startsWith("/") || /^[a-zA-Z]:/.test(p)) return null;
  const parts = p.split("/");
  if (parts.some((s) => s === "" || s === "." || s === ".." || s.includes(":") || /[<>"|?*\x00-\x1f]/.test(s) || /[. ]$/.test(s) || WIN_RESERVED.test(s))) return null;
  if (EXEC_EXT.test(p)) return null;
  return parts.join("/");
}

export interface MrpackFile {
  path: string;
  url: string;
  sha512: string;
  sha1: string | null;
  size: number;
}

export interface MrpackPlan {
  name: string;
  version: string;
  mc: string;
  loader: "Fabric" | "Forge" | "NeoForge" | "Quilt" | null;
  loaderVersion: string | null;
  files: MrpackFile[];
  warnings: string[];
}

const LOADER_DEPS: [string, MrpackPlan["loader"]][] = [
  ["neoforge", "NeoForge"],
  ["forge", "Forge"],
  ["fabric-loader", "Fabric"],
  ["quilt-loader", "Quilt"],
];

/** modrinth.index.json -> plan vérifié ; lève une erreur claire si l'archive n'est pas utilisable. */
export function planMrpack(index: unknown): MrpackPlan {
  const o = (typeof index === "object" && index !== null ? index : {}) as Record<string, unknown>;
  if (o["formatVersion"] !== 1 || o["game"] !== "minecraft") throw new Error("Ce fichier n'est pas un modpack Modrinth pour Minecraft (format inconnu).");
  const deps = (typeof o["dependencies"] === "object" && o["dependencies"] !== null ? o["dependencies"] : {}) as Record<string, unknown>;
  const mc = deps["minecraft"];
  if (typeof mc !== "string" || !/^[0-9][0-9A-Za-z._-]{0,31}$/.test(mc) || /[. ]$/.test(mc)) throw new Error("Version de Minecraft absente ou invalide dans le modpack.");
  let loader: MrpackPlan["loader"] = null;
  let loaderVersion: string | null = null;
  for (const [k, nice] of LOADER_DEPS) {
    const v = deps[k];
    if (typeof v === "string") {
      if (!/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/.test(v)) throw new Error(`Version de ${nice} invalide dans le modpack.`);
      loader = nice;
      loaderVersion = v;
      break;
    }
  }
  const warnings: string[] = [];
  const files: MrpackFile[] = [];
  const raw = Array.isArray(o["files"]) ? (o["files"] as unknown[]) : [];
  if (raw.length > MAX_FILES) throw new Error("Modpack trop gros (plus de 5000 fichiers).");
  const seen = new Set<string>();
  for (const f0 of raw) {
    const f = (typeof f0 === "object" && f0 !== null ? f0 : {}) as Record<string, unknown>;
    const env = (typeof f["env"] === "object" && f["env"] !== null ? f["env"] : {}) as Record<string, unknown>;
    if (env["client"] === "unsupported") continue; // fichier réservé au serveur
    const rel = safeRelPath(f["path"]);
    const label = typeof f["path"] === "string" ? f["path"].slice(0, 120) : "?";
    if (!rel) {
      warnings.push(`« ${label} » ignoré : chemin ou type de fichier refusé.`);
      continue;
    }
    if (seen.has(rel.toLowerCase())) continue;
    const hashes = (typeof f["hashes"] === "object" && f["hashes"] !== null ? f["hashes"] : {}) as Record<string, unknown>;
    const sha512 = typeof hashes["sha512"] === "string" && /^[0-9a-f]{128}$/i.test(hashes["sha512"]) ? hashes["sha512"].toLowerCase() : null;
    const sha1 = typeof hashes["sha1"] === "string" && /^[0-9a-f]{40}$/i.test(hashes["sha1"]) ? hashes["sha1"].toLowerCase() : null;
    const urls = (Array.isArray(f["downloads"]) ? (f["downloads"] as unknown[]) : []).filter((u): u is string => typeof u === "string");
    const url = urls.find((u) => {
      try {
        const x = new URL(u);
        return x.protocol === "https:" && MRPACK_HOSTS.has(x.hostname) && !x.username && !x.password;
      } catch {
        return false;
      }
    });
    if (!sha512 || !url) {
      warnings.push(`« ${label} » ignoré : ${!sha512 ? "empreinte SHA-512 absente" : "adresse de téléchargement non autorisée"}.`);
      continue;
    }
    const size = typeof f["fileSize"] === "number" && f["fileSize"] >= 0 ? f["fileSize"] : 0;
    if (size > 1024 * 1024 * 1024) {
      warnings.push(`« ${label} » ignoré : fichier trop gros.`);
      continue;
    }
    seen.add(rel.toLowerCase());
    files.push({ path: rel, url, sha512, sha1, size });
  }
  return {
    name: typeof o["name"] === "string" && o["name"].trim() ? o["name"].trim().slice(0, 60) : "Modpack",
    version: typeof o["versionId"] === "string" ? o["versionId"].slice(0, 60) : "",
    mc,
    loader,
    loaderVersion,
    files,
    warnings,
  };
}

// ---------------------------------------------------------------- lecture de l'archive
interface ZipEntry {
  name: string;
  method: number;
  flags: number;
  csize: number;
  usize: number;
  loc: number;
}

/** Table des entrées d'une archive ZIP (sans ZIP64 ni chiffrement). */
export async function listZip(file: string): Promise<{ entries: ZipEntry[]; size: number }> {
  const fh = await open(file, "r");
  try {
    const size = (await fh.stat()).size;
    const tailLen = Math.min(size, 65536 + 22);
    const tail = Buffer.alloc(tailLen);
    await fh.read(tail, 0, tailLen, size - tailLen);
    let e = -1;
    for (let i = tailLen - 22; i >= 0; i--)
      if (tail.readUInt32LE(i) === 0x06054b50) {
        e = i;
        break;
      }
    if (e < 0) throw new Error("Archive illisible (ce n'est pas un fichier .mrpack valide).");
    const count = tail.readUInt16LE(e + 10);
    const cdSize = tail.readUInt32LE(e + 12);
    const cdOff = tail.readUInt32LE(e + 16);
    if (cdOff + cdSize > size || cdSize > 32 * 1024 * 1024) throw new Error("Archive illisible.");
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOff);
    const entries: ZipEntry[] = [];
    let p = 0;
    for (let n = 0; n < count && p + 46 <= cd.length; n++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) break;
      const nlen = cd.readUInt16LE(p + 28);
      entries.push({
        flags: cd.readUInt16LE(p + 8),
        method: cd.readUInt16LE(p + 10),
        csize: cd.readUInt32LE(p + 20),
        usize: cd.readUInt32LE(p + 24),
        loc: cd.readUInt32LE(p + 42),
        name: cd.toString("utf8", p + 46, p + 46 + nlen),
      });
      p += 46 + nlen + cd.readUInt16LE(p + 30) + cd.readUInt16LE(p + 32);
    }
    return { entries, size };
  } finally {
    await fh.close();
  }
}

export async function readEntry(file: string, e: ZipEntry, max: number): Promise<Buffer> {
  if (e.flags & 1 || e.usize > max || e.csize > max || e.csize === 0xffffffff || (e.method !== 0 && e.method !== 8)) throw new Error(`entrée ${e.name} illisible ou trop grosse`);
  const fh = await open(file, "r");
  try {
    const lh = Buffer.alloc(30);
    await fh.read(lh, 0, 30, e.loc);
    if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error("archive abîmée");
    const start = e.loc + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
    const data = Buffer.alloc(e.csize);
    await fh.read(data, 0, e.csize, start);
    const out = e.method === 0 ? data : inflateRawSync(data, { maxOutputLength: max });
    if (out.length !== e.usize) throw new Error("archive abîmée");
    return out;
  } finally {
    await fh.close();
  }
}

export async function readMrpackIndex(file: string): Promise<{ plan: MrpackPlan; entries: ZipEntry[] }> {
  const { entries } = await listZip(file);
  const idx = entries.find((e) => e.name === "modrinth.index.json");
  if (!idx) throw new Error("Ce fichier n'est pas un modpack Modrinth (modrinth.index.json absent).");
  let index: unknown;
  try {
    index = JSON.parse((await readEntry(file, idx, 16 * 1024 * 1024)).toString("utf8"));
  } catch {
    throw new Error("modrinth.index.json illisible.");
  }
  return { plan: planMrpack(index), entries };
}

export type Progress = (done: number, total: number, msg: string) => void;
/** Liste du contenu fourni par un modpack installé (mods, packs de ressources, shaders). */
export const PACK_FILE = "wecraft_pack.json";

/**
 * Installe le modpack dans une NOUVELLE instance `<instancesDir>/<nom>` : fichiers téléchargés et vérifiés,
 * puis « overrides » copiés, puis wecraft.json. Renvoie le dossier et les avertissements.
 */
export async function installMrpack(
  archive: string,
  instancesDir: string,
  name: string | null,
  progress: Progress,
  opts: NetOptions & { userAgent: string },
): Promise<{ folder: string; plan: MrpackPlan; warnings: string[] }> {
  const { plan, entries } = await readMrpackIndex(archive);
  const folderName = safeFolderName(name || plan.name);
  const folder = path.join(instancesDir, folderName);
  await mkdir(instancesDir, { recursive: true });
  try {
    await mkdir(folder); // jamais un dossier existant
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Une instance « ${folderName} » existe déjà.`);
    throw e;
  }
  const warnings = [...plan.warnings];
  try {
    let done = 0;
    progress(0, plan.files.length, "Téléchargement des fichiers du modpack...");
    await runLimited(plan.files, 4, async (f) => {
      const dest = path.join(folder, ...f.path.split("/"));
      await mkdir(path.dirname(dest), { recursive: true });
      const expected: { sha512: string; size?: number } = { sha512: f.sha512 };
      if (f.size > 0) expected.size = f.size;
      await downloadVerified(f.url, dest, expected, { ...opts, allowedHosts: MRPACK_HOSTS, headers: { "User-Agent": opts.userAgent } });
      done++;
      progress(done, plan.files.length, path.basename(f.path));
    });
    // overrides (communs) puis client-overrides (prioritaires), comme le launcher de Modrinth
    let total = 0;
    for (const prefix of ["overrides/", "client-overrides/"]) {
      for (const e of entries) {
        if (!e.name.startsWith(prefix) || e.name.endsWith("/")) continue;
        const rel = safeRelPath(e.name.slice(prefix.length));
        if (!rel) {
          warnings.push(`« ${e.name.slice(0, 120)} » ignoré : chemin ou type de fichier refusé.`);
          continue;
        }
        if (e.usize > MAX_OVERRIDE_ENTRY || total + e.usize > MAX_OVERRIDES_TOTAL) {
          warnings.push(`« ${rel} » ignoré : fichier trop gros.`);
          continue;
        }
        total += e.usize;
        const dest = path.join(folder, ...rel.split("/"));
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(dest, await readEntry(archive, e, MAX_OVERRIDE_ENTRY));
      }
    }
    const wj: Record<string, string> = {};
    if ((name || plan.name) !== folderName) wj["name"] = (name || plan.name).slice(0, 60);
    wj["version"] = plan.mc;
    if (plan.loader) wj["loader"] = plan.loader;
    if (plan.loaderVersion) wj["loader_version"] = plan.loaderVersion;
    await writeFile(path.join(folder, "wecraft.json"), JSON.stringify(wj, null, 2), "utf8");
    // contenu fourni par le modpack (affiché « Contenu du modpack » dans la page de l'instance)
    const packFiles = plan.files.map((f) => f.path).filter((p) => /^(mods|resourcepacks|shaderpacks)\//.test(p));
    await writeFile(path.join(folder, PACK_FILE), JSON.stringify({ name: plan.name, version: plan.version, source: "Modrinth", files: packFiles }, null, 2), "utf8").catch(() => undefined);
  } catch (e) {
    await rm(folder, { recursive: true, force: true }).catch(() => undefined); // dossier créé à l'instant
    throw e;
  }
  return { folder, plan, warnings };
}
