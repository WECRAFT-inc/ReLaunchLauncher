// Service des modpacks (lot E7) : recherche Modrinth, création et modification d'un WePack, suivi réel.
// L'interface n'envoie que des valeurs vérifiées ici (texte, version, loader, identifiants de projets) ;
// les dossiers sont calculés dans le processus principal, jamais fournis par l'interface.
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ModpackEditInfo, ModpackHit, ModpackJob, ModpackSearch, ModpackStartResult, PackRowView } from "../../shared/api";
import { fetchVersionList } from "../install/vanilla";
import type { InstanceService } from "../instances/service";
import type { NetOptions } from "../net/download";
import {
  applyModpackEdit,
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

  /** Une création ou une modification est en cours (lancement et suppression refusés pendant ce temps). */
  busy(): boolean {
    return !!this.job && this.job.phase === "en-cours";
  }

  private run(work: (progress: (done: number, total: number, msg: string) => void) => Promise<{ summary: string; warnings: string[] }>): ModpackStartResult {
    const job: ModpackJob = { id: randomUUID(), phase: "en-cours", message: "Préparation...", done: 0, total: 0, warnings: [] };
    this.job = job;
    void work((done, total, msg) => Object.assign(job, { done, total, message: total ? `Téléchargement des mods (${done}/${total}) : ${msg}` : msg }))
      .then((r) => Object.assign(job, { phase: "termine", message: r.summary, warnings: r.warnings }))
      .catch((e: unknown) => Object.assign(job, { phase: "erreur", message: explainModrinthError(e) }));
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
    return this.run(async (progress) => {
      const r = await buildModpack(folder, name, mc, loader, roots, progress, this.fetch, this.download);
      return {
        summary: `Instance « ${path.basename(folder)} » créée avec ${r.count} mods${r.deps ? ` (dont ${r.deps} dépendances ajoutées automatiquement)` : ""}.`,
        warnings: r.warnings,
      };
    });
  }

  private async metaOf(id: unknown): Promise<{ folder: string; display: string; meta: ModpackMeta } | null> {
    const inst = this.d.instances.target(id);
    // comme la version Python : seuls les WePacks créés dans WeCraft se modifient ici (jamais CurseForge, Prism…)
    if (!inst || inst.source !== "WeCraft") return null;
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
