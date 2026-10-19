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
  /** Le dossier existe-t-il ? (lecture seule : E0 n'y écrit rien) */
  dataDirExists: boolean;
  /** Thème lu dans launcher_config.json, s'il est lisible et connu ; sinon null. */
  savedTheme: ThemeKey | null;
}

export interface WeCraftApi {
  app: {
    getInfo(): Promise<AppInfo>;
  };
  links: {
    open(id: ExternalLinkId): Promise<boolean>;
  };
}
