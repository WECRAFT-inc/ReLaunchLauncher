// Canaux IPC de la grosse mise à jour : réglages d'une instance, icônes, fonds, captures, images.
// Chaque gestionnaire est enregistré par `handle`, qui vérifie l'expéditeur (fenêtre principale, app://wecraft)
// AVANT d'appeler la fonction. Toutes les valeurs reçues sont vérifiées ici : l'interface ne fournit jamais
// de chemin, seulement des identifiants opaques et des valeurs contrôlées.
import { readFile, readdir, stat } from "node:fs/promises";
import type { CreateInstanceResult, IconChoice, InstanceEdit, SettingResult } from "../shared/api";
import { CHANNELS } from "../shared/channels";
import { cleanCreate, createCustomInstance } from "./instances/create";
import { parseIconMeta, type IconMeta } from "./instances/detect";
import { InstanceService } from "./instances/service";
import type { LinkStore } from "./links";
import { MAX_IMPORT, MediaError, MediaStore, type Crop } from "./media/media";
import { cleanProjectQuery, getProject, getVersions, searchProjects } from "./modpacks/projects";
import type { ModpackService } from "./modpacks/service";

export type Handle = (channel: string, fn: (...args: unknown[]) => Promise<unknown>) => void;

export interface LookDeps {
  instances: () => InstanceService | null;
  media: () => MediaStore | null;
  instancesDir: () => string;
  platform: NodeJS.Platform;
  /** Fenêtre « Ouvrir » du système (une image) ; null si annulée. */
  pickImage: (title: string) => Promise<string | null>;
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
  media: () => MediaStore | null;
  links: LinkStore;
  openExternal: (url: string) => Promise<void>;
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
  handle(CHANNELS.projOpenLink, async (token) => {
    const url = d.links.url(token); // seulement une adresse HTTPS vue dans une réponse de Modrinth
    if (!url) return false;
    await d.openExternal(url);
    return true;
  });
}

export function registerLookIpc(handle: Handle, d: LookDeps): void {
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
      return r.ok ? { ok: true, url: name ? `app://wecraft/user/backgrounds/${name}` : null } : { ok: false, message: "Réglage non enregistré." };
    } catch (e) {
      return { ok: false, message: failMessage(e) };
    }
  });
}
