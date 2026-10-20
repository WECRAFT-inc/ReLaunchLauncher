// Contrat entre l'interface (processus de rendu) et le processus principal.
// L'interface ne voit QUE cette API (window.wecraft), exposée par le preload : aucun accès direct
// au disque, au réseau ni aux processus. Chaque action est métier (pas de « lire un fichier X »).

/** Thèmes de couleurs repris de la maquette ReLaunch × WeCraft et de launcher_config.json. */
export type ThemeKey = "phenix" | "relink" | "aurore" | "glace";

/** Liens externes autorisés : l'interface envoie un identifiant, jamais une adresse. */
export type ExternalLinkId = "modrinth" | "releases" | "github";

export interface AppInfo {
  /** Version de l'application Electron (package.json). */
  version: string;
  /** Versions des composants, pour le diagnostic. */
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  arch: string;
  /** Dossier des réglages WeCraft partagé avec la version Python (%APPDATA%\.wecraft). */
  dataDir: string;
  /** Le dossier existe-t-il ? */
  dataDirExists: boolean;
  /** Thème lu dans launcher_config.json, s'il est lisible et connu ; sinon null. */
  savedTheme: ThemeKey | null;
  /** Temps écoulé entre le démarrage du processus Electron et la première demande de l'interface (ms). */
  startupMs: number;
  /** Lancé depuis l'exe portable (décompressé à chaque démarrage) ? */
  portable: boolean;
  /** Fichiers de réglages illisibles mis de côté depuis la dernière demande (à signaler une fois). */
  invalidFiles: InvalidFileNotice[];
  /** Réglages repris d'un ancien dossier au démarrage (copie). */
  migrated: string[];
}

/** Fichier de réglages invalide : conservé à part (copie), jamais effacé. Noms seuls, dans dataDir. */
export interface InvalidFileNotice {
  name: string;
  /** Nom de la copie mise de côté ; null si la copie a échoué. */
  copyName: string | null;
}

/** Résultat d'un enregistrement de réglage. */
export type SettingResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "unreadable" | "write-failed" };

export interface WeCraftApi {
  app: {
    getInfo(): Promise<AppInfo>;
  };
  settings: {
    setTheme(theme: ThemeKey): Promise<SettingResult>;
  };
  links: {
    open(id: ExternalLinkId): Promise<boolean>;
  };
}
