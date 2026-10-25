// Canaux IPC de la grosse mise à jour : réglages d'une instance, icônes, fonds, captures, images.
// Chaque gestionnaire est enregistré par `handle`, qui vérifie l'expéditeur (fenêtre principale, app://wecraft)
// AVANT d'appeler la fonction. Toutes les valeurs reçues sont vérifiées ici : l'interface ne fournit jamais
// de chemin, seulement des identifiants opaques et des valeurs contrôlées.
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { CreateInstanceResult, IconChoice, InstanceEdit, SettingResult } from "../shared/api";
import { CHANNELS } from "../shared/channels";
import { currentShader, EventLockError, listPacks, readEventManifest, removePack, setResourcePack, setShader, type EventManifest } from "./events/eventLock";
import { cleanCreate, createCustomInstance } from "./instances/create";
import { parseIconMeta, type IconMeta } from "./instances/detect";
import { InstanceService } from "./instances/service";
import type { LinkStore } from "./links";
import { MAX_IMPORT, MediaError, MediaStore, type Crop } from "./media/media";
import { CONTENT_DIRS, cleanProjectQuery, getProject, getVersions, planContent, safeContentFile, searchProjects } from "./modpacks/projects";
import type { ModpackService } from "./modpacks/service";

export type Handle = (channel: string, fn: (...args: unknown[]) => Promise<unknown>) => void;

export interface LookDeps {
  instances: () => InstanceService | null;
  media: () => MediaStore | null;
  instancesDir: () => string;
  platform: NodeJS.Platform;
  /** Fenêtre « Ouvrir » du système (une image) ; null si annulée. */
  pickImage: (title: string) => Promise<string | null>;
  /** Corbeille du système (jamais d'effacement définitif). */
  trash: (file: string) => Promise<void>;
}

/** Icône choisie dans l'interface, vérifiée (couleurs, symbole, nom de fichier d'icône recadrée). */
export function cleanIcon(v: unknown): IconMeta | null | undefined {
  if (v === null) return null;
  const icon = parseIconMeta(v);
  return icon ?? undefined; // undefined = refus
}

/** Réglages d'instance vérifiés ; null si invalides. */
export function cleanEdit(v: unknown): InstanceEdit | null {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  const base = cleanCreate({ name: typeof o["name"] === "string" && o["name"].trim() ? o["name"] : "x", mc: o["mc"], loader: o["loader"], loaderVersion: o["loaderVersion"] ?? null });
  if (!base || typeof o["name"] !== "string") return null;
  const ram = o["ram"];
  if (ram !== null && (typeof ram !== "number" || !Number.isInteger(ram) || ram < 1 || ram > 16)) return null;
  return { name: o["name"].trim().slice(0, 60), mc: base.mc, loader: base.loader, loaderVersion: base.loaderVersion, ram: ram as number | null };
}

function cleanCrop(v: unknown): Crop | null {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : NaN);
  const c = { zoom: n(o["zoom"]), cx: n(o["cx"]), cy: n(o["cy"]) };
  return [c.zoom, c.cx, c.cy].some(Number.isNaN) ? null : c;
}

const failMessage = (e: unknown) => (e instanceof MediaError ? e.message : "Opération impossible sur cette image.");

async function readPicked(file: string): Promise<Buffer> {
  const s = await stat(file);
  if (!s.isFile() || s.size > MAX_IMPORT) throw new MediaError("Image trop lourde (15 Mo au plus) ou fichier invalide.");
  return readFile(file);
}

export interface ProjectDeps {
  modpacks: () => ModpackService | null;
  instances: () => { target(id: unknown): { path: string } | null };
  media: () => MediaStore | null;
  links: LinkStore;
  openExternal: (url: string) => Promise<void>;
  /** Fenêtre « Ouvrir » du système pour un fichier .mrpack ; null si annulée. */
  pickMrpack: () => Promise<string | null>;
  /** Un lancement est en cours (installation refusée pendant ce temps). */
  launching: () => boolean;
}

export function registerProjectIpc(handle: Handle, d: ProjectDeps): void {
  handle(CHANNELS.projSearch, async (q) => {
    const mp = d.modpacks();
    const query = cleanProjectQuery(q);
    if (!mp || !query) return { ok: false, message: "Recherche invalide." };
    return searchProjects(mp.api, query, d.media());
  });
  handle(CHANNELS.projGet, async (id) => {
    const mp = d.modpacks();
    return mp ? getProject(mp.api, id, d.media(), d.links) : { error: "Indisponible." };
  });
  handle(CHANNELS.projVersions, async (id, mc, loader) => {
    const mp = d.modpacks();
    return mp ? getVersions(mp.api, id, mc, loader) : { error: "Indisponible." };
  });
  handle(CHANNELS.mpImportFile, async () => {
    const mp = d.modpacks();
    if (!mp) return { ok: false, reason: "invalid" };
    if (d.launching() || mp.busy()) return { ok: false, reason: "busy" };
    const file = await d.pickMrpack();
    if (!file) return { ok: false, reason: "canceled" };
    return mp.importFile(file);
  });
  handle(CHANNELS.mpInstallVersion, async (versionId, name) => {
    const mp = d.modpacks();
    if (!mp) return { ok: false, reason: "invalid" };
    if (d.launching()) return { ok: false, reason: "busy" };
    return mp.installVersion(versionId, name);
  });
  handle(CHANNELS.projInstalled, async (instanceId, type) => {
    const inst = d.instances().target(instanceId);
    if (!inst || (type !== "resourcepack" && type !== "shader")) return [];
    try {
      return (await readdir(path.join(inst.path, CONTENT_DIRS[type]))).filter((n) => safeContentFile(n)).slice(0, 2000);
    } catch {
      return [];
    }
  });
  handle(CHANNELS.projInstallFile, async (instanceId, versionId) => {
    const mp = d.modpacks();
    const inst = d.instances().target(instanceId);
    if (!mp || !inst) return { ok: false, message: "Instance introuvable." };
    if (d.launching() || mp.busy()) return { ok: false, message: "Une opération est en cours : réessayez dans un instant." };
    try {
      const plan = await planContent(mp.api, versionId);
      const dir = path.join(inst.path, plan.dir);
      const dest = path.join(dir, plan.file);
      try {
        await stat(dest);
        return { ok: false, message: `« ${plan.file} » est déjà dans ${plan.dir} : rien n'a été remplacé.` };
      } catch {
        // fichier absent : on installe
      }
      await mkdir(dir, { recursive: true });
      await mp.downloader(plan.url, dest, plan.sha512, null); // cdn.modrinth.com seulement, SHA-512 vérifié
      return { ok: true, file: plan.file, dir: plan.dir };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  });
  handle(CHANNELS.projOpenLink, async (token) => {
    const url = d.links.url(token); // seulement une adresse HTTPS vue dans une réponse de Modrinth
    if (!url) return false;
    await d.openExternal(url);
    return true;
  });
}

/** Modpacks d'événements : seuls les packs de ressources et les shaders du joueur se modifient. */
export function registerEventIpc(handle: Handle, d: LookDeps): void {
  const target = async (id: unknown) => {
    const inst = d.instances()?.target(id);
    const m = inst ? await readEventManifest(inst.folder) : null;
    return inst && m ? { folder: inst.path, root: inst.folder, m } : null;
  };
  const run = async (id: unknown, fn: (t: { folder: string; m: EventManifest }) => Promise<void>) => {
    const t = await target(id);
    if (!t) return { ok: false, message: "Ce n'est pas un modpack d'événement." };
    try {
      await fn(t);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof EventLockError ? e.message : "Opération impossible." };
    }
  };
  handle(CHANNELS.eventInfo, async (id) => {
    const t = await target(id);
    if (!t) return null;
    return {
      name: t.m.name,
      resourcepacks: await listPacks(t.folder, t.m, "resourcepack"),
      shaders: await listPacks(t.folder, t.m, "shader"),
      shader: await currentShader(t.folder),
      defaultShader: t.m.defaultShader,
    };
  });
  handle(CHANNELS.eventSetPack, async (id, name, on) => run(id, (t) => setResourcePack(t.folder, t.m, name, on === true)));
  handle(CHANNELS.eventSetShader, async (id, name) => run(id, (t) => setShader(t.folder, name === null ? null : name)));
  handle(CHANNELS.eventRemove, async (id, kind, name) => run(id, (t) => removePack(t.folder, t.m, kind, name, d.trash)));
}

export function registerLookIpc(handle: Handle, d: LookDeps): void {
  registerEventIpc(handle, d);
  handle(CHANNELS.createInstance, async (req) => {
    const c = cleanCreate(req);
    const inst = d.instances();
    if (!c || !inst) return { ok: false, reason: "invalid" } satisfies CreateInstanceResult;
    const o = (typeof req === "object" && req !== null ? req : {}) as Record<string, unknown>;
    const icon = "icon" in o ? cleanIcon(o["icon"]) : null;
    if (icon === undefined) return { ok: false, reason: "invalid" } satisfies CreateInstanceResult;
    const r = await createCustomInstance(d.instancesDir(), c);
    if (!r.ok) return (r.reason === "exists" ? { ok: false, reason: "exists", name: r.name } : { ok: false, reason: "write-failed" }) satisfies CreateInstanceResult;
    await inst.list(true); // l'identifiant opaque de la nouvelle instance devient connu
    const id = InstanceService.idOf(r.folder, d.platform);
    if (icon) await inst.setLook(id, { icon }); // icône facultative : son échec ne défait pas l'instance
    return { ok: true, id } satisfies CreateInstanceResult;
  });

  handle(CHANNELS.editInstance, async (id, v) => {
    const e = cleanEdit(v);
    const inst = d.instances();
    if (!e || !inst) return { ok: false, reason: "invalid" } satisfies SettingResult;
    return inst.edit(id, e);
  });

  handle(CHANNELS.setIcon, async (id, v) => {
    const icon = cleanIcon(v);
    const inst = d.instances();
    if (icon === undefined || !inst) return { ok: false, reason: "invalid" } satisfies SettingResult;
    return inst.setLook(id, { icon });
  });

  handle(CHANNELS.importIcon, async () => {
    const media = d.media();
    if (!media) return { ok: false, message: "Indisponible." };
    const file = await d.pickImage("Choisir une image pour l'icône");
    if (!file) return { ok: false, canceled: true };
    try {
      return { ok: true, ...(await media.importIconSource(await readPicked(file))) };
    } catch (e) {
      return { ok: false, message: failMessage(e) };
    }
  });

  handle(CHANNELS.makeIcon, async (key, ext, crop) => {
    const media = d.media();
    const c = cleanCrop(crop);
    if (!media || !c) return { ok: false, message: "Recadrage invalide." };
    try {
      const file = await media.makeIcon(key, ext, c);
      return { ok: true, icon: { file } satisfies IconChoice, url: `app://wecraft/user/icons/${file}` };
    } catch (e) {
      return { ok: false, message: failMessage(e) };
    }
  });

  handle(CHANNELS.screenshots, async (id) => {
    const inst = d.instances()?.target(id);
    const media = d.media();
    if (!inst || !media) return [];
    return media.screenshots(inst.path, (dir) => readdir(dir));
  });

  handle(CHANNELS.setBackground, async (id, how, token) => {
    const inst = d.instances();
    const media = d.media();
    if (!inst || !media || !inst.target(id)) return { ok: false, message: "Instance introuvable." };
    try {
      let name: string | null;
      if (how === "clear") name = null;
      else if (how === "shot") name = await media.backgroundFromShot(token);
      else if (how === "import") {
        const file = await d.pickImage("Choisir une image de fond");
        if (!file) return { ok: false, canceled: true };
        name = await media.importBackground(await readPicked(file));
      } else return { ok: false, message: "Demande invalide." };
      const r = await inst.setLook(id, { background: name });
      if (!r.ok && r.reason === "locked") return { ok: false, message: "L'image de fond d'un événement est choisie par le staff : elle ne se remplace pas ici (Réglages > Apparence pour masquer les images de fond)." };
      return r.ok ? { ok: true, url: name ? `app://wecraft/user/backgrounds/${name}` : null } : { ok: false, message: "Réglage non enregistré." };
    } catch (e) {
      return { ok: false, message: failMessage(e) };
    }
  });
}
