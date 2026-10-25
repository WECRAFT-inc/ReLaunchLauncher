// Modpacks ReLaunch (manifeste « relaunch-pack » v1, docs/MANIFESTE-RELAUNCH-PACK.md).
//
// Deux usages :
//  - packs OFFICIELS publiés dans le panel : manifeste + archive overrides téléchargés depuis le Worker, SHA-256
//    comparé à celui annoncé PUIS signature Ed25519 vérifiée avec la clé épinglée, avant toute lecture. Un pack
//    d'event (pack.locked) devient un modpack d'événement : mods et fichiers officiels imposés, remis en état
//    avant chaque lancement ; le joueur ne peut changer que les shaders ;
//  - packs PARTAGÉS entre joueurs (fichier .rlpack exporté depuis une instance) : non signés, donc installés
//    seulement dans une NOUVELLE instance, après accord du joueur qui voit la liste des mods qui ne viennent
//    ni de Modrinth ni de WeCraft (code exécuté par le jeu).
//
// Mêmes garde-fous que le Worker : chemins relatifs sûrs dans des dossiers permis, pas d'exécutable Windows,
// empreinte obligatoire et vérifiée pour chaque fichier, téléchargements seulement depuis des hôtes connus.
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { downloadVerified, runLimited, type NetOptions } from "../net/download";
import { EVENT_FILE, setShader } from "../events/eventLock";
import { listZip, PACK_FILE, readEntry, safeRelPath, type ZipEntry } from "./mrpack";
import { safeFolderName } from "./modrinth";

/** Copie du manifeste installé (mise à jour, réparation, verrou). */
export const RP_FILE = "relaunch_pack.json";
export const RP_DIRS = ["mods", "resourcepacks", "shaderpacks", "config", "defaultconfigs", "kubejs", "scripts", "datapacks", "global_packs", "emotes", "options.txt", "servers.dat"] as const;
export const RP_HOSTS: ReadonlySet<string> = new Set(["cdn.modrinth.com", "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com", "edge.forgecdn.net", "mediafilez.forgecdn.net"]);
const LOADERS: Record<string, "Fabric" | "Forge" | "NeoForge" | "Quilt" | null> = { vanilla: null, fabric: "Fabric", quilt: "Quilt", forge: "Forge", neoforge: "NeoForge" };
const MAX_OVERRIDE_ENTRY = 64 * 1024 * 1024;
const MAX_OVERRIDES_TOTAL = 512 * 1024 * 1024;
const MAX_EXPORT_OVERRIDES = 512 * 1024 * 1024;

export interface RpFile {
  path: string;
  sha512: string | null;
  sha256: string | null;
  sha1: string | null;
  size: number;
  urls: string[];
  required: boolean;
  /** Mod hébergé par WeCraft (adresse du Worker). */
  hosted: boolean;
}
export interface RpPlan {
  id: string;
  name: string;
  version: string;
  event: string | null;
  locked: boolean;
  mc: string;
  loader: "Fabric" | "Forge" | "NeoForge" | "Quilt" | null;
  loaderVersion: string | null;
  files: RpFile[];
  overrides: { sha256: string; size: number } | null;
  remove: string[];
  editable: string[];
  defaultShader: string | null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});

/** Chemin d'instance permis par le format (dossier connu, chemin sûr, pas d'exécutable). */
export function rpPath(p: unknown): string | null {
  const rel = safeRelPath(p);
  if (!rel || rel.length > 240) return null;
  return (RP_DIRS as readonly string[]).includes(rel.split("/")[0]!) ? rel : null;
}
const isEditable = (plan: { editable: string[] }, rel: string) => plan.editable.some((e) => rel === e || rel.startsWith(`${e}/`));

/** Manifeste -> plan vérifié. Lève une erreur claire (en français) si le fichier n'est pas utilisable. */
export function planRelaunchPack(raw: unknown, workerHost: string): RpPlan {
  const m = obj(raw);
  if (m["format"] !== "relaunch-pack" || m["formatVersion"] !== 1) throw new Error("Ce fichier n'est pas un modpack ReLaunch (format inconnu).");
  const pack = obj(m["pack"]);
  const id = typeof pack["id"] === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(pack["id"]) ? pack["id"] : "";
  const version = typeof pack["version"] === "string" && /^[0-9][0-9A-Za-z.+-]{0,39}$/.test(pack["version"]) ? pack["version"] : "";
  if (!id || !version) throw new Error("Identifiant ou version du modpack invalide.");
  const mc = m["minecraft"];
  if (typeof mc !== "string" || !/^[0-9][0-9A-Za-z._-]{0,31}$/.test(mc) || /[. ]$/.test(mc)) throw new Error("Version de Minecraft invalide dans le modpack.");
  const l = obj(m["loader"]);
  const type = typeof l["type"] === "string" ? l["type"] : "";
  if (!(type in LOADERS)) throw new Error("Loader inconnu dans le modpack.");
  const loaderVersion = type === "vanilla" ? null : typeof l["version"] === "string" && /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,59}$/.test(l["version"]) ? l["version"] : "";
  if (loaderVersion === "") throw new Error("Version du loader absente ou invalide dans le modpack.");
  const rawFiles = Array.isArray(m["files"]) ? (m["files"] as unknown[]) : [];
  if (rawFiles.length > 5000) throw new Error("Modpack trop gros (plus de 5000 fichiers).");
  const seen = new Set<string>();
  const files: RpFile[] = [];
  for (const [i, f0] of rawFiles.entries()) {
    const f = obj(f0);
    const rel = rpPath(f["path"]);
    if (!rel) throw new Error(`Fichier n° ${i + 1} refusé : chemin ou type de fichier non permis.`);
    if (seen.has(rel.toLowerCase())) throw new Error(`Fichier en double : ${rel}`);
    seen.add(rel.toLowerCase());
    if (f["side"] === "server") continue;
    const h = obj(f["hashes"]);
    const sha512 = typeof h["sha512"] === "string" && /^[0-9a-f]{128}$/i.test(h["sha512"]) ? h["sha512"].toLowerCase() : null;
    const sha256 = typeof h["sha256"] === "string" && /^[0-9a-f]{64}$/i.test(h["sha256"]) ? h["sha256"].toLowerCase() : null;
    const sha1 = typeof h["sha1"] === "string" && /^[0-9a-f]{40}$/i.test(h["sha1"]) ? h["sha1"].toLowerCase() : null;
    if (!sha512 && !sha256) throw new Error(`« ${rel} » : empreinte absente.`);
    const size = typeof f["size"] === "number" && Number.isSafeInteger(f["size"]) && f["size"] >= 0 && f["size"] <= 2 * 1024 ** 3 ? f["size"] : -1;
    if (size < 0) throw new Error(`« ${rel} » : taille invalide.`);
    const urls: string[] = [];
    let hosted = false;
    for (const u of Array.isArray(f["downloads"]) ? (f["downloads"] as unknown[]).slice(0, 5) : []) {
      try {
        const x = new URL(String(u));
        if (x.protocol !== "https:" || x.username || x.password || (x.port && x.port !== "443")) continue;
        if (x.host === workerHost && /^\/launcher\/assets\/[A-Za-z0-9_.:-]{1,100}$/.test(x.pathname) && !x.search) {
          hosted = true;
          urls.push(x.href);
        } else if (RP_HOSTS.has(x.hostname)) urls.push(x.href);
      } catch {
        // adresse ignorée
      }
    }
    if (!urls.length) throw new Error(`« ${rel} » : aucune adresse de téléchargement autorisée.`);
    files.push({ path: rel, sha512, sha256, sha1, size, urls, required: f["required"] !== false, hosted });
  }
  const list = (v: unknown, ok: (s: string) => boolean) => (Array.isArray(v) ? (v as unknown[]).filter((s): s is string => typeof s === "string" && ok(s)).slice(0, 2000) : []);
  const locked = pack["locked"] === true;
  let editable = list(m["editable"], (s) => /^(resourcepacks|shaderpacks|options\.txt|config)(\/.*)?$/.test(s) && !!safeRelPath(s));
  if (locked) editable = ["shaderpacks"];
  const ov = obj(m["overrides"]);
  const overrides = m["overrides"] && typeof ov["sha256"] === "string" && /^[0-9a-f]{64}$/i.test(ov["sha256"]) && typeof ov["size"] === "number" && ov["size"] > 0 && ov["size"] <= 90 * 1024 * 1024 ? { sha256: ov["sha256"].toLowerCase(), size: ov["size"] } : null;
  if (m["overrides"] && !overrides) throw new Error("Description de l'archive overrides invalide.");
  const ds = obj(m["defaults"])["shader"];
  return {
    id,
    name: typeof pack["name"] === "string" && pack["name"].trim() ? pack["name"].trim().slice(0, 60) : id,
    version,
    event: typeof pack["event"] === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(pack["event"]) ? pack["event"] : null,
    locked,
    mc,
    loader: LOADERS[type] ?? null,
    loaderVersion,
    files,
    overrides,
    remove: list(m["remove"], (s) => !!rpPath(s)),
    editable,
    defaultShader: typeof ds === "string" && /^[^/\\:*?"<>|\x00-\x1f]{1,200}$/.test(ds) ? ds : null,
  };
}

/** Empreinte d'un fichier existant (même algorithme que celui du manifeste), ou null s'il n'existe pas. */
async function fileMatches(file: string, f: RpFile): Promise<boolean> {
  try {
    const st = await stat(file);
    if (!st.isFile() || st.size !== f.size) return false;
    const h = createHash(f.sha512 ? "sha512" : "sha256").update(await readFile(file)).digest("hex");
    return h === (f.sha512 ?? f.sha256);
  } catch {
    return false;
  }
}

async function download(f: RpFile, dest: string, net: NetOptions & { userAgent: string }, workerHost: string): Promise<void> {
  const expected: { sha512?: string; sha256?: string; size: number } = { size: f.size };
  if (f.sha512) expected.sha512 = f.sha512;
  else if (f.sha256) expected.sha256 = f.sha256;
  let last: unknown = null;
  for (const url of f.urls) {
    try {
      await downloadVerified(url, dest, expected, { ...net, allowedHosts: new Set([...RP_HOSTS, workerHost]), headers: { "User-Agent": net.userAgent } });
      return;
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error(`téléchargement de ${f.path} impossible`);
}

export interface InstallInput {
  folder: string;
  plan: RpPlan;
  /** Archive overrides déjà vérifiée (empreinte + signature), ou null. */
  overridesZip: string | null;
  /** Copie installée précédente (mise à jour) : fichiers officiels à retirer s'ils disparaissent. */
  previous: { plan: RpPlan; overridesFiles: string[] } | null;
  signed: boolean;
  source: string;
  net: NetOptions & { userAgent: string };
  workerHost: string;
  progress: (done: number, total: number, msg: string) => void;
  /** Corbeille de Windows pour les fichiers retirés (jamais d'effacement définitif). */
  trash: (file: string) => Promise<void>;
  /** Contenu du manifeste tel que publié (gardé pour la réparation). */
  manifestText: string;
}

/** Installe ou met à jour un modpack ReLaunch dans `folder` (dossier déjà créé). Renvoie les avertissements. */
export async function installRelaunchPack(x: InstallInput): Promise<{ warnings: string[]; downloaded: number }> {
  const { folder, plan } = x;
  const warnings: string[] = [];
  const fresh = !x.previous;
  let done = 0;
  let downloaded = 0;
  x.progress(0, plan.files.length, "Vérification des fichiers du modpack...");
  await runLimited(plan.files, 4, async (f) => {
    const dest = path.join(folder, ...f.path.split("/"));
    if (await fileMatches(dest, f)) {
      done++;
      return;
    }
    if (!fresh && isEditable(plan, f.path) && (await stat(dest).then(() => true, () => false))) {
      done++; // fichier que le joueur a le droit de modifier : on garde le sien
      return;
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await download(f, dest, x.net, x.workerHost);
    downloaded++;
    done++;
    x.progress(done, plan.files.length, path.basename(f.path));
  });
  // fichiers officiels de l'ancienne version qui ne font plus partie du pack, et liste « remove »
  const keep = new Set(plan.files.map((f) => f.path.toLowerCase()));
  const gone = new Set<string>(plan.remove);
  for (const f of x.previous?.plan.files ?? []) if (!keep.has(f.path.toLowerCase())) gone.add(f.path);
  for (const rel of gone) {
    if (isEditable(plan, rel)) continue;
    const file = path.join(folder, ...rel.split("/"));
    if (await stat(file).then((s) => s.isFile(), () => false)) await x.trash(file).catch(() => warnings.push(`« ${rel} » n'a pas pu être retiré.`));
  }
  // overrides : chemins de l'instance, sans écraser ce que le joueur peut modifier
  const overridesFiles: string[] = [];
  if (x.overridesZip) {
    const { entries } = await listZip(x.overridesZip);
    let total = 0;
    for (const e of entries) {
      if (e.name.endsWith("/")) continue;
      const rel = rpPath(e.name);
      if (!rel) {
        warnings.push(`« ${e.name.slice(0, 120)} » ignoré : chemin ou type de fichier refusé.`);
        continue;
      }
      if (e.usize > MAX_OVERRIDE_ENTRY || total + e.usize > MAX_OVERRIDES_TOTAL) {
        warnings.push(`« ${rel} » ignoré : fichier trop gros.`);
        continue;
      }
      total += e.usize;
      overridesFiles.push(rel);
      const dest = path.join(folder, ...rel.split("/"));
      if (!fresh && isEditable(plan, rel) && (await stat(dest).then(() => true, () => false))) continue;
      await mkdir(path.dirname(dest), { recursive: true });
      const tmp = `${dest}.rlpart`;
      await writeFile(tmp, await readEntry(x.overridesZip, e, MAX_OVERRIDE_ENTRY));
      await rename(tmp, dest);
    }
  }
  // description de l'instance pour le launcher
  const wjFile = path.join(folder, "wecraft.json");
  const wj = obj(await readFile(wjFile, "utf8").then((t) => JSON.parse(t) as unknown, () => ({})));
  if (fresh && path.basename(folder) !== plan.name) wj["name"] = plan.name;
  wj["version"] = plan.mc;
  if (plan.loader) wj["loader"] = plan.loader;
  else delete wj["loader"];
  if (plan.loaderVersion) wj["loader_version"] = plan.loaderVersion;
  else delete wj["loader_version"];
  await writeFile(wjFile, JSON.stringify(wj, null, 2), "utf8");
  const packFiles = [...plan.files.map((f) => f.path), ...overridesFiles].filter((p) => /^(mods|resourcepacks|shaderpacks)\//.test(p));
  await writeFile(path.join(folder, PACK_FILE), JSON.stringify({ name: plan.name, version: plan.version, source: x.source, files: packFiles }, null, 2), "utf8");
  await writeFile(path.join(folder, RP_FILE), JSON.stringify({ signed: x.signed, installedAt: new Date().toISOString(), overridesFiles, manifest: x.manifestText }, null, 2), "utf8");
  if (plan.locked && x.signed) {
    // modpack d'événement : tout le contenu officiel est imposé, seuls les shaders restent au joueur
    const evId = plan.id.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 64) || "event";
    await writeFile(path.join(folder, EVENT_FILE), JSON.stringify({ id: evId, name: plan.name, files: [...plan.files.map((f) => ({ path: f.path })), ...overridesFiles.map((p) => ({ path: p }))], defaultShader: plan.defaultShader, editable: ["shaderpacks"] }, null, 2), "utf8");
    if (fresh && plan.defaultShader) await setShader(folder, plan.defaultShader).catch(() => warnings.push("Le shader par défaut n'a pas pu être activé."));
  } else if (!plan.locked) {
    await rm(path.join(folder, EVENT_FILE), { force: true });
  }
  return { warnings, downloaded };
}

/** Copie installée d'un modpack ReLaunch (null si ce dossier n'en est pas un). */
export async function readInstalledPack(folder: string, workerHost: string): Promise<{ plan: RpPlan; signed: boolean; overridesFiles: string[]; manifest: string } | null> {
  try {
    const o = obj(JSON.parse(await readFile(path.join(folder, RP_FILE), "utf8")));
    const manifest = typeof o["manifest"] === "string" ? o["manifest"] : "";
    const plan = planRelaunchPack(JSON.parse(manifest), workerHost);
    const overridesFiles = Array.isArray(o["overridesFiles"]) ? (o["overridesFiles"] as unknown[]).map(rpPath).filter((p): p is string => !!p) : [];
    return { plan, signed: o["signed"] === true, overridesFiles, manifest };
  } catch {
    return null;
  }
}

/**
 * Pack d'event verrouillé, avant chaque lancement : chaque mod officiel est présent et intact (sinon il est
 * retéléchargé et revérifié), et tout mod ajouté par le joueur part à la corbeille. Les configs ne sont pas
 * remises à zéro (les mods les réécrivent en jouant).
 */
export async function enforceLockedPack(folder: string, x: { net: NetOptions & { userAgent: string }; workerHost: string; trash: (file: string) => Promise<void> }): Promise<{ restored: number; removed: string[] } | null> {
  const inst = await readInstalledPack(folder, x.workerHost);
  if (!inst || !inst.signed || !inst.plan.locked) return null;
  let restored = 0;
  const official = new Set([...inst.plan.files.map((f) => f.path.toLowerCase()), ...inst.overridesFiles.map((p) => p.toLowerCase())]);
  await runLimited(inst.plan.files.filter((f) => f.path.startsWith("mods/")), 4, async (f) => {
    const dest = path.join(folder, ...f.path.split("/"));
    if (await fileMatches(dest, f)) return;
    await download(f, dest, x.net, x.workerHost);
    restored++;
  });
  const removed: string[] = [];
  const modsDir = path.join(folder, "mods");
  for (const name of await readdir(modsDir).catch(() => [] as string[])) {
    const rel = `mods/${name}`;
    if (official.has(rel.toLowerCase()) || name.startsWith(".")) continue;
    const file = path.join(modsDir, name);
    if (!(await stat(file).then((s) => s.isFile(), () => false))) continue;
    await x.trash(file);
    removed.push(name);
  }
  return { restored, removed };
}

// ---------------------------------------------------------------- export / import entre joueurs (.rlpack)
const TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(b: Buffer): number {
  let c = -1;
  for (const x of b) c = TABLE[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
/** Archive ZIP simple (deflate, noms UTF-8). */
export function zipFiles(files: [string, Buffer][]): Buffer {
  const loc: Buffer[] = [];
  const cen: Buffer[] = [];
  let off = 0;
  for (const [name, data] of files) {
    const comp = deflateRawSync(data, { level: 6 });
    const n = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(0x00210000, 10);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(0x00210000, 12);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(n.length, 28);
    ch.writeUInt32LE(off, 42);
    loc.push(lh, n, comp);
    cen.push(ch, n);
    off += 30 + n.length + comp.length;
  }
  const cd = Buffer.concat(cen);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(off, 16);
  return Buffer.concat([...loc, cd, end]);
}

/** Dossiers exportés (options.txt et servers.dat restent au joueur). */
const EXPORT_DIRS = ["mods", "resourcepacks", "shaderpacks", "config", "defaultconfigs", "kubejs", "scripts", "datapacks", "global_packs", "emotes"];
const SKIP = /(^|\/)(\.|__MACOSX)|\.(log|tmp|bak|old|disabled|part|rlpart)$/i;

async function walk(root: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(path.join(root, rel), { withFileTypes: true }).catch(() => [])) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (SKIP.test(r)) continue;
    if (e.isDirectory()) out.push(...(await walk(root, r)));
    else if (e.isFile()) out.push(r);
  }
  return out;
}

export interface ExportLookup {
  /** Modrinth : version_files par SHA-1 -> { url, sha512 } du fichier exact. */
  modrinth(sha1s: string[]): Promise<Record<string, { url: string; sha512: string }>>;
  /** Mods hébergés par WeCraft : par SHA-512 -> adresse. */
  hosted(sha512s: string[]): Promise<Record<string, { url: string }>>;
}

/** Fabrique un .rlpack (manifeste + overrides) à partir d'une instance. */
export async function exportRlpack(
  folder: string,
  info: { name: string; mc: string; loader: string | null; loaderVersion: string | null },
  lookup: ExportLookup,
  progress: (done: number, total: number, msg: string) => void,
): Promise<{ data: Buffer; fromModrinth: number; hosted: number; inArchive: number }> {
  const loaderType = info.loader ? info.loader.toLowerCase() : "vanilla";
  if (!(loaderType in LOADERS)) throw new Error("Loader de l'instance inconnu : export impossible.");
  if (loaderType !== "vanilla" && !info.loaderVersion) throw new Error("Version du loader inconnue : règle-la dans l'instance avant d'exporter.");
  const rels: string[] = [];
  for (const d of EXPORT_DIRS) rels.push(...(await walk(folder, d)).filter((r) => !!rpPath(r)));
  if (!rels.length) throw new Error("Cette instance ne contient rien à partager (mods, packs, configs).");
  progress(0, rels.length, "Lecture des fichiers...");
  const entries: { rel: string; data: Buffer; sha1: string; sha512: string }[] = [];
  for (const rel of rels) {
    const data = await readFile(path.join(folder, ...rel.split("/")));
    entries.push({ rel, data, sha1: createHash("sha1").update(data).digest("hex"), sha512: createHash("sha512").update(data).digest("hex") });
  }
  const jars = entries.filter((e) => /^(mods|resourcepacks|shaderpacks|datapacks)\//.test(e.rel) && /\.(jar|zip)$/i.test(e.rel));
  progress(0, 0, "Recherche des fichiers sur Modrinth...");
  const mr = await lookup.modrinth(jars.map((e) => e.sha1)).catch(() => ({}) as Record<string, { url: string; sha512: string }>);
  const left = jars.filter((e) => !(mr[e.sha1] && mr[e.sha1]!.sha512 === e.sha512));
  const wc = await lookup.hosted(left.map((e) => e.sha512)).catch(() => ({}) as Record<string, { url: string }>);
  const files: Obj[] = [];
  const archive: [string, Buffer][] = [];
  let fromModrinth = 0;
  let hosted = 0;
  let archived = 0;
  for (const e of entries) {
    const m = mr[e.sha1];
    if (m && m.sha512 === e.sha512) {
      files.push({ path: e.rel, hashes: { sha512: e.sha512, sha1: e.sha1 }, size: e.data.length, downloads: [m.url] });
      fromModrinth++;
      continue;
    }
    const w = wc[e.sha512];
    if (w) {
      files.push({ path: e.rel, hashes: { sha512: e.sha512, sha1: e.sha1 }, size: e.data.length, downloads: [w.url] });
      hosted++;
      continue;
    }
    archived += e.data.length;
    if (archived > MAX_EXPORT_OVERRIDES) throw new Error("Trop de fichiers hors Modrinth (plus de 512 Mo) : export impossible.");
    archive.push([`overrides/${e.rel}`, e.data]);
  }
  const id = `${safeFolderName(info.name).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "pack"}-${createHash("sha1").update(`${Date.now()}`).digest("hex").slice(0, 6)}`;
  const manifest = {
    format: "relaunch-pack",
    formatVersion: 1,
    pack: { id, name: info.name.slice(0, 60), version: "1.0.0", shared: true },
    minecraft: info.mc,
    loader: loaderType === "vanilla" ? { type: "vanilla" } : { type: loaderType, version: info.loaderVersion },
    files,
    overrides: null,
    remove: [],
    editable: ["resourcepacks", "shaderpacks", "options.txt", "config"],
  };
  const data = zipFiles([["relaunch.json", Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8")], ...archive]);
  return { data, fromModrinth, hosted, inArchive: archive.length };
}

/** Lecture d'un .rlpack partagé : plan vérifié + liste des mods inclus dans l'archive (code non vérifié). */
export async function readRlpack(file: string, workerHost: string): Promise<{ plan: RpPlan; manifestText: string; entries: ZipEntry[]; unknownMods: string[] }> {
  const { entries } = await listZip(file);
  const idx = entries.find((e) => e.name === "relaunch.json");
  if (!idx) throw new Error("Ce fichier n'est pas un modpack ReLaunch (relaunch.json absent).");
  const manifestText = (await readEntry(file, idx, 4 * 1024 * 1024)).toString("utf8");
  let raw: unknown;
  try {
    raw = JSON.parse(manifestText);
  } catch {
    throw new Error("relaunch.json illisible.");
  }
  const plan = planRelaunchPack(raw, workerHost);
  plan.locked = false; // un pack partagé n'est jamais imposé
  const unknownMods = entries.filter((e) => e.name.startsWith("overrides/mods/") && /\.jar$/i.test(e.name)).map((e) => e.name.slice("overrides/mods/".length)).slice(0, 200);
  return { plan, manifestText, entries, unknownMods };
}

/** Extrait les overrides d'un .rlpack dans une archive temporaire « à plat » (mêmes règles que l'officiel). */
export async function rlpackOverridesToZip(file: string, entries: ZipEntry[], dest: string): Promise<boolean> {
  const out: [string, Buffer][] = [];
  let total = 0;
  for (const e of entries) {
    if (!e.name.startsWith("overrides/") || e.name.endsWith("/")) continue;
    const rel = rpPath(e.name.slice("overrides/".length));
    if (!rel || e.usize > MAX_OVERRIDE_ENTRY || total + e.usize > MAX_OVERRIDES_TOTAL) continue;
    total += e.usize;
    out.push([rel, await readEntry(file, e, MAX_OVERRIDE_ENTRY)]);
  }
  if (!out.length) return false;
  await writeFile(dest, zipFiles(out));
  return true;
}

export const packFolderName = (plan: RpPlan) => safeFolderName(plan.name);
