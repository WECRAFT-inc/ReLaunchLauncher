// Pont minimal entre l'interface et le processus principal (bac à sable : seul « electron » est
// disponible ici, pas les fichiers du projet). Les noms de canaux sont recopiés de shared/channels.ts ;
// tests/channels.test.ts vérifie qu'ils restent identiques.
import { contextBridge, ipcRenderer } from "electron";
import type { ExternalLinkId, WeCraftApi } from "../shared/api";

const GET_INFO = "app:get-info";
const OPEN_LINK = "link:open";

const api: WeCraftApi = Object.freeze({
  app: Object.freeze({
    getInfo: () => ipcRenderer.invoke(GET_INFO),
  }),
  links: Object.freeze({
    open: (id: ExternalLinkId) => ipcRenderer.invoke(OPEN_LINK, id),
  }),
});

contextBridge.exposeInMainWorld("wecraft", api);
