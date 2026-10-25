// Liens externes vus dans les données Modrinth (description, liens officiels, licence).
// L'interface ne reçoit qu'un jeton ; le processus principal garde l'adresse, ne l'accepte qu'en HTTPS (sans
// identifiants dans l'adresse) et l'ouvre dans le navigateur de l'utilisateur, jamais dans ReLaunch.
import { randomBytes } from "node:crypto";

export function safeExternalUrl(url: unknown): string | null {
  if (typeof url !== "string" || url.length > 2048) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".")) return null;
    return u.href;
  } catch {
    return null;
  }
}

export class LinkStore {
  private readonly byToken = new Map<string, string>();
  private readonly byUrl = new Map<string, string>();

  /** Jeton d'une adresse HTTPS ; null si l'adresse est refusée. */
  token(url: unknown): string | null {
    const href = safeExternalUrl(url);
    if (!href) return null;
    const known = this.byUrl.get(href);
    if (known) return known;
    if (this.byToken.size > 20_000) {
      this.byToken.clear();
      this.byUrl.clear();
    }
    const t = randomBytes(12).toString("hex");
    this.byToken.set(t, href);
    this.byUrl.set(href, t);
    return t;
  }

  url(token: unknown): string | null {
    return typeof token === "string" && /^[0-9a-f]{24}$/.test(token) ? (this.byToken.get(token) ?? null) : null;
  }
}
