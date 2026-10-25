// Page d'une instance : contenu (mods, packs de ressources, shaders), mondes, fichiers et journal du jeu.
// L'interface ne fournit jamais de chemin : seulement l'identifiant opaque de l'instance, un genre contrôlé et
// un simple nom de fichier, revérifié ici (pas de « / », pas de nom réservé, chemin réel resté dans son dossier).
// Activer/désactiver = renommer « x.jar » <-> « x.jar.disabled » (comme Prism et le launcher de Modrinth).
// Retirer = corbeille du système, jamais d'effacement définitif. Un modpack d'événement garde ses mods et
// ses fichiers officiels intacts.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { ContentItem, ContentKind, ContentList, ContentMeta, FileEntry, WorldView } from "../../shared/api";
import { readEventManifest, type EventManifest } from "../events/eventLock";
import { readTail, redact } from "../logs/logs";
import { PACK_FILE, safeRelPath } from "../modpacks/mrpack";
import type { Fetch } from "../modpacks/modrinth";

export const KIND_DIRS: Record<ContentKind, string> = { mod: "mods", resourcepack: "resourcepacks", shader: "shaderpacks" };
const MAX_ITEMS = 3000;

export class ContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentError";
  }
}

const isKind = (k: unknown): k is ContentKind => k === "mod" || k === "resourcepack" || k === "shader";

/** Fichier de contenu reconnu pour ce genre (le reste du dossier est ignoré). */
export function contentFileOk(kind: ContentKind, name: string, dir: boolean): boolean {
  if (safeRelPath(name) !== name || name.includes("/")) return false;
  if (kind === "mod") return !dir && /\.jar(\.disabled)?$/i.test(name);
  return dir || /\.zip(\.disabled)?$/i.test(name);
}

const baseName = (f: string) => f.replace(/\.disabled$/i, "");

/** Fichiers fournis par le modpack de l'instance (WePack, .mrpack installé, événement), en « dossier/nom » minuscule. */
export async function packInfo(gameDir: string, root: string, ev: EventManifest | null): Promise<{ name: string; version: string; source: string; files: Set<string> } | null> {
  if (ev) {
    const files = new Set([...ev.official].filter((p) => /^(mods|resourcepacks|shaderpacks)\/[^/]+$/.test(p)));
    return { name: ev.name, version: "", source: "Événement", files };
  }
  for (const dir of [root, gameDir]) {
    try {
      const o = JSON.parse(await readFile(path.join(dir, PACK_FILE), "utf8")) as Record<string, unknown>;
      const files = new Set((Array.isArray(o["files"]) ? o["files"] : []).filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase()));
      return { name: String(o["name"] ?? "Modpack").slice(0, 80), version: String(o["version"] ?? "").slice(0, 60), source: String(o["source"] ?? "Modrinth").slice(0, 30), files };
    } catch {
      // pas de liste de ce type
    }
    try {
      const o = JSON.parse(await readFile(path.join(dir, "wecraft_modpack.json"), "utf8")) as Record<string, unknown>;
      const mods = Array.isArray(o["mods"]) ? (o["mods"] as Record<string, unknown>[]) : [];
      const files = new Set(mods.map((m) => `mods/${path.basename(String(m?.["filename"] ?? ""))}`.toLowerCase()).filter((x) => x !== "mods/"));
      return { name: String(o["name"] ?? "WePack").slice(0, 80), version: "", source: "WePack", files };
    } catch {
      // pas un WePack
    }
  }
  return null;
}

/** Contenu de l'instance, trié par nom ; rapide (rien n'est ouvert ni téléchargé). */
export async function listContent(gameDir: string, root: string): Promise<ContentList> {
  const ev = await readEventManifest(root);
  const pack = await packInfo(gameDir, root, ev);
  const items: ContentItem[] = [];
  let truncated = false;
  for (const kind of ["mod", "resourcepack", "shader"] as ContentKind[]) {
    let ents;
    try {
      ents = await readdir(path.join(gameDir, KIND_DIRS[kind]), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      if (items.length >= MAX_ITEMS) {
        truncated = true;
        break;
      }
      const dir = e.isDirectory();
      if (!dir && !e.isFile()) continue;
      if (!contentFileOk(kind, e.name, dir)) continue;
      let size = 0;
      if (!dir) size = await stat(path.join(gameDir, KIND_DIRS[kind], e.name)).then((s) => s.size, () => 0);
      const rel = `${KIND_DIRS[kind]}/${baseName(e.name)}`.toLowerCase();
      items.push({
        kind,
        file: e.name,
        name: baseName(e.name).replace(/\.(jar|zip)$/i, ""),
        version: "",
        disabled: /\.disabled$/i.test(e.name),
        dir,
        size,
        pack: !!pack?.files.has(rel),
        locked: !!ev && (kind === "mod" || ev.official.has(rel)),
      });
    }
  }
  items.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  const count = (k: ContentKind) => items.filter((i) => i.kind === k && i.pack).length;
  return {
    items,
    truncated,
    event: !!ev,
    pack: pack ? { name: pack.name, version: pack.version, source: pack.source, counts: { mod: count("mod"), resourcepack: count("resourcepack"), shader: count("shader") } } : null,
  };
}

/** Chemin vérifié d'un fichier de contenu : nom simple, genre connu, chemin réel resté dans son dossier. */
export async function contentPath(gameDir: string, kind: unknown, file: unknown): Promise<{ kind: ContentKind; file: string; full: string; dir: string }> {
  if (!isKind(kind)) throw new ContentError("Genre de contenu inconnu.");
  if (typeof file !== "string" || file.length > 255) throw new ContentError("Nom de fichier refusé.");
  const dir = path.join(gameDir, KIND_DIRS[kind]);
  const full = path.join(dir, file);
  let st;
  try {
    st = await stat(full);
  } catch {
    throw new ContentError("Fichier introuvable : la liste a peut-être changé.");
  }
  if (!contentFileOk(kind, file, st.isDirectory())) throw new ContentError("Nom de fichier refusé.");
  const real = await realpath(full);
  const rel = path.relative(await realpath(dir), real);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel) || rel.includes(path.sep)) throw new ContentError("Ce fichier sort de son dossier : refusé.");
  return { kind, file, full, dir };
}

async function assertEditable(root: string, kind: ContentKind, file: string): Promise<void> {
  const ev = await readEventManifest(root);
  if (!ev) return;
  if (kind === "mod") throw new ContentError("Modpack d'événement : les mods sont imposés par l'événement.");
  if (ev.official.has(`${KIND_DIRS[kind]}/${baseName(file)}`.toLowerCase())) throw new ContentError("Ce fichier fait partie du modpack officiel de l'événement.");
}

/** Active (`on`) ou désactive un fichier ; renvoie son nouveau nom. Un dossier ne se désactive pas. */
export async function toggleContent(gameDir: string, root: string, kind: unknown, file: unknown, on: boolean): Promise<string> {
  const c = await contentPath(gameDir, kind, file);
  await assertEditable(root, c.kind, c.file);
  if ((await stat(c.full)).isDirectory()) throw new ContentError("Un pack en dossier ne peut pas être désactivé ici.");
  const disabled = /\.disabled$/i.test(c.file);
  if (on === !disabled) return c.file;
  const next = on ? c.file.replace(/\.disabled$/i, "") : `${c.file}.disabled`;
  try {
    await stat(path.join(c.dir, next));
    throw new ContentError(`« ${next} » existe déjà : rien n'a été renommé.`);
  } catch (e) {
    if (e instanceof ContentError) throw e;
  }
  await rename(c.full, path.join(c.dir, next));
  return next;
}

/** Retire un fichier (corbeille du système). */
export async function removeContent(gameDir: string, root: string, kind: unknown, file: unknown, trash: (f: string) => Promise<void>): Promise<void> {
  const c = await contentPath(gameDir, kind, file);
  await assertEditable(root, c.kind, c.file);
  await trash(c.full);
}

// ---------------------------------------------------------------- informations Modrinth (icône, auteur, version)
interface HashHit {
  pid: string | null;
  version: string;
  at: number;
}
interface ProjInfo {
  title: string;
  slug: string;
  icon: string | null;
  author: string;
  at: number;
}
interface MetaCache {
  hashes: Record<string, HashHit>;
  projects: Record<string, ProjInfo>;
}
const WEEK = 7 * 864e5;
const PID = /^[A-Za-z0-9]{8}$/;

function sha1File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha1");
    createReadStream(file)
      .on("data", (d) => h.update(d))
      .on("error", reject)
      .on("end", () => resolve(h.digest("hex")));
  });
}

async function limited<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]!);
    }),
  );
}

/**
 * Icône, nom, auteur et version des fichiers reconnus par Modrinth (empreinte SHA-1, API publique). Les
 * réponses sont gardées dans .wecraft\cache\content_meta.json (une semaine). `remote` transforme une
 * adresse d'image en adresse app:// (seulement cdn.modrinth.com).
 */
export async function contentDetails(gameDir: string, items: ContentItem[], fetch: Fetch, cacheFile: string, remote: (u: string) => string | null, now = Date.now()): Promise<Record<string, ContentMeta>> {
  let cache: MetaCache = { hashes: {}, projects: {} };
  try {
    const o = JSON.parse(await readFile(cacheFile, "utf8")) as MetaCache;
    if (o && typeof o.hashes === "object" && typeof o.projects === "object") cache = o;
  } catch {
    // pas encore de cache
  }
  const files = items.filter((i) => !i.dir && i.size > 0 && i.size < 512 * 1024 * 1024).slice(0, 600);
  const sha: Record<string, string> = {};
  await limited(files, 4, async (i) => {
    try {
      sha[`${i.kind}/${i.file}`] = await sha1File(path.join(gameDir, KIND_DIRS[i.kind], i.file));
    } catch {
      // fichier illisible : pas d'informations
    }
  });
  const todo = [...new Set(Object.values(sha))].filter((h) => !cache.hashes[h] || now - cache.hashes[h]!.at > WEEK).slice(0, 300);
  await limited(todo, 4, async (h) => {
    try {
      const v = (await fetch(`/version_file/${h}`, { algorithm: "sha1" })) as Record<string, unknown>;
      const pid = typeof v["project_id"] === "string" && PID.test(v["project_id"]) ? v["project_id"] : null;
      cache.hashes[h] = { pid, version: typeof v["version_number"] === "string" ? v["version_number"].slice(0, 60) : "", at: now };
    } catch (e) {
      if ((e as { status?: number }).status === 404) cache.hashes[h] = { pid: null, version: "", at: now }; // inconnu de Modrinth
    }
  });
  const pids = [...new Set(Object.values(sha).map((h) => cache.hashes[h]?.pid).filter((p): p is string => !!p))].filter((p) => !cache.projects[p] || now - cache.projects[p]!.at > WEEK);
  for (let k = 0; k < pids.length; k += 100) {
    const chunk = pids.slice(k, k + 100);
    try {
      const projs = (await fetch("/projects", { ids: JSON.stringify(chunk) })) as Record<string, unknown>[];
      const teams = [...new Set(projs.map((p) => p["team"]).filter((x): x is string => typeof x === "string" && PID.test(x)))];
      const owners: Record<string, string> = {};
      if (teams.length) {
        try {
          const tl = (await fetch("/teams", { ids: JSON.stringify(teams) })) as Record<string, unknown>[][];
          for (const members of Array.isArray(tl) ? tl : []) {
            const ms = Array.isArray(members) ? members : [];
            const o = ms.find((m) => m["is_owner"] === true || m["role"] === "Owner") ?? ms[0];
            const tid = o?.["team_id"];
            const user = (o?.["user"] ?? {}) as Record<string, unknown>;
            if (typeof tid === "string" && typeof user["username"] === "string") owners[tid] = user["username"].slice(0, 40);
          }
        } catch {
          // auteurs indisponibles
        }
      }
      for (const p of Array.isArray(projs) ? projs : []) {
        const id = p["id"];
        if (typeof id !== "string" || !PID.test(id)) continue;
        cache.projects[id] = {
          title: String(p["title"] ?? "").slice(0, 100),
          slug: typeof p["slug"] === "string" && /^[\w-]{1,100}$/.test(p["slug"]) ? p["slug"] : "",
          icon: typeof p["icon_url"] === "string" ? p["icon_url"].slice(0, 2048) : null,
          author: owners[String(p["team"])] ?? "",
          at: now,
        };
      }
    } catch {
      // Modrinth injoignable : les noms des fichiers restent affichés
    }
  }
  try {
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify(cache), "utf8");
  } catch {
    // cache non écrit : sera refait
  }
  const out: Record<string, ContentMeta> = {};
  for (const [key, h] of Object.entries(sha)) {
    const hit = cache.hashes[h];
    const pr = hit?.pid ? cache.projects[hit.pid] : undefined;
    if (!hit?.pid || !pr) continue;
    out[key] = { title: pr.title, slug: pr.slug, icon: pr.icon ? remote(pr.icon) : null, author: pr.author, version: hit.version };
  }
  return out;
}

// ---------------------------------------------------------------- mondes, fichiers, journal
/** Nom d'un monde lu dans level.dat (NBT compressé), sinon nom du dossier. */
export function levelName(buf: Buffer): string | null {
  let data: Buffer;
  try {
    data = gunzipSync(buf, { maxOutputLength: 32 * 1024 * 1024 });
  } catch {
    return null;
  }
  const tag = Buffer.from([8, 0, 9, ...Buffer.from("LevelName")]);
  const i = data.indexOf(tag);
  if (i < 0 || i + tag.length + 2 > data.length) return null;
  const len = data.readUInt16BE(i + tag.length);
  const s = data.subarray(i + tag.length + 2, i + tag.length + 2 + len).toString("utf8");
  return s.trim() ? s.trim().slice(0, 80) : null;
}

export async function listWorlds(gameDir: string): Promise<WorldView[]> {
  const out: WorldView[] = [];
  let ents;
  try {
    ents = await readdir(path.join(gameDir, "saves"), { withFileTypes: true });
  } catch {
    return [];
  }
  for (const e of ents.slice(0, 500)) {
    if (!e.isDirectory()) continue;
    const ld = path.join(gameDir, "saves", e.name, "level.dat");
    try {
      const st = await stat(ld);
      const name = st.size < 8 * 1024 * 1024 ? levelName(await readFile(ld)) : null;
      out.push({ folder: e.name, name: name ?? e.name, last: Math.round(st.mtimeMs) });
    } catch {
      // pas un monde
    }
  }
  return out.sort((a, b) => b.last - a.last);
}

export async function listFiles(gameDir: string): Promise<FileEntry[]> {
  let ents;
  try {
    ents = await readdir(gameDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: FileEntry[] = [];
  for (const e of ents.slice(0, 1000)) {
    if (!e.isDirectory() && !e.isFile()) continue;
    const st = await stat(path.join(gameDir, e.name)).catch(() => null);
    if (!st) continue;
    out.push({ name: e.name.slice(0, 255), dir: e.isDirectory(), size: e.isDirectory() ? 0 : st.size, mtime: Math.round(st.mtimeMs) });
  }
  return out.sort((a, b) => (a.dir === b.dir ? a.name.toLowerCase().localeCompare(b.name.toLowerCase()) : a.dir ? -1 : 1));
}

/** Sous-dossier ouvrable dans l'explorateur : un simple nom de dossier existant de l'instance (ou la racine). */
export async function openableDir(gameDir: string, sub: unknown): Promise<string | null> {
  if (sub === "" || sub === null || sub === undefined) return gameDir;
  if (typeof sub !== "string" || safeRelPath(sub) !== sub || sub.includes("/")) return null;
  const p = path.join(gameDir, sub);
  try {
    const real = await realpath(p);
    const rel = path.relative(await realpath(gameDir), real);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel) || rel.includes(path.sep)) return null;
    return (await stat(real)).isDirectory() ? real : null;
  } catch {
    return null;
  }
}

/** Fin de logs/latest.log, données sensibles masquées. */
export async function gameLog(gameDir: string): Promise<{ lines: string[]; truncated: boolean; at: number | null }> {
  const f = path.join(gameDir, "logs", "latest.log");
  const st = await stat(f).catch(() => null);
  if (!st) return { lines: [], truncated: false, at: null };
  const text = await readTail(f);
  const lines = text.split(/\r?\n/).map((l) => redact(l.slice(0, 4000)));
  while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop();
  return { lines: lines.slice(-4000), truncated: st.size > 256 * 1024 || lines.length > 4000, at: Math.round(st.mtimeMs) };
}
