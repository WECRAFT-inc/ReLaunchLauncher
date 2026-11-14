// Lecteur Twitch intégré.
//
// Pourquoi pas une <iframe> dans l'interface : Twitch n'accepte d'être intégré que dans une page dont l'hôte figure dans
// « parent=… ». L'interface est servie en app://wecraft, que Twitch ne reconnaît pas. On sert donc une toute petite page
// depuis http://localhost (hôte que Twitch accepte, port aléatoire, écoute sur 127.0.0.1 seulement), qui contient le lecteur.
// Cette page s'affiche dans une vue native (WebContentsView) posée par-dessus l'emplacement du lecteur de l'interface,
// dans une session À PART (en mémoire, sans lien avec celle de l'interface) : la CSP et le blocage réseau de l'interface
// ne changent pas du tout.
import { WebContentsView, session } from "electron";
import type { BrowserWindow, Session, WebContents } from "electron";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { embedPage, hostOk } from "./playerPage";
import { isTwitchLogin } from "./security";

export interface PlayerRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const PLAYER_PARTITION = "relaunch-player";
const EMBED = /^\/embed\/([A-Za-z0-9_]{1,40})$/;

export class PlayerHost {
  private server: http.Server | null = null;
  private port = 0;
  private view: WebContentsView | null = null;
  private channel = "";
  private ses: Session | null = null;

  constructor(
    private readonly win: () => BrowserWindow | null,
    private readonly log: (line: string) => void = () => undefined,
  ) {}

  private async ensureServer(): Promise<number> {
    if (this.server) return this.port;
    const srv = http.createServer((req, res) => {
      const m = req.method === "GET" && hostOk(req.headers.host, this.port) ? EMBED.exec((req.url ?? "").split("?")[0]!) : null;
      if (!m) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Introuvable");
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-src https://player.twitch.tv",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "origin",
        "Cache-Control": "no-store",
      });
      res.end(embedPage(m[1]!));
    });
    await new Promise<void>((resolve, reject) => {
      srv.once("error", reject);
      srv.listen(0, "127.0.0.1", () => resolve());
    });
    this.port = (srv.address() as AddressInfo).port;
    this.server = srv;
    return this.port;
  }

  private sessionOf(): Session {
    if (this.ses) return this.ses;
    const s = session.fromPartition(PLAYER_PARTITION); // pas de « persist: » : rien n'est gardé sur le disque
    const local = (u: string): boolean => u.startsWith(`http://localhost:${this.port}/`) || u.startsWith(`http://127.0.0.1:${this.port}/`);
    // Cette session ne sert qu'à Twitch : HTTPS vers l'extérieur et la page locale ; tout le reste est refusé.
    s.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !(d.url.startsWith("https://") || d.url.startsWith("data:") || d.url.startsWith("blob:") || local(d.url)) }));
    const fullscreenOk = (permission: string, url: string): boolean => permission === "fullscreen" && (local(url) || url.startsWith("https://player.twitch.tv/"));
    s.setPermissionRequestHandler((_wc, permission, cb, details) => cb(fullscreenOk(permission, details.requestingUrl)));
    s.setPermissionCheckHandler((_wc, permission, origin) => fullscreenOk(permission, origin));
    s.setDevicePermissionHandler(() => false);
    // Twitch refuse ou fige son lecteur quand le navigateur se présente comme « Electron » : identifiant de Chrome standard.
    s.setUserAgent(s.getUserAgent().replace(/\s(?:Electron|ReLaunch|relaunch)\/[^\s]+/gi, ""));
    this.ses = s;
    return s;
  }

  /** Affiche (ou déplace) le lecteur ; rect null = masqué sans arrêter la lecture. */
  async show(channel: string, rect: PlayerRect | null): Promise<void> {
    const win = this.win();
    if (!win || win.isDestroyed() || !isTwitchLogin(channel)) return;
    const port = await this.ensureServer();
    if (!this.view || this.channel !== channel.toLowerCase()) {
      this.stop();
      const view = new WebContentsView({
        webPreferences: { session: this.sessionOf(), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, autoplayPolicy: "no-user-gesture-required", devTools: false },
      });
      view.setBackgroundColor("#000000");
      view.setVisible(false);
      win.contentView.addChildView(view);
      const wc = view.webContents;
      wc.setWindowOpenHandler(() => ({ action: "deny" }));
      // diagnostic : visible dans Réglages > Logs si le lecteur n'affiche rien
      wc.on("did-fail-load", (_e, code, desc, url, isMainFrame) => this.log(`Lecteur Twitch : échec de chargement (${code} ${desc}) ${isMainFrame ? "page" : "cadre"} ${url.slice(0, 120)}`));
      wc.on("render-process-gone", (_e, d) => this.log(`Lecteur Twitch : processus arrêté (${d.reason}).`));
      wc.on("console-message", (_e, level, message) => {
        if (level >= 2) this.log(`Lecteur Twitch : ${message.slice(0, 200)}`);
      });
      void view.webContents.loadURL(`http://localhost:${port}/embed/${channel.toLowerCase()}`).catch(() => undefined);
      this.view = view;
      this.channel = channel.toLowerCase();
    }
    const view = this.view;
    if (!rect) {
      view.setVisible(false);
      return;
    }
    const z = win.webContents.getZoomFactor();
    view.setBounds({ x: Math.round(rect.x * z), y: Math.round(rect.y * z), width: Math.max(1, Math.round(rect.width * z)), height: Math.max(1, Math.round(rect.height * z)) });
    view.setVisible(true);
  }

  /** Règles de navigation de la vue du lecteur (à la place de celles de l'interface, qui bloquaient les redirections de Twitch). */
  guard(contents: WebContents): void {
    contents.on("will-navigate", (e) => e.preventDefault()); // la page du lecteur ne navigue jamais ailleurs
    contents.on("will-redirect", (e, url, _inPlace, isMainFrame) => {
      if (isMainFrame || !url.startsWith("https://")) e.preventDefault(); // le lecteur Twitch (cadre) peut rediriger, en HTTPS seulement
    });
    contents.on("will-attach-webview", (e) => e.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
  }

  /** Ce contenu web est-il celui du lecteur ? (session à part) */
  owns(contents: WebContents): boolean {
    return contents.session === session.fromPartition(PLAYER_PARTITION);
  }

  /** Arrête la lecture et retire la vue. */
  stop(): void {
    const v = this.view;
    this.view = null;
    this.channel = "";
    if (!v) return;
    try {
      const win = this.win();
      if (win && !win.isDestroyed()) win.contentView.removeChildView(v);
      v.webContents.close();
    } catch {
      // fenêtre déjà fermée
    }
  }

  /** À la fermeture de l'application. */
  dispose(): void {
    this.stop();
    this.server?.close();
    this.server = null;
  }
}
