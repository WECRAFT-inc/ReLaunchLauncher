/**
 * Partie lancée par le launcher officiel de Minecraft : ReLaunch ne démarre pas le jeu lui-même, il ne sait donc
 * pas quand la partie commence ni quand elle finit. On surveille les processus Java : un Java dont la ligne de
 * commande contient « --gameDir <dossier de l'instance> » est la partie. Sert aux statistiques de jeu, à la série
 * de jours et à la présence « en jeu ».
 *
 * Rien n'est lancé ni modifié : lecture seule de la liste des processus (PowerShell, commande fixe), toutes les
 * 20 s, et seulement tant qu'une partie est attendue ou en cours.
 */

export interface WatchTarget {
  gameDir: string;
}

export interface GameWatchDeps<T extends WatchTarget> {
  /** Lignes de commande des processus Java en cours (null : lecture impossible). */
  list: () => Promise<string[] | null>;
  onStart: (t: T) => void;
  onExit: (t: T) => void;
  now?: () => number;
  log?: (line: string) => void;
  /** Délai pour cliquer sur « Jouer » dans le launcher officiel. */
  waitMs?: number;
  pollMs?: number;
  /** Tests : pas de minuterie. */
  timers?: { set: (f: () => void, ms: number) => unknown; clear: (h: unknown) => void };
}

/** Script PowerShell (fixe) : lignes de commande des processus Java, en base64 UTF-8 (chemins accentués intacts). */
export const JAVA_PROCS_SCRIPT =
  "Get-CimInstance Win32_Process | Where-Object { $_.Name -in 'javaw.exe','java.exe' } | " +
  "ForEach-Object { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$_.CommandLine)) }";

export function decodeProcs(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[A-Za-z0-9+/=]+$/.test(l))
    .map((l) => Buffer.from(l, "base64").toString("utf8"));
}

const norm = (s: string) => s.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();

/** La ligne de commande lance-t-elle le jeu dans ce dossier (« --gameDir <dossier> », avec ou sans guillemets) ? */
export function runsIn(cmd: string, gameDir: string): boolean {
  const dir = norm(gameDir);
  if (!dir) return false;
  const re = /--gamedir\s+(?:"([^"]+)"|(\S+))/gi;
  for (const m of norm(cmd).matchAll(re)) if (norm(m[1] ?? m[2] ?? "") === dir) return true;
  return false;
}

export class OfficialGameWatch<T extends WatchTarget> {
  private readonly waiting = new Map<string, { t: T; until: number }>();
  private readonly running = new Map<string, { t: T; missed: number }>();
  private timer: unknown = null;
  private busy = false;

  constructor(private readonly d: GameWatchDeps<T>) {}

  private now(): number {
    return this.d.now ? this.d.now() : Date.now();
  }

  /** Le profil vient d'être préparé dans le launcher officiel : on attend que le joueur clique sur « Jouer ». */
  watch(t: T): void {
    const k = norm(t.gameDir);
    if (this.running.has(k)) return;
    this.waiting.set(k, { t, until: this.now() + (this.d.waitMs ?? 20 * 60 * 1000) });
    this.schedule(2000);
  }

  private schedule(ms: number): void {
    if (this.timer !== null) return;
    const set = this.d.timers?.set ?? ((f: () => void, n: number) => setTimeout(f, n).unref());
    this.timer = set(() => {
      this.timer = null;
      void this.poll();
    }, ms);
  }

  /** Un passage : partie démarrée, toujours là, ou fermée. */
  async poll(): Promise<void> {
    if (this.busy || (!this.waiting.size && !this.running.size)) return;
    this.busy = true;
    try {
      const procs = await this.d.list().catch(() => null);
      const at = this.now();
      if (procs) {
        for (const [k, w] of [...this.waiting]) {
          if (procs.some((c) => runsIn(c, w.t.gameDir))) {
            this.waiting.delete(k);
            this.running.set(k, { t: w.t, missed: 0 });
            this.d.log?.(`Partie détectée (launcher officiel) : ${w.t.gameDir}`);
            this.d.onStart(w.t);
          } else if (at > w.until) {
            this.waiting.delete(k);
            this.d.log?.(`Aucune partie détectée après le lancement par le launcher officiel : ${w.t.gameDir}`);
          }
        }
        for (const [k, r] of [...this.running]) {
          if (procs.some((c) => runsIn(c, r.t.gameDir))) r.missed = 0;
          else if (++r.missed >= 2) {
            // deux passages sans le processus : partie fermée (un seul raté peut être une lecture ratée)
            this.running.delete(k);
            this.d.log?.(`Partie fermée (launcher officiel) : ${r.t.gameDir}`);
            this.d.onExit(r.t);
          }
        }
      } else for (const [k, w] of [...this.waiting]) if (at > w.until) this.waiting.delete(k);
    } finally {
      this.busy = false;
      if (this.waiting.size || this.running.size) this.schedule(this.d.pollMs ?? 20_000);
    }
  }
}
