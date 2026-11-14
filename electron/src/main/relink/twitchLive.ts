// Détection des lives Twitch des partenaires, faite par le launcher lui-même (sans clé d'API).
//
// Le Worker ReLink peut déjà indiquer `live` / `viewers` (API Helix, avec ses secrets Twitch). Tant qu'il ne le
// fait pas, ou s'il se trompe dans le sens « hors ligne », le launcher vérifie chaque chaîne renseignée :
// Twitch publie l'aperçu d'un direct à une adresse fixe ; une chaîne hors ligne y est redirigée vers une image
// « 404_preview ». Une seule requête donne donc l'état ET la miniature, sans compte ni secret.
//
// - Seules les chaînes au format Twitch (lettres, chiffres, _) sont interrogées, sur un hôte fixe.
// - Pas de nombre de spectateurs avec cette méthode : `viewers` reste celui du Worker (0 si inconnu).
// - En cas d'erreur réseau, l'état du Worker est gardé tel quel (jamais de « en direct » inventé).
import type { RelinkPartner, RelinkState } from "../../shared/api";

export const TWITCH_PREVIEW_HOST = "static-cdn.jtvnw.net";
const LOGIN = /^[A-Za-z0-9_]{1,40}$/;
/** Durée pendant laquelle un relevé est réutilisé (le launcher relève les partenaires toutes les 2 min). */
export const LIVE_TTL_MS = 90_000;
const MAX_THUMB = 1024 * 1024;
const CONCURRENCY = 4;

type FetchLike = (url: string, init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> }) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export interface LiveCheck {
  live: boolean;
  /** Miniature du direct en data: (seulement si en direct). */
  thumb: string | null;
  at: number;
}

export interface TwitchLiveDeps {
  fetch?: FetchLike;
  userAgent: string;
  now?: () => number;
  log?: (line: string) => void;
}

export function previewUrl(login: string): string {
  return `https://${TWITCH_PREVIEW_HOST}/previews-ttv/live_user_${login.toLowerCase()}-320x180.jpg`;
}

export class TwitchLiveDetector {
  private readonly cache = new Map<string, LiveCheck>();
  private readonly inflight = new Map<string, Promise<LiveCheck | null>>();
  private readonly now: () => number;
  constructor(private readonly d: TwitchLiveDeps) {
    this.now = d.now ?? Date.now;
  }

  /** État d'une chaîne : en direct, hors ligne, ou null si inconnu (erreur, réponse inattendue). */
  async check(channel: string): Promise<LiveCheck | null> {
    if (!LOGIN.test(channel)) return null;
    const key = channel.toLowerCase();
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < LIVE_TTL_MS) return hit;
    const running = this.inflight.get(key);
    if (running) return running;
    const p = this.fetchState(key).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async fetchState(login: string): Promise<LiveCheck | null> {
    const f: FetchLike = this.d.fetch ?? ((u, init) => fetch(u, init) as unknown as ReturnType<FetchLike>);
    try {
      const res = await f(previewUrl(login), { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "User-Agent": this.d.userAgent, Accept: "image/*" } });
      let r: LiveCheck | null = null;
      if (res.status >= 300 && res.status < 400) {
        // hors ligne : Twitch redirige vers son image « 404_preview »
        r = { live: false, thumb: null, at: this.now() };
      } else if (res.status === 200) {
        const type = (res.headers.get("content-type") || "").split(";")[0]!.trim().toLowerCase();
        const buf = Buffer.from(await res.arrayBuffer());
        if (/^image\/(jpe?g|png|webp)$/.test(type) && buf.length > 0 && buf.length <= MAX_THUMB) {
          r = { live: true, thumb: `data:${type};base64,${buf.toString("base64")}`, at: this.now() };
        }
      } else if (res.status === 404) {
        r = { live: false, thumb: null, at: this.now() };
      }
      if (r) this.cache.set(login, r);
      else this.d.log?.(`Live Twitch ${login} : réponse inattendue (${res.status}).`);
      return r;
    } catch (e) {
      this.d.log?.(`Live Twitch ${login} : relevé impossible (${(e as Error).message}).`);
      return null;
    }
  }

  /** Miniature du dernier relevé « en direct » d'une chaîne, sans réseau. */
  thumbOf(channel: string): string | null {
    const c = this.cache.get(channel.toLowerCase());
    return c?.live ? c.thumb : null;
  }

  /**
   * Complète l'état ReLink : un partenaire avec une chaîne Twitch passe « en direct » si Twitch le confirme.
   * Ce que le Worker dit « en direct » est gardé (il peut connaître YouTube ou le nombre de spectateurs).
   */
  async apply(st: RelinkState): Promise<RelinkState> {
    const partners = st.data?.partners;
    if (!st.data || !partners?.length) return st;
    const channels = [...new Set(partners.filter((p) => !p.live && p.channel).map((p) => p.channel.toLowerCase()))];
    const results = new Map<string, LiveCheck | null>();
    for (let i = 0; i < channels.length; i += CONCURRENCY) {
      const batch = channels.slice(i, i + CONCURRENCY);
      const got = await Promise.all(batch.map((c) => this.check(c)));
      batch.forEach((c, k) => results.set(c, got[k] ?? null));
    }
    let changed = false;
    const next: RelinkPartner[] = partners.map((p) => {
      if (p.live || !p.channel) return p;
      const r = results.get(p.channel.toLowerCase());
      if (!r?.live) return p;
      changed = true;
      return { ...p, live: true, thumb: true, liveSource: "twitch" };
    });
    return changed ? { ...st, data: { ...st.data, partners: next } } : st;
  }
}
