// Compte Minecraft officiel (Microsoft) dans ReLaunch : connexion, renouvellement, session de jeu.
//
// Décision validée par l'auteur (2026-10-26) : ReLaunch se connecte lui-même à Microsoft pour lancer le jeu
// sans le launcher officiel et pour lier le compte ReLink à l'UUID officiel. Garde-fous :
//  - connexion dans le NAVIGATEUR du joueur (OAuth 2.0 « application native », PKCE S256 + state à usage
//    unique, retour sur http://localhost:<port> qui n'écoute que sur la boucle locale le temps de la
//    connexion) : aucun mot de passe ne passe par ReLaunch ;
//  - aucun jeton n'est lu dans le launcher officiel ni ailleurs : ReLaunch a sa propre connexion ;
//  - jeton de renouvellement Microsoft + jeton Minecraft chiffrés par le système (safeStorage = DPAPI) dans
//    .wecraft\microsoft_session.bin ; ils ne vont jamais à l'interface ni dans un journal ;
//  - le jeton Minecraft n'est envoyé qu'à Mojang (et UNE fois au Worker ReLink pour vérifier le profil lors
//    de la liaison) ; serveurs autorisés : Microsoft, Xbox Live, Mojang.
// Le joueur ne se reconnecte que si Microsoft refuse le renouvellement (environ 90 jours sans jouer, mot de
// passe changé, accès retiré).
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MicrosoftState } from "../../shared/api";
import type { SecretBox } from "../relink/account";

export const MS_PORT = 47322;
export const MS_REDIRECT = `http://localhost:${MS_PORT}/relaunch/microsoft`;
const AUTHORIZE = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
const TOKEN = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const SCOPE = "XboxLive.signin offline_access";
const HOSTS = new Set(["login.microsoftonline.com", "user.auth.xboxlive.com", "xsts.auth.xboxlive.com", "api.minecraftservices.com"]);
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

export class MicrosoftError extends Error {}

export interface MicrosoftDeps {
  dataDir: string;
  secrets: SecretBox;
  openExternal: (url: string) => Promise<void>;
  /** Identifiant public de l'application Azure de WeCraft (annoncé par le Worker), ou null. */
  clientId: () => Promise<string | null>;
  fetch?: typeof fetch;
  now?: () => number;
}

interface Saved {
  refresh: string;
  mc: { token: string; expires: number } | null;
  profile: { id: string; name: string };
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
// Jetons Microsoft grand public : contiennent aussi « ! * $ » (ex. M.C527_BL2…!…*…$$). Caractères visibles, sans espace.
const TOKEN_RE = /^[\x21-\x7e]{20,8192}$/;

export class MicrosoftAccount {
  private saved: Saved | null = null;
  private loaded = false;
  private lastError: string | null = null;
  private pending: Promise<MicrosoftState> | null = null;

  constructor(private readonly d: MicrosoftDeps) {}

  private get file(): string {
    return path.join(this.d.dataDir, "microsoft_session.bin");
  }
  private now(): number {
    return this.d.now ? this.d.now() : Date.now();
  }

  private async req(url: string, init: RequestInit): Promise<{ status: number; data: Obj }> {
    const u = new URL(url);
    if (u.protocol !== "https:" || !HOSTS.has(u.hostname)) throw new MicrosoftError("Serveur non autorisé.");
    let res: Response;
    try {
      res = await (this.d.fetch ?? fetch)(u.href, { ...init, redirect: "error", signal: AbortSignal.timeout(15000) });
    } catch (e) {
      throw new MicrosoftError(`Microsoft injoignable (${e instanceof Error ? e.message : String(e)}).`);
    }
    const text = await res.text();
    let data: Obj = {};
    try {
      data = obj(text && text.length < 256 * 1024 ? JSON.parse(text) : {});
    } catch {
      data = {};
    }
    return { status: res.status, data };
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      if (!this.d.secrets.isEncryptionAvailable()) return;
      const o = obj(JSON.parse(this.d.secrets.decryptString(await readFile(this.file))));
      const p = obj(o["profile"]);
      const mc = obj(o["mc"]);
      if (typeof o["refresh"] !== "string" || !TOKEN_RE.test(o["refresh"]) || typeof p["id"] !== "string" || typeof p["name"] !== "string") return;
      this.saved = {
        refresh: o["refresh"],
        profile: { id: p["id"], name: p["name"] },
        mc: typeof mc["token"] === "string" && typeof mc["expires"] === "number" ? { token: mc["token"], expires: mc["expires"] } : null,
      };
    } catch {
      this.saved = null;
    }
  }

  private async persist(): Promise<void> {
    if (!this.saved) {
      await rm(this.file, { force: true });
      return;
    }
    if (!this.d.secrets.isEncryptionAvailable()) return; // jamais en clair
    await mkdir(this.d.dataDir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, this.d.secrets.encryptString(JSON.stringify(this.saved)));
    await rename(tmp, this.file);
  }

  async state(): Promise<MicrosoftState> {
    await this.load();
    return {
      connected: !!this.saved,
      profile: this.saved ? { ...this.saved.profile } : null,
      loginPending: !!this.pending,
      available: !!(await this.d.clientId().catch(() => null)),
      persisted: this.d.secrets.isEncryptionAvailable(),
      error: this.lastError,
    };
  }

  /** Microsoft -> Xbox Live -> XSTS -> Minecraft, puis vérification que le compte possède Minecraft Java. */
  private async minecraftFrom(msAccess: string): Promise<{ token: string; expires: number; profile: { id: string; name: string } }> {
    const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
    const xbl = await this.req("https://user.auth.xboxlive.com/user/authenticate", json({ Properties: { AuthMethod: "RPS", SiteName: "user.auth.xboxlive.com", RpsTicket: `d=${msAccess}` }, RelyingParty: "http://auth.xboxlive.com", TokenType: "JWT" }));
    if (xbl.status !== 200 || typeof xbl.data["Token"] !== "string") throw new MicrosoftError("Connexion Xbox Live refusée.");
    const xsts = await this.req("https://xsts.auth.xboxlive.com/xsts/authorize", json({ Properties: { SandboxId: "RETAIL", UserTokens: [xbl.data["Token"]] }, RelyingParty: "rp://api.minecraftservices.com/", TokenType: "JWT" }));
    if (xsts.status !== 200 || typeof xsts.data["Token"] !== "string") {
      const x = Number(xsts.data["XErr"]);
      throw new MicrosoftError(x === 2148916233 ? "Ce compte Microsoft n'a pas de profil Xbox : crée-le sur xbox.com, puis réessaie." : x === 2148916238 ? "Compte mineur : un adulte doit l'ajouter à une famille Microsoft pour qu'il puisse jouer." : x === 2148916235 ? "Xbox Live n'est pas disponible dans ton pays." : "Autorisation Xbox refusée.");
    }
    const xui = obj((obj(xsts.data["DisplayClaims"])["xui"] as unknown[] | undefined)?.[0]);
    const uhs = typeof xui["uhs"] === "string" ? xui["uhs"] : "";
    const mc = await this.req("https://api.minecraftservices.com/authentication/login_with_xbox", json({ identityToken: `XBL3.0 x=${uhs};${xsts.data["Token"] as string}` }));
    const token = mc.data["access_token"];
    if (mc.status !== 200 || typeof token !== "string" || !TOKEN_RE.test(token)) {
      throw new MicrosoftError(mc.status === 403 ? "Mojang n'a pas encore autorisé l'application WeCraft à se connecter à Minecraft." : "Connexion Minecraft refusée.");
    }
    const expires = this.now() + Math.max(60, Number(mc.data["expires_in"]) || 86400) * 1000;
    const prof = await this.req("https://api.minecraftservices.com/minecraft/profile", { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (prof.status === 404) throw new MicrosoftError("Ce compte Microsoft ne possède pas Minecraft Java Edition.");
    const id = typeof prof.data["id"] === "string" && /^[0-9a-f]{32}$/i.test(prof.data["id"]) ? prof.data["id"].toLowerCase() : "";
    const name = typeof prof.data["name"] === "string" && /^[A-Za-z0-9_]{1,16}$/.test(prof.data["name"]) ? prof.data["name"] : "";
    if (prof.status !== 200 || !id || !name) throw new MicrosoftError("Profil Minecraft illisible.");
    return { token, expires, profile: { id, name } };
  }

  private async tokens(form: Record<string, string>): Promise<{ access: string; refresh: string }> {
    const r = await this.req(TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString() });
    const access = r.data["access_token"], refresh = r.data["refresh_token"];
    if (r.status !== 200 || typeof access !== "string" || typeof refresh !== "string" || !TOKEN_RE.test(refresh)) {
      const err = String(r.data["error"] ?? "");
      // code AADSTS (sans jeton ni donnée personnelle) pour comprendre un refus dans Réglages > Logs
      const code = /AADSTS\d{4,8}/.exec(String(r.data["error_description"] ?? ""))?.[0] ?? "";
      const detail = [err, code, r.status !== 200 ? `HTTP ${r.status}` : "jeton illisible"].filter(Boolean).join(", ").slice(0, 120);
      if (err === "invalid_grant") throw new MicrosoftError("Ta connexion Microsoft a expiré : reconnecte-toi.");
      if (code === "AADSTS7000218" || err === "invalid_client") throw new MicrosoftError(`Connexion Microsoft refusée : dans Azure, active « Autoriser les flux clients publics » (Authentification) (${detail}).`);
      throw new MicrosoftError(`Connexion Microsoft refusée (${detail}).`);
    }
    return { access, refresh };
  }

  /** Connexion dans le navigateur (5 min au plus). */
  async login(): Promise<MicrosoftState> {
    if (this.pending) return this.pending;
    this.lastError = null;
    this.pending = (async () => {
      let server: Server | null = null;
      let server6: Server | null = null;
      try {
        const clientId = await this.d.clientId();
        if (!clientId || !/^[0-9a-f-]{36}$/i.test(clientId)) throw new MicrosoftError("Connexion Microsoft pas encore disponible (application WeCraft non configurée).");
        const verifier = b64url(randomBytes(48));
        const challenge = b64url(createHash("sha256").update(verifier).digest());
        const state = randomBytes(24).toString("hex");
        let settle!: (v: { code: string } | { error: string }) => void;
        const got = new Promise<{ code: string } | { error: string }>((r) => (settle = r));
        const handler = (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => {
          const u = new URL(req.url ?? "/", MS_REDIRECT);
          const page = (ok: boolean, msg: string) => {
            res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
            res.end(`<!doctype html><meta charset="utf-8"><title>ReLaunch</title><body style="font:16px system-ui;background:#0b0f14;color:#e5e7eb;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="font-size:20px">${ok ? "Compte Microsoft connecté" : "Connexion annulée"}</h1><p>${msg}</p></div></body>`);
          };
          if (req.method !== "GET" || u.pathname !== "/relaunch/microsoft") return void res.writeHead(404).end();
          if (u.searchParams.get("state") !== state) return page(false, "Demande inconnue : recommence depuis ReLaunch.");
          const code = u.searchParams.get("code") ?? "";
          if (!code || code.length > 4096) {
            page(false, "Microsoft n'a pas donné l'accord. Tu peux fermer cet onglet.");
            return settle({ error: "Connexion refusée sur Microsoft." });
          }
          page(true, "Tu peux fermer cet onglet et revenir dans ReLaunch.");
          settle({ code });
        };
        server = createServer(handler);
        const srv = server;
        await new Promise<void>((resolve, reject) => {
          srv.once("error", (e: NodeJS.ErrnoException) => reject(new MicrosoftError(e.code === "EADDRINUSE" ? `Le port ${MS_PORT} est déjà utilisé : ferme l'autre ReLaunch, puis réessaie.` : e.message)));
          srv.listen(MS_PORT, "127.0.0.1", () => resolve());
        });
        // « localhost » peut viser ::1 selon le navigateur : même port, boucle locale IPv6 seulement (facultatif)
        server6 = createServer(handler);
        server6.once("error", () => undefined);
        server6.listen(MS_PORT, "::1");
        const q = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: MS_REDIRECT, scope: SCOPE, state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account" });
        await this.d.openExternal(`${AUTHORIZE}?${q}`);
        const timer = new Promise<{ error: string }>((r) => setTimeout(() => r({ error: "Connexion abandonnée (5 minutes sans réponse)." }), LOGIN_TIMEOUT_MS).unref());
        const r = await Promise.race([got, timer]);
        if ("error" in r) throw new MicrosoftError(r.error);
        const t = await this.tokens({ client_id: clientId, grant_type: "authorization_code", code: r.code, redirect_uri: MS_REDIRECT, code_verifier: verifier, scope: SCOPE });
        const mc = await this.minecraftFrom(t.access);
        this.saved = { refresh: t.refresh, mc: { token: mc.token, expires: mc.expires }, profile: mc.profile };
        await this.persist();
      } catch (e) {
        this.lastError = e instanceof Error ? e.message : String(e);
      } finally {
        server?.close();
        server6?.close();
        this.pending = null;
      }
      return this.state();
    })();
    return this.pending;
  }

  /**
   * Session de jeu valable au moins 10 minutes (renouvelée sans le joueur si possible). null : il faut se
   * (re)connecter. Ne quitte jamais le processus principal.
   */
  async session(): Promise<{ name: string; uuid: string; accessToken: string } | null> {
    await this.load();
    const s = this.saved;
    if (!s) return null;
    if (s.mc && s.mc.expires - this.now() > 10 * 60 * 1000) return { name: s.profile.name, uuid: s.profile.id, accessToken: s.mc.token };
    const clientId = await this.d.clientId().catch(() => null);
    if (!clientId) return null;
    try {
      const t = await this.tokens({ client_id: clientId, grant_type: "refresh_token", refresh_token: s.refresh, scope: SCOPE });
      const mc = await this.minecraftFrom(t.access);
      this.saved = { refresh: t.refresh, mc: { token: mc.token, expires: mc.expires }, profile: mc.profile };
      await this.persist();
      this.lastError = null;
      return { name: mc.profile.name, uuid: mc.profile.id, accessToken: mc.token };
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      if (e instanceof MicrosoftError && /expiré/.test(this.lastError)) {
        this.saved = null; // renouvellement refusé : il faudra se reconnecter
        await this.persist().catch(() => undefined);
      }
      return null;
    }
  }

  /**
   * Envoie le skin au profil Minecraft officiel (visible partout, même en vanilla). PNG déjà vérifié
   * (64 × 64 ou 64 × 32). Renvoie null si réussi, sinon le message d'erreur.
   */
  async uploadSkin(png: Buffer, model: "classic" | "slim"): Promise<string | null> {
    const ses = await this.session();
    if (!ses) return "Compte Microsoft non connecté dans ReLaunch.";
    const form = new FormData();
    form.append("variant", model === "slim" ? "slim" : "classic");
    form.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "skin.png");
    let res: Response;
    try {
      res = await (this.d.fetch ?? fetch)("https://api.minecraftservices.com/minecraft/profile/skins", { method: "POST", headers: { Authorization: `Bearer ${ses.accessToken}` }, body: form, redirect: "error", signal: AbortSignal.timeout(20000) });
    } catch {
      return "Mojang injoignable.";
    }
    await res.body?.cancel().catch(() => undefined);
    if (res.ok) return null;
    return res.status === 429 ? "Mojang limite les changements de skin : réessaie dans quelques minutes." : res.status === 401 || res.status === 403 ? "Mojang a refusé le changement de skin (accès de l'application WeCraft pas encore accordé ?)." : `Mojang a refusé le skin (HTTP ${res.status}).`;
  }

  async logout(): Promise<MicrosoftState> {
    await this.load();
    this.saved = null;
    this.lastError = null;
    await this.persist().catch(() => undefined);
    return this.state();
  }
}
