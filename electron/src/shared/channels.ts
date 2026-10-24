// Noms des canaux IPC. Le preload (bac à sable, sans accès aux fichiers locaux) en garde une copie :
// tests/channels.test.ts vérifie que les deux listes sont identiques.
export const CHANNELS = {
  getInfo: "app:get-info",
  rendered: "app:rendered",
  openDataDir: "app:open-data-dir",
  setRam: "settings:set-ram",
  updateCheck: "update:check",
  updateInstall: "update:install",
  updateStatus: "update:status",
  updatePage: "update:page",
  openLink: "link:open",
  setTheme: "settings:set-theme",
  listInstances: "instances:list",
  setFavorite: "instances:set-favorite",
  removeInstance: "instances:remove",
  mpVersions: "modpacks:versions",
  mpSearch: "modpacks:search",
  mpCreate: "modpacks:create",
  mpEditInfo: "modpacks:edit-info",
  mpRows: "modpacks:rows",
  mpEdit: "modpacks:edit",
  mpStatus: "modpacks:status",
  mpPage: "modpacks:page",
  launchStart: "launch:start",
  launchStatus: "launch:status",
  launchAnswer: "launch:answer",
} as const;

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];

export const ALL_CHANNELS: readonly string[] = Object.values(CHANNELS);
