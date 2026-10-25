// Service des modpacks (lot E7) : recherche Modrinth, création et modification d'un WePack, suivi réel.
// L'interface n'envoie que des valeurs vérifiées ici (texte, version, loader, identifiants de projets) ;
// les dossiers sont calculés dans le processus principal, jamais fournis par l'interface.
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import type { ModpackEditInfo, ModpackHit, ModpackJob, ModpackSearch, ModpackStartResult, PackRowView } from "../../shared/api";
import { fetchVersionList } from "../install/vanilla";
import type { InstanceService } from "../instances/service";
import type { MediaStore } from "../media/media";
import type { NetOptions } from "../net/download";
import { installMrpack } from "./mrpack";
import { CONTENT_DIRS, planContent } from "./projects";
import { readEventManifest } from "../events/eventLock";
import {
  applyModpackEdit,
  resolveModpack,
  buildModpack,
  explainModrinthError,
  MODRINTH_LOADERS,
  modDownloader,
  modrinthFetcher,
  MP_CATEGORIES,
  MP_SORTS,
  packNote,
  packRows,
  safeFolderName,
  searchParams,
  type Download,
  type Fetch,
  type ModpackMeta,
  type Root,
} from "./modrinth";

const isMc = (v: unknown): v is string => typeof v === "string" && /^[0-9][0-9A-Za-z._-]{0,31}$/.test(v);
const isLoader = (v: unknown): v is string => typeof v === "string" && v in MODRINTH_LOADERS;
const isPid = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9]{1,64}$/.test(v);

/** Liste de mods choisis, vérifiée (identifiants Modrinth, titres courts), sans doublon. */
export function cleanRoots(v: unknown): Root[] | null {
  if (!Array.isArray(v) || v.length > 500) return null;
  const out: Root[] = [];
  const seen = new Set<string>();
  for (const r of v as unknown[]) {
    const o = (typeof r === "object" && r !== null ? r : {}) as Record<string, unknown>;
    if (!isPid(o["project_id"]) || typeof o["title"] !== "string") return null;
    if (seen.has(o["project_id"])) continue;
    seen.add(o["project_id"]);
    out.push({ project_id: o["project_id"], title: o["title"].slice(0, 200) });
  }
  return out;
}

/** Packs de ressources et shaders à ajouter à un nouveau WePack (identifiants Modrinth vérifiés). */
export function cleanExtras(v: unknown): { project_id: string; title: string; type: "resourcepack" | "shader" }[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 100) return null;
  const out: { project_id: string; title: string; type: "resourcepack" | "shader" }[] = [];
  for (const r of v as unknown[]) {
    const o = (typeof r === "object" && r !== null ? r : {}) as Record<string, unknown>;
    if (!isPid(o["project_id"]) || typeof o["title"] !== "string" || (o["type"] !== "resourcepack" && o["type"] !== "shader")) return null;
    if (out.some((x) => x.project_id === o["project_id"])) continue;
    out.push({ project_id: o["project_id"], title: o["title"].slice(0, 200), type: o["type"] });
  }
  return out;
}

export interface ModpackDeps {
  instancesDir: string;
  instances: InstanceService;
  net?: NetOptions;
  userAgent: string;
  fetch?: Fetch;
  download?: Download;
  versions?: () => Promise<string[]>;
  /** Retire un mod du modpack : corbeille de Windows (jamais d'effacement définitif). */
  trash?: (file: string) => Promise<void>;
  /** Icônes des résultats (adresses app:// des images Modrinth). */
  media?: MediaStore;
  /** Journal de l'application (résultat de chaque opération). */
  log?: { info(origin: string, msg: string): unknown; error(origin: string, msg: string): unknown } | null;
}

export class ModpackService {
  private job: ModpackJob | null = null;
  private versionsCache: string[] | null = null;
  private readonly fetch: Fetch;
  private readonly download: Download;

  constructor(private readonly d: ModpackDeps) {
    this.fetch = d.fetch ?? modrinthFetcher(d.userAgent, d.net);
    this.download = d.download ?? modDownloader(d.userAgent, d.net);
  }

  /** Accès à l'API Modrinth (mêmes garde-fous : HTTPS, api.modrinth.com seulement, User-Agent). */
  get api(): Fetch {
    return this.fetch;
  }
  get downloader(): Download {
    return this.download;
  }

  /** Versions de Minecraft (releases) de la liste officielle de Mojang, la plus récente d'abord. */
  async mcVersions(): Promise<string[]> {
    if (this.versionsCache) return this.versionsCache;
    const list = this.d.versions ? await this.d.versions() : (await fetchVersionList(this.d.net ?? {})).filter((v) => v.type === "release").map((v) => v.id);
    this.versionsCache = list;
    return list;
  }

  async search(q: unknown): Promise<ModpackSearch> {
    const o = (typeof q === "object" && q !== null ? q : {}) as Record<string, unknown>;
    const query = typeof o["query"] === "string" ? o["query"].slice(0, 200) : "";
    const offset = typeof o["offset"] === "number" && Number.isInteger(o["offset"]) && o["offset"] >= 0 && o["offset"] <= 10_000 ? o["offset"] : 0;
    const cats = Array.isArray(o["categories"]) ? (o["categories"] as unknown[]).filter((c): c is string => typeof c === "string" && (MP_CATEGORIES as readonly string[]).includes(c)) : [];
    const envs = Array.isArray(o["envs"]) ? (o["envs"] as unknown[]).filter((e): e is string => e === "client" || e === "server") : [];
    const sort = typeof o["sort"] === "string" && Object.values(MP_SORTS).includes(o["sort"]) ? o["sort"] : null;
    if (!isMc(o["mc"]) || !isLoader(o["loader"])) return { ok: false, message: "Version de Minecraft ou loader invalide." };
    try {
      const d = (await this.fetch("/search", searchParams(query, o["mc"], o["loader"], offset, 20, cats, envs, sort))) as Record<string, unknown>;
      const hits = (Array.isArray(d["hits"]) ? d["hits"] : []) as Record<string, unknown>[];
      return {
        ok: true,
        total: typeof d["total_hits"] === "number" ? d["total_hits"] : hits.length,
        hits: hits
          .filter((h) => isPid(h["project_id"]))
          .map(
            (h): ModpackHit => ({
              id: h["project_id"] as string,
              title: String(h["title"] ?? h["slug"] ?? h["project_id"]).slice(0, 200),
              author: String(h["author"] ?? "").slice(0, 100),
              description: String(h["description"] ?? "").slice(0, 400),
              downloads: typeof h["downloads"] === "number" ? h["downloads"] : 0,
              categories: (Array.isArray(h["categories"]) ? (h["categories"] as unknown[]) : []).filter((c): c is string => typeof c === "string").slice(0, 12),
              slug: typeof h["slug"] === "string" && /^[\w-]{1,100}$/.test(h["slug"]) ? h["slug"] : null,
              icon: this.d.media?.remoteUrl(h["icon_url"]) ?? null,
            }),
          ),
      };
    } catch (e) {
      return { ok: false, message: explainModrinthError(e) };
    }
  }

  status(id: unknown): ModpackJob | null {
    return this.job && this.job.id === id ? { ...this.job, warnings: [...this.job.warnings] } : null;
  }

  private async installArchive(archive: string, name: string | null, progress: (d: number, t: number, m: string) => void): Promise<{ summary: string; warnings: string[] }> {
    const r = await installMrpack(archive, this.d.instancesDir, name, progress, { ...(this.d.net ?? {}), userAgent: this.d.userAgent });
    await this.d.instances.list(true);
    const n = r.plan.files.length;
    return {
      summary: `Instance « ${path.basename(r.folder)} » créée : Minecraft ${r.plan.mc}${r.plan.loader ? ` · ${r.plan.loader} ${r.plan.loaderVersion ?? ""}`.trimEnd() : ""}, ${n} fichier${n > 1 ? "s" : ""} téléchargé${n > 1 ? "s" : ""} et vérifié${n > 1 ? "s" : ""}. Le jeu et le loader seront installés au premier lancement.`,
      warnings: r.warnings,
    };
  }

  /** Importe un fichier .mrpack choisi par l'utilisateur (fenêtre du système) dans une nouvelle instance. */
  importFile(file: string): ModpackStartResult {
    if (this.busy()) return { ok: false, reason: "busy" };
    return this.run((progress) => this.installArchive(file, null, progress));
  }

  /** Installe une version de modpack Modrinth (Découvrir > Modpacks > Installer) dans une nouvelle instance. */
  installVersion(versionId: unknown, name: unknown): ModpackStartResult {
    if (this.busy()) return { ok: false, reason: "busy" };
    if (!isPid(versionId)) return { ok: false, reason: "invalid" };
    const wanted = typeof name === "string" && name.trim() ? name.trim().slice(0, 60) : null;
    return this.run(async (progress) => {
      progress(0, 0, "Recherche du modpack sur Modrinth...");
      const v = (await this.fetch(`/version/${versionId}`)) as Record<string, unknown>;
      const files = (Array.isArray(v?.["files"]) ? v["files"] : []) as Record<string, unknown>[];
      const f = files.find((x) => x?.["primary"] === true) ?? files[0];
      const hashes = (f?.["hashes"] ?? {}) as Record<string, unknown>;
      const sha512 = typeof hashes["sha512"] === "string" && /^[0-9a-f]{128}$/i.test(hashes["sha512"]) ? hashes["sha512"].toLowerCase() : null;
      if (!f || typeof f["url"] !== "string" || typeof f["filename"] !== "string" || !/\.mrpack$/i.test(f["filename"]) || !sha512) {
        throw new Error("Cette version ne contient pas de fichier .mrpack vérifiable : installation impossible.");
      }
      const tmpDir = path.join(path.dirname(this.d.instancesDir), "cache", "mrpack");
      await mkdir(tmpDir, { recursive: true });
      const tmp = path.join(tmpDir, `${versionId}.mrpack`);
      progress(0, 0, "Téléchargement du modpack...");
      await this.download(f["url"], tmp, sha512, null); // cdn.modrinth.com seulement, SHA-512 vérifié
      try {
        return await this.installArchive(tmp, wanted, progress);
      } finally {
        await unlink(tmp).catch(() => undefined);
      }
    });
  }

  /** Dernière version compatible de chaque pack de ressources / shader, vérifiée (SHA-512), dans le dossier de jeu. */
  private async installExtras(gameDir: string, mc: string, extras: { project_id: string; title: string; type: "resourcepack" | "shader" }[], progress: (d: number, t: number, m: string) => void): Promise<{ done: number; warnings: string[] }> {
    const warnings: string[] = [];
    let done = 0;
    for (const x of extras) {
      try {
        progress(done, extras.length, x.title);
        const vs = (await this.fetch(`/project/${x.project_id}/version`, { game_versions: JSON.stringify([mc]) })) as Record<string, unknown>[];
        const list = Array.isArray(vs) ? vs : [];
        const best = list.find((v) => v?.["version_type"] === "release") ?? list[0];
        if (!best || typeof best["id"] !== "string") {
          warnings.push(`« ${x.title} » : aucune version pour Minecraft ${mc}.`);
          continue;
        }
        const plan = await planContent(this.fetch, best["id"]);
        if (plan.type !== x.type) throw new Error("type de contenu inattendu");
        const dir = path.join(gameDir, CONTENT_DIRS[plan.type]);
        await mkdir(dir, { recursive: true });
        const dest = path.join(dir, plan.file);
        if (await stat(dest).then(() => true, () => false)) continue; // déjà présent : rien n'est remplacé
        await this.download(plan.url, dest, plan.sha512, null);
        done++;
      } catch (e) {
        warnings.push(`« ${x.title} » : ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { done, warnings };
  }

  /**
   * Ajoute des mods (et leurs dépendances obligatoires) dans le dossier mods/ d'une instance qui n'est ni un
   * WePack (modifié par edit) ni un modpack d'événement. Un fichier déjà présent n'est jamais remplacé.
   */
  async addMods(id: unknown, roots0: unknown): Promise<ModpackStartResult> {
    const roots = cleanRoots(roots0);
    if (this.busy()) return { ok: false, reason: "busy" };
    if (!roots) return { ok: false, reason: "invalid" };
    if (!roots.length) return { ok: false, reason: "empty" };
    const inst = this.d.instances.target(id);
    if (!inst || !inst.version || !inst.loader || !isLoader(inst.loader)) return { ok: false, reason: "invalid" };
    if (await readEventManifest(inst.folder)) return { ok: false, reason: "invalid" };
    const mc = inst.version;
    const loader = inst.loader;
    const gameDir = inst.path;
    return this.run(async (progress) => {
      progress(0, 0, "Recherche des versions compatibles...");
      const { plan, warnings } = await resolveModpack(mc, loader, roots, this.fetch);
      const modsDir = path.join(gameDir, "mods");
      await mkdir(modsDir, { recursive: true });
      const present = new Set((await readdir(modsDir).catch(() => [] as string[])).map((n) => n.toLowerCase().replace(/\.disabled$/, "")));
      const todo = plan.filter((i) => !present.has(i.filename.toLowerCase()));
      let done = 0;
      for (const i of todo) {
        progress(done, todo.length, i.filename);
        await this.download(i.url, path.join(modsDir, i.filename), i.sha512, i.sha1);
        done++;
      }
      const deps = todo.filter((i) => i.dependency).length;
      const skipped = plan.length - todo.length;
      return {
        summary: `${done} mod(s) ajouté(s) à « ${inst.display} »${deps ? ` (dont ${deps} dépendance(s) obligatoire(s))` : ""}${skipped ? ` ; ${skipped} déjà présent(s), non remplacé(s)` : ""}.`,
        warnings,
      };
    });
  }

  /** Une création ou une modification est en cours (lancement et suppression refusés pendant ce temps). */
  busy(): boolean {
    return !!this.job && this.job.phase === "en-cours";
  }

  private run(work: (progress: (done: number, total: number, msg: string) => void) => Promise<{ summary: string; warnings: string[] }>): ModpackStartResult {
    const job: ModpackJob = { id: randomUUID(), phase: "en-cours", message: "Préparation...", done: 0, total: 0, warnings: [] };
    this.job = job;
    void work((done, total, msg) => Object.assign(job, { done, total, message: total ? `Téléchargement des mods (${done}/${total}) : ${msg}` : msg }))
      .then((r) => {
        Object.assign(job, { phase: "termine", message: r.summary, warnings: r.warnings });
        this.d.log?.info("Modpacks", `${r.summary}${r.warnings.length ? ` (${r.warnings.length} avertissement(s) : ${r.warnings.slice(0, 5).join(" ; ")})` : ""}`);
      })
      .catch((e: unknown) => {
        Object.assign(job, { phase: "erreur", message: explainModrinthError(e) });
        this.d.log?.error("Modpacks", explainModrinthError(e));
      });
    return { ok: true, job: job.id };
  }

  /** Crée un WePack dans le dossier des instances de WeCraft (mp_create). */
  async create(input: unknown): Promise<ModpackStartResult> {
    const o = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
    const name = typeof o["name"] === "string" ? o["name"].trim().slice(0, 100) : "";
    const roots = cleanRoots(o["roots"]);
    if (this.busy()) return { ok: false, reason: "busy" };
    if (!name || !isMc(o["mc"]) || !isLoader(o["loader"]) || !roots) return { ok: false, reason: "invalid" };
    if (!roots.length) return { ok: false, reason: "empty" };
    const folder = path.join(this.d.instancesDir, safeFolderName(name));
    try {
      await stat(folder);
      return { ok: false, reason: "exists", name: path.basename(folder) };
    } catch {
      // nom libre
    }
    const mc = o["mc"];
    const loader = o["loader"];
    const extras = cleanExtras(o["extras"]);
    if (!extras) return { ok: false, reason: "invalid" };
    return this.run(async (progress) => {
      const r = await buildModpack(folder, name, mc, loader, roots, progress, this.fetch, this.download);
      const ex = await this.installExtras(folder, mc, extras, progress);
      return {
        summary: `Instance « ${path.basename(folder)} » créée avec ${r.count} mods${r.deps ? ` (dont ${r.deps} dépendances ajoutées automatiquement)` : ""}${ex.done ? `, ${ex.done} pack(s) de ressources ou shader(s)` : ""}.`,
        warnings: [...r.warnings, ...ex.warnings],
      };
    });
  }

  private async metaOf(id: unknown): Promise<{ folder: string; display: string; meta: ModpackMeta } | null> {
    const inst = this.d.instances.target(id);
    // comme la version Python : seuls les WePacks créés dans WeCraft se modifient ici (jamais CurseForge, Prism…)
    if (!inst || inst.source !== "WeCraft") return null;
    if (await readEventManifest(inst.folder)) return null; // mods d'un modpack d'événement : jamais modifiables
    try {
      const meta = JSON.parse(await readFile(path.join(inst.folder, "wecraft_modpack.json"), "utf8")) as ModpackMeta;
      if (!meta || !isMc(meta.minecraft) || !isLoader(meta.loader) || !Array.isArray(meta.mods)) return null;
      if (!meta.mods.every((m) => m && typeof m.project_id === "string" && typeof m.filename === "string")) return null;
      return { folder: inst.folder, display: inst.display, meta };
    } catch {
      return null;
    }
  }

  /** edit_modpack : ce qu'il faut pour modifier un WePack créé par WeCraft (null : illisible ou pas un WePack). */
  async editInfo(id: unknown): Promise<ModpackEditInfo | null> {
    const m = await this.metaOf(id);
    if (!m) return null;
    return {
      id: id as string,
      name: m.display,
      mc: m.meta.minecraft,
      loader: m.meta.loader,
      selected: m.meta.mods.filter((x) => !x.dependency).map((x) => ({ project_id: x.project_id, title: x.title || x.filename })),
      old: m.meta.mods.map((x) => ({ project_id: x.project_id, title: x.title || x.filename, dependency: !!x.dependency, required_by: x.required_by ?? [] })),
    };
  }

  /** Lignes de « Mon modpack » (pack_rows + pack_note), pour une création (id null) ou une modification. */
  async rows(id: unknown, selected: unknown): Promise<PackRowView[]> {
    const sel = cleanRoots(selected) ?? [];
    const m = id ? await this.metaOf(id) : null;
    return packRows(m?.meta.mods ?? [], sel, null).map((r) => ({ ...r, note: packNote(r).text, tone: packNote(r).tone }));
  }

  /** mp_save_edit / apply_modpack_edit. */
  async edit(id: unknown, selected: unknown): Promise<ModpackStartResult> {
    const sel = cleanRoots(selected);
    if (this.busy()) return { ok: false, reason: "busy" };
    if (!sel) return { ok: false, reason: "invalid" };
    if (!sel.length) return { ok: false, reason: "empty" };
    const m = await this.metaOf(id);
    if (!m) return { ok: false, reason: "invalid" };
    const oldRoots = new Set(m.meta.mods.filter((x) => !x.dependency).map((x) => x.project_id));
    const keep = new Set(sel.map((x) => x.project_id));
    if (keep.size === oldRoots.size && [...keep].every((k) => oldRoots.has(k))) return { ok: false, reason: "unchanged" };
    return this.run(async (progress) => {
      const r = await applyModpackEdit(m.folder, m.meta, sel, progress, this.fetch, this.download, this.d.trash);
      const s = (n: number) => (n > 1 ? "s" : "");
      const parts: string[] = [];
      if (r.added) parts.push(`${r.added} mod${s(r.added)} ajouté${s(r.added)}${r.deps ? ` (+ ${r.deps} dépendance${s(r.deps)})` : ""}`);
      if (r.removed) parts.push(`${r.removed} retiré${s(r.removed)}`);
      if (r.pruned) parts.push(`${r.pruned} dépendance${s(r.pruned)} devenue${s(r.pruned)} inutile${s(r.pruned)} retirée${s(r.pruned)}`);
      return { summary: `Modpack « ${m.display} » mis à jour : ${parts.join(", ") || "réglages enregistrés"}.`, warnings: r.warnings };
    });
  }
}
