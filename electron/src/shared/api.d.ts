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

/**
 * Résultat d'un enregistrement de réglage. `reset` : le fichier était invalide ; il a été copié de côté
 * (copyName) puis remplacé, les autres réglages sont donc revenus aux valeurs par défaut.
 * « not-backed-up » : fichier invalide dont la copie a échoué, laissé tel quel.
 */
export type SettingResult =
  | { ok: true; reset?: { name: string; copyName: string } }
  | { ok: false; reason: "invalid" | "unreadable" | "not-backed-up" | "write-failed" };

/** Instance affichée par l'interface (lot E2). Aucun chemin : `id` est opaque. */
export interface InstanceView {
  id: string;
  /** Nom affiché (réglage par instance, sinon nom lu dans l'instance). */
  name: string;
  source: "WeCraft" | "CurseForge" | "Modrinth" | "Prism";
  version: string | null;
  loader: "Fabric" | "Forge" | "NeoForge" | "Quilt" | null;
  loaderVersion: string | null;
  ram: number | null;
  fav: boolean;
}

export interface InstanceList {
  instances: InstanceView[];
  /** Instances masquées (réglage de la version Python), seulement comptées. */
  hidden: number;
}

export interface WeCraftApi {
  app: {
    getInfo(): Promise<AppInfo>;
  };
  settings: {
    setTheme(theme: ThemeKey): Promise<SettingResult>;
  };
  instances: {
    /** `rescan` : relire aussi les autres launchers tout de suite (sinon au plus toutes les 60 s). */
    list(rescan?: boolean): Promise<InstanceList>;
    setFavorite(id: string, fav: boolean): Promise<SettingResult>;
  };
  links: {
    open(id: ExternalLinkId): Promise<boolean>;
  };
}
