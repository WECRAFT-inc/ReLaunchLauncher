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
  /** RAM proposée par défaut au lancement (Go), lue dans launcher_config.json. */
  ram: number;
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
  /** WePack créé par WeCraft (wecraft_modpack.json) : modifiable dans Découvrir (lot E7). */
  modpack: boolean;
}

export interface InstanceList {
  instances: InstanceView[];
  /** Instances masquées (réglage de la version Python), seulement comptées. */
  hidden: number;
}

/** Étapes d'un lancement (lot E4), dans l'ordre ; « accord » : réponse de l'utilisateur attendue. */
export type LaunchPhase = "fermeture" | "accord" | "installation" | "profil" | "ouverture" | "termine" | "erreur";

/** État réel d'un lancement : rien n'est estimé ni simulé. */
export interface LaunchStatus {
  job: string;
  phase: LaunchPhase;
  /** Étape en cours, ou message d'erreur. */
  message: string;
  /** Fichiers réellement téléchargés / à télécharger dans l'étape en cours ; null si inconnu. */
  progress: { done: number; total: number } | null;
  notes: string[];
  /** Nom du profil préparé (une fois le profil écrit et vérifié). */
  profile: string | null;
  /** Launcher officiel ouvert ? null tant que ce n'est pas fait. */
  opened: boolean | null;
}

export type LaunchStartResult = { ok: true; job: string } | { ok: false; reason: "busy" | "invalid" | "no-version" };

/** Suppression d'instance (lot E8) : dossier envoyé à la corbeille, jamais effacé définitivement. */
export type DeleteResult =
  | { ok: true; metaForgotten: boolean }
  | { ok: false; reason: "invalid" | "refused" | "busy" | "trash-failed" };

/** Vérification des mises à jour (lot E5). `auto` : installation automatique possible (sinon page de la release). */
export type UpdateCheck =
  | { state: "none"; current: string; latest: string | null }
  | { state: "available"; current: string; latest: string; notes: string; auto: boolean }
  | { state: "error"; message: string };

/** Avancement réel du téléchargement de la mise à jour (octets reçus). */
export interface UpdateStatus {
  phase: "idle" | "download" | "restart" | "error";
  done: number;
  total: number;
  message: string;
}

/** Lot E7 : modpacks Modrinth. */
export interface ModpackRoot {
  project_id: string;
  title: string;
}
export interface ModpackHit {
  id: string;
  title: string;
  author: string;
  description: string;
  downloads: number;
  categories: string[];
  slug: string | null;
}
export type ModpackSearch = { ok: true; total: number; hits: ModpackHit[] } | { ok: false; message: string };
export interface ModpackJob {
  id: string;
  phase: "en-cours" | "termine" | "erreur";
  message: string;
  done: number;
  total: number;
  warnings: string[];
}
export type ModpackStartResult = { ok: true; job: string } | { ok: false; reason: "busy" | "invalid" | "empty" | "exists" | "unchanged"; name?: string };
export interface ModpackEditInfo {
  id: string;
  name: string;
  mc: string;
  loader: string;
  selected: ModpackRoot[];
  old: { project_id: string; title: string; dependency: boolean; required_by: string[] }[];
}
export interface PackRowView {
  id: string;
  title: string;
  kind: "root" | "missing" | "dep" | "orphan";
  parents: string[];
  note: string;
  tone: "warn" | "orphan" | "dep" | "muted";
}
export interface ModpackQuery {
  query: string;
  mc: string;
  loader: string;
  offset?: number;
  categories?: string[];
  envs?: string[];
  sort?: string | null;
}

export interface WeCraftApi {
  app: {
    getInfo(): Promise<AppInfo>;
    /** L'interface est affichée : valide une mise à jour en attente (mark_update_healthy). */
    rendered(): Promise<void>;
    /** Ouvre le dossier des réglages (%APPDATA%\.wecraft) dans l'Explorateur. */
    openDataDir(): Promise<boolean>;
  };
  settings: {
    setTheme(theme: ThemeKey): Promise<SettingResult>;
    /** RAM proposée par défaut au lancement (1 à 16 Go), clé « ram » de launcher_config.json. */
    setRam(ram: number): Promise<boolean>;
  };
  instances: {
    /** `rescan` : relire aussi les autres launchers tout de suite (sinon au plus toutes les 60 s). */
    list(rescan?: boolean): Promise<InstanceList>;
    setFavorite(id: string, fav: boolean): Promise<SettingResult>;
    /** Envoie l'instance à la corbeille. `confirmed` doit être true (confirmation affichée par l'interface). */
    remove(id: string, confirmed: true): Promise<DeleteResult>;
  };
  launch: {
    /** Prépare l'instance puis ouvre le launcher officiel. `ram` en Go (1 à 16) ; `repair` : tout réinstaller. */
    start(id: string, opts: { ram: number; repair?: boolean }): Promise<LaunchStartResult>;
    status(job: string): Promise<LaunchStatus | null>;
    /** Réponse à « forcer la fermeture du launcher officiel ? » (phase « accord »). */
    answer(job: string, force: boolean): Promise<boolean>;
  };
  modpacks: {
    /** Versions de Minecraft (releases), la plus récente d'abord ; null si la liste est inaccessible. */
    versions(): Promise<string[] | null>;
    search(q: ModpackQuery): Promise<ModpackSearch>;
    create(p: { name: string; mc: string; loader: string; roots: ModpackRoot[] }): Promise<ModpackStartResult>;
    editInfo(id: string): Promise<ModpackEditInfo | null>;
    rows(id: string | null, selected: ModpackRoot[]): Promise<PackRowView[]>;
    edit(id: string, selected: ModpackRoot[]): Promise<ModpackStartResult>;
    status(job: string): Promise<ModpackJob | null>;
    /** Page Modrinth d'un mod (adresse construite par le processus principal). */
    openPage(slug: string): Promise<boolean>;
  };
  discord: {
    /** askNow : demander l'accord (premier démarrage de cette version). */
    state(): Promise<{ enabled: boolean; askNow: boolean }>;
    /** `answer` : réponse à la question du premier démarrage (sinon simple réglage). */
    set(on: boolean, answer?: boolean): Promise<boolean>;
  };
  update: {
    check(manual: boolean): Promise<UpdateCheck>;
    install(): Promise<boolean>;
    status(): Promise<UpdateStatus>;
    /** Ouvre la page de la release sur GitHub (installation à la main). */
    openPage(): Promise<boolean>;
  };
  links: {
    open(id: ExternalLinkId): Promise<boolean>;
  };
}
