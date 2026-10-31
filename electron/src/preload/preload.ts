// Pont minimal entre l'interface et le processus principal (bac à sable : seul « electron » est
// disponible ici, pas les fichiers du projet). Les noms de canaux sont recopiés de shared/channels.ts ;
// tests/channels.test.ts vérifie qu'ils restent identiques.
import { contextBridge, ipcRenderer } from "electron";
import type { ExternalLinkId, ThemeKey, WeCraftApi } from "../shared/api";

const GET_INFO = "app:get-info";
const RENDERED = "app:rendered";
const OPEN_DATA_DIR = "app:open-data-dir";
const SET_RAM = "settings:set-ram";
const SHADERS_GET = "settings:shaders-get";
const SHADERS_SET = "settings:shaders-set";
const UPDATE_CHECK = "update:check";
const UPDATE_INSTALL = "update:install";
const UPDATE_STATUS = "update:status";
const UPDATE_PAGE = "update:page";
const UPDATE_GET_BETA = "update:get-beta";
const UPDATE_SET_BETA = "update:set-beta";
const OPEN_LINK = "link:open";
const SET_THEME = "settings:set-theme";
const LIST_INSTANCES = "instances:list";
const SET_FAVORITE = "instances:set-favorite";
const REMOVE_INSTANCE = "instances:remove";
const CREATE_INSTANCE = "instances:create";
const LOADER_VERSIONS = "instances:loader-versions";
const EDIT_INSTANCE = "instances:edit";
const SET_ICON = "instances:set-icon";
const SCREENSHOTS = "instances:screenshots";
const WORLDS = "instances:worlds";
const WIN_MINIMIZE = "win:minimize";
const WIN_MAXIMIZE = "win:maximize";
const WIN_CLOSE = "win:close";
const WIN_STATE = "win:state";
const RELINK_STATE = "relink:state";
const RELINK_NOTIFICATIONS = "relink:notifications";
const RELINK_DISMISS_NOTIF = "relink:dismiss-notification";
const RELINK_CARD_IMAGE = "relink:card-image";
const MS_STATE = "microsoft:state";
const MS_LOGIN = "microsoft:login";
const MS_LOGOUT = "microsoft:logout";
const MS_GET_OFFICIAL = "microsoft:get-official";
const MS_SET_OFFICIAL = "microsoft:set-official";
const OFF_STATE = "offline:state";
const OFF_SET = "offline:set";
const OFF_SET_ACTIVE = "offline:set-active";
const OFF_REMOVE = "offline:remove";
const ACC_STATE = "account:state";
const ACC_LOGIN = "account:login";
const ACC_LOGOUT = "account:logout";
const ACC_REFRESH = "account:refresh";
const ACC_SKIN_UP = "account:skin-upload";
const ACC_SKIN_RM = "account:skin-remove";
const ACC_SKIN_IMG = "account:skin-image";
const ACC_BUY = "account:buy-skin";
const SKINMOD_GET = "skins:get-skin-mod";
const SKINMOD_SET = "skins:set-skin-mod";
const ACC_REDEEM = "account:redeem-code";
const ACC_QUESTS = "account:quests";
const FRIENDS_LIST = "friends:list";
const FRIENDS_REQUEST = "friends:request";
const FRIENDS_ACCEPT = "friends:accept";
const FRIENDS_DECLINE = "friends:decline";
const FRIENDS_REMOVE = "friends:remove";
const SKINS_LIST = "skins:list";
const SKINS_IMPORT = "skins:import-local";
const SKINS_INSTALL = "skins:install";
const SKINS_REMOVE = "skins:remove";
const FILES = "instances:files";
const OPEN_FOLDER = "instances:open-folder";
const GAME_LOG = "instances:game-log";
const CONTENT_LIST = "content:list";
const CONTENT_DETAILS = "content:details";
const CONTENT_TOGGLE = "content:toggle";
const CONTENT_REMOVE = "content:remove";
const SET_BACKGROUND = "instances:set-background";
const IMPORT_ICON = "media:import-icon";
const LOGS_READ = "logs:read";
const EVENT_INFO = "events:info";
const EVENT_SET_PACK = "events:set-pack";
const EVENT_SET_SHADER = "events:set-shader";
const EVENT_REMOVE = "events:remove";
const LOGS_OPEN_DIR = "logs:open-dir";
const LOGS_COPY = "logs:copy";
const MAKE_ICON = "media:make-icon";
const DISCORD_STATE = "discord:state";
const DISCORD_SET = "discord:set";
const MP_VERSIONS = "modpacks:versions";
const MP_SEARCH = "modpacks:search";
const MP_CREATE = "modpacks:create";
const MP_EDIT_INFO = "modpacks:edit-info";
const MP_ROWS = "modpacks:rows";
const MP_EDIT = "modpacks:edit";
const MP_STATUS = "modpacks:status";
const MP_PAGE = "modpacks:page";
const MP_ADD_MODS = "modpacks:add-mods";
const MP_IMPORT_FILE = "modpacks:import-file";
const MP_INSTALL_VERSION = "modpacks:install-version";
const MP_OFFICIAL_INSTALLED = "modpacks:official-installed";
const MP_INSTALL_OFFICIAL = "modpacks:install-official";
const MP_EXPORT_SHARED = "modpacks:export-shared";
const PROJ_SEARCH = "projects:search";
const PROJ_GET = "projects:get";
const PROJ_VERSIONS = "projects:versions";
const PROJ_OPEN_LINK = "projects:open-link";
const PROJ_INSTALLED = "projects:installed";
const PROJ_INSTALL_FILE = "projects:install-file";
const LAUNCH_START = "launch:start";
const LAUNCH_STATUS = "launch:status";
const LAUNCH_ANSWER = "launch:answer";

const api: WeCraftApi = Object.freeze({
  app: Object.freeze({
    getInfo: () => ipcRenderer.invoke(GET_INFO),
    rendered: () => ipcRenderer.invoke(RENDERED),
    openDataDir: () => ipcRenderer.invoke(OPEN_DATA_DIR),
  }),
  settings: Object.freeze({
    setTheme: (theme: ThemeKey) => ipcRenderer.invoke(SET_THEME, theme),
    setRam: (ram: number) => ipcRenderer.invoke(SET_RAM, ram),
    shaders: () => ipcRenderer.invoke(SHADERS_GET),
    setShaders: (p: unknown) => ipcRenderer.invoke(SHADERS_SET, p),
  }),
  instances: Object.freeze({
    list: (rescan?: boolean) => ipcRenderer.invoke(LIST_INSTANCES, rescan === true),
    setFavorite: (id: string, fav: boolean) => ipcRenderer.invoke(SET_FAVORITE, id, fav),
    remove: (id: string, confirmed: true) => ipcRenderer.invoke(REMOVE_INSTANCE, id, confirmed === true),
    create: (req: unknown) => ipcRenderer.invoke(CREATE_INSTANCE, req),
    loaderVersions: (loader: string, mc: string) => ipcRenderer.invoke(LOADER_VERSIONS, loader, mc),
    edit: (id: string, e: unknown) => ipcRenderer.invoke(EDIT_INSTANCE, id, e),
    setIcon: (id: string, icon: unknown) => ipcRenderer.invoke(SET_ICON, id, icon),
    screenshots: (id: string) => ipcRenderer.invoke(SCREENSHOTS, id),
    setBackground: (id: string, how: string, token?: string) => ipcRenderer.invoke(SET_BACKGROUND, id, how, token ?? null),
    worlds: (id: string) => ipcRenderer.invoke(WORLDS, id),
    files: (id: string) => ipcRenderer.invoke(FILES, id),
    openFolder: (id: string, sub?: string) => ipcRenderer.invoke(OPEN_FOLDER, id, sub ?? ""),
    gameLog: (id: string) => ipcRenderer.invoke(GAME_LOG, id),
  }),
  relink: Object.freeze({
    state: (force?: boolean) => ipcRenderer.invoke(RELINK_STATE, force === true),
    notifications: () => ipcRenderer.invoke(RELINK_NOTIFICATIONS),
    /** Supprime une notification de la boîte locale ; renvoie la boîte à jour. */
    dismissNotification: (id: string) => ipcRenderer.invoke(RELINK_DISMISS_NOTIF, id),
    /** Image d'un encart (bannière), en data: (l'interface ne charge aucune image distante). */
    cardImage: (bannerId: string) => ipcRenderer.invoke(RELINK_CARD_IMAGE, bannerId),
  }),
  microsoft: Object.freeze({
    state: () => ipcRenderer.invoke(MS_STATE),
    login: () => ipcRenderer.invoke(MS_LOGIN),
    logout: () => ipcRenderer.invoke(MS_LOGOUT),
    openOfficial: () => ipcRenderer.invoke(MS_GET_OFFICIAL),
    setOpenOfficial: (on: boolean) => ipcRenderer.invoke(MS_SET_OFFICIAL, on === true),
  }),
  offline: Object.freeze({
    state: () => ipcRenderer.invoke(OFF_STATE),
    set: (name: string) => ipcRenderer.invoke(OFF_SET, name),
    setActive: (on: boolean) => ipcRenderer.invoke(OFF_SET_ACTIVE, on === true),
    remove: () => ipcRenderer.invoke(OFF_REMOVE),
  }),
  account: Object.freeze({
    state: () => ipcRenderer.invoke(ACC_STATE),
    login: () => ipcRenderer.invoke(ACC_LOGIN),
    logout: () => ipcRenderer.invoke(ACC_LOGOUT),
    refresh: () => ipcRenderer.invoke(ACC_REFRESH),
    uploadMinecraftSkin: (model: "classic" | "slim") => ipcRenderer.invoke(ACC_SKIN_UP, model === "slim" ? "slim" : "classic"),
    removeMinecraftSkin: () => ipcRenderer.invoke(ACC_SKIN_RM),
    minecraftSkinImage: () => ipcRenderer.invoke(ACC_SKIN_IMG),
    buySkin: (relinkId: string) => ipcRenderer.invoke(ACC_BUY, relinkId),
    skinMod: () => ipcRenderer.invoke(SKINMOD_GET),
    setSkinMod: (on: boolean) => ipcRenderer.invoke(SKINMOD_SET, on === true),
    redeemCode: (code: string) => ipcRenderer.invoke(ACC_REDEEM, code),
    quests: () => ipcRenderer.invoke(ACC_QUESTS),
  }),
  friends: Object.freeze({
    list: () => ipcRenderer.invoke(FRIENDS_LIST),
    request: (pseudo: string) => ipcRenderer.invoke(FRIENDS_REQUEST, pseudo),
    accept: (discordId: string) => ipcRenderer.invoke(FRIENDS_ACCEPT, discordId),
    decline: (discordId: string) => ipcRenderer.invoke(FRIENDS_DECLINE, discordId),
    remove: (discordId: string) => ipcRenderer.invoke(FRIENDS_REMOVE, discordId),
  }),
  skins: Object.freeze({
    list: () => ipcRenderer.invoke(SKINS_LIST),
    importLocal: () => ipcRenderer.invoke(SKINS_IMPORT),
    install: (relinkId: string) => ipcRenderer.invoke(SKINS_INSTALL, relinkId),
    remove: (key: string) => ipcRenderer.invoke(SKINS_REMOVE, key),
  }),
  win: Object.freeze({
    minimize: () => ipcRenderer.invoke(WIN_MINIMIZE),
    maximize: () => ipcRenderer.invoke(WIN_MAXIMIZE),
    close: () => ipcRenderer.invoke(WIN_CLOSE),
    state: () => ipcRenderer.invoke(WIN_STATE),
  }),
  content: Object.freeze({
    list: (id: string) => ipcRenderer.invoke(CONTENT_LIST, id),
    details: (id: string) => ipcRenderer.invoke(CONTENT_DETAILS, id),
    toggle: (id: string, kind: string, file: string, on: boolean) => ipcRenderer.invoke(CONTENT_TOGGLE, id, kind, file, on === true),
    remove: (id: string, kind: string, file: string) => ipcRenderer.invoke(CONTENT_REMOVE, id, kind, file),
  }),
  events: Object.freeze({
    info: (id: string) => ipcRenderer.invoke(EVENT_INFO, id),
    setPack: (id: string, name: string, on: boolean) => ipcRenderer.invoke(EVENT_SET_PACK, id, name, on === true),
    setShader: (id: string, name: string | null) => ipcRenderer.invoke(EVENT_SET_SHADER, id, name),
    remove: (id: string, kind: string, name: string) => ipcRenderer.invoke(EVENT_REMOVE, id, kind, name),
  }),
  logs: Object.freeze({
    read: () => ipcRenderer.invoke(LOGS_READ),
    openDir: () => ipcRenderer.invoke(LOGS_OPEN_DIR),
    copy: (text: string) => ipcRenderer.invoke(LOGS_COPY, typeof text === "string" ? text : ""),
  }),
  media: Object.freeze({
    importIcon: () => ipcRenderer.invoke(IMPORT_ICON),
    makeIcon: (key: string, ext: string, crop: unknown) => ipcRenderer.invoke(MAKE_ICON, key, ext, crop),
  }),
  launch: Object.freeze({
    start: (id: string, opts: { ram: number; repair?: boolean }) =>
      ipcRenderer.invoke(LAUNCH_START, id, { ram: opts?.ram, repair: opts?.repair === true }),
    status: (job: string) => ipcRenderer.invoke(LAUNCH_STATUS, job),
    answer: (job: string, force: boolean) => ipcRenderer.invoke(LAUNCH_ANSWER, job, force === true),
  }),
  discord: Object.freeze({
    state: () => ipcRenderer.invoke(DISCORD_STATE),
    set: (on: boolean, answer?: boolean) => ipcRenderer.invoke(DISCORD_SET, on === true, answer === true),
  }),
  modpacks: Object.freeze({
    versions: () => ipcRenderer.invoke(MP_VERSIONS),
    search: (q: unknown) => ipcRenderer.invoke(MP_SEARCH, q),
    create: (p: unknown) => ipcRenderer.invoke(MP_CREATE, p),
    editInfo: (id: string) => ipcRenderer.invoke(MP_EDIT_INFO, id),
    rows: (id: string | null, selected: unknown) => ipcRenderer.invoke(MP_ROWS, id, selected),
    edit: (id: string, selected: unknown) => ipcRenderer.invoke(MP_EDIT, id, selected),
    status: (job: string) => ipcRenderer.invoke(MP_STATUS, job),
    openPage: (slug: string) => ipcRenderer.invoke(MP_PAGE, slug),
    addMods: (id: string, roots: unknown) => ipcRenderer.invoke(MP_ADD_MODS, id, roots),
    importFile: () => ipcRenderer.invoke(MP_IMPORT_FILE),
    installVersion: (versionId: string, name?: string) => ipcRenderer.invoke(MP_INSTALL_VERSION, versionId, name ?? null),
    officialInstalled: () => ipcRenderer.invoke(MP_OFFICIAL_INSTALLED),
    installOfficial: (relinkId: string) => ipcRenderer.invoke(MP_INSTALL_OFFICIAL, relinkId),
    exportShared: (instanceId: string) => ipcRenderer.invoke(MP_EXPORT_SHARED, instanceId),
  }),
  projects: Object.freeze({
    search: (q: unknown) => ipcRenderer.invoke(PROJ_SEARCH, q),
    get: (id: string) => ipcRenderer.invoke(PROJ_GET, id),
    versions: (id: string, mc?: string, loader?: string) => ipcRenderer.invoke(PROJ_VERSIONS, id, mc ?? null, loader ?? null),
    openLink: (token: string) => ipcRenderer.invoke(PROJ_OPEN_LINK, token),
    installed: (instanceId: string, type: string) => ipcRenderer.invoke(PROJ_INSTALLED, instanceId, type),
    installFile: (instanceId: string, versionId: string) => ipcRenderer.invoke(PROJ_INSTALL_FILE, instanceId, versionId),
  }),
  update: Object.freeze({
    check: (manual: boolean) => ipcRenderer.invoke(UPDATE_CHECK, manual === true),
    install: () => ipcRenderer.invoke(UPDATE_INSTALL),
    status: () => ipcRenderer.invoke(UPDATE_STATUS),
    openPage: () => ipcRenderer.invoke(UPDATE_PAGE),
    beta: () => ipcRenderer.invoke(UPDATE_GET_BETA),
    setBeta: (on: boolean) => ipcRenderer.invoke(UPDATE_SET_BETA, on === true),
  }),
  links: Object.freeze({
    open: (id: ExternalLinkId) => ipcRenderer.invoke(OPEN_LINK, id),
  }),
});

contextBridge.exposeInMainWorld("wecraft", api);
