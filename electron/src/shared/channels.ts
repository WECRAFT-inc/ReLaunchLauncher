// Noms des canaux IPC. Le preload (bac à sable, sans accès aux fichiers locaux) en garde une copie :
// tests/channels.test.ts vérifie que les deux listes sont identiques.
export const CHANNELS = {
  getInfo: "app:get-info",
  openLink: "link:open",
  setTheme: "settings:set-theme",
} as const;

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];

export const ALL_CHANNELS: readonly string[] = Object.values(CHANNELS);
