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
const MP_IMPORT_FILE = "modpacks:import-file";
const MP_INSTALL_VERSION = "modpacks:install-version";
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
    importFile: () => ipcRenderer.invoke(MP_IMPORT_FILE),
    installVersion: (versionId: string, name?: string) => ipcRenderer.invoke(MP_INSTALL_VERSION, versionId, name ?? null),
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
  }),
  links: Object.freeze({
    open: (id: ExternalLinkId) => ipcRenderer.invoke(OPEN_LINK, id),
  }),
});

contextBridge.exposeInMainWorld("wecraft", api);
