/**
 * Skin public d'un compte Minecraft (pour afficher sa vraie tête) : profil Mojang → texture officielle.
 * Seuls sessionserver.mojang.com et textures.minecraft.net sont contactés, en HTTPS, sans redirection ;
 * l'image doit être un PNG de skin valide. Résultat gardé en mémoire (y compris « pas de skin ») pour ne pas
 * interroger Mojang à chaque affichage.
 */
import { checkSkinPng } from "./account";

export interface HeadsDeps {
  /** Adresse du Worker ReLink (skins envoyés par les joueurs). */
  workerUrl?: string;
  fetch?: typeof fetch;
  now?: () => number;
  userAgent?: string;
}

const UUID = /^[0-9a-f]{32}$/;
const TTL_OK = 60 * 60 * 1000;
const TTL_NONE = 10 * 60 * 1000;

/** Identifiant Minecraft sans tirets, en minuscules (null si invalide). */
export function cleanUuid(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const u = v.replace(/-/g, "").toLowerCase();
  return UUID.test(u) ? u : null;
}

/** Adresse de la texture du skin dans la réponse du profil Mojang (null si absente ou hors du serveur officiel). */
export function skinUrlFromProfile(p: unknown): string | null {
  const props = (p as { properties?: unknown } | null)?.properties;
  if (!Array.isArray(props)) return null;
  const tex = props.find((x) => (x as { name?: unknown })?.name === "textures") as { value?: unknown } | undefined;
  if (!tex || typeof tex.value !== "string" || tex.value.length > 8000) return null;
  try {
    const d = JSON.parse(Buffer.from(tex.value, "base64").toString("utf8")) as { textures?: { SKIN?: { url?: unknown } } };
    const raw = d.textures?.SKIN?.url;
    if (typeof raw !== "string") return null;
    const u = new URL(raw.replace(/^http:\/\//, "https://"));
    if (u.protocol !== "https:" || u.hostname !== "textures.minecraft.net" || u.port || u.username || !/^\/texture\/[0-9a-f]{20,80}$/.test(u.pathname)) return null;
    return u.href;
  } catch {
    return null;
  }
}

export class SkinHeads {
  private readonly cache = new Map<string, { at: number; img: string | null }>();
  private readonly busy = new Map<string, Promise<string | null>>();
  constructor(private readonly d: HeadsDeps = {}) {}

  private now(): number {
    return this.d.now ? this.d.now() : Date.now();
  }

  /** Skin (data:image/png) du compte, ou null (pas de skin personnalisé, réseau coupé…). */
  async forUuid(uuid0: unknown): Promise<string | null> {
    const uuid = cleanUuid(uuid0);
    if (!uuid) return null;
    const c = this.cache.get(uuid);
    if (c && this.now() - c.at < (c.img ? TTL_OK : TTL_NONE)) return c.img;
    const running = this.busy.get(uuid);
    if (running) return running;
    const p = this.load(uuid)
      .then(
        (img) => {
          this.cache.set(uuid, { at: this.now(), img });
          return img;
        },
        () => {
          // panne réseau : on garde l'ancienne image si on en avait une
          const img = c?.img ?? null;
          this.cache.set(uuid, { at: this.now(), img });
          return img;
        },
      )
      .finally(() => this.busy.delete(uuid));
    this.busy.set(uuid, p);
    return p;
  }

  private async load(uuid: string): Promise<string | null> {
    const f = this.d.fetch ?? fetch;
    const headers = { "User-Agent": this.d.userAgent ?? "ReLaunch", Accept: "application/json" };
    const r = await f(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`, { redirect: "error", signal: AbortSignal.timeout(8000), headers });
    if (r.status === 204 || r.status === 404) return null;
    if (!r.ok) throw new Error(`profil ${r.status}`);
    const text = await r.text();
    if (text.length > 20000) return null;
    const url = skinUrlFromProfile(JSON.parse(text));
    if (!url) return null;
    const t = await f(url, { redirect: "error", signal: AbortSignal.timeout(8000), headers: { "User-Agent": headers["User-Agent"] } });
    if (!t.ok) throw new Error(`texture ${t.status}`);
    const buf = Buffer.from(await t.arrayBuffer());
    if (checkSkinPng(buf)) return null;
    return `data:image/png;base64,${buf.toString("base64")}`;
  }

  /**
   * Skin d'un joueur d'après son pseudo Minecraft (fiche d'un ami) : skin envoyé à ReLink s'il en a un, sinon
   * son skin Mojang. `model` : « slim » si connu.
   */
  async forName(name0: unknown): Promise<{ skin: string; model?: "classic" | "slim" } | null> {
    if (typeof name0 !== "string" || !/^[A-Za-z0-9_]{3,16}$/.test(name0)) return null;
    const name = name0.toLowerCase();
    const c = this.byName.get(name);
    if (c && this.now() - c.at < (c.v ? TTL_OK : TTL_NONE)) return c.v;
    let v: { skin: string; model?: "classic" | "slim" } | null = null;
    try {
      v = await this.relinkSkin(name);
      if (!v) {
        const f = this.d.fetch ?? fetch;
        const r = await f(`https://api.mojang.com/users/profiles/minecraft/${name}`, { redirect: "error", signal: AbortSignal.timeout(8000), headers: { "User-Agent": this.d.userAgent ?? "ReLaunch", Accept: "application/json" } });
        if (r.ok) {
          const id = cleanUuid(((await r.json()) as { id?: unknown })?.id);
          const skin = id ? await this.forUuid(id) : null;
          if (skin) v = { skin };
        }
      }
    } catch {
      v = c?.v ?? null;
    }
    if (this.byName.size > 300) this.byName.clear();
    this.byName.set(name, { at: this.now(), v });
    return v;
  }
  private readonly byName = new Map<string, { at: number; v: { skin: string; model?: "classic" | "slim" } | null }>();

  /** Skin envoyé à ReLink (format CustomSkinAPI du Worker : /launcher/mcskin/csl/<pseudo> puis la texture). */
  private async relinkSkin(name: string): Promise<{ skin: string; model?: "classic" | "slim" } | null> {
    if (!this.d.workerUrl) return null;
    const f = this.d.fetch ?? fetch;
    const r = await f(`${this.d.workerUrl}/launcher/mcskin/csl/${name}`, { redirect: "error", signal: AbortSignal.timeout(8000), headers: { "User-Agent": this.d.userAgent ?? "ReLaunch", Accept: "application/json" } });
    if (!r.ok) return null;
    const skins = ((await r.json()) as { skins?: Record<string, unknown> })?.skins ?? {};
    const slim = typeof skins["slim"] === "string" && /^[0-9a-f]{64}$/.test(skins["slim"]);
    const sha = slim ? (skins["slim"] as string) : typeof skins["default"] === "string" && /^[0-9a-f]{64}$/.test(skins["default"]) ? (skins["default"] as string) : null;
    if (!sha) return null;
    const t = await f(`${this.d.workerUrl}/launcher/mcskin/textures/${sha}`, { redirect: "error", signal: AbortSignal.timeout(8000), headers: { "User-Agent": this.d.userAgent ?? "ReLaunch" } });
    if (!t.ok) return null;
    const buf = Buffer.from(await t.arrayBuffer());
    if (checkSkinPng(buf)) return null;
    return { skin: `data:image/png;base64,${buf.toString("base64")}`, model: slim ? "slim" : "classic" };
  }
}
