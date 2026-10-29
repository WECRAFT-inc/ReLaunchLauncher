// Compte ReLink dans le launcher (connexion obligatoire pour jouer, skins, boutique).
//
// Connexion : « application native » (RFC 8252). Le launcher ouvre le navigateur du joueur sur la page
// d'autorisation de Discord ; Discord renvoie vers http://127.0.0.1:47321/relaunch/callback, un petit serveur
// local qui n'écoute QUE sur la boucle locale, le temps d'une connexion (5 min au plus), et vérifie un « state »
// aléatoire à usage unique. Le code reçu est envoyé au Worker, qui l'échange avec son secret Discord : aucun
// secret n'est dans le launcher, et le joueur ne tape jamais de mot de passe dans le launcher.
//
// Session : jeton ReLink (30 jours, révocable depuis le site) chiffré par le système (safeStorage = DPAPI sous
// Windows) dans .wecraft\relink_session.bin. Il ne sort jamais du processus principal : l'interface ne reçoit
// que le pseudo, l'état et les informations publiques du compte.
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AccountState, Quest, QuestsState } from "../../shared/api";
import { checkUrl, HttpError, type NetOptions } from "../net/download";
import { str, WORKER_HOSTS, WORKER_URL } from "./worker";
import { isOfflineName } from "../auth/offline";

export const CALLBACK_PORT = 47321;
export const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/relaunch/callback`;
const AUTHORIZE = "https://discord.com/oauth2/authorize";
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_JSON = 256 * 1024;
const MC_SKIN_MAX = 64 * 1024;

export interface SecretBox {
  isEncryptionAvailable(): boolean;
  encryptString(text: string): Buffer;
  decryptString(data: Buffer): string;
}

export interface AccountDeps {
  dataDir: string;
  userAgent: string;
  /** Ouvre une adresse https dans le navigateur du joueur. */
  openExternal: (url: string) => Promise<void>;
  secrets: SecretBox;
  net?: NetOptions;
  now?: () => number;
}

interface Saved {
  token: string;
  user: AccountState["user"];
  expiresAt: string | null;
  me: Me | null;
  checkedAt: number | null;
}
interface Me {
  launcherSkins: string[];
  minecraftSkin: { url: string; model: "classic" | "slim"; sha256: string } | null;
  eclats: number;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});

export class AccountError extends Error {
  /** Réponse d'erreur du Worker (code, dates…), pour que l'appelant distingue les cas ; jamais montrée telle quelle. */
  readonly data: Record<string, unknown>;
  constructor(message: string, data: Record<string, unknown> = {}) {
    super(message);
    this.data = data;
  }
}

function decodeUser(v: unknown): AccountState["user"] {
  const o = obj(v);
  const id = typeof o["id"] === "string" && /^\d{5,25}$/.test(o["id"]) ? o["id"] : "";
  if (!id) return null;
  return {
    id,
    pseudo: str(o["pseudo"], 60) || "Joueur",
    minecraftName: /^[A-Za-z0-9_]{1,16}$/.test(String(o["minecraftName"] ?? "")) ? String(o["minecraftName"]) : null,
    minecraftUuid: typeof o["minecraftUuid"] === "string" && /^[0-9a-f-]{32,36}$/i.test(o["minecraftUuid"]) ? o["minecraftUuid"].toLowerCase() : null,
    minecraftVerified: o["minecraftVerified"] === true,
    eclats: typeof o["eclats"] === "number" && Number.isFinite(o["eclats"]) ? Math.max(0, Math.floor(o["eclats"])) : 0,
    premium: o["premium"] === true,
  };
}
function decodeMe(v: unknown): { user: AccountState["user"]; me: Me; expiresAt: string | null } {
  const o = obj(v);
  const user = decodeUser(o["user"]);
  const skins = Array.isArray(o["launcherSkins"]) ? o["launcherSkins"].filter((s): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(s)).slice(0, 500) : [];
  const mc = obj(o["minecraftSkin"]);
  const sha = typeof mc["sha256"] === "string" && /^[0-9a-f]{64}$/.test(mc["sha256"]) ? mc["sha256"] : "";
  const exp = str(obj(o["session"])["expiresAt"], 40);
  return {
    user,
    me: {
      launcherSkins: skins,
      minecraftSkin: sha ? { url: `${WORKER_URL}/launcher/mcskin/textures/${sha}`, model: mc["model"] === "slim" ? "slim" : "classic", sha256: sha } : null,
      eclats: user?.eclats ?? 0,
    },
    expiresAt: exp && !Number.isNaN(Date.parse(exp)) ? new Date(exp).toISOString() : null,
  };
}

export class RelinkAccount {
  private saved: Saved | null = null;
  private loaded = false;
  private unreachable = false;
  private lastError: string | null = null;
  private pending: { server: Server; done: Promise<AccountState> } | null = null;

  constructor(private readonly d: AccountDeps) {}

  private get file(): string {
    return path.join(this.d.dataDir, "relink_session.bin");
  }
  private now(): number {
    return this.d.now ? this.d.now() : Date.now();
  }
  private fetcher(): typeof fetch {
    return (this.d.net?.fetch as unknown as typeof fetch | undefined) ?? fetch;
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(this.file);
      if (!this.d.secrets.isEncryptionAvailable()) return;
      const o = obj(JSON.parse(this.d.secrets.decryptString(raw)));
      const token = typeof o["token"] === "string" && /^[A-Za-z0-9._-]{20,4096}$/.test(o["token"]) ? o["token"] : "";
      const user = decodeUser(o["user"]);
      if (!token || !user) return;
      const meO = obj(o["me"]);
      this.saved = {
        token, user,
        expiresAt: typeof o["expiresAt"] === "string" ? o["expiresAt"] : null,
        me: o["me"] ? decodeMe({ user: o["user"], launcherSkins: meO["launcherSkins"], minecraftSkin: meO["minecraftSkin"] }).me : null,
        checkedAt: typeof o["checkedAt"] === "number" ? o["checkedAt"] : null,
      };
    } catch {
      this.saved = null; // pas de session, fichier illisible ou chiffré pour un autre compte Windows
    }
  }

  private async persist(): Promise<void> {
    if (!this.saved) {
      await rm(this.file, { force: true });
      return;
    }
    if (!this.d.secrets.isEncryptionAvailable()) return; // jamais en clair : la session reste en mémoire seulement
    await mkdir(this.d.dataDir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, this.d.secrets.encryptString(JSON.stringify(this.saved)));
    await rename(tmp, this.file);
  }

  private expired(): boolean {
    const e = this.saved?.expiresAt ? Date.parse(this.saved.expiresAt) : NaN;
    return Number.isFinite(e) && e <= this.now();
  }

  async state(): Promise<AccountState> {
    await this.load();
    if (this.saved && this.expired()) {
      this.saved = null;
      await this.persist().catch(() => undefined);
      this.lastError = "Ta session ReLink a expiré : reconnecte-toi.";
    }
    const s = this.saved;
    return {
      loggedIn: !!s,
      user: s?.user ?? null,
      expiresAt: s?.expiresAt ?? null,
      offline: this.unreachable,
      loginPending: !!this.pending,
      launcherSkins: s?.me?.launcherSkins ?? [],
      minecraftSkin: s?.me?.minecraftSkin ? { model: s.me.minecraftSkin.model, sha256: s.me.minecraftSkin.sha256 } : null,
      persisted: this.d.secrets.isEncryptionAvailable(),
      error: this.lastError,
    };
  }

  /** Jeton de la session, pour les appels du processus principal seulement. */
  async token(): Promise<string | null> {
    await this.load();
    return this.saved && !this.expired() ? this.saved.token : null;
  }

  private async call(method: string, route: string, init: { body?: FormData; json?: unknown; auth?: boolean; timeout?: number } = {}): Promise<Obj> {
    const headers: Record<string, string> = { "User-Agent": this.d.userAgent, Accept: "application/json" };
    if (init.json !== undefined) headers["Content-Type"] = "application/json";
    if (init.auth) {
      const t = await this.token();
      if (!t) throw new AccountError("Connecte-toi à ReLink.");
      headers["Authorization"] = `Bearer ${t}`;
    }
    const url = checkUrl(`${WORKER_URL}${route}`, WORKER_HOSTS).href;
    let res: Response;
    try {
      const reqInit: RequestInit = { method, headers, redirect: "error", signal: AbortSignal.timeout(init.timeout ?? 15000) };
      const body = init.json !== undefined ? JSON.stringify(init.json) : init.body;
      if (body !== undefined) reqInit.body = body;
      res = await this.fetcher()(url, reqInit);
      this.unreachable = false;
    } catch (e) {
      this.unreachable = true;
      throw new AccountError(`Service ReLink injoignable (${e instanceof Error ? e.message : String(e)}).`);
    }
    const text = await res.text();
    if (text.length > MAX_JSON) throw new AccountError("Réponse ReLink trop volumineuse.");
    let data: Obj = {};
    try {
      data = obj(text ? JSON.parse(text) : {});
    } catch {
      data = {};
    }
    if (res.status === 401 && init.auth) {
      this.saved = null;
      await this.persist().catch(() => undefined);
      throw new AccountError("Ta session ReLink n'est plus valide (déconnectée depuis le site ou expirée) : reconnecte-toi.");
    }
    if (!res.ok) {
      const err = data["error"];
      const msg = typeof err === "string" ? err : str(obj(err)["message"], 200);
      throw new AccountError(msg ? str(msg, 300) : `Erreur ReLink (HTTP ${res.status}).`, { status: res.status, code: str(data["code"], 40), lockedUntil: str(data["lockedUntil"], 40), officialName: str(data["officialName"], 16) });
    }
    return data;
  }

  /**
   * Pseudo hors-ligne du compte ReLink, géré par le Worker : format, pseudo non pris par un compte Minecraft officiel,
   * unicité entre joueurs ReLink et verrou de 90 jours (horloge du serveur). Lève AccountError (data.code) en cas de refus.
   */
  async offline(method: "GET" | "PUT" | "DELETE", name?: string): Promise<{ name: string | null; changedAt: number | null; lockedUntil: number | null }> {
    const r = await this.call(method, "/launcher/me/offline", { auth: true, ...(method === "PUT" ? { json: { name } } : {}) });
    const o = obj(r["offline"]);
    const ms = (v: unknown): number | null => {
      const t = typeof v === "string" ? Date.parse(v) : NaN;
      return Number.isFinite(t) ? t : null;
    };
    return { name: isOfflineName(o["name"]) ? (o["name"] as string) : null, changedAt: ms(o["changedAt"]), lockedUntil: ms(o["lockedUntil"]) };
  }

  /** Relit le compte (skins possédés, skin Minecraft). Hors ligne : garde ce qui était connu. */
  async refresh(): Promise<AccountState> {
    await this.load();
    if (!this.saved) return this.state();
    try {
      const d = decodeMe(await this.call("GET", "/launcher/me", { auth: true }));
      if (this.saved && d.user) {
        this.saved = { ...this.saved, user: d.user, me: d.me, expiresAt: d.expiresAt ?? this.saved.expiresAt, checkedAt: this.now() };
        await this.persist().catch(() => undefined);
      }
      this.lastError = null;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
    }
    return this.state();
  }

  /** Connexion par Discord. Renvoie quand le joueur a accepté (ou refusé, ou après 5 min). */
  async login(): Promise<AccountState> {
    if (this.pending) return this.pending.done;
    this.lastError = null;
    let cfg: Obj;
    try {
      cfg = await this.call("GET", "/launcher/auth/config");
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      return this.state();
    }
    const clientId = typeof cfg["clientId"] === "string" && /^\d{5,25}$/.test(cfg["clientId"]) ? cfg["clientId"] : "";
    if (!clientId || cfg["redirectUri"] !== REDIRECT_URI) {
      this.lastError = "Configuration de connexion ReLink inattendue : connexion annulée.";
      return this.state();
    }
    const state = randomBytes(24).toString("hex");
    let settle!: (v: { code: string } | { error: string }) => void;
    const got = new Promise<{ code: string } | { error: string }>((r) => (settle = r));
    const server = createServer((req, res) => {
      const u = new URL(req.url ?? "/", `http://127.0.0.1:${CALLBACK_PORT}`);
      const page = (ok: boolean, msg: string) => {
        res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
        res.end(`<!doctype html><meta charset="utf-8"><title>ReLaunch</title><body style="font:16px system-ui;background:#0b0f14;color:#e5e7eb;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="font-size:20px">${ok ? "Connexion réussie" : "Connexion annulée"}</h1><p>${msg}</p></div></body>`);
      };
      if (req.method !== "GET" || u.pathname !== "/relaunch/callback") {
        res.writeHead(404).end();
        return;
      }
      if (u.searchParams.get("state") !== state) {
        page(false, "Demande inconnue : recommence la connexion depuis ReLaunch.");
        return;
      }
      const code = u.searchParams.get("code") ?? "";
      if (!/^[A-Za-z0-9_-]{10,100}$/.test(code)) {
        page(false, "Discord n'a pas donné l'accord. Tu peux fermer cet onglet.");
        settle({ error: "Connexion refusée sur Discord." });
        return;
      }
      page(true, "Tu peux fermer cet onglet et revenir dans ReLaunch.");
      settle({ code });
    });
    const done = (async (): Promise<AccountState> => {
      try {
        await new Promise<void>((resolve, reject) => {
          server.once("error", (e: NodeJS.ErrnoException) => reject(new AccountError(e.code === "EADDRINUSE" ? `Le port ${CALLBACK_PORT} est déjà utilisé sur cet ordinateur : ferme l'autre ReLaunch ou le programme qui l'occupe, puis réessaie.` : e.message)));
          server.listen(CALLBACK_PORT, "127.0.0.1", () => resolve());
        });
        const q = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: REDIRECT_URI, scope: "identify", state, prompt: "none" });
        await this.d.openExternal(`${AUTHORIZE}?${q}`);
        const timer = new Promise<{ error: string }>((r) => setTimeout(() => r({ error: "Connexion abandonnée (5 minutes sans réponse)." }), LOGIN_TIMEOUT_MS).unref());
        const r = await Promise.race([got, timer]);
        if ("error" in r) throw new AccountError(r.error);
        const auth = await this.call("POST", "/launcher/auth/discord", { json: { code: r.code } });
        const token = typeof auth["access_token"] === "string" && /^[A-Za-z0-9._-]{20,4096}$/.test(auth["access_token"]) ? auth["access_token"] : "";
        const user = decodeUser(auth["user"]);
        if (!token || !user) throw new AccountError("Réponse de connexion ReLink invalide.");
        this.saved = { token, user, expiresAt: null, me: null, checkedAt: null };
        await this.persist();
        return await this.refresh();
      } catch (e) {
        this.lastError = e instanceof Error ? e.message : String(e);
        return this.state();
      } finally {
        server.close();
        this.pending = null;
      }
    })();
    this.pending = { server, done };
    return done;
  }

  async logout(): Promise<AccountState> {
    await this.load();
    if (this.saved) await this.call("POST", "/launcher/auth/logout", { auth: true, timeout: 8000 }).catch(() => undefined); // révoque la session côté ReLink si possible
    this.saved = null;
    this.lastError = null;
    await this.persist().catch(() => undefined);
    return this.state();
  }

  /** Envoie le skin Minecraft (PNG 64 × 64 ou 64 × 32) ; vérifié ici puis par le Worker. */
  async uploadMinecraftSkin(png: Buffer, model: "classic" | "slim"): Promise<AccountState> {
    const bad = checkSkinPng(png);
    if (bad) throw new AccountError(bad);
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "skin.png");
    form.append("model", model === "slim" ? "slim" : "classic");
    await this.call("PUT", "/launcher/me/mcskin", { auth: true, body: form });
    return this.refresh();
  }

  async removeMinecraftSkin(): Promise<AccountState> {
    await this.call("DELETE", "/launcher/me/mcskin", { auth: true });
    return this.refresh();
  }

  /** Image du skin Minecraft actuel, en data: (l'interface ne charge aucune image distante). */
  async minecraftSkinImage(): Promise<string | null> {
    await this.load();
    const s = this.saved?.me?.minecraftSkin;
    if (!s) return null;
    try {
      const res = await this.fetcher()(checkUrl(s.url, WORKER_HOSTS).href, { redirect: "error", signal: AbortSignal.timeout(10000), headers: { "User-Agent": this.d.userAgent } });
      if (!res.ok) throw new HttpError(s.url, res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MC_SKIN_MAX || checkSkinPng(buf)) return null;
      return `data:image/png;base64,${buf.toString("base64")}`;
    } catch {
      return null;
    }
  }

  /** Identifiant public de l'application Microsoft de WeCraft (annoncé par le Worker, gardé en mémoire). */
  private msClient: string | null | undefined;
  async microsoftClientId(): Promise<string | null> {
    if (this.msClient !== undefined) return this.msClient;
    const cfg = await this.call("GET", "/launcher/auth/config");
    const id = typeof cfg["microsoftClientId"] === "string" && /^[0-9a-f-]{36}$/i.test(cfg["microsoftClientId"]) ? cfg["microsoftClientId"] : null;
    this.msClient = id;
    return id;
  }

  /** Lie le compte Minecraft officiel : le Worker vérifie le jeton chez Mojang, puis l'oublie. */
  async linkMinecraft(minecraftToken: string): Promise<AccountState> {
    await this.call("POST", "/launcher/me/minecraft", { auth: true, json: { minecraftToken } });
    return this.refresh();
  }

  /** Achat d'un skin du launcher en Éclats (débit fait par le Worker, de façon atomique). */
  async buySkin(skinId: string): Promise<{ state: AccountState; message: string }> {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(skinId)) throw new AccountError("Skin inconnu.");
    const r = await this.call("POST", `/launcher/skins/${encodeURIComponent(skinId)}/buy`, { auth: true, json: {} });
    const spent = typeof r["spent"] === "number" ? r["spent"] : 0;
    const left = typeof r["eclats"] === "number" ? r["eclats"] : null;
    return { state: await this.refresh(), message: `Skin débloqué pour ${spent} éclats${left !== null ? ` (il t'en reste ${left})` : ""}.` };
  }

  /** Code de déblocage (12 lettres et chiffres). */
  async redeemCode(code: string): Promise<{ state: AccountState; skinId: string; skinName: string }> {
    const c = String(code).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (c.length !== 12) throw new AccountError("Code invalide (12 lettres et chiffres, ex. ABCD-EFGH-JKLM).");
    const r = await this.call("POST", "/launcher/skins/redeem", { auth: true, json: { code: c } });
    const skinId = typeof r["skinId"] === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(r["skinId"]) ? r["skinId"] : "";
    return { state: await this.refresh(), skinId, skinName: str(r["skinName"], 60) || skinId };
  }

  /** Avantages & Quêtes : liste lue sur ReLink (données du serveur, rien n'est calculé ici). */
  async quests(): Promise<QuestsState> {
    await this.load();
    if (!this.saved) return { ok: false, error: "Connecte-toi à ReLink pour voir tes quêtes.", quests: [], streak: null };
    try {
      const r = await this.call("GET", "/launcher/quests", { auth: true });
      const num = (v: unknown, max = 1e9) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
      const quests: Quest[] = (Array.isArray(r["quests"]) ? (r["quests"] as unknown[]) : []).slice(0, 200).flatMap((q0): Quest[] => {
        const q = obj(q0);
        const id = typeof q["id"] === "string" && /^[A-Za-z0-9_:-]{1,100}$/.test(q["id"]) ? q["id"] : "";
        const cat = q["category"] === "streak" || q["category"] === "event" ? q["category"] : "general";
        if (!id) return [];
        const ev = typeof q["event"] === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(q["event"]) ? q["event"] : null;
        return [{ id, category: cat, event: ev, title: str(q["title"], 120) || id, desc: str(q["desc"], 600), reward: num(q["reward"], 1e6), done: q["done"] === true, claimed: q["claimed"] === true }];
      });
      const s = obj(r["streak"]);
      const streak = r["streak"]
        ? {
            current: num(s["current"], 10000),
            longest: num(s["longest"], 10000),
            lastValidDate: typeof s["lastValidDate"] === "string" ? str(s["lastValidDate"], 40) : null,
            days: num(s["days"], 365),
            dailyReward: num(s["dailyReward"], 1e6),
            milestones: (Array.isArray(s["milestones"]) ? (s["milestones"] as unknown[]) : []).slice(0, 50).map((m) => ({ day: num(obj(m)["day"], 365), bonus: num(obj(m)["bonus"], 1e6) })),
          }
        : null;
      if (r["reward"]) await this.refresh().catch(() => undefined); // récompense versée à l'instant : solde d'Éclats à jour
      return { ok: true, error: null, quests, streak };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e), quests: [], streak: null };
    }
  }

  /** Skins du launcher que le joueur possède (offerts, gagnés), d'après le dernier état connu. */
  async owns(skinId: string): Promise<boolean> {
    await this.load();
    return !!this.saved?.me?.launcherSkins.includes(skinId);
  }
}

/** PNG 64 × 64 (ou ancien format 64 × 32), 64 Ko maximum. null = valide, sinon le message d'erreur. */
export function checkSkinPng(b: Buffer): string | null {
  if (b.length > MC_SKIN_MAX) return "Image trop lourde (64 Ko maximum).";
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 33 || !sig.every((x, i) => b[i] === x) || b.toString("latin1", 12, 16) !== "IHDR") return "Le fichier doit être une image PNG.";
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  if (!(w === 64 && (h === 64 || h === 32))) return `Un skin Minecraft fait 64 × 64 pixels (reçu ${w} × ${h}).`;
  return null;
}