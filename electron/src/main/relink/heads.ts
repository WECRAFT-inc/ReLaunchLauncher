/**
 * Skin public d'un compte Minecraft (pour afficher sa vraie tête) : profil Mojang → texture officielle.
 * Seuls sessionserver.mojang.com et textures.minecraft.net sont contactés, en HTTPS, sans redirection ;
 * l'image doit être un PNG de skin valide. Résultat gardé en mémoire (y compris « pas de skin ») pour ne pas
 * interroger Mojang à chaque affichage.
 */
import { checkSkinPng } from "./account";

export interface HeadsDeps {
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
}
