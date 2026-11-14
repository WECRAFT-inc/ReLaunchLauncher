// Statut des amis (en ligne / absent / hors ligne) : signal envoyé au Worker ReLink tant que le launcher est ouvert.
//  - toutes les minutes : « je suis là », le temps écoulé depuis ma dernière activité et la partie en cours ;
//  - le Worker calcule le statut avec SON horloge : hors ligne = plus de signal depuis 3 minutes (launcher fermé,
//    jeu fermé ou partage coupé), absent = aucune activité depuis plus de 30 minutes, en ligne sinon ;
//  - activité = utilisation du launcher, ou du jeu (les journaux logs/latest.log du jeu servent de preuve d'activité).
// Rien n'est envoyé si le joueur coupe le partage ou n'est pas connecté à ReLink.

export interface PresenceGame {
  kind: "event" | "pack" | "instance";
  /** Identifiant ReLink de l'event ou du modpack (null pour une instance locale). */
  id: string | null;
  name: string;
  mc: string;
}

/** Morceau écouté, envoyé seulement si le joueur a activé le partage de sa musique. */
export interface PresenceMusic {
  title: string;
  artist: string;
  app: string;
}

export interface FriendsPresenceDeps {
  send: (body: { idleMs: number; game: PresenceGame | null; music?: PresenceMusic | null }) => Promise<void>;
  /** Morceau en cours à partager (null : rien, ou partage coupé). */
  music?: () => Promise<PresenceMusic | null>;
  clear: () => Promise<void>;
  /** Partage activé ET compte ReLink connecté. */
  active: () => Promise<boolean>;
  /** Dernière écriture du journal du jeu (ms), ou null. */
  gameActivity?: (gameDir: string) => Promise<number | null>;
  now?: () => number;
  intervalMs?: number;
}

export const PRESENCE_INTERVAL_MS = 60_000;

export class FriendsPresence {
  private lastTouch: number;
  private game: { info: PresenceGame; dir: string; startedAt: number } | null = null;
  private timer: NodeJS.Timeout | null = null;
  private sent = false;

  constructor(private readonly d: FriendsPresenceDeps) {
    this.lastTouch = this.now();
  }

  private now(): number {
    return this.d.now ? this.d.now() : Date.now();
  }

  /** Le joueur utilise le launcher. */
  touch(): void {
    this.lastTouch = this.now();
  }

  gameStarted(info: PresenceGame, gameDir: string): void {
    this.game = { info, dir: gameDir, startedAt: this.now() };
    this.touch();
    void this.beat();
  }

  gameStopped(gameDir?: string): void {
    if (gameDir !== undefined && this.game && this.game.dir !== gameDir) return;
    this.game = null;
    void this.beat();
  }

  /** Temps écoulé depuis la dernière activité (launcher, ou jeu s'il tourne). */
  async idleMs(): Promise<number> {
    let last = this.lastTouch;
    if (this.game) {
      const m = await (this.d.gameActivity?.(this.game.dir) ?? Promise.resolve(null)).catch(() => null);
      last = Math.max(last, this.game.startedAt, m ?? 0);
    }
    return Math.max(0, this.now() - last);
  }

  /** Un signal maintenant (sans effet, ni erreur, si le partage est coupé ou le joueur déconnecté). */
  async beat(): Promise<void> {
    try {
      if (!(await this.d.active())) {
        if (this.sent) {
          this.sent = false;
          await this.d.clear();
        }
        return;
      }
      const music = this.d.music ? await this.d.music().catch(() => null) : undefined;
      await this.d.send({ idleMs: await this.idleMs(), game: this.game?.info ?? null, ...(music !== undefined ? { music } : {}) });
      this.sent = true;
    } catch {
      /* Worker injoignable : le prochain signal réessaie */
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.beat(), this.d.intervalMs ?? PRESENCE_INTERVAL_MS);
    this.timer.unref();
    void this.beat();
  }

  /** Fermeture du launcher : le joueur apparaît hors ligne tout de suite. */
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.game = null;
    if (this.sent) {
      this.sent = false;
      await this.d.clear().catch(() => undefined);
    }
  }
}
