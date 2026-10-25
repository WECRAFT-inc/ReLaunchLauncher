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
  | { ok: false; reason: "invalid" | "unreadable" | "not-backed-up" | "write-failed" | "locked" };

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
  /** Icône choisie : dégradé + symbole de la bibliothèque, ou image importée (adresse app://). */
  icon: InstanceIcon | null;
  /** Fond choisi (adresse app://), copié dans .wecraft\backgrounds. */
  background: string | null;
  /** Modpack d'événement (wecraft_event.json) : seuls ses packs de ressources et shaders se modifient. */
  event: { id: string; name: string } | null;
  /** Dernière partie (date de logs/latest.log, écrit par le jeu) ; null si jamais lancée. */
  lastPlayed: number | null;
}

export type ContentKind = "mod" | "resourcepack" | "shader";
export interface ContentItem {
  kind: ContentKind;
  /** Nom du fichier (ou du dossier) dans mods/, resourcepacks/ ou shaderpacks/. */
  file: string;
  name: string;
  version: string;
  disabled: boolean;
  dir: boolean;
  size: number;
  /** Fourni par le modpack de l'instance. */
  pack: boolean;
  /** Imposé par un événement : ni désactivable ni retirable. */
  locked: boolean;
}
export interface ContentList {
  items: ContentItem[];
  truncated: boolean;
  event: boolean;
  pack: { name: string; version: string; source: string; counts: Record<ContentKind, number> } | null;
}
export interface ContentMeta {
  title: string;
  slug: string;
  /** Adresse app:// (image Modrinth vérifiée) ou null. */
  icon: string | null;
  author: string;
  version: string;
}
export type ContentResult = { ok: true; file?: string } | { ok: false; message: string };
export interface WorldView {
  folder: string;
  name: string;
  last: number;
}
export interface FileEntry {
  name: string;
  dir: boolean;
  size: number;
  mtime: number;
}

export interface EventPackView {
  name: string;
  official: boolean;
  enabled: boolean;
}
export interface EventInfo {
  name: string;
  resourcepacks: EventPackView[];
  shaders: EventPackView[];
  shader: string | null;
  defaultShader: string | null;
  /** Le joueur peut changer les packs de ressources (false : pack d'event verrouillé, shaders seulement). */
  resourcepacksEditable: boolean;
}
export type EventResult = { ok: true } | { ok: false; message: string };

export type InstanceIcon = { kind: "gen"; c: [string, string]; sym: string | null } | { kind: "file"; url: string };
/** Icône à enregistrer : dégradé + symbole, ou nom renvoyé par `media.makeIcon`. */
export type IconChoice = { c: [string, string]; sym: string | null } | { file: string };

/** Réglages d'une instance (comme la fenêtre « Réglages de l'instance » de la version Python). */
export interface InstanceEdit {
  /** Nom affiché ; vide = nom d'origine. Le dossier n'est jamais renommé. */
  name: string;
  mc: string;
  loader: "Vanilla" | "Fabric" | "NeoForge" | "Forge" | "Quilt";
  loaderVersion: string | null;
  /** null = RAM proposée par défaut. */
  ram: number | null;
}

/** « Créer un WePack » > « Sur mesure » (instance vide, installée au premier lancement). */
export interface CreateInstanceRequest {
  name: string;
  mc: string;
  loader: "Vanilla" | "Fabric" | "NeoForge" | "Forge" | "Quilt";
  /** null : version stable choisie au lancement. */
  loaderVersion: string | null;
  icon?: IconChoice | null;
}
export type CreateInstanceResult = { ok: true; id: string } | { ok: false; reason: "invalid" | "exists" | "write-failed"; name?: string };
export interface LoaderVersionItem {
  version: string;
  stable: boolean;
  recommended: boolean;
}
export type LoaderVersionList = { ok: true; versions: LoaderVersionItem[] } | { ok: false; message: string };

export interface ScreenshotItem {
  token: string;
  name: string;
  url: string;
}
export type BackgroundResult = { ok: true; url: string | null } | { ok: false; message?: string; canceled?: true };
export type IconImportResult = { ok: true; key: string; ext: string; width: number; height: number; url: string } | { ok: false; message?: string; canceled?: true };
export type MakeIconResult = { ok: true; icon: IconChoice; url: string } | { ok: false; message: string };

export interface ShaderPrefsView {
  /** Appliquer au lancement (sinon rien ne change dans les instances). */
  on: boolean;
  primary: string | null;
  secondary: string | null;
}

export interface LogEntry {
  time: string;
  level: "error" | "warn" | "info";
  origin: string;
  text: string;
  /** Niveau déduit du texte (journal sans niveau écrit). */
  guessed: boolean;
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

export type LaunchStartResult = { ok: true; job: string; offline?: boolean } | { ok: false; reason: "busy" | "invalid" | "no-version" | "maintenance" | "login" | "pack" };

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
export interface ContentExtra {
  project_id: string;
  title: string;
  type: "resourcepack" | "shader";
}
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
  /** Icône servie par ReLaunch (app://), null = image de remplacement. */
  icon: string | null;
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

/** Pages Modrinth (grosse mise à jour). */
export type ProjectType = "modpack" | "mod" | "resourcepack" | "shader";
export interface ProjectHit {
  id: string;
  title: string;
  author: string;
  description: string;
  downloads: number;
  follows: number;
  categories: string[];
  slug: string | null;
  type: ProjectType | null;
  /** Icône servie par ReLaunch (app://), null = image de remplacement. */
  icon: string | null;
  banner: string | null;
  updated: string | null;
  clientSide: "required" | "optional" | "unsupported" | null;
  serverSide: "required" | "optional" | "unsupported" | null;
  mcVersions: string[];
}
export type ProjectSearch = { ok: true; total: number; hits: ProjectHit[] } | { ok: false; message: string };
export interface ProjectQuery {
  type: ProjectType;
  query: string;
  mc: string;
  loader: string;
  sort: string | null;
  offset: number;
  categories: string[];
}
/** Description convertie en blocs sûrs par le processus principal (jamais de HTML). */
export type MdInline =
  | { t: "text"; v: string }
  | { t: "b"; c: MdInline[] }
  | { t: "i"; c: MdInline[] }
  | { t: "s"; c: MdInline[] }
  | { t: "code"; v: string }
  | { t: "a"; token: string | null; c: MdInline[] }
  | { t: "img"; src: string | null; alt: string }
  | { t: "br" };
export type MdBlock =
  | { t: "h"; level: 1 | 2 | 3 | 4; c: MdInline[] }
  | { t: "p"; c: MdInline[] }
  | { t: "ul" | "ol"; items: MdInline[][] }
  | { t: "quote"; c: MdInline[] }
  | { t: "pre"; v: string }
  | { t: "hr" };
export interface ProjectView {
  id: string;
  slug: string | null;
  type: ProjectType | null;
  title: string;
  description: string;
  body: MdBlock[];
  icon: string | null;
  author: string | null;
  categories: string[];
  extraCategories: string[];
  loaders: string[];
  mcVersions: string[];
  clientSide: "required" | "optional" | "unsupported" | null;
  serverSide: "required" | "optional" | "unsupported" | null;
  downloads: number;
  followers: number;
  published: string | null;
  updated: string | null;
  license: { id: string | null; name: string | null; token: string | null } | null;
  gallery: { url: string; title: string | null; description: string | null }[];
  /** Liens officiels (jetons ouverts dans le navigateur par le processus principal). */
  links: { label: string; token: string }[];
  page: string | null;
}
export interface ProjectVersion {
  id: string;
  name: string;
  number: string;
  channel: "release" | "beta" | "alpha";
  mcVersions: string[];
  loaders: string[];
  published: string | null;
  downloads: number;
  file: { name: string; size: number } | null;
  dependencies: number;
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
    /** Shaders préférés et noms des packs trouvés dans les instances (pour les proposer). */
    shaders(): Promise<{ prefs: ShaderPrefsView; known: string[] }>;
    setShaders(p: ShaderPrefsView): Promise<boolean>;
  };
  instances: {
    /** `rescan` : relire aussi les autres launchers tout de suite (sinon au plus toutes les 60 s). */
    list(rescan?: boolean): Promise<InstanceList>;
    setFavorite(id: string, fav: boolean): Promise<SettingResult>;
    /** Envoie l'instance à la corbeille. `confirmed` doit être true (confirmation affichée par l'interface). */
    remove(id: string, confirmed: true): Promise<DeleteResult>;
    /** Nouvelle instance vide (dossier et wecraft.json créés par le processus principal). */
    create(req: CreateInstanceRequest): Promise<CreateInstanceResult>;
    /** Versions du loader pour cette version de Minecraft ; ok:false = combinaison impossible ou hors ligne. */
    loaderVersions(loader: string, mc: string): Promise<LoaderVersionList>;
    /** Nom affiché, version, loader, RAM (instances_meta.json ; le dossier n'est pas modifié). */
    edit(id: string, e: InstanceEdit): Promise<SettingResult>;
    /** null = icône par défaut. */
    setIcon(id: string, icon: IconChoice | null): Promise<SettingResult>;
    /** Captures du dossier « screenshots » de l'instance, les plus récentes d'abord. */
    screenshots(id: string): Promise<ScreenshotItem[]>;
    /** Fond : capture listée (`shot` + jeton), image du PC (`import`, fenêtre du système) ou aucun (`clear`). */
    setBackground(id: string, how: "shot" | "import" | "clear", token?: string): Promise<BackgroundResult>;
    /** Mondes (dossier saves), les plus récents d'abord. */
    worlds(id: string): Promise<WorldView[]>;
    /** Premier niveau du dossier de jeu de l'instance. */
    files(id: string): Promise<FileEntry[]>;
    /** Ouvre le dossier de l'instance (ou l'un de ses sous-dossiers, par son nom) dans l'Explorateur. */
    openFolder(id: string, sub?: string): Promise<boolean>;
    /** Fin de logs/latest.log du jeu, données sensibles masquées. */
    gameLog(id: string): Promise<{ lines: string[]; truncated: boolean; at: number | null }>;
  };
  relink: {
    /** Données publiques du service ReLink (cache si hors ligne). `force` : relever tout de suite. */
    state(force?: boolean): Promise<RelinkState>;
    /** Notifications reçues (enregistrées sur ce PC, puis accusé de lecture envoyé au service). */
    notifications(): Promise<{ items: RelinkNotification[]; error: string | null }>;
  };
  account: {
    state(): Promise<AccountState>;
    /** Ouvre Discord dans le navigateur ; se termine quand le joueur a répondu (5 min au plus). */
    login(): Promise<AccountState>;
    logout(): Promise<AccountState>;
    refresh(): Promise<AccountState>;
    /** Fenêtre « Ouvrir » : PNG 64 × 64 envoyé comme skin Minecraft. */
    uploadMinecraftSkin(model: "classic" | "slim"): Promise<AccountResult>;
    removeMinecraftSkin(): Promise<AccountResult>;
    /** Image du skin Minecraft actuel (data:), ou null. */
    minecraftSkinImage(): Promise<string | null>;
    /** Achète un skin du launcher avec des Éclats. */
    buySkin(relinkId: string): Promise<AccountResult>;
    /** Débloque un skin avec un code (event, succès, partenaire…). */
    redeemCode(code: string): Promise<AccountResult & { skinId?: string; skinName?: string }>;
  };
  skins: {
    list(): Promise<InstalledSkin[]>;
    /** Fenêtre « Ouvrir » : fichier .rlskin du PC, installé en aperçu local (non signé). */
    importLocal(): Promise<SkinResult>;
    /** Skin publié sur ReLink (fichier vérifié : SHA-256 + signature Ed25519). */
    install(relinkId: string): Promise<SkinResult>;
    remove(key: string): Promise<boolean>;
  };
  win: {
    minimize(): Promise<void>;
    /** Agrandit ou restaure (quitte d'abord le plein écran) ; renvoie l'état agrandi. */
    maximize(): Promise<boolean>;
    close(): Promise<void>;
    state(): Promise<{ maximized: boolean; fullscreen: boolean }>;
  };
  content: {
    /** Mods, packs de ressources et shaders de l'instance (lecture locale, rapide). */
    list(id: string): Promise<ContentList | null>;
    /** Icônes, noms, auteurs et versions trouvés sur Modrinth, par « genre/fichier ». */
    details(id: string): Promise<Record<string, ContentMeta>>;
    /** Active ou désactive (renommage .disabled). */
    toggle(id: string, kind: ContentKind, file: string, on: boolean): Promise<ContentResult>;
    /** Retire (corbeille). */
    remove(id: string, kind: ContentKind, file: string): Promise<ContentResult>;
  };
  logs: {
    /** Fin des journaux (relaunch.log, lancement.log, update.log), les plus récentes d'abord, textes masqués. */
    read(): Promise<{ entries: LogEntry[]; truncated: boolean }>;
    /** Ouvre le dossier des journaux dans l'Explorateur. */
    openDir(): Promise<boolean>;
    /** Copie dans le presse-papiers, après masquage des données sensibles. */
    copy(text: string): Promise<boolean>;
  };
  events: {
    /** Packs de ressources et shaders d'un modpack d'événement (null si ce n'en est pas un). */
    info(id: string): Promise<EventInfo | null>;
    setPack(id: string, name: string, on: boolean): Promise<EventResult>;
    setShader(id: string, name: string | null): Promise<EventResult>;
    /** Retire (corbeille) un pack ajouté par le joueur ; les fichiers officiels sont refusés. */
    remove(id: string, kind: "resourcepack" | "shader", name: string): Promise<EventResult>;
  };
  media: {
    /** Fenêtre « Ouvrir » du système : image PNG ou JPEG gardée avant recadrage. */
    importIcon(): Promise<IconImportResult>;
    /** Recadre l'image importée en icône carrée (256 px). */
    makeIcon(key: string, ext: string, crop: { zoom: number; cx: number; cy: number }): Promise<MakeIconResult>;
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
    /** `extras` : packs de ressources et shaders ajoutés à l'instance après les mods (dernière version compatible). */
    create(p: { name: string; mc: string; loader: string; roots: ModpackRoot[]; extras?: ContentExtra[] }): Promise<ModpackStartResult>;
    /** Ajoute des mods (et leurs dépendances obligatoires) à une instance qui n'est pas un WePack. */
    addMods(id: string, roots: ModpackRoot[]): Promise<ModpackStartResult>;
    editInfo(id: string): Promise<ModpackEditInfo | null>;
    rows(id: string | null, selected: ModpackRoot[]): Promise<PackRowView[]>;
    edit(id: string, selected: ModpackRoot[]): Promise<ModpackStartResult>;
    status(job: string): Promise<ModpackJob | null>;
    /** Page Modrinth d'un mod (adresse construite par le processus principal). */
    openPage(slug: string): Promise<boolean>;
    /** Fenêtre « Ouvrir » du système : fichier .mrpack installé dans une nouvelle instance (suivi par status). */
    importFile(): Promise<ModpackStartResult | { ok: false; reason: "canceled" }>;
    /** Version d'un modpack Modrinth installée dans une nouvelle instance. */
    installVersion(versionId: string, name?: string): Promise<ModpackStartResult>;
    /** Modpacks officiels ReLaunch déjà installés sur ce PC. */
    officialInstalled(): Promise<OfficialInstalled[]>;
    /** Installe ou met à jour un modpack officiel du catalogue ReLink (fichiers signés). */
    installOfficial(relinkId: string): Promise<ModpackStartResult>;
    /** Fenêtre « Enregistrer » : exporte l'instance en pack partageable (.rlpack). */
    exportShared(instanceId: string): Promise<{ ok: boolean; message: string; canceled?: boolean }>;
  };
  projects: {
    search(q: ProjectQuery): Promise<ProjectSearch>;
    get(id: string): Promise<ProjectView | { error: string }>;
    versions(id: string, mc?: string, loader?: string): Promise<ProjectVersion[] | { error: string }>;
    /** Ouvre un lien (jeton reçu dans une page de projet) dans le navigateur. */
    openLink(token: string): Promise<boolean>;
    /** Fichiers déjà présents dans resourcepacks / shaderpacks de l'instance (noms seuls). */
    installed(instanceId: string, type: "resourcepack" | "shader"): Promise<string[]>;
    /** Télécharge (SHA-512 vérifié) la version d'un pack de ressources ou d'un shader dans l'instance. */
    installFile(instanceId: string, versionId: string): Promise<{ ok: true; file: string; dir: string } | { ok: false; message: string }>;
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
    /** « Participer à la bêta » : reçoit aussi les préversions. */
    beta(): Promise<boolean>;
    setBeta(on: boolean): Promise<boolean>;
  };
  links: {
    open(id: ExternalLinkId): Promise<boolean>;
  };
}

// ---------------------------------------------------------------- service ReLink (Worker, lecture seule)
export interface RelinkNews {
  id: string;
  title: string;
  body: string;
  date: string;
  tags: { label: string; color: string }[];
  cta: string;
  /** Page du launcher à ouvrir ("" = aucune). */
  open: string;
}
export interface RelinkCard {
  id: string;
  title: string;
  text: string;
  cta: string;
  open: string;
  tag: string;
}
export interface RelinkServer {
  id: string;
  name: string;
  host: string;
  state: "online" | "offline" | "maintenance" | "unknown";
  players: number;
  max: number;
  pack: string;
  event: string;
  desc: string;
  version: string;
}
export interface RelinkEvent {
  id: string;
  name: string;
  desc: string;
  status: string;
  start: string;
  end: string;
  server: string;
  pack: string;
}
export interface RelinkPartner {
  id: string;
  name: string;
  channel: string;
  category: string;
  featured: boolean;
  live: boolean;
  viewers: number;
}
export interface RelinkModpack {
  id: string;
  name: string;
  desc: string;
  mc: string;
  loader: string;
  version: string;
  /** Pack d'event (lié à un event ReLaunch). */
  event: string | null;
  /** Dernière version signée (manifeste relaunch-pack) ; null tant qu'aucune n'est publiée. */
  latest: { id: string; version: string; sha256: string; size: number; locked: boolean; mandatory: boolean; changelog: string; overrides: { id: string; sha256: string; size: number } | null } | null;
}
export interface OfficialInstalled {
  packId: string;
  version: string;
  locked: boolean;
  folderName: string;
}
export interface RelinkSkin {
  id: string;
  name: string;
  desc: string;
  unlock: { event: boolean; shop: number; achievement: boolean; premium: boolean };
  versions: { liquidGlass: boolean; mat: boolean };
  followsTheme: boolean;
  /** Fichier .rlskin publié (null tant que le Worker n'en annonce pas). */
  file: { id: string; sha256: string; size: number; version: string } | null;
}
export interface RelinkNotification {
  id: string;
  title: string;
  body: string;
  open: string;
  at: string;
}
export interface RelinkBootstrap {
  generatedAt: string;
  maintenance: { enabled: boolean; level: "info" | "warn" | "danger" | "critical"; text: string; blockLaunch: boolean };
  updates: { kill: boolean; minVersion: string | null; blockOld: boolean; latest: string | null; paused: boolean; release: { version: string; mandatory: boolean; sha256: string } | null };
  carousel: { count: number; autoplay: boolean; speedSeconds: number };
  flags: string[];
  cards: RelinkCard[];
  news: RelinkNews[];
  skins: RelinkSkin[];
  modpacks: RelinkModpack[];
  servers: RelinkServer[];
  events: RelinkEvent[];
  partners: RelinkPartner[];
}
/** Compte ReLink du joueur (le jeton de session ne quitte jamais le processus principal). */
export interface AccountState {
  loggedIn: boolean;
  user: { id: string; pseudo: string; minecraftName: string | null; eclats: number; premium: boolean } | null;
  expiresAt: string | null;
  /** Le service ReLink n'a pas répondu au dernier essai. */
  offline: boolean;
  /** Une connexion par Discord attend la réponse du navigateur. */
  loginPending: boolean;
  /** Skins du launcher possédés (offerts, gagnés en event…). */
  launcherSkins: string[];
  minecraftSkin: { model: "classic" | "slim"; sha256: string } | null;
  /** false : pas de chiffrement système disponible, la session n'est pas gardée après fermeture. */
  persisted: boolean;
  error: string | null;
}
export type AccountResult = { ok: true; state: AccountState; message?: string } | { ok: false; message: string; canceled?: boolean };

export interface RelinkState {
  /** Des données sont disponibles (fraîches ou en cache). */
  ok: boolean;
  /** Données venant du cache (le dernier relevé a échoué ou n'a pas encore eu lieu). */
  stale: boolean;
  fetchedAt: number | null;
  error: string | null;
  data: RelinkBootstrap | null;
}

// ---------------------------------------------------------------- skins du launcher (.rlskin)
export interface SkinAnimation {
  keyframes: Record<string, string | number>[];
  durationMs: number;
  iterations: number | "infinite";
  direction: "normal" | "reverse" | "alternate" | "alternate-reverse";
  easing: string;
  delayMs: number;
}
export interface SkinVariant {
  tokens: Record<string, string>;
  barBackground: string | undefined;
  cardBackground: string | undefined;
}
export interface SkinManifest {
  id: string;
  name: string;
  author: string;
  skinVersion: string;
  description: string;
  /** Garde les couleurs du thème choisi (le skin n'ajoute que le décor). */
  followsTheme: boolean;
  tokens: Record<string, string>;
  fonts: { display: { file: string; family: string } | undefined; body: { file: string; family: string } | undefined };
  background: { color: string | undefined; gradient: string | undefined; layers: { image: string; size: string; position: string; repeat: boolean; opacity: number; blend: string; animation: string | undefined }[]; overlay: "none" | "vignette" | "grain" };
  bars: { pattern: string | undefined; patternOpacity: number; background: string | undefined; border: string | undefined; radius: number | undefined };
  frames: { radius: number | undefined; border: string | undefined; glow: string | undefined; background: string | undefined };
  playButton: { image: string | undefined; background: string | undefined; text: string | undefined; radius: number | undefined; animation: string | undefined };
  transition: { type: "none" | "fade" | "slide" | "wave" | "zoom"; durationMs: number };
  launchScreen: { image: string | undefined; text: string; animation: string | undefined };
  animations: Record<string, SkinAnimation>;
  variants: { liquidGlass: SkinVariant | undefined; mat: SkinVariant | undefined };
}
export interface InstalledSkin {
  key: string;
  signed: boolean;
  source: "relink" | "local";
  relinkId: string | null;
  sha256: string;
  /** Adresse app:// du dossier du skin (images, polices). */
  base: string;
  manifest: SkinManifest;
}
export type SkinResult = { ok: true; skin: InstalledSkin } | { ok: false; message: string; canceled?: boolean };
