/**
 * Statistiques de jeu, gardées sur ce PC uniquement (play-stats.dat dans le dossier de données) :
 * temps de jeu cumulé, lancements, instances les plus jouées, jours joués, plus longue session,
 * amis avec qui on a le plus joué (même event ou même modpack ReLink au même moment).
 *
 * Le temps est compté par tranches (tick toutes les minutes environ, plafonnées) : un PC mis en veille
 * pendant une partie ne gonfle pas les chiffres.
 *
 * Le fichier est chiffré et authentifié par le système (safeStorage : DPAPI + AES-GCM sous Windows) : il est
 * illisible et toute modification à la main le rend invalide. Un fichier modifié est mis de côté
 * (play-stats.dat.modifie) et les stats repartent de zéro : retoucher le fichier fait perdre ses stats.
 */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PlayStatsView } from "../../shared/api";
import type { SecretBox } from "../relink/account";

export interface StatGame {
  /** Instance locale (identifiant stable). */
  key: string;
  name: string;
  mc: string;
  /** Event ou modpack ReLink de la partie (« pack:id » / « event:id »), pour reconnaître les amis dans la même partie. */
  group: string | null;
}

interface Data {
  v: 1;
  since: number | null;
  total: number;
  launches: number;
  sessions: number;
  longest: number;
  days: Record<string, number>;
  inst: Record<string, { name: string; mc: string; sec: number; launches: number; last: number }>;
  friends: Record<string, { name: string; sec: number }>;
}

export interface PlayStatsDeps {
  dataDir: string;
  now?: () => number;
  /** Chiffrement du système (safeStorage). Indisponible : les stats restent en mémoire, jamais écrites en clair. */
  secrets: SecretBox;
  fs?: { readFile: (f: string) => Promise<Buffer | string>; writeFile: (f: string, d: Buffer) => Promise<void>; rename: (a: string, b: string) => Promise<void>; mkdir: (d: string) => Promise<unknown>; rm?: (f: string) => Promise<void> };
}

/** En-tête du fichier : format reconnu avant d'essayer de le déchiffrer. */
const MAGIC = Buffer.from("RLSTAT1\n", "latin1");

/** Plus grande tranche comptée entre deux ticks (au-delà : veille, PC figé…). */
const MAX_SLICE = 3 * 60;
const KEEP_DAYS = 400;
const MAX_INST = 300;
const MAX_FRIENDS = 300;

const empty = (): Data => ({ v: 1, since: null, total: 0, launches: 0, sessions: 0, longest: 0, days: {}, inst: {}, friends: {} });

/** Jour local (AAAA-MM-JJ). */
export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const nonNeg = (v: unknown, max = 1e10): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.floor(v)) : 0);
const text = (v: unknown, n: number): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, n) : "");

function clean(raw: unknown): Data {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = empty();
  d.since = typeof o["since"] === "number" && Number.isFinite(o["since"]) ? o["since"] : null;
  d.total = nonNeg(o["total"]);
  d.launches = nonNeg(o["launches"]);
  d.sessions = nonNeg(o["sessions"]);
  d.longest = nonNeg(o["longest"]);
  const days = (o["days"] ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(days)) if (/^\d{4}-\d{2}-\d{2}$/.test(k)) d.days[k] = nonNeg(v, 86400 * 2);
  const inst = (o["inst"] ?? {}) as Record<string, unknown>;
  for (const [k, v0] of Object.entries(inst).slice(0, MAX_INST)) {
    const v = (v0 ?? {}) as Record<string, unknown>;
    if (k.length <= 200) d.inst[k] = { name: text(v["name"], 80) || "Instance", mc: text(v["mc"], 24), sec: nonNeg(v["sec"]), launches: nonNeg(v["launches"]), last: nonNeg(v["last"], 1e14) };
  }
  const fr = (o["friends"] ?? {}) as Record<string, unknown>;
  for (const [k, v0] of Object.entries(fr).slice(0, MAX_FRIENDS)) {
    const v = (v0 ?? {}) as Record<string, unknown>;
    if (/^\d{5,25}$/.test(k)) d.friends[k] = { name: text(v["name"], 64) || "Ami", sec: nonNeg(v["sec"]) };
  }
  return d;
}

export class PlayStats {
  private data: Data | null = null;
  private loading: Promise<Data> | null = null;
  private readonly file: string;
  /** Parties en cours, par dossier de jeu. */
  private readonly running = new Map<string, { game: StatGame; start: number; last: number; sec: number }>();
  private dirty = false;
  private saving: Promise<void> = Promise.resolve();

  constructor(private readonly d: PlayStatsDeps) {
    this.file = path.join(d.dataDir, "play-stats.dat");
  }

  private now(): number {
    return this.d.now ? this.d.now() : Date.now();
  }

  private async load(): Promise<Data> {
    if (this.data) return this.data;
    if (!this.loading) {
      this.loading = (async () => {
        const read = this.d.fs?.readFile ?? readFile;
        let raw: Buffer | null = null;
        try {
          raw = Buffer.from(await read(this.file));
        } catch {
          raw = null; // pas encore de stats
        }
        this.data = empty();
        if (raw && this.d.secrets.isEncryptionAvailable()) {
          try {
            if (!raw.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("format");
            this.data = clean(JSON.parse(this.d.secrets.decryptString(raw.subarray(MAGIC.length))));
          } catch {
            // fichier retouché ou abîmé : mis de côté, on repart de zéro
            await (this.d.fs?.rename ?? rename)(this.file, `${this.file}.modifie`).catch(() => undefined);
          }
        }
        // ancienne version en clair (play-stats.json) : supprimée, jamais relue (elle a pu être modifiée)
        await (this.d.fs?.rm ?? ((f: string) => rm(f, { force: true })))(path.join(this.d.dataDir, "play-stats.json")).catch(() => undefined);
        return this.data;
      })();
    }
    return this.loading;
  }

  private add(d: Data, s: { game: StatGame }, at: number, sec: number): void {
    if (sec <= 0) return;
    d.total += sec;
    const day = localDay(at);
    d.days[day] = (d.days[day] ?? 0) + sec;
    const i = d.inst[s.game.key];
    if (i) i.sec += sec;
    this.dirty = true;
  }

  /** Une partie démarre. */
  async start(dir: string, game: StatGame): Promise<void> {
    const d = await this.load();
    const at = this.now();
    if (this.running.has(dir)) await this.stop(dir);
    d.since ??= at;
    d.launches += 1;
    const i = d.inst[game.key];
    if (i) {
      i.launches += 1;
      i.last = at;
      i.name = game.name || i.name;
      i.mc = game.mc || i.mc;
    } else {
      const keys = Object.keys(d.inst);
      if (keys.length >= MAX_INST) {
        // place pour la nouvelle : on oublie l'instance la moins jouée
        const low = keys.reduce((a, b) => (d.inst[a]!.sec <= d.inst[b]!.sec ? a : b));
        delete d.inst[low];
      }
      d.inst[game.key] = { name: game.name || "Instance", mc: game.mc, sec: 0, launches: 1, last: at };
    }
    this.running.set(dir, { game, start: at, last: at, sec: 0 });
    this.dirty = true;
    await this.flush();
  }

  /** Compte le temps écoulé des parties en cours (appelé chaque minute). */
  async tick(): Promise<void> {
    if (!this.running.size) return;
    const d = await this.load();
    const at = this.now();
    for (const s of this.running.values()) {
      const sec = Math.min(MAX_SLICE, Math.max(0, Math.round((at - s.last) / 1000)));
      s.last = at;
      s.sec += sec;
      this.add(d, s, at, sec);
    }
    await this.flush();
  }

  /** Une partie se termine. */
  async stop(dir: string): Promise<void> {
    const s = this.running.get(dir);
    if (!s) return;
    this.running.delete(dir);
    const d = await this.load();
    const at = this.now();
    const sec = Math.min(MAX_SLICE, Math.max(0, Math.round((at - s.last) / 1000)));
    s.sec += sec;
    this.add(d, s, at, sec);
    d.sessions += 1;
    d.longest = Math.max(d.longest, s.sec);
    this.dirty = true;
    await this.flush();
  }

  /** Groupes (event ou modpack ReLink) des parties en cours. */
  groups(): string[] {
    return [...new Set([...this.running.values()].map((s) => s.game.group).filter((g): g is string => !!g))];
  }

  /** Des amis jouent dans la même partie que nous : on leur crédite `sec` secondes. */
  async coplay(friends: { id: string; name: string }[], sec: number): Promise<void> {
    if (!friends.length || sec <= 0) return;
    const d = await this.load();
    for (const f of friends) {
      if (!/^\d{5,25}$/.test(f.id)) continue;
      const cur = d.friends[f.id];
      if (cur) {
        cur.sec += Math.min(MAX_SLICE * 2, Math.floor(sec));
        cur.name = text(f.name, 64) || cur.name;
      } else if (Object.keys(d.friends).length < MAX_FRIENDS) d.friends[f.id] = { name: text(f.name, 64) || "Ami", sec: Math.min(MAX_SLICE * 2, Math.floor(sec)) };
    }
    this.dirty = true;
    await this.flush();
  }

  async view(): Promise<PlayStatsView> {
    const d = await this.load();
    const at = this.now();
    const last14: { day: string; seconds: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const day = localDay(at - i * 86400000);
      last14.push({ day, seconds: d.days[day] ?? 0 });
    }
    const insts = Object.values(d.inst);
    return {
      totalSeconds: d.total,
      launches: d.launches,
      sessions: d.sessions,
      longestSeconds: Math.max(d.longest, ...[...this.running.values()].map((s) => s.sec)),
      daysPlayed: Object.values(d.days).filter((s) => s > 0).length,
      instances: insts.length,
      top: insts
        .filter((i) => i.sec > 0 || i.launches > 0)
        .sort((a, b) => b.sec - a.sec || b.launches - a.launches)
        .slice(0, 5)
        .map((i) => ({ name: i.name, mc: i.mc, seconds: i.sec, launches: i.launches, last: i.last })),
      friends: Object.entries(d.friends)
        .filter(([, f]) => f.sec >= 60)
        .sort((a, b) => b[1].sec - a[1].sec)
        .slice(0, 5)
        .map(([id, f]) => ({ id, name: f.name, seconds: f.sec })),
      last14,
      since: d.since,
      playing: this.running.size > 0,
    };
  }

  private flush(): Promise<void> {
    if (!this.dirty || !this.data) return this.saving;
    this.dirty = false;
    const d = this.data;
    // jours trop anciens oubliés (le total, lui, reste)
    const keys = Object.keys(d.days).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete d.days[k];
    if (!this.d.secrets.isEncryptionAvailable()) return this.saving; // jamais en clair
    let body: Buffer;
    try {
      body = Buffer.concat([MAGIC, this.d.secrets.encryptString(JSON.stringify(d))]);
    } catch {
      return this.saving;
    }
    const fs = { writeFile: this.d.fs?.writeFile ?? ((f: string, b: Buffer) => writeFile(f, b)), rename: this.d.fs?.rename ?? rename, mkdir: this.d.fs?.mkdir ?? ((p: string) => mkdir(p, { recursive: true })) };
    this.saving = this.saving
      .then(async () => {
        await fs.mkdir(path.dirname(this.file));
        const tmp = `${this.file}.tmp`;
        await fs.writeFile(tmp, body);
        await fs.rename(tmp, this.file);
      })
      .catch(() => undefined);
    return this.saving;
  }
}
