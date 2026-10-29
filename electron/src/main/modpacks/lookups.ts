// Recherches par empreinte pour l'export d'un pack partagé : aucun fichier n'est envoyé, seulement des SHA.
import { checkUrl, type NetOptions } from "../net/download";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});

async function postJson(url: string, body: unknown, hosts: ReadonlySet<string>, userAgent: string, net: NetOptions): Promise<unknown> {
  const f = (net.fetch as unknown as typeof fetch | undefined) ?? fetch;
  const res = await f(checkUrl(url, hosts).href, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: { "Content-Type": "application/json", "User-Agent": userAgent, Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`HTTP ${res.status}`);
  }
  const text = await res.text();
  if (text.length > 16 * 1024 * 1024) throw new Error("réponse trop volumineuse");
  return JSON.parse(text) as unknown;
}

/** Modrinth /version_files (SHA-1) -> fichier exact { url cdn.modrinth.com, sha512 }. */
export async function modrinthByHash(sha1s: string[], userAgent: string, net: NetOptions = {}): Promise<Record<string, { url: string; sha512: string }>> {
  const out: Record<string, { url: string; sha512: string }> = {};
  const list = [...new Set(sha1s.filter((h) => /^[0-9a-f]{40}$/.test(h)))];
  for (let i = 0; i < list.length; i += 500) {
    const d = obj(await postJson("https://api.modrinth.com/v2/version_files", { hashes: list.slice(i, i + 500), algorithm: "sha1" }, new Set(["api.modrinth.com"]), userAgent, net));
    for (const [sha1, v] of Object.entries(d)) {
      const files = Array.isArray(obj(v)["files"]) ? (obj(v)["files"] as unknown[]) : [];
      const f = obj(files.find((x) => obj(obj(x)["hashes"])["sha1"] === sha1));
      const h = obj(f["hashes"]);
      const url = typeof f["url"] === "string" ? f["url"] : "";
      try {
        if (typeof h["sha512"] === "string" && /^[0-9a-f]{128}$/.test(h["sha512"]) && new URL(url).hostname === "cdn.modrinth.com" && new URL(url).protocol === "https:") out[sha1] = { url, sha512: h["sha512"] };
      } catch {
        // adresse ignorée
      }
    }
  }
  return out;
}

/** Mods hébergés par WeCraft (Worker /launcher/pack-files/lookup, SHA-512) -> adresse du Worker. */
export async function hostedByHash(sha512s: string[], workerUrl: string, workerHosts: ReadonlySet<string>, userAgent: string, net: NetOptions = {}): Promise<Record<string, { url: string }>> {
  const list = [...new Set(sha512s.filter((h) => /^[0-9a-f]{128}$/.test(h)))].slice(0, 1000);
  if (!list.length) return {};
  const d = obj(obj(await postJson(`${workerUrl}/launcher/pack-files/lookup`, { sha512: list }, workerHosts, userAgent, net))["files"]);
  const out: Record<string, { url: string }> = {};
  for (const [sha512, v] of Object.entries(d)) {
    const url = typeof obj(v)["url"] === "string" ? (obj(v)["url"] as string) : "";
    try {
      const u = new URL(url);
      if (u.protocol === "https:" && workerHosts.has(u.host) && /^\/launcher\/assets\/[A-Za-z0-9_.:-]{1,100}$/.test(u.pathname)) out[sha512] = { url: u.href };
    } catch {
      // adresse ignorée
    }
  }
  return out;
}
