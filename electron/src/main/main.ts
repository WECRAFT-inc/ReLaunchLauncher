// Processus principal de ReLaunch (Electron). Seul processus autorisé à toucher au disque, au réseau
// et aux autres programmes. Lot E1 : réglages lus et écrits avec les mêmes garde-fous que la version
// Python (copie des fichiers invalides, écriture atomique, jamais d'écriture dans un fichier illisible).
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, protocol, session, shell } from "electron";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ModpackEditInfo, ModpackJob, ModpackSearch, ModpackStartResult, PackRowView, UpdateCheck, UpdateStatus } from "../shared/api";
import type { LoaderVersionList } from "../shared/api";
import type { AppInfo, DeleteResult, InstanceList, InvalidFileNotice, LaunchStartResult, LaunchStatus, SettingResult } from "../shared/api";
import { CHANNELS } from "../shared/channels";
import { Settings } from "./config";
import { loadXmcl } from "./install/xmcl";
import { instancesDir } from "./instances/detect";
import { InstanceService } from "./instances/service";
import { loaderVersionList } from "./install/loaderList";
import { isSafeVersionId } from "./install/vanilla";
import { registerLookIpc, registerProjectIpc } from "./ipcLook";
import { LinkStore } from "./links";
import { MediaStore, type ImageOps } from "./media/media";
import { ModpackService } from "./modpacks/service";
import { DiscordPresence, discordClientId } from "./discord/presence";
import { LaunchService } from "./launch/launch";
import { fileLogger } from "./launch/log";
import { closeOfficialLauncher, nodeRunner, openOfficialLauncher } from "./launch/officialLauncher";
import { defaultInstanceName, profileNameFor } from "./launch/profiles";
import { cleanupLeftovers, markHealthy, restorePrevious, startupCheck, type UpdateEnv } from "./update/pending";
import { UpdateService } from "./update/service";
import { fetchReleaseProof } from "./update/release";
import { configFile, legacyDataDirs, minecraftDir, wecraftDataDir, type PathEnv } from "./paths";
import { JsonStore } from "./storage/jsonStore";
import { migrateOldSettings } from "./storage/migrate";
import {
  APP_ENTRY,
  APP_SCHEME,
  CONTENT_SECURITY_POLICY,
  EXTERNAL_LINKS,
  isAppUrl,
  isExternalLinkId,
  mimeType,
  isFullScreenToggle,
  resolveAppAsset,
  secureWebPreferences,
} from "./security";

const RENDERER_ROOT = path.join(__dirname, "..", "renderer");
const PRELOAD = path.join(__dirname, "..", "preload", "preload.js");

let mainWindow: BrowserWindow | null = null;
/** Mesuré une seule fois, à la première demande de l'interface (diagnostic de lenteur au démarrage). */
let startupMs: number | undefined;
const store = new JsonStore();
let settings: Settings | null = null;
let instances: InstanceService | null = null;
let launcher: LaunchService | null = null;
let updater: UpdateService | null = null;
let modpacks: ModpackService | null = null;
let presence: DiscordPresence | null = null;
let updateEnv: UpdateEnv | null = null;
let media: MediaStore | null = null;
let healthyDone = false;
let migrated: string[] = [];

// ---------------------------------------------------------------- avant « ready »
app.enableSandbox(); // tous les processus de rendu en bac à sable, sans exception
app.setAppUserModelId("ReLaunch.Launcher");

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: false, corsEnabled: false } },
]);

// Un seul ReLaunch à la fois : un second lancement remet simplement la fenêtre existante au premier plan.
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

/** Images avec Electron (nativeImage : PNG et JPEG). */
const nativeOps: ImageOps = {
  size(buf) {
    const im = nativeImage.createFromBuffer(buf);
    return im.isEmpty() ? null : im.getSize();
  },
  cropSquare(buf, r, out) {
    return nativeImage.createFromBuffer(buf).crop({ x: r.x, y: r.y, width: r.size, height: r.size }).resize({ width: out, height: out, quality: "best" }).toPNG();
  },
  shrinkJpeg(buf, maxWidth) {
    let im = nativeImage.createFromBuffer(buf);
    if (im.getSize().width > maxWidth) im = im.resize({ width: maxWidth, quality: "best" });
    return im.toJPEG(85);
  },
};

async function serveAsset(request: Request): Promise<Response> {
  // Images (icônes, fonds, captures, Modrinth) : noms opaques vérifiés dans MediaStore.serve
  if (media) {
    let pathname = "";
    try {
      const u = new URL(request.url);
      if (u.host === "wecraft") pathname = decodeURIComponent(u.pathname);
    } catch {
      pathname = "";
    }
    const r = pathname ? await media.serve(pathname) : null;
    if (r) {
      return r.data
        ? new Response(new Uint8Array(r.data), { status: 200, headers: { "Content-Type": r.type!, "X-Content-Type-Options": "nosniff", "Cache-Control": "max-age=86400", "Cross-Origin-Resource-Policy": "same-origin" } })
        : new Response("Introuvable", { status: 404 });
    }
  }
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
  const env = pathEnv();
  try {
    migrated = (await migrateOldSettings(wecraftDataDir(env), legacyDataDirs(env))).map((m) => path.basename(m.file));
  } catch {
    migrated = []; // une reprise impossible ne doit jamais empêcher WeCraft de démarrer
  }
  // Lot E5 : mise à jour en attente (comptage des démarrages, retour arrière au 2ᵉ échec), AVANT la fenêtre
  updateEnv = {
    dataDir: wecraftDataDir(env),
    execPath: process.execPath,
    version: app.getVersion(),
    platform: process.platform,
    packaged: app.isPackaged,
    store,
    start: (file, args) => nodeRunner.start(file, args),
    releaseProof: (v) => fetchReleaseProof(v),
  };
  const failed = await startupCheck(updateEnv);
  if (failed) {
    const answer = await dialog.showMessageBox({
      type: "warning",
      title: "ReLaunch",
      message:
        `La version v${failed.data.to || "?"} installée par la dernière mise à jour ne semble pas avoir démarré correctement.\n\n` +
        `Revenir à la version précédente (v${failed.data.from || "?"}) ?`,
      buttons: ["Revenir à la version précédente", "Continuer avec cette version"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (answer.response === 0) {
      try {
        await restorePrevious(updateEnv, failed);
        app.exit(0);
        return;
      } catch (e) {
        dialog.showErrorBox("ReLaunch", `Retour à la version précédente impossible :\n${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } else {
    void cleanupLeftovers(updateEnv);
  }
  updater = new UpdateService({ env: updateEnv, quit: () => app.quit() });
  settings = new Settings(store, configFile(env));
  instances = new InstanceService(store, env);
  media = new MediaStore({ dataDir: wecraftDataDir(env), ops: nativeOps });
  modpacks = new ModpackService({
    media,
    instancesDir: instancesDir(env),
    instances,
    userAgent: `Rexidelamort/WeCraft-Launcher/${app.getVersion()} (ReLaunch)`,
    trash: (f) => shell.trashItem(f), // mods retirés : corbeille de Windows uniquement
  });
  const launchLog = fileLogger(path.join(wecraftDataDir(env), "logs", "lancement.log"));
  launcher = new LaunchService({
    mcDir: minecraftDir(env),
    profile: {
      store,
      idsFile: path.join(wecraftDataDir(env), "managed_profiles.json"),
      backupDir: path.join(wecraftDataDir(env), "backups", "launcher_profiles"),
    },
    xmcl: loadXmcl,
    log: launchLog,
    onOpened: (t) => void presence?.launching(t.profileName.replace(/^WECRAFT - /, ""), t.mc, t.loader),
    close: (o) => closeOfficialLauncher(o, { platform: process.platform, env: process.env, runner: nodeRunner, log: launchLog }),
    open: () => openOfficialLauncher({ platform: process.platform, env: process.env, runner: nodeRunner, log: launchLog }),
  });
  // Statut Discord (lot E9) : désactivé par défaut, comme la version Python
  const dc = await settings.discord(app.getVersion());
  presence = new DiscordPresence({ clientId: discordClientId(dc.config), enabled: dc.enabled, version: app.getVersion() });
  if (dc.enabled) void presence.idle();
  lockDownSession();
  protocol.handle(APP_SCHEME, serveAsset);
  registerIpc();
  if (app.isPackaged) Menu.setApplicationMenu(null);
  createWindow();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: "ReLaunch",
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0A0B10",
    show: false,
    autoHideMenuBar: true,
    icon: path.join(RENDERER_ROOT, "assets", "relaunch_logo.png"),
    webPreferences: secureWebPreferences(PRELOAD, !app.isPackaged),
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  // F11 : vrai plein écran de la fenêtre (pas un effet CSS) ; un second appui revient en fenêtré.
  // Échap n'est pas intercepté ici : il reste à l'interface (fermeture des panneaux, retour à l'accueil).
  mainWindow.webContents.on("before-input-event", (event: { preventDefault: () => void }, input: Parameters<typeof isFullScreenToggle>[0]) => {
    if (isFullScreenToggle(input) && mainWindow) {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });
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
  const handle = (channel: string, fn: (...args: unknown[]) => Promise<unknown>) =>
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      if (!trustedSender(event)) throw new Error("Expéditeur refusé");
      return fn(...args);
    });
  registerProjectIpc(handle, { modpacks: () => modpacks, media: () => media, links: new LinkStore(), openExternal: (url) => shell.openExternal(url) });
  registerLookIpc(handle, {
    instances: () => instances,
    media: () => media,
    instancesDir: () => instancesDir(pathEnv()),
    platform: process.platform,
    pickImage: async (title) => {
      const opts = { title, properties: ["openFile" as const], filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }] };
      const r = mainWindow ? await dialog.showOpenDialog(mainWindow, opts) : await dialog.showOpenDialog(opts);
      return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
    },
  });
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
      savedTheme: settings ? await settings.theme() : null,
      ram: settings ? await settings.ram() : 4,
      startupMs: startupMs ??= Math.round(process.uptime() * 1000),
      portable: Boolean(process.env["PORTABLE_EXECUTABLE_FILE"]),
      invalidFiles: store.takeInvalidFiles().map(
        (r): InvalidFileNotice => ({ name: path.basename(r.file), copyName: r.copy ? path.basename(r.copy) : null }),
      ),
      migrated: migrated.splice(0),
    };
  });

  ipcMain.handle(CHANNELS.rendered, async (event): Promise<void> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    // fenêtre réellement affichée et premier rendu fait : la mise à jour est validée (une seule fois)
    if (healthyDone || !updateEnv || !mainWindow?.isVisible()) return;
    healthyDone = true;
    await markHealthy(updateEnv, updater?.handedOff ?? false);
  });

  ipcMain.handle(CHANNELS.updateCheck, async (event, manual: unknown): Promise<UpdateCheck> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    if (!updater) return { state: "error", message: "Mises à jour indisponibles." };
    return updater.check(manual === true);
  });

  ipcMain.handle(CHANNELS.updateInstall, async (event): Promise<boolean> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    return updater?.install() ?? false;
  });

  ipcMain.handle(CHANNELS.updateStatus, async (event): Promise<UpdateStatus> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    return updater?.status() ?? { phase: "idle", done: 0, total: 0, message: "" };
  });

  ipcMain.handle(CHANNELS.updatePage, async (event): Promise<boolean> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    const url = updater?.page();
    if (!url) return false; // adresse GitHub vérifiée dans le service
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle(CHANNELS.setRam, async (event, ram: unknown): Promise<boolean> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    if (!settings || typeof ram !== "number" || !Number.isInteger(ram) || ram < 1 || ram > 16) return false;
    return settings.setRam(ram);
  });

  ipcMain.handle(CHANNELS.openDataDir, async (event): Promise<boolean> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    // dossier fixe, jamais un chemin fourni par l'interface
    return (await shell.openPath(wecraftDataDir(pathEnv()))) === "";
  });

  ipcMain.handle(CHANNELS.setTheme, async (event, theme: unknown): Promise<SettingResult> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    if (!settings) return { ok: false, reason: "write-failed" };
    return settings.setTheme(theme); // valeur vérifiée dans setTheme (liste fermée de thèmes)
  });

  ipcMain.handle(CHANNELS.listInstances, async (event, rescan: unknown): Promise<InstanceList> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    if (!instances) return { instances: [], hidden: 0 };
    return instances.list(rescan === true); // lecture seule des dossiers d'instances
  });

  ipcMain.handle(CHANNELS.setFavorite, async (event, id: unknown, fav: unknown): Promise<SettingResult> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    if (!instances) return { ok: false, reason: "write-failed" };
    return instances.setFavorite(id, fav); // identifiant opaque + booléen vérifiés dans le service
  });

  ipcMain.handle(CHANNELS.removeInstance, async (event, id: unknown, confirmed: unknown): Promise<DeleteResult> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    if (!instances || confirmed !== true) return { ok: false, reason: "invalid" };
    if (launcher?.busy() || modpacks?.busy()) return { ok: false, reason: "busy" };
    // corbeille de Windows uniquement : jamais d'effacement définitif
    return instances.remove(id, (folder) => shell.trashItem(folder));
  });

  // ---------------------------------------------------------------- créer une instance « Sur mesure »
  ipcMain.handle(CHANNELS.loaderVersions, async (event, loader: unknown, mc: unknown): Promise<LoaderVersionList> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    if (typeof loader !== "string" || typeof mc !== "string" || !isSafeVersionId(mc)) return { ok: false, message: "Version invalide." };
    return loaderVersionList(loader, mc);
  });

  // ---------------------------------------------------------------- modpacks (lot E7)
  ipcMain.handle(CHANNELS.discordState, async (event): Promise<{ enabled: boolean; askNow: boolean }> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    if (!settings) return { enabled: false, askNow: false };
    const s = await settings.discord(app.getVersion());
    return { enabled: s.enabled, askNow: s.askNow && !!presence?.usable };
  });
  ipcMain.handle(CHANNELS.discordSet, async (event, on: unknown, answer: unknown): Promise<boolean> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    if (!settings || typeof on !== "boolean") return false;
    const ok = await settings.setDiscord(on, answer === true ? app.getVersion() : undefined);
    if (ok) {
      await presence?.setEnabled(on);
      if (on) void presence?.idle();
    }
    return ok;
  });

  ipcMain.handle(CHANNELS.mpVersions, async (event): Promise<string[] | null> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    try {
      return (await modpacks?.mcVersions()) ?? null;
    } catch {
      return null;
    }
  });
  ipcMain.handle(CHANNELS.mpSearch, async (event, q: unknown): Promise<ModpackSearch> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    return modpacks ? modpacks.search(q) : { ok: false, message: "Indisponible." };
  });
  ipcMain.handle(CHANNELS.mpCreate, async (event, p: unknown): Promise<ModpackStartResult> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    return modpacks ? modpacks.create(p) : { ok: false, reason: "invalid" };
  });
  ipcMain.handle(CHANNELS.mpEditInfo, async (event, id: unknown): Promise<ModpackEditInfo | null> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    return modpacks ? modpacks.editInfo(id) : null;
  });
  ipcMain.handle(CHANNELS.mpRows, async (event, id: unknown, selected: unknown): Promise<PackRowView[]> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    return modpacks ? modpacks.rows(id, selected) : [];
  });
  ipcMain.handle(CHANNELS.mpEdit, async (event, id: unknown, selected: unknown): Promise<ModpackStartResult> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    if (launcher?.busy()) return { ok: false, reason: "busy" };
    return modpacks ? modpacks.edit(id, selected) : { ok: false, reason: "invalid" };
  });
  ipcMain.handle(CHANNELS.mpStatus, async (event, job: unknown): Promise<ModpackJob | null> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    return modpacks?.status(job) ?? null;
  });
  ipcMain.handle(CHANNELS.mpPage, async (event, slug: unknown): Promise<boolean> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    if (typeof slug !== "string" || !/^[\w-]{1,100}$/.test(slug)) return false; // adresse construite ici
    await shell.openExternal(`https://modrinth.com/mod/${slug}`);
    return true;
  });

  ipcMain.handle(CHANNELS.launchStart, async (event, id: unknown, opts: unknown): Promise<LaunchStartResult> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    const inst = instances?.target(id); // identifiant opaque : le dossier n'est jamais fourni par l'interface
    if (!inst || !launcher) return { ok: false, reason: "invalid" };
    if (!inst.version) return { ok: false, reason: "no-version" };
    if (modpacks?.busy()) return { ok: false, reason: "busy" }; // mods en cours de téléchargement
    const o = (typeof opts === "object" && opts !== null ? opts : {}) as { ram?: unknown; repair?: unknown };
    const ram = typeof o.ram === "number" ? o.ram : NaN;
    const started = launcher.start(
      {
        gameDir: inst.path,
        profileName: profileNameFor(inst.display || defaultInstanceName(inst.path)),
        mc: inst.version,
        loader: inst.loader,
        loaderVersion: inst.loaderVersion,
      },
      { ram, repair: o.repair === true },
    );
    if (started.ok) {
      // comme la version Python : la RAM choisie devient celle proposée la prochaine fois
      await settings?.setRam(ram);
      await instances?.rememberRam(id, ram);
    }
    return started;
  });

  ipcMain.handle(CHANNELS.launchStatus, async (event, job: unknown): Promise<LaunchStatus | null> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    return launcher?.status(job) ?? null;
  });

  ipcMain.handle(CHANNELS.launchAnswer, async (event, job: unknown, force: unknown): Promise<boolean> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    return launcher?.answer(job, force) ?? false;
  });

  ipcMain.handle(CHANNELS.openLink, async (event, id: unknown): Promise<boolean> => {
    if (!trustedSender(event)) throw new Error("Expéditeur refusé");
    if (!isExternalLinkId(id)) return false; // jamais d'adresse fournie par l'interface
    await shell.openExternal(EXTERNAL_LINKS[id]);
    return true;
  });
}
