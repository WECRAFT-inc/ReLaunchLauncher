// Processus principal de WeCraft (Electron). Seul processus autorisé à toucher au disque, au réseau
// et aux autres programmes. Lot E0 : fenêtre sécurisée + lecture seule des informations d'accueil.
// Aucune donnée utilisateur n'est modifiée par cette version.
import { app, BrowserWindow, ipcMain, Menu, protocol, session, shell } from "electron";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AppInfo } from "../shared/api";
import { CHANNELS } from "../shared/channels";
import { readSavedTheme } from "./config";
import { configFile, wecraftDataDir, type PathEnv } from "./paths";
import {
  APP_ENTRY,
  APP_SCHEME,
  CONTENT_SECURITY_POLICY,
  EXTERNAL_LINKS,
  isAppUrl,
  isExternalLinkId,
  mimeType,
  resolveAppAsset,
  secureWebPreferences,
} from "./security";

const RENDERER_ROOT = path.join(__dirname, "..", "renderer");
const PRELOAD = path.join(__dirname, "..", "preload", "preload.js");

let mainWindow: BrowserWindow | null = null;
/** Mesuré une seule fois, à la première demande de l'interface (diagnostic de lenteur au démarrage). */
let startupMs: number | undefined;

// ---------------------------------------------------------------- avant « ready »
app.enableSandbox(); // tous les processus de rendu en bac à sable, sans exception
app.setAppUserModelId("WeCraft.Launcher"); // même identifiant que la version Python (barre des tâches)

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: false, corsEnabled: false } },
]);

// Un seul WeCraft à la fois : un second lancement remet simplement la fenêtre existante au premier plan.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(start).catch((err: unknown) => {
    console.error("Démarrage impossible :", err);
    app.exit(1);
  });
}

app.on("window-all-closed", () => app.quit());

// ---------------------------------------------------------------- règles appliquées à tout contenu web
app.on("web-contents-created", (_event, contents: WebContents) => {
  // Aucune navigation hors de l'interface, aucune fenêtre secondaire, aucune <webview>.
  contents.on("will-navigate", (e, url) => {
    if (!isAppUrl(url)) e.preventDefault();
  });
  contents.on("will-redirect", (e, url) => {
    if (!isAppUrl(url)) e.preventDefault();
  });
  contents.on("will-attach-webview", (e) => e.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
});

// ---------------------------------------------------------------- démarrage
function pathEnv(): PathEnv {
  return { platform: process.platform, env: process.env, home: os.homedir() };
}

async function serveAsset(request: Request): Promise<Response> {
  const file = resolveAppAsset(RENDERER_ROOT, request.url);
  const type = file ? mimeType(file) : null;
  if (!file || !type) return new Response("Introuvable", { status: 404 });
  try {
    const body = await readFile(file);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Content-Security-Policy": CONTENT_SECURITY_POLICY,
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return new Response("Introuvable", { status: 404 });
  }
}

function lockDownSession(): void {
  const s = session.defaultSession;
  s.setPermissionRequestHandler((_wc, _permission, callback) => callback(false)); // caméra, micro, notifications…
  s.setPermissionCheckHandler(() => false);
  s.setDevicePermissionHandler(() => false);
  // L'interface ne fait aucune requête réseau : tout ce qui n'est pas app:// est bloqué.
  s.webRequest.onBeforeRequest((details, callback) => {
    const allowed = details.url.startsWith(`${APP_SCHEME}://`) || details.url.startsWith("devtools://");
    callback({ cancel: !allowed });
  });
}

async function start(): Promise<void> {
  lockDownSession();
  protocol.handle(APP_SCHEME, serveAsset);
  registerIpc();
  if (app.isPackaged) Menu.setApplicationMenu(null);
  createWindow();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: "WeCraft",
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0A0B10",
    show: false,
    autoHideMenuBar: true,
    webPreferences: secureWebPreferences(PRELOAD, !app.isPackaged),
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  void mainWindow.loadURL(APP_ENTRY);
}

// ---------------------------------------------------------------- IPC
/** Seule la fenêtre principale, affichant l'interface de WeCraft, peut appeler le processus principal. */
function trustedSender(event: IpcMainInvokeEvent): boolean {
  const frameUrl = event.senderFrame?.url ?? "";
  return mainWindow !== null && event.sender === mainWindow.webContents && isAppUrl(frameUrl);
}

function registerIpc(): void {
  ipcMain.handle(CHANNELS.getInfo, async (event): Promise<AppInfo> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    const env = pathEnv();
    const dataDir = wecraftDataDir(env);
    let dataDirExists = false;
    try {
      dataDirExists = (await stat(dataDir)).isDirectory();
    } catch {
      dataDirExists = false;
    }
    return {
      version: app.getVersion(),
      electron: process.versions.electron ?? "",
      chrome: process.versions.chrome ?? "",
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      dataDir,
      dataDirExists,
      savedTheme: await readSavedTheme(configFile(env)),
      startupMs: startupMs ??= Math.round(process.uptime() * 1000),
      portable: Boolean(process.env["PORTABLE_EXECUTABLE_FILE"]),
    };
  });

  ipcMain.handle(CHANNELS.openLink, async (event, id: unknown): Promise<boolean> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    if (!isExternalLinkId(id)) return false; // jamais d'adresse fournie par l'interface
    await shell.openExternal(EXTERNAL_LINKS[id]);
    return true;
  });
}
