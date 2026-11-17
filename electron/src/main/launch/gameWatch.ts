/**
 * Partie lancée par le launcher officiel de Minecraft : ReLaunch ne démarre pas le jeu lui-même, il ne sait donc
 * pas quand la partie commence ni quand elle finit. On surveille les processus Java : un Java dont la ligne de
 * commande contient « --gameDir <dossier de l'instance> » est la partie. Sert aux statistiques de jeu, à la série
 * de jours et à la présence « en jeu ».
 *
 * Rien n'est lancé ni modifié : lecture seule de la liste des processus (PowerShell, commande fixe), toutes les
 * 20 s, seulement tant qu'une partie est attendue. Une fois la partie repérée, on retient son numéro de processus
 * et on vérifie seulement qu'il existe encore (sans PowerShell) : relire la liste pendant une partie chargée
 * (processeur et disque à fond) pouvait revenir vide et faire croire la partie fermée.
 */

export interface JavaProc {
  pid: number;
  cmd: string;
}

export interface WatchTarget {
  gameDir: string;
}

export interface GameWatchDeps<T extends WatchTarget> {
  /** Processus Java en cours avec leur ligne de commande (null : lecture impossible). */
  list: () => Promise<JavaProc[] | null>;
  /** Le processus existe-t-il encore ? (par défaut : signal 0, sans effet sur le processus) */
  alive?: (pid: number) => boolean;
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

/**
 * Script PowerShell (fixe) : « @@numéro:ligne de commande en base64 UTF-8 » pour chaque processus Java
 * (chemins accentués intacts). La ligne de commande d'un jeu moddé fait des milliers de caractères et PowerShell
 * coupe les longues lignes quand sa sortie va dans un tuyau : chaque entrée commence donc par « @@ » et le
 * décodage ignore tous les retours à la ligne.
 */
export const JAVA_PROCS_SCRIPT =
  "Get-CimInstance Win32_Process | Where-Object { $_.Name -in 'javaw.exe','java.exe' } | " +
  "ForEach-Object { '@@' + [string]$_.ProcessId + ':' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$_.CommandLine)) }";

export function decodeProcs(stdout: string): JavaProc[] {
  const out: JavaProc[] = [];
  for (const rec of stdout.replace(/\s+/g, "").split("@@")) {
    const m = /^(\d{1,10}):([A-Za-z0-9+/=]*)$/.exec(rec);
    if (m) out.push({ pid: Number(m[1]), cmd: Buffer.from(m[2]!, "base64").toString("utf8") });
  }
  return out;
}

/** Dossier de jeu d'une ligne de commande Java (pour le journal), ou null. */
export function gameDirOf(cmd: string): string | null {
  const m = /--gameDir\s+(?:"([^"]+)"|(\S+))/i.exec(cmd);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

/** Signal 0 : ne fait rien au processus, échoue seulement s'il n'existe plus (EPERM = il existe). */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as { code?: string }).code === "EPERM";
  }
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
  private readonly waiting = new Map<string, { t: T; until: number; seen?: string }>();
  private readonly running = new Map<string, { t: T; pid: number; missed: number }>();
  private timer: unknown = null;
  private busy = false;
  private lastErr = "";

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
      const alive = this.d.alive ?? pidAlive;
      // parties en cours : on regarde seulement si leur processus existe encore
      for (const [k, r] of [...this.running]) {
        if (alive(r.pid)) r.missed = 0;
        else if (++r.missed >= 2) {
          this.running.delete(k);
          this.d.log?.(`Partie fermée (launcher officiel) : ${r.t.gameDir}`);
          this.d.onExit(r.t);
        }
      }
      if (this.waiting.size) {
        const procs = await this.d.list().catch((e: unknown) => {
          const msg = `Liste des processus Java illisible : ${e instanceof Error ? e.message : String(e)}`;
          if (msg !== this.lastErr) this.d.log?.(msg); // une fois, pas toutes les 20 s
          this.lastErr = msg;
          return null;
        });
        if (procs) this.lastErr = "";
        const at = this.now();
        for (const [k, w] of [...this.waiting]) {
          const p = procs?.find((c) => runsIn(c.cmd, w.t.gameDir));
          if (p) {
            this.waiting.delete(k);
            this.running.set(k, { t: w.t, pid: p.pid, missed: 0 });
            this.d.log?.(`Partie détectée (launcher officiel, processus ${p.pid}) : ${w.t.gameDir}`);
            this.d.onStart(w.t);
          } else if (procs) {
            // journal (une fois par changement) : ce que ReLaunch voit pendant qu'il attend la partie
            const seen = procs.length ? procs.map((c) => `${c.pid} → ${gameDirOf(c.cmd) ?? "sans --gameDir"}`).join(" ; ") : "aucun";
            if (seen !== w.seen) {
              w.seen = seen;
              this.d.log?.(`En attente de la partie (${w.t.gameDir}) ; processus Java : ${seen}`);
            }
          }
          if (!p && at > w.until) {
            this.waiting.delete(k);
            this.d.log?.(`Aucune partie détectée après le lancement par le launcher officiel : ${w.t.gameDir}`);
          }
        }
      }
    } finally {
      this.busy = false;
      if (this.waiting.size || this.running.size) this.schedule(this.d.pollMs ?? 20_000);
    }
  }
}
