// Pont minimal entre l'interface et le processus principal (bac à sable : seul « electron » est
// disponible ici, pas les fichiers du projet). Les noms de canaux sont recopiés de shared/channels.ts ;
// tests/channels.test.ts vérifie qu'ils restent identiques.
import { contextBridge, ipcRenderer } from "electron";
import type { ExternalLinkId, ThemeKey, WeCraftApi } from "../shared/api";

const GET_INFO = "app:get-info";
const OPEN_LINK = "link:open";
const SET_THEME = "settings:set-theme";
const LIST_INSTANCES = "instances:list";
const SET_FAVORITE = "instances:set-favorite";

const api: WeCraftApi = Object.freeze({
  app: Object.freeze({
    getInfo: () => ipcRenderer.invoke(GET_INFO),
  }),
  settings: Object.freeze({
    setTheme: (theme: ThemeKey) => ipcRenderer.invoke(SET_THEME, theme),
  }),
  instances: Object.freeze({
    list: (rescan?: boolean) => ipcRenderer.invoke(LIST_INSTANCES, rescan === true),
    setFavorite: (id: string, fav: boolean) => ipcRenderer.invoke(SET_FAVORITE, id, fav),
  }),
  links: Object.freeze({
    open: (id: ExternalLinkId) => ipcRenderer.invoke(OPEN_LINK, id),
  }),
});

contextBridge.exposeInMainWorld("wecraft", api);
