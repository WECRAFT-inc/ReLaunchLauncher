// Modpacks Modrinth (lot E7), port de la bibliothèque de mods de wecraft_launcher.py :
// modrinth_get / modrinth_search / resolve_modpack / build_modpack / pack_graph / pack_rows / pack_note /
// apply_modpack_edit / list_pack_mods / count_mod_files / read_mod_jar.
//
// Sécurité (identique à Python, plus strict sur le réseau) :
// - API Modrinth et CDN Modrinth uniquement, en HTTPS ; mods téléchargés SEULEMENT depuis cdn.modrinth.com ;
// - empreinte SHA-512 obligatoire, vérifiée avant de garder le fichier ; nom de fichier contrôlé (aucun dossier,
//   aucun caractère interdit sous Windows, aucun nom réservé) ;
// - création : rien ne reste si un téléchargement échoue ; modification : rien n'est supprimé si un
//   téléchargement échoue, et seuls les fichiers notés dans wecraft_modpack.json peuvent être retirés.
import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { downloadVerified, fetchJson, HttpError, runLimited, type NetOptions } from "../net/download";
import { readZipEntries } from "./zip";

export const MODRINTH_API = "https://api.modrinth.com/v2";
export const MODRINTH_CDN = "https://cdn.modrinth.com/";
export const MODRINTH_HOSTS: ReadonlySet<string> = new Set(["api.modrinth.com", "cdn.modrinth.com"]);
export const MODRINTH_LOADERS: Record<string, string[]> = { Fabric: ["fabric"], Forge: ["forge"], NeoForge: ["neoforge"], Quilt: ["quilt", "fabric"] };
export const MP_CATEGORIES = [
  "adventure", "cursed", "decoration", "economy", "equipment", "food", "game-mechanics", "library", "magic", "management",
  "minigame", "mobs", "optimization", "social", "storage", "technology", "transportation", "utility", "worldgen",
] as const;
export const MP_SORTS: Record<string, string | null> = { Pertinence: null, Téléchargements: "downloads", Favoris: "follows", "Plus récents": "newest", "Mis à jour": "updated" };
export const CATEGORY_FR: Record<string, string> = {
  optimization: "Optimisation", decoration: "Décoration", library: "Bibliothèque", utility: "Utilitaire", technology: "Technologie",
  adventure: "Aventure", magic: "Magie", storage: "Stockage", equipment: "Équipement", food: "Nourriture", "game-mechanics": "Mécaniques",
  mobs: "Créatures", worldgen: "Génération", transportation: "Transport", social: "Social", economy: "Économie", cursed: "Maudit",
  management: "Gestion", minigame: "Mini-jeu",
};

export type Params = Record<string, string | number>;
export type Fetch = (path: string, params?: Params) => Promise<unknown>;

/** modrinth_get : requête GET sur l'API Modrinth (gratuite, sans clé ; User-Agent demandé par Modrinth). */
export function modrinthFetcher(userAgent: string, opts: NetOptions = {}): Fetch {
  return (p, params) => {
    const q = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]): [string, string] => [k, String(v)])).toString()}` : "";
    return fetchJson(MODRINTH_API + p + q, 8 * 1024 * 1024, {}, { ...opts, allowedHosts: MODRINTH_HOSTS, headers: { "User-Agent": userAgent } });
  };
}

export function explainModrinthError(e: unknown): string {
  if (e instanceof HttpError) {
    if (e.status === 429) return "Trop de requêtes envoyées à Modrinth : patientez une minute puis réessayez.";
    return `Modrinth a répondu par une erreur (${e.status}).`;
  }
  if (e instanceof TypeError) return "Connexion à Modrinth impossible : vérifiez votre connexion internet.";
  return e instanceof Error ? e.message : String(e);
}

/** Facettes de recherche (toutes les catégories obligatoires ; envs : « client » et/ou « server »). */
export function searchParams(query: string, mc: string, loader: string, offset = 0, limit = 20, categories: string[] = [], envs: string[] = [], sort: string | null = null): Params {
  const facets: string[][] = [["project_type:mod"], [`versions:${mc}`], (MODRINTH_LOADERS[loader] ?? []).map((l) => `categories:${l}`)];
  for (const c of categories) facets.push([`categories:${c}`]);
  for (const e of envs) facets.push([`${e}_side:required`, `${e}_side:optional`]);
  return { query, facets: JSON.stringify(facets), limit, offset, index: sort || (query ? "relevance" : "downloads") };
}

export function shortCount(n0: unknown): string {
  const n = Math.trunc(Number(n0) || 0);
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

const WIN_RESERVED = new Set(["CON", "PRN", "AUX", "NUL", ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`), ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`)]);

/** safe_folder_name : nom de dossier d'instance sans caractère interdit ni nom réservé. */
export function safeFolderName(name: string): string {
  let clean = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/^[ .]+|[ .]+$/g, "").slice(0, 60);
  if (!clean || WIN_RESERVED.has(clean.toUpperCase())) clean = `Modpack ${clean}`.trim();
  return clean;
}

/** safe_mod_filename : simple nom de fichier .jar, sans dossier, sans caractère interdit ni nom réservé. */
export function safeModFilename(name: unknown): boolean {
  const n = String(name ?? "");
  return /^[^<>:"/\\|?*\x00-\x1f]{1,200}\.jar$/i.test(n) && !n.endsWith(" ") && !n.endsWith(".") && !WIN_RESERVED.has(n.split(".")[0]!.trim().toUpperCase());
}

export interface Root {
  project_id: string;
  title: string;
}
export interface PlanItem {
  project_id: string;
  version_id: string;
  version: string;
  filename: string;
  url: string;
  size: number;
  sha512: string;
  sha1: string | null;
  dependency: boolean;
  title: string;
  required_by: string[];
}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * resolve_modpack : meilleure version compatible de chaque mod demandé (stable d'abord, puis la plus
 * récente), puis ses dépendances « required », récursivement. Renvoie les fichiers à télécharger et les avertissements.
 */
export async function resolveModpack(mc: string, loader: string, roots: Root[], fetch: Fetch): Promise<{ plan: PlanItem[]; warnings: string[] }> {
  const loaders = MODRINTH_LOADERS[loader] ?? [];
  const titles = new Map<string, string>(roots.map((r) => [r.project_id, r.title]));
  const chosen = new Map<string, Omit<PlanItem, "title" | "required_by"> | null>();
  const warnings: string[] = [];
  const incompatible: [string, string][] = [];
  const requiredBy = new Map<string, Set<string>>();
  const queue: [string, boolean][] = roots.map((r) => [r.project_id, false]);
  const t = (pid: string) => titles.get(pid) ?? pid;

  const pick = async (pid: string): Promise<Obj | null> => {
    const versions = asArr(await fetch(`/project/${pid}/version`, { loaders: JSON.stringify(loaders), game_versions: JSON.stringify([mc]) })).map(asObj);
    for (const kind of ["release", "beta", "alpha"]) {
      const found = versions.filter((v) => v["version_type"] === kind);
      if (found.length) return found.reduce((best, v) => (String(v["date_published"] ?? "") > String(best["date_published"] ?? "") ? v : best));
    }
    return null;
  };

  while (queue.length) {
    const [pid, isDep] = queue.shift()!;
    if (chosen.has(pid)) continue;
    let v: Obj | null;
    try {
      v = await pick(pid);
    } catch (e) {
      v = null;
      warnings.push(`« ${t(pid)} » : version introuvable (${e instanceof Error ? e.message : String(e)}).`);
    }
    const files = asArr(v?.["files"]).map(asObj);
    const f = files.find((x) => x["primary"]) ?? files[0] ?? null;
    const hashes = asObj(f?.["hashes"]);
    if (!v || !f || !String(f["url"] ?? "").startsWith(MODRINTH_CDN) || !safeModFilename(f["filename"]) || !hashes["sha512"]) {
      chosen.set(pid, null);
      if (v === null) {
        if (!warnings.some((w) => w.includes(`« ${t(pid)} » :`))) warnings.push(`« ${t(pid)} » : aucune version pour Minecraft ${mc} (${loader}).`);
      } else {
        warnings.push(`« ${t(pid)} » : fichier indisponible ou non autorisé, ignoré.`);
      }
      continue;
    }
    chosen.set(pid, {
      project_id: pid,
      version_id: String(v["id"]),
      version: String(v["version_number"] ?? ""),
      filename: String(f["filename"]),
      url: String(f["url"]),
      size: typeof f["size"] === "number" ? f["size"] : 0,
      sha512: String(hashes["sha512"]),
      sha1: typeof hashes["sha1"] === "string" ? hashes["sha1"] : null,
      dependency: isDep,
    });
    for (const dep0 of asArr(v["dependencies"])) {
      const dep = asObj(dep0);
      let dp = typeof dep["project_id"] === "string" && dep["project_id"] ? (dep["project_id"] as string) : null;
      const kind = dep["dependency_type"];
      if (!dp && dep["version_id"]) {
        try {
          const pv = asObj(await fetch(`/version/${String(dep["version_id"])}`))["project_id"];
          dp = typeof pv === "string" && pv ? pv : null;
        } catch {
          dp = null;
        }
      }
      if (dp && kind === "required") {
        queue.push([dp, true]);
        if (!requiredBy.has(dp)) requiredBy.set(dp, new Set());
        requiredBy.get(dp)!.add(pid);
      } else if (dp && kind === "incompatible") {
        incompatible.push([dp, pid]);
      }
    }
  }

  const plan: PlanItem[] = [];
  const seen = new Set<string>();
  for (const item of chosen.values()) {
    if (item && !seen.has(item.filename.toLowerCase())) {
      // deux projets ne peuvent pas partager un fichier (Windows ne distingue pas majuscules et minuscules)
      seen.add(item.filename.toLowerCase());
      plan.push({ ...item, title: "", required_by: [] });
    }
  }
  const ids = plan.map((i) => i.project_id);
  try {
    // noms lisibles pour les dépendances ajoutées automatiquement
    for (let k = 0; k < ids.length; k += 100) {
      for (const p0 of asArr(await fetch("/projects", { ids: JSON.stringify(ids.slice(k, k + 100)) }))) {
        const p = asObj(p0);
        if (typeof p["id"] === "string" && !titles.has(p["id"])) titles.set(p["id"], String(p["title"]));
      }
    }
  } catch {
    // noms des dépendances : nom du fichier à la place
  }
  for (const item of plan) item.title = titles.get(item.project_id) ?? item.filename;
  const inPack = new Set(plan.map((i) => i.project_id));
  for (const item of plan) {
    item.required_by = [...(requiredBy.get(item.project_id) ?? [])].filter((p) => inPack.has(p) && p !== item.project_id).sort();
  }
  for (const [dp, by] of incompatible) {
    if (inPack.has(dp)) warnings.push(`Incompatibilité : « ${titles.get(by) ?? by} » ne fonctionne pas avec « ${titles.get(dp) ?? dp} ».`);
  }
  return { plan, warnings };
}

export type Download = (url: string, dest: string, sha512: string | null, sha1: string | null) => Promise<void>;
export type Progress = (done: number, total: number, msg: string) => void;

/** download_mod_file : seulement depuis le CDN Modrinth, empreinte vérifiée avant de garder le fichier. */
export function modDownloader(userAgent: string, opts: NetOptions = {}): Download {
  return async (url, dest, sha512, sha1) => {
    if (!url.startsWith(MODRINTH_CDN)) throw new Error("Adresse de téléchargement non autorisée.");
    const expected = sha512 ? { sha512 } : sha1 ? { sha1 } : null;
    if (!expected) throw new Error(`Fichier corrompu ou modifié : ${path.basename(dest)}`);
    await downloadVerified(url, dest, expected, { ...opts, allowedHosts: MODRINTH_HOSTS, headers: { "User-Agent": userAgent } });
  };
}

const json2 = (v: unknown) => JSON.stringify(v, null, 2);
const META_KEYS = ["project_id", "version_id", "title", "version", "filename", "dependency"] as const;

/** build_modpack : dossier + mods téléchargés (4 en parallèle) + réglages WeCraft ; rien ne reste en cas d'échec. */
export async function buildModpack(
  folder: string,
  name: string,
  mc: string,
  loader: string,
  roots: Root[],
  progress: Progress,
  fetch: Fetch,
  download: Download,
): Promise<{ count: number; deps: number; warnings: string[] }> {
  progress(0, 0, "Recherche des versions compatibles et des dépendances...");
  const { plan, warnings } = await resolveModpack(mc, loader, roots, fetch);
  if (!plan.length) throw new Error(`Aucun de ces mods n'existe pour cette version de Minecraft et ce loader.\n${warnings.join("\n")}`);
  const modsDir = path.join(folder, "mods");
  // mkdir sans « recursive » : échoue si le dossier existe (même apparu entre-temps) ; seul un dossier créé
  // ici peut être retiré en cas d'échec (comme mkdir(parents=True) sans exist_ok en Python)
  await mkdir(path.dirname(folder), { recursive: true });
  try {
    await mkdir(folder);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") throw Object.assign(new Error(`Une instance « ${path.basename(folder)} » existe déjà.`), { code: "EEXIST" });
    throw e;
  }
  await mkdir(modsDir);
  try {
    let done = 0;
    await runLimited(plan, 4, async (i) => {
      await download(i.url, path.join(modsDir, i.filename), i.sha512, i.sha1);
      done++;
      progress(done, plan.length, i.filename);
    });
    await writeFile(path.join(folder, "wecraft.json"), json2({ version: mc, loader }), "utf8");
    await writeFile(
      path.join(folder, "wecraft_modpack.json"),
      json2({
        name,
        minecraft: mc,
        loader,
        source: "modrinth",
        mods: plan.map((i) => ({ project_id: i.project_id, version_id: i.version_id, title: i.title, version: i.version, filename: i.filename, dependency: i.dependency, required_by: i.required_by })),
      }),
      "utf8",
    );
  } catch (e) {
    await rm(folder, { recursive: true, force: true }); // pas d'instance à moitié créée (dossier créé à l'instant)
    throw e;
  }
  return { count: plan.length, deps: plan.filter((i) => i.dependency).length, warnings };
}

/** de_name : « de Create », « d'Apotheosis ». */
export const deName = (name: string) => ("aeiouyàâéèêîôû".includes(name.slice(0, 1).toLowerCase()) && name ? "d'" : "de ") + name;
/** join_fr : « A », « A et B », « A, B et C ». */
export const joinFr = (items: string[]) => (items.length === 1 ? items[0]! : `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`);

export interface MetaMod {
  project_id: string;
  filename: string;
  title?: string;
  version?: string;
  version_id?: string;
  dependency?: boolean;
  required_by?: string[];
  [k: string]: unknown;
}

/** pack_graph : qui reste dans le modpack (vivants) et qui a besoin de qui (parents). */
export function packGraph(old: MetaMod[], keep: Iterable<string>, plan: Record<string, string[]>): { alive: Set<string>; parents: Record<string, string[]> } {
  const edges = new Map<string, Set<string>>();
  const add = (pid: string, req: Iterable<string>) => {
    if (!edges.has(pid)) edges.set(pid, new Set());
    for (const r of req) edges.get(pid)!.add(r);
  };
  for (const m of old) add(m.project_id, m.required_by ?? []);
  for (const [pid, req] of Object.entries(plan)) add(pid, req);
  const alive = new Set<string>([...keep, ...Object.keys(plan)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of old) {
      const pid = m.project_id;
      const e = edges.get(pid)!;
      if (!alive.has(pid) && m.dependency && (!e.size || [...e].some((x) => alive.has(x)))) {
        alive.add(pid);
        changed = true;
      }
    }
  }
  const parents: Record<string, string[]> = {};
  for (const pid of alive) parents[pid] = [...(edges.get(pid) ?? [])].filter((p) => alive.has(p) && p !== pid).sort();
  return { alive, parents };
}

export interface PackRow {
  id: string;
  title: string;
  kind: "root" | "missing" | "dep" | "orphan";
  parents: string[];
}

const pyStrSort = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** pack_rows : lignes de « Mon modpack ». plan_items : mods résolus pour les ajouts (null = pas encore calculé). */
export function packRows(old: MetaMod[], selected: Root[], planItems: Record<string, Partial<PlanItem>> | null = null): PackRow[] {
  const items = planItems ?? {};
  const keep = selected.map((m) => m.project_id);
  const { alive, parents } = packGraph(
    old,
    keep,
    Object.fromEntries(Object.entries(items).map(([pid, i]) => [pid, i.required_by ?? []])),
  );
  const titles = new Map<string, string>();
  for (const m of old) titles.set(m.project_id, m.title || m.filename || m.project_id);
  for (const [pid, i] of Object.entries(items)) titles.set(pid, i.title || pid);
  for (const m of selected) titles.set(m.project_id, m.title);
  const names = (pid: string) => (parents[pid] ?? []).map((p) => titles.get(p) ?? p).sort(pyStrSort);
  const oldIds = new Set(old.map((m) => m.project_id));
  const rows: PackRow[] = [];
  for (const m of selected) {
    const pid = m.project_id;
    const missing = planItems !== null && !oldIds.has(pid) && !(pid in items);
    rows.push({ id: pid, title: titles.get(pid)!, kind: missing ? "missing" : "root", parents: names(pid) });
  }
  const shown = new Set(keep);
  for (const m of old) {
    const pid = m.project_id;
    if (m.dependency && !shown.has(pid)) {
      shown.add(pid);
      rows.push({ id: pid, title: titles.get(pid)!, kind: alive.has(pid) ? "dep" : "orphan", parents: names(pid) });
    }
  }
  for (const [pid, i] of Object.entries(items)) {
    if (i.dependency && !shown.has(pid)) {
      shown.add(pid);
      rows.push({ id: pid, title: titles.get(pid)!, kind: "dep", parents: names(pid) });
    }
  }
  return rows;
}

/** pack_note : petit texte affiché à côté d'un mod du modpack (avec son genre pour la couleur). */
export function packNote(row: PackRow): { text: string; tone: "warn" | "orphan" | "dep" | "muted" } {
  if (row.kind === "missing") return { text: "(introuvable pour cette version et ce loader)", tone: "warn" };
  if (row.kind === "orphan") return { text: "(dépendance devenue inutile : sera retirée)", tone: "orphan" };
  if (row.kind === "dep") return row.parents.length ? { text: `(dépendance ${joinFr(row.parents.map(deName))})`, tone: "dep" } : { text: "(dépendance automatique)", tone: "dep" };
  if (row.parents.length) return { text: `(aussi requis par ${joinFr(row.parents)})`, tone: "muted" };
  return { text: "", tone: "muted" };
}

export interface ModpackMeta {
  name?: string;
  minecraft: string;
  loader: string;
  source?: string;
  mods: MetaMod[];
  [k: string]: unknown;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * apply_modpack_edit : télécharge les mods ajoutés (+ dépendances requises), puis retire les mods enlevés et les
 * dépendances que plus aucun mod ne requiert. Rien n'est supprimé si un téléchargement échoue.
 */
export async function applyModpackEdit(
  folder: string,
  meta: ModpackMeta,
  selected: Root[],
  progress: Progress,
  fetch: Fetch,
  download: Download,
  /** Retrait d'un mod (ReLaunch : corbeille de Windows) ; par défaut effacement, comme la version Python. */
  remove: (file: string) => Promise<void> = unlink,
): Promise<{ added: number; deps: number; removed: number; pruned: number; warnings: string[] }> {
  const modsDir = path.join(folder, "mods");
  const { minecraft: mc, loader } = meta;
  const old = [...(meta.mods ?? [])];
  const oldIds = new Set(old.map((m) => m.project_id));
  const keep = new Set(selected.map((m) => m.project_id));
  const newRoots = selected.filter((m) => !oldIds.has(m.project_id));

  const plan: PlanItem[] = [];
  let warnings: string[] = [];
  const foundRb: Record<string, string[]> = {};
  if (newRoots.length) {
    progress(0, 0, "Recherche des versions compatibles et des dépendances...");
    const r = await resolveModpack(mc, loader, newRoots, fetch);
    warnings = r.warnings;
    if (!r.plan.length) throw new Error(`Aucun des mods ajoutés n'existe pour cette version de Minecraft et ce loader.\n${warnings.join("\n")}`);
    const used = new Set(old.map((m) => m.filename.toLowerCase())); // Windows : « Foo.jar » = « foo.jar »
    for (const item of r.plan) {
      if (oldIds.has(item.project_id)) {
        // déjà dans le modpack : seul « qui le requiert » est mis à jour
        foundRb[item.project_id] = item.required_by ?? [];
        continue;
      }
      if (used.has(item.filename.toLowerCase()) || (await exists(path.join(modsDir, item.filename)))) {
        warnings.push(`« ${item.title} » : un fichier du même nom existe déjà dans « mods », ignoré.`);
        continue;
      }
      plan.push(item);
    }
  }
  const planIds = new Set(plan.map((i) => i.project_id));
  const edgesNew: Record<string, string[]> = {};
  for (const i of plan) edgesNew[i.project_id] = (i.required_by ?? []).filter((p) => planIds.has(p));
  for (const [pid, rb] of Object.entries(foundRb)) edgesNew[pid] = rb.filter((p) => planIds.has(p));
  const { alive, parents } = packGraph(old, keep, edgesNew);
  const removed = old.filter((m) => !alive.has(m.project_id));

  await mkdir(modsDir, { recursive: true });
  try {
    let done = 0;
    await runLimited(plan, 4, async (i) => {
      await download(i.url, path.join(modsDir, i.filename), i.sha512, i.sha1);
      done++;
      progress(done, plan.length, i.filename);
    });
  } catch (e) {
    for (const i of plan) await unlink(path.join(modsDir, i.filename)).catch(() => undefined); // on annule
    throw e;
  }

  const failed: MetaMod[] = [];
  for (const m of removed) {
    const f = path.join(modsDir, path.basename(m.filename));
    if (!(await exists(f))) continue;
    try {
      await remove(f);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
      failed.push(m);
      warnings.push(`« ${m.title || m.filename} » : fichier impossible à supprimer (jeu ouvert ?), supprimez-le à la main.`);
    }
  }
  const gone = removed.filter((m) => !failed.includes(m));
  const goneIds = new Set(gone.map((m) => m.project_id));
  const kept: MetaMod[] = [];
  for (const m0 of old) {
    if (goneIds.has(m0.project_id)) continue;
    const m = { ...m0 };
    const pid = m.project_id;
    if (keep.has(pid)) m.dependency = false; // un ancien « dépendance » choisi à la main devient un vrai mod du pack
    if (alive.has(pid) && ("required_by" in m || (edgesNew[pid] ?? []).length)) m.required_by = parents[pid] ?? [];
    kept.push(m);
  }
  for (const i of plan) {
    const o = {} as MetaMod;
    for (const k of META_KEYS) (o as Record<string, unknown>)[k] = i[k];
    o.required_by = parents[i.project_id] ?? [];
    kept.push(o);
  }
  const tmp = path.join(folder, "wecraft_modpack.json.tmp");
  await writeFile(tmp, json2({ ...meta, mods: kept }), "utf8");
  await rename(tmp, path.join(folder, "wecraft_modpack.json"));
  return {
    added: plan.filter((i) => !i.dependency).length,
    deps: plan.filter((i) => i.dependency).length,
    removed: gone.filter((m) => !m.dependency).length,
    pruned: gone.filter((m) => m.dependency).length,
    warnings,
  };
}

// ---------------------------------------------------------------- liste des mods d'un modpack
const JAR_RE = /\.jar(\.disabled)?$/i;
const modCache = new Map<string, { name: string; version: string }>();
const clean = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return !s || s.includes("${") ? "" : s;
};

/** read_mod_jar : nom et version lus dans le .jar (Fabric, Quilt, Forge, NeoForge, ancien Forge), sinon nom du fichier. */
export async function readModJar(file: string): Promise<{ name: string; version: string }> {
  const fallback = path.basename(file).replace(JAR_RE, "");
  let st;
  try {
    st = await stat(file);
  } catch {
    return { name: fallback, version: "" };
  }
  const key = `${file}|${st.size}|${st.mtimeMs}`;
  const hit = modCache.get(key);
  if (hit) return hit;
  let name = "";
  let version = "";
  try {
    const want = ["fabric.mod.json", "quilt.mod.json", "META-INF/neoforge.mods.toml", "META-INF/mods.toml", "mcmod.info"];
    const z = await readZipEntries(file, want, 1024 * 1024);
    const text = (n: string) => z.get(n)!.toString("utf8");
    const loose = (s: string) => JSON.parse(s.replace(/[\u0000-\u001f]/g, (c) => (c === "\n" || c === "\r" || c === "\t" ? c : " "))) as unknown;
    if (z.has("fabric.mod.json")) {
      const d = asObj(loose(text("fabric.mod.json")));
      name = clean(d["name"]);
      version = clean(d["version"]);
    } else if (z.has("quilt.mod.json")) {
      const ql = asObj(asObj(loose(text("quilt.mod.json")))["quilt_loader"]);
      name = clean(asObj(ql["metadata"])["name"]);
      version = clean(ql["version"]);
    } else {
      const toml = ["META-INF/neoforge.mods.toml", "META-INF/mods.toml"].find((n) => z.has(n));
      if (toml) {
        const t = text(toml);
        const m = /^\s*displayName\s*=\s*"([^"]+)"/m.exec(t);
        const v = /^\s*version\s*=\s*"([^"]+)"/m.exec(t);
        name = m ? clean(m[1]) : "";
        version = v ? clean(v[1]) : "";
      } else if (z.has("mcmod.info")) {
        let d = loose(text("mcmod.info"));
        if (typeof d === "object" && d !== null && !Array.isArray(d)) d = asObj(d)["modList"] ?? [d];
        const first = asObj(asArr(d)[0]);
        if (asArr(d).length) {
          name = clean(first["name"]);
          version = clean(first["version"]);
        }
      }
    }
  } catch {
    // jar illisible : nom du fichier
  }
  const info = { name: name || fallback, version };
  modCache.set(key, info);
  return info;
}

/** count_mod_files : nombre de mods (.jar) d'un dossier de jeu, sans les ouvrir. */
export async function countModFiles(gameDir: string): Promise<number> {
  try {
    const d = await readdir(path.join(gameDir, "mods"), { withFileTypes: true });
    return d.filter((e) => e.isFile() && JAR_RE.test(e.name)).length;
  } catch {
    return 0;
  }
}

export interface PackMod {
  name: string;
  version: string;
  file: string;
  dep: boolean;
  disabled: boolean;
  parents: string[];
}

/** list_pack_mods : mods d'un modpack, noms tirés de wecraft_modpack.json sinon des .jar ; triés par nom. */
export async function listPackMods(gameDir: string, folder: string): Promise<PackMod[]> {
  const modsDir = path.join(gameDir, "mods");
  const known = new Map<string, MetaMod>();
  const byId = new Map<string, MetaMod>();
  try {
    const data = asObj(JSON.parse(await readFile(path.join(folder, "wecraft_modpack.json"), "utf8")));
    for (const m0 of asArr(data["mods"])) {
      const m = asObj(m0) as MetaMod;
      known.set(path.basename(String(m.filename ?? "")), m);
      if (m.project_id) byId.set(m.project_id, m);
    }
  } catch {
    // pas un modpack WeCraft
  }
  const out: PackMod[] = [];
  let files: string[] = [];
  try {
    files = (await readdir(modsDir, { withFileTypes: true })).filter((e) => e.isFile() && JAR_RE.test(e.name)).map((e) => e.name);
  } catch {
    files = [];
  }
  const present = new Set(files.map((f) => f.replace(/\.disabled$/i, "")));
  for (const f of files) {
    const disabled = f.toLowerCase().endsWith(".disabled");
    const k = known.get(f) ?? known.get(f.replace(/\.disabled$/i, ""));
    let parents: string[] = [];
    let name: string;
    let version: string;
    let dep: boolean;
    if (k) {
      name = k.title || f.replace(JAR_RE, "");
      version = k.version || "";
      dep = !!k.dependency;
      parents = [
        ...new Set(
          (k.required_by ?? [])
            .filter((r) => byId.has(r) && present.has(path.basename(String(byId.get(r)!.filename ?? ""))))
            .map((r) => byId.get(r)!.title || path.parse(String(byId.get(r)!.filename ?? "")).name),
        ),
      ].sort(pyStrSort);
    } else {
      const info = await readModJar(path.join(modsDir, f));
      name = info.name;
      version = info.version;
      dep = false;
    }
    out.push({ name, version, file: f, dep, disabled, parents });
  }
  if (!out.length) {
    // export Modrinth (.mrpack) pas encore installé : les fichiers sont dans l'index
    try {
      const idx = asObj(JSON.parse(await readFile(path.join(folder, "modrinth.index.json"), "utf8")));
      for (const f0 of asArr(idx["files"])) {
        const p = String(asObj(f0)["path"] ?? "");
        if (p.startsWith("mods/") && JAR_RE.test(p)) {
          const fname = path.posix.basename(p);
          out.push({ name: fname.replace(JAR_RE, ""), version: "", file: fname, dep: false, disabled: false, parents: [] });
        }
      }
    } catch {
      // pas d'index
    }
  }
  out.sort((a, b) => pyStrSort(a.name.toLowerCase(), b.name.toLowerCase()));
  return out;
}
