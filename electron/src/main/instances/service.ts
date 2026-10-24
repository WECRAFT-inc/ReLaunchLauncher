// Service des instances (lot E2) : liste pour l'interface et favori enregistré dans instances_meta.json.
// L'interface ne reçoit jamais de chemin : chaque instance a un identifiant opaque, que seul ce service
// sait relier à un dossier. Rien n'est écrit dans les dossiers d'instances.
import { createHash } from "node:crypto";
import path from "node:path";
import type { DeleteResult, InstanceView, SettingResult } from "../../shared/api";
import type { PathEnv } from "../paths";
import { wecraftDataDir } from "../paths";
import { JsonStore, SettingsNotBackedUp, SettingsUnreadable } from "../storage/jsonStore";
import { safeToDelete } from "./delete";
import { applyMeta, detectExternal, instancesDir, LocalScanner, metaKey, sortInstances, type ListedInstance } from "./detect";

/** Les autres launchers sont relus au plus toutes les 60 s (comme la version Python). */
const EXTERNAL_TTL_MS = 60_000;

export class InstanceService {
  private readonly local: LocalScanner;
  private external: { at: number; list: Awaited<ReturnType<typeof detectExternal>> } | null = null;
  private byId = new Map<string, ListedInstance>();
  readonly metaFile: string;

  constructor(
    private readonly store: JsonStore,
    private readonly env: PathEnv,
    private readonly now: () => number = Date.now,
  ) {
    this.local = new LocalScanner(instancesDir(env));
    this.metaFile = path.join(wecraftDataDir(env), "instances_meta.json");
  }

  static idOf(folder: string, platform: NodeJS.Platform): string {
    return "i" + createHash("sha256").update(metaKey(folder, platform)).digest("hex").slice(0, 16);
  }

  /** Toutes les instances visibles (les masquées sont seulement comptées). `rescan` : tout relire. */
  async list(rescan = false): Promise<{ instances: InstanceView[]; hidden: number }> {
    if (rescan) {
      this.local.clear();
      this.external = null;
    }
    const local = await this.local.scan();
    if (!this.external || this.now() - this.external.at > EXTERNAL_TTL_MS) {
      this.external = { at: this.now(), list: await detectExternal(this.env) };
    }
    const meta = await this.store.read(this.metaFile);
    const all = sortInstances(applyMeta([...local, ...this.external.list], meta, this.env.platform));
    this.byId = new Map(all.map((i) => [InstanceService.idOf(i.folder, this.env.platform), i]));
    const visible = all.filter((i) => !i.hidden);
    return {
      hidden: all.length - visible.length,
      instances: visible.map((i) => ({
        id: InstanceService.idOf(i.folder, this.env.platform),
        name: i.display,
        source: i.source,
        version: i.version,
        loader: i.loader,
        loaderVersion: i.loaderVersion,
        ram: i.ram,
        fav: i.fav,
      })),
    };
  }

  /**
   * Ce qu'il faut pour lancer l'instance `id` (lot E4) : dossier de jeu, nom, version, loader. Reste dans le
   * processus principal ; null si l'identifiant est inconnu (liste pas encore lue, instance disparue).
   */
  target(id: unknown): ListedInstance | null {
    return typeof id === "string" ? (this.byId.get(id) ?? null) : null;
  }

  /**
   * RAM propre à l'instance mise à jour, seulement si l'instance en avait déjà une (start_instance en
   * Python). Un échec n'empêche pas de jouer.
   */
  async rememberRam(id: unknown, ram: number): Promise<void> {
    const inst = this.target(id);
    if (!inst || !inst.ram || inst.ram === ram) return;
    const key = metaKey(inst.folder, this.env.platform);
    try {
      await this.store.update(this.metaFile, (meta) => {
        const prev = meta[key];
        const entry = typeof prev === "object" && prev !== null && !Array.isArray(prev) ? { ...(prev as object) } : {};
        return { ...meta, [key]: { ...entry, ram } };
      });
      inst.ram = ram;
    } catch {
      // réglage non enregistré : le lancement continue
    }
  }

  /**
   * Envoie le dossier de l'instance à la corbeille (lot E8), puis oublie ses réglages par instance.
   * `trash` : corbeille du système (shell.trashItem) ; jamais d'effacement définitif.
   */
  async remove(id: unknown, trash: (folder: string) => Promise<void>): Promise<DeleteResult> {
    const inst = this.target(id);
    if (!inst) return { ok: false, reason: "invalid" };
    if (!(await safeToDelete(inst.folder, this.env))) return { ok: false, reason: "refused" };
    try {
      await trash(inst.folder);
    } catch {
      return { ok: false, reason: "trash-failed" };
    }
    let metaForgotten = true;
    const key = metaKey(inst.folder, this.env.platform);
    try {
      await this.store.update(this.metaFile, (meta) => {
        if (!(key in meta)) return meta;
        const out = { ...meta };
        delete out[key];
        return out;
      });
    } catch {
      metaForgotten = false; // dossier déjà à la corbeille : seuls ses réglages restent dans instances_meta.json
    }
    this.byId.delete(id as string);
    this.local.clear();
    this.external = null;
    return { ok: true, metaForgotten };
  }

  /** Favori (même clé « fav » que la version Python). Seule cette clé de l'instance change. */
  async setFavorite(id: unknown, fav: unknown): Promise<SettingResult> {
    if (typeof id !== "string" || typeof fav !== "boolean") return { ok: false, reason: "invalid" };
    const inst = this.byId.get(id);
    if (!inst) return { ok: false, reason: "invalid" };
    const key = metaKey(inst.folder, this.env.platform);
    try {
      await this.store.update(this.metaFile, (meta) => {
        const prev = meta[key];
        const entry: Record<string, unknown> = typeof prev === "object" && prev !== null && !Array.isArray(prev) ? { ...(prev as object) } : {};
        if (fav) entry["fav"] = true;
        else delete entry["fav"];
        const out = { ...meta };
        if (Object.keys(entry).length) out[key] = entry;
        else delete out[key];
        return out;
      });
      inst.fav = fav;
      return { ok: true };
    } catch (e) {
      if (e instanceof SettingsUnreadable) return { ok: false, reason: "unreadable" };
      if (e instanceof SettingsNotBackedUp) return { ok: false, reason: "not-backed-up" };
      return { ok: false, reason: "write-failed" };
    }
  }
}
