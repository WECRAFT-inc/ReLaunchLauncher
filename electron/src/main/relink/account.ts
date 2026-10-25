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
import type { AccountState } from "../../shared/api";
import { checkUrl, HttpError, type NetOptions } from "../net/download";
import { str, WORKER_HOSTS, WORKER_URL } from "./worker";

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

export class AccountError extends Error {}

function decodeUser(v: unknown): AccountState["user"] {
  const o = obj(v);
  const id = typeof o["id"] === "string" && /^\d{5,25}$/.test(o["id"]) ? o["id"] : "";
  if (!id) return null;
  return {
    id,
    pseudo: str(o["pseudo"], 60) || "Joueur",
    minecraftName: /^[A-Za-z0-9_]{1,16}$/.test(String(o["minecraftName"] ?? "")) ? String(o["minecraftName"]) : null,
    eclats: typeof o["eclats"] === "number" && Number.isFinite(o["eclats"]) ? Math.max(0, Math.floor(o["eclats"])) : 0,
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
  private offline = false;
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
      offline: this.offline,
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

  /** Lancer le jeu : connecté, ou Worker injoignable (le jeu passe alors sans les serveurs d'event). */
  async launchGate(): Promise<"ok" | "offline" | "login"> {
    const st = await this.state();
    if (st.loggedIn) return "ok";
    if (this.offline) return "offline";
    try {
      const res = await this.fetcher()(checkUrl(`${WORKER_URL}/launcher/auth/config`, WORKER_HOSTS).href, { redirect: "error", signal: AbortSignal.timeout(6000), headers: { "User-Agent": this.d.userAgent } });
      await res.body?.cancel().catch(() => undefined);
      return res.ok ? "login" : "offline";
    } catch {
      this.offline = true;
      return "offline";
    }
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
      this.offline = false;
    } catch (e) {
      this.offline = true;
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
      throw new AccountError(msg ? str(msg, 300) : `Erreur ReLink (HTTP ${res.status}).`);
    }
    return data;
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
