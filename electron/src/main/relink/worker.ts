// Client du Worker ReLink (API publique /launcher/*), côté processus principal uniquement.
// - Lecture seule : bootstrap, notifications (+ accusé de lecture). Aucune route /admin/*, aucun secret.
// - Identifiant d'installation : UUID tiré au hasard une fois, gardé dans .wecraft\relaunch_install.json
//   (sert aux cohortes de déploiement ; ce n'est PAS une identité de joueur).
// - Chaque réponse est décodée champ par champ (types, longueurs, valeurs permises) ; ce qui ne correspond
//   pas est ignoré. L'interface ne reçoit que ces objets nettoyés, jamais la réponse brute.
// - En cas d'échec réseau, la dernière réponse valide (cache disque horodaté) reste affichée, signalée
//   comme ancienne ; elle n'est jamais remplacée par des valeurs inventées.
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RelinkBootstrap, RelinkCard, RelinkEvent, RelinkModpack, RelinkNews, RelinkNotification, RelinkPartner, RelinkServer, RelinkSkin, RelinkState } from "../../shared/api";
import { checkUrl, fetchJson, HttpError, type NetOptions } from "../net/download";

export const WORKER_URL = "https://relink-auth.refugeemeraudien-direction.workers.dev";
export const WORKER_HOSTS: ReadonlySet<string> = new Set([new URL(WORKER_URL).host]);
export const CHANNELS_OK = ["stable", "beta", "interne"] as const;
export type ReleaseChannel = (typeof CHANNELS_OK)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9_.:-]{1,100}$/;
const MAX_JSON = 2 * 1024 * 1024;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown, max = 200): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
/** Texte nettoyé (caractères de contrôle retirés, longueur bornée) ; "" si absent. */
export function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}
const pick = (o: Obj, keys: string[], max = 200) => {
  for (const k of keys) {
    const s = str(o[k], max);
    if (s) return s;
  }
  return "";
};
const bool = (v: unknown) => v === true;
const num = (v: unknown, min = 0, max = 1e9) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 0);
const id = (v: unknown) => (typeof v === "string" && ID.test(v) ? v : "");
const date = (v: unknown) => {
  const s = str(v, 40);
  return s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : "";
};
/** Couleur CSS simple (#hex) ; autre chose est refusé. */
const color = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v.trim()) ? v.trim() : "");
const version = (v: unknown) => (typeof v === "string" && /^[0-9][0-9A-Za-z.+-]{0,39}$/.test(v.trim()) ? v.trim() : null);

/** Action d'ouverture d'une carte ou d'une notification : une page connue du launcher, ou rien. */
const VIEWS = new Set(["home", "wecraft", "relaunch", "welive", "live", "news", "discover", "favorites", "settings", "relink"]);
export function openTarget(v: unknown): string {
  const s = str(v, 40).toLowerCase();
  return VIEWS.has(s) ? s : "";
}

const tags = (v: unknown): { label: string; color: string }[] =>
  arr(v, 8)
    .map((t) => (Array.isArray(t) ? { label: str(t[0], 30), color: color(t[1]) } : typeof t === "string" ? { label: str(t, 30), color: "" } : { label: str(obj(t)["label"] ?? obj(t)["n"], 30), color: color(obj(t)["color"] ?? obj(t)["c"]) }))
    .filter((t) => t.label);

export function decodeNews(v: unknown): RelinkNews | null {
  const o = obj(v);
  const i = id(o["id"]);
  const title = pick(o, ["title", "t"], 160);
  if (!i || !title) return null;
  return { id: i, title, body: pick(o, ["body", "text"], 4000), date: pick(o, ["date", "d"], 60), tags: tags(o["tags"]), cta: pick(o, ["cta"], 40), open: openTarget(o["open"] ?? o["go"]) };
}
export function decodeCard(v: unknown): RelinkCard | null {
  const o = obj(v);
  const i = id(o["id"]);
  const title = pick(o, ["title", "t", "n"], 120);
  if (!i || !title) return null;
  return { id: i, title, text: pick(o, ["body", "text", "d", "desc"], 600), cta: pick(o, ["cta"], 40), open: openTarget(o["open"] ?? o["go"] ?? o["target"]), tag: pick(o, ["tag", "kind", "type"], 30) };
}
export function decodeServer(v: unknown): RelinkServer | null {
  const o = obj(v);
  const i = id(o["id"]);
  const n = pick(o, ["n", "name"], 80);
  if (!i || !n) return null;
  const st = str(o["state"], 20).toLowerCase();
  return {
    id: i,
    name: n,
    host: /^[A-Za-z0-9.-]{1,253}(:[0-9]{1,5})?$/.test(str(o["host"], 260)) ? str(o["host"], 260) : "",
    state: st === "online" || st === "offline" || st === "maintenance" ? st : "unknown",
    players: Math.round(num(o["players"], 0, 1e6)),
    max: Math.round(num(o["max"], 0, 1e6)),
    pack: id(o["pack"]),
    event: id(o["event"]),
    desc: pick(o, ["d", "desc", "description"], 200),
    version: pick(o, ["v", "version", "mc"], 20),
  };
}
export function decodeEvent(v: unknown): RelinkEvent | null {
  const o = obj(v);
  const i = id(o["id"]);
  const n = pick(o, ["n", "name", "title"], 100);
  if (!i || !n) return null;
  return { id: i, name: n, desc: pick(o, ["d", "desc", "description", "body"], 1000), status: pick(o, ["status", "state"], 20), start: date(o["start"] ?? o["startsAt"] ?? o["date"]), end: date(o["end"] ?? o["endsAt"]), server: id(o["server"]), pack: id(o["pack"] ?? o["modpack"]) };
}
export function decodePartner(v: unknown): RelinkPartner | null {
  const o = obj(v);
  const i = id(o["id"]);
  const n = pick(o, ["n", "name"], 60);
  if (!i || !n) return null;
  const ch = str(o["ch"], 40);
  return { id: i, name: n, channel: /^[A-Za-z0-9_]{1,40}$/.test(ch) ? ch : "", category: pick(o, ["cat", "category"], 40), featured: bool(o["featured"]), live: bool(o["live"]), viewers: Math.round(num(o["viewers"], 0, 1e8)) };
}
export function decodeModpack(v: unknown): RelinkModpack | null {
  const o = obj(v);
  const i = id(o["id"]);
  const n = pick(o, ["n", "name", "title"], 100);
  if (!i || !n) return null;
  return { id: i, name: n, desc: pick(o, ["d", "desc", "description"], 600), mc: pick(o, ["mc", "v", "minecraft"], 20), loader: pick(o, ["loader", "l"], 40), version: pick(o, ["version", "latest"], 40) };
}
/** Fichier téléchargeable annoncé par le Worker (route /launcher/assets/{id}), avec son empreinte. */
function decodeAsset(v: unknown): RelinkSkin["file"] {
  const o = obj(v);
  const i = id(o["id"]);
  const sha256 = typeof o["sha256"] === "string" && /^[0-9a-f]{64}$/i.test(o["sha256"]) ? o["sha256"].toLowerCase() : "";
  if (!i || !sha256) return null;
  return { id: i, sha256, size: Math.round(num(o["size"], 0, 64 * 1024 * 1024)), version: str(o["version"], 40) };
}
export function decodeSkin(v: unknown): RelinkSkin | null {
  const o = obj(v);
  const i = id(o["id"]);
  const n = pick(o, ["n", "name"], 60);
  if (!i || !n) return null;
  const u = obj(o["unlock"]);
  const vs = obj(o["versions"]);
  return {
    id: i,
    name: n,
    desc: pick(o, ["d", "desc", "description"], 400),
    unlock: { event: bool(u["event"]), shop: Math.round(num(u["shop"], 0, 1e7)), achievement: bool(u["achievement"]), premium: bool(u["premium"]) },
    versions: { liquidGlass: bool(vs["liquidGlass"]), mat: bool(vs["mat"]) },
    followsTheme: bool(o["followsTheme"]),
    file: decodeAsset(o["file"] ?? o["asset"]),
  };
}
export function decodeNotification(v: unknown): RelinkNotification | null {
  const o = obj(v);
  const i = id(o["id"]);
  const title = pick(o, ["title", "t"], 160);
  if (!i || !title) return null;
  return { id: i, title, body: pick(o, ["body", "text"], 1000), open: openTarget(o["open"]), at: date(o["sendAt"] ?? o["createdAt"] ?? o["date"]) };
}

const list = <T>(v: unknown, f: (x: unknown) => T | null, max = 100): T[] => arr(v, max).map(f).filter((x): x is T => x !== null);

export function decodeBootstrap(v: unknown): RelinkBootstrap {
  const o = obj(v);
  if (o["schemaVersion"] !== 1) throw new Error("Format de réponse du Worker inconnu.");
  const m = obj(o["maintenance"]);
  const up = obj(o["updates"]);
  const ch = obj(up["channel"]);
  const rel = ch["release"] === null || ch["release"] === undefined ? null : obj(ch["release"]);
  const car = obj(o["carousel"]);
  const level = str(m["level"], 10);
  return {
    generatedAt: date(o["generatedAt"]),
    maintenance: { enabled: bool(m["enabled"]), level: level === "warn" || level === "danger" || level === "critical" ? level : "info", text: str(m["text"], 500), blockLaunch: bool(m["blockLaunch"]) },
    updates: {
      kill: bool(up["kill"]),
      minVersion: version(up["minVersion"] ?? up["minimumVersion"]),
      blockOld: up["blockOld"] !== false,
      latest: version(ch["version"]),
      paused: bool(ch["paused"]),
      // une release absente = aucune mise à jour proposée à cette installation
      release: rel ? { version: version(rel["version"]) ?? "", mandatory: bool(rel["mandatory"]), sha256: str(rel["sha256"], 64) } : null,
    },
    carousel: { count: Math.round(num(car["count"], 0, 5)) || 3, autoplay: car["autoplay"] !== false, speedSeconds: Math.round(num(car["speedSeconds"], 3, 60)) || 7 },
    flags: list(o["flags"], (f) => {
      const x = obj(f);
      const k = str(x["key"], 60);
      return k && /^[A-Za-z0-9_.-]+$/.test(k) && x["enabled"] === true ? k : null; // un flag « enabled: false » est ignoré
    }),
    cards: list(o["cards"], decodeCard, 20),
    news: list(o["news"], decodeNews, 50),
    skins: list(o["skins"], decodeSkin, 50),
    modpacks: list(o["modpacks"], decodeModpack, 100),
    servers: list(o["servers"], decodeServer, 100),
    events: list(o["events"], decodeEvent, 50),
    partners: list(o["partners"], decodePartner, 100),
  };
}

export interface WorkerDeps {
  dataDir: string;
  net?: NetOptions;
  userAgent: string;
  now?: () => number;
}

/** Erreur lisible pour l'interface (jamais la réponse brute). */
export function explainWorkerError(e: unknown): string {
  if (e instanceof HttpError) return e.status >= 500 ? `Le service ReLink répond mal (erreur ${e.status}).` : `Le service ReLink a refusé la demande (erreur ${e.status}).`;
  const m = e instanceof Error ? e.message : String(e);
  if (/abort|timeout/i.test(m)) return "Le service ReLink ne répond pas (délai dépassé).";
  if (/Format de réponse/.test(m)) return m;
  return "Service ReLink injoignable : vérifiez la connexion.";
}

export class RelinkClient {
  private installId: string | null = null;
  private state: RelinkState = { ok: false, stale: true, fetchedAt: null, error: null, data: null };
  private inflight: Promise<RelinkState> | null = null;
  private readonly now: () => number;
  constructor(private readonly d: WorkerDeps) {
    this.now = d.now ?? Date.now;
  }

  private get cacheFile() {
    return path.join(this.d.dataDir, "cache", "relink_bootstrap.json");
  }
  private get inboxFile() {
    return path.join(this.d.dataDir, "cache", "relink_notifications.json");
  }

  /** UUID de cette installation : créé une fois, jamais renouvelé (sauf fichier illisible). */
  async install(): Promise<string> {
    if (this.installId) return this.installId;
    const f = path.join(this.d.dataDir, "relaunch_install.json");
    try {
      const v = obj(JSON.parse(await readFile(f, "utf8")))["installId"];
      if (typeof v === "string" && UUID.test(v)) return (this.installId = v.toLowerCase());
    } catch {
      // pas encore créé
    }
    const idv = randomUUID();
    await mkdir(this.d.dataDir, { recursive: true });
    await writeAtomic(f, JSON.stringify({ installId: idv, note: "Identifiant d'installation ReLaunch (pas un compte) : cohortes de déploiement du service ReLink." }, null, 2));
    return (this.installId = idv);
  }

  private opts(): NetOptions {
    return { ...this.d.net, allowedHosts: WORKER_HOSTS, signal: AbortSignal.timeout(12000), headers: { "User-Agent": this.d.userAgent, Accept: "application/json" } };
  }

  /** Dernier état connu (cache), sans réseau. */
  async cached(): Promise<RelinkState> {
    if (this.state.data) return this.state;
    try {
      const c = obj(JSON.parse(await readFile(this.cacheFile, "utf8")));
      const data = decodeBootstrap(c["raw"]);
      this.state = { ok: true, stale: true, fetchedAt: typeof c["fetchedAt"] === "number" ? c["fetchedAt"] : null, error: null, data };
    } catch {
      // pas de cache
    }
    return this.state;
  }

  /** Bootstrap du Worker (toutes les données publiques du launcher). `force` : ignorer le délai de 60 s. */
  async refresh(channel: ReleaseChannel = "stable", force = false): Promise<RelinkState> {
    if (this.inflight) return this.inflight;
    if (!force && this.state.fetchedAt && !this.state.stale && this.now() - this.state.fetchedAt < 60_000) return this.state;
    this.inflight = (async () => {
      await this.cached();
      try {
        const inst = await this.install();
        const raw = await fetchJson(`${WORKER_URL}/launcher/bootstrap?channel=${channel}&installId=${inst}`, MAX_JSON, {}, this.opts());
        const data = decodeBootstrap(raw);
        const at = this.now();
        this.state = { ok: true, stale: false, fetchedAt: at, error: null, data };
        await mkdir(path.dirname(this.cacheFile), { recursive: true });
        await writeAtomic(this.cacheFile, JSON.stringify({ fetchedAt: at, raw })).catch(() => undefined);
      } catch (e) {
        this.state = { ...this.state, ok: !!this.state.data, stale: true, error: explainWorkerError(e) };
      }
      return this.state;
    })().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  /** Règles imposées par l'administration, d'après le dernier état connu (même ancien). */
  policy(): { blockLaunch: boolean; maintenanceText: string; updatesKilled: boolean } {
    const d = this.state.data;
    return { blockLaunch: !!d?.maintenance.enabled && d.maintenance.blockLaunch, maintenanceText: d?.maintenance.text ?? "", updatesKilled: !!d?.updates.kill };
  }

  /**
   * Notifications : relève les nouvelles, les ENREGISTRE dans la boîte locale, puis seulement envoie l'accusé
   * de lecture (ACK) au Worker. Renvoie la boîte (les plus récentes d'abord).
   */
  async notifications(channel: ReleaseChannel = "stable"): Promise<{ items: RelinkNotification[]; error: string | null }> {
    const box = await this.inbox();
    let error: string | null = null;
    try {
      const inst = await this.install();
      const raw = obj(await fetchJson(`${WORKER_URL}/launcher/notifications?deviceId=${inst}&channel=${channel}`, MAX_JSON, {}, this.opts()));
      const fresh = list(raw["notifications"], decodeNotification, 50).filter((n) => !box.some((b) => b.id === n.id));
      if (fresh.length) {
        const next = [...fresh.map((n) => ({ ...n, at: n.at || new Date(this.now()).toISOString() })), ...box].slice(0, 100);
        await mkdir(path.dirname(this.inboxFile), { recursive: true });
        await writeAtomic(this.inboxFile, JSON.stringify(next));
        box.splice(0, box.length, ...next);
        for (const n of fresh) await this.ack(n.id, inst).catch(() => undefined); // redemandé au prochain relevé si l'ACK échoue
      }
    } catch (e) {
      error = explainWorkerError(e);
    }
    return { items: box, error };
  }

  private async inbox(): Promise<RelinkNotification[]> {
    try {
      return list(JSON.parse(await readFile(this.inboxFile, "utf8")), decodeNotification, 100);
    } catch {
      return [];
    }
  }

  private async ack(notificationId: string, deviceId: string): Promise<void> {
    const url = checkUrl(`${WORKER_URL}/launcher/notifications/${encodeURIComponent(notificationId)}/ack`, WORKER_HOSTS).href;
    const f = this.d.net?.fetch as unknown as typeof fetch | undefined;
    const res = await (f ?? fetch)(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/json", "User-Agent": this.d.userAgent },
      body: JSON.stringify({ deviceId }),
    });
    await res.body?.cancel().catch(() => undefined);
    if (!res.ok) throw new HttpError(url, res.status);
  }

  /** Adresse d'un fichier annoncé par le Worker (jamais une adresse fournie par l'interface). */
  assetUrl(assetId: string, signature = false): string {
    if (!ID.test(assetId)) throw new Error("Identifiant de fichier invalide.");
    return `${WORKER_URL}/launcher/assets/${encodeURIComponent(assetId)}${signature ? "?signature=1" : ""}`;
  }
}

async function writeAtomic(file: string, text: string): Promise<void> {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, text, "utf8");
  await rename(tmp, file);
}
