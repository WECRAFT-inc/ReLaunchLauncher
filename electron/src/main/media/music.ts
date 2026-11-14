// Musique : pilotage de l'appli qui joue (Spotify, Deezer, YouTube dans un navigateur, Apple Music…) par les
// commandes multimédias de Windows (GlobalSystemMediaTransportControlsSessionManager, API WinRT).
//
// - Aucune connexion à un service de musique, aucune clé : ReLaunch voit ce que Windows voit (overlay de volume).
// - Un seul processus PowerShell (Windows PowerShell 5.1, chemin fixe dans System32) reste ouvert et répond à des
//   commandes d'une ligne sur son entrée standard, en JSON d'une ligne sur sa sortie. Il n'est démarré que si la
//   fonction musique est activée et que l'interface demande l'état.
// - Les identifiants de session viennent de Windows ; une commande n'accepte qu'un identifiant vu dans le dernier état.
// - Hors Windows : fonction indisponible (aucun processus lancé).
import { spawn } from "node:child_process";
import path from "node:path";
import type { MusicAction, MusicSession, MusicState } from "../../shared/api";

/** Script PowerShell du pont (gardé ici pour être livré dans l'archive de l'appli, sans fichier à écrire). */
export const BRIDGE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
# Lancé SANS console (fenêtre cachée) : ne jamais toucher à [Console]::*Encoding (« descripteur non valide »).
# On lit et écrit directement les flux standard, en UTF-8 sans BOM.
$rlUtf8 = New-Object Text.UTF8Encoding $false
$rlIn = New-Object IO.StreamReader([Console]::OpenStandardInput(), $rlUtf8)
$rlOut = New-Object IO.StreamWriter([Console]::OpenStandardOutput(), $rlUtf8)
$rlOut.AutoFlush = $true
function Out-Line($o) { $rlOut.WriteLine(($o | ConvertTo-Json -Compress -Depth 5)) }
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation${"`"}1' } | Select-Object -First 1
  if (-not $asTask) { throw 'AsTask introuvable' }
  function Wait-Op($op, [Type]$type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); [void]$t.Wait(5000); return $t.Result }
  $mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
  $propType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
  $mgr = Wait-Op ($mgrType::RequestAsync()) $mgrType
  if (-not $mgr) { throw 'gestionnaire multimédia indisponible' }
} catch {
  Out-Line @{ fatal = [string]$_.Exception.Message }
  exit 2
}
function Find-Session([string]$id) { foreach ($s in $mgr.GetSessions()) { if ($s.SourceAppUserModelId -eq $id) { return $s } }; return $null }
Out-Line @{ ready = $true }
while ($true) {
  $line = $rlIn.ReadLine()
  if ($null -eq $line) { break }
  $parts = $line.Split([char[]]@(' '), 3)
  $rid = $parts[0]
  $cmd = ''; if ($parts.Count -gt 1) { $cmd = $parts[1] }
  $arg = ''; if ($parts.Count -gt 2) { $arg = $parts[2] }
  try {
    if ($cmd -eq 'state') {
      $cur = $mgr.GetCurrentSession(); $curId = ''; if ($cur) { $curId = $cur.SourceAppUserModelId }
      $list = New-Object System.Collections.ArrayList
      foreach ($s in $mgr.GetSessions()) {
        $p = $null; try { $p = Wait-Op ($s.TryGetMediaPropertiesAsync()) $propType } catch { }
        $info = $s.GetPlaybackInfo(); $c = $info.Controls
        $t = ''; $a = ''; $al = ''; $th = $false
        if ($p) { $t = [string]$p.Title; $a = [string]$p.Artist; $al = [string]$p.AlbumTitle; $th = ($null -ne $p.Thumbnail) }
        [void]$list.Add(@{ id = [string]$s.SourceAppUserModelId; title = $t; artist = $a; album = $al; status = $info.PlaybackStatus.ToString(); canPlay = [bool]$c.IsPlayEnabled; canPause = [bool]$c.IsPauseEnabled; canNext = [bool]$c.IsNextEnabled; canPrev = [bool]$c.IsPreviousEnabled; hasThumb = [bool]$th })
      }
      Out-Line @{ id = $rid; ok = $true; current = $curId; sessions = $list }
    } elseif ($cmd -eq 'thumb') {
      $s = Find-Session $arg; if (-not $s) { throw 'session' }
      $p = Wait-Op ($s.TryGetMediaPropertiesAsync()) $propType
      if (-not $p -or -not $p.Thumbnail) { Out-Line @{ id = $rid; ok = $false; error = 'none' }; continue }
      $st = Wait-Op ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
      if ($st.Size -gt 2097152) { $st.Dispose(); throw 'too-big' }
      $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($st)
      $ms = New-Object IO.MemoryStream; $net.CopyTo($ms); $net.Dispose()
      Out-Line @{ id = $rid; ok = $true; type = [string]$st.ContentType; data = [Convert]::ToBase64String($ms.ToArray()) }
    } elseif (@('play', 'pause', 'toggle', 'next', 'prev') -contains $cmd) {
      $s = Find-Session $arg; if (-not $s) { throw 'session' }
      if ($cmd -eq 'play') { $op = $s.TryPlayAsync() } elseif ($cmd -eq 'pause') { $op = $s.TryPauseAsync() } elseif ($cmd -eq 'toggle') { $op = $s.TryTogglePlayPauseAsync() } elseif ($cmd -eq 'next') { $op = $s.TrySkipNextAsync() } else { $op = $s.TrySkipPreviousAsync() }
      $r = Wait-Op $op ([bool])
      Out-Line @{ id = $rid; ok = [bool]$r }
    } else {
      Out-Line @{ id = $rid; ok = $false; error = 'unknown' }
    }
  } catch { Out-Line @{ id = $rid; ok = $false; error = [string]$_.Exception.Message } }
}
`;

/** Processus fils minimal (remplaçable dans les tests). */
export interface BridgeChild {
  stdin: { write(s: string): unknown } | null;
  stdout: { on(ev: "data", cb: (b: Buffer | string) => void): unknown } | null;
  stderr?: { on(ev: "data", cb: (b: Buffer | string) => void): unknown } | null;
  on(ev: "exit" | "error", cb: (...a: unknown[]) => void): unknown;
  kill(): unknown;
}

export interface MusicDeps {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  spawnBridge?: () => BridgeChild;
  now?: () => number;
  log?: (line: string) => void;
}

type Reply = Record<string, unknown>;

/** Nom lisible de l'appli, d'après l'identifiant donné par Windows (AUMID ou nom d'exécutable). */
export function appName(id: string): string {
  const rules: [RegExp, string][] = [
    [/spotify/i, "Spotify"],
    [/deezer/i, "Deezer"],
    [/AppleInc\.AppleMusic|AppleMusic|itunes/i, "Apple Music"],
    [/tidal/i, "TIDAL"],
    [/amazon.*music/i, "Amazon Music"],
    [/youtube\s*music|ytmusic/i, "YouTube Music"],
    [/soundcloud/i, "SoundCloud"],
    [/ZuneMusic|Microsoft\.Media\.Player/i, "Lecteur multimédia"],
    [/vlc/i, "VLC"],
    [/foobar/i, "foobar2000"],
    [/discord/i, "Discord"],
    [/msedge/i, "Microsoft Edge"],
    [/chrome/i, "Google Chrome"],
    [/firefox/i, "Firefox"],
    [/opera/i, "Opera"],
    [/brave/i, "Brave"],
  ];
  for (const [re, n] of rules) if (re.test(id)) return n;
  const base = id.split("!")[0]!.split("_")[0]!.replace(/\.exe$/i, "");
  return (base.split(".").pop() || base || "Appli").slice(0, 40);
}

const SESSION_ID = /^[^\r\n]{1,300}$/;
const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\x00-\x1f]/g, " ").trim().slice(0, n) : "");

export function decodeSessions(v: unknown): MusicSession[] {
  const arr = Array.isArray(v) ? v : v && typeof v === "object" ? [v] : []; // PowerShell 5.1 aplatit parfois un tableau d'un élément
  const out: MusicSession[] = [];
  for (const x of arr.slice(0, 20)) {
    const o = (x && typeof x === "object" ? x : {}) as Reply;
    const id = typeof o["id"] === "string" && SESSION_ID.test(o["id"]) ? o["id"] : "";
    if (!id) continue;
    const status = str(o["status"], 20);
    out.push({
      id,
      app: appName(id),
      title: str(o["title"], 200),
      artist: str(o["artist"], 200),
      album: str(o["album"], 200),
      playing: status === "Playing",
      status,
      canPlay: o["canPlay"] === true,
      canPause: o["canPause"] === true,
      canNext: o["canNext"] === true,
      canPrev: o["canPrev"] === true,
      hasThumb: o["hasThumb"] === true,
    });
  }
  return out;
}

/** Session pilotée : celle choisie par le joueur si elle existe encore, sinon celle de Windows, sinon une qui joue. */
export function pickSession(sessions: MusicSession[], chosen: string | null, current: string | null): MusicSession | null {
  return (
    (chosen ? sessions.find((s) => s.id === chosen) : undefined) ??
    (current ? sessions.find((s) => s.id === current) : undefined) ??
    sessions.find((s) => s.playing) ??
    sessions[0] ??
    null
  );
}

/** Applis proposées dans « Ouvrir l'appli » : l'appli installée si Windows la connaît, sinon la version web. */
export const MUSIC_APPS: readonly { id: string; name: string; scheme: string | null; web: string }[] = [
  { id: "spotify", name: "Spotify", scheme: "spotify", web: "https://open.spotify.com/" },
  { id: "deezer", name: "Deezer", scheme: "deezer", web: "https://www.deezer.com/" },
  { id: "youtube-music", name: "YouTube Music", scheme: null, web: "https://music.youtube.com/" },
  { id: "apple-music", name: "Apple Music", scheme: null, web: "https://music.apple.com/" },
  { id: "tidal", name: "TIDAL", scheme: "tidal", web: "https://listen.tidal.com/" },
  { id: "soundcloud", name: "SoundCloud", scheme: null, web: "https://soundcloud.com/" },
  { id: "amazon-music", name: "Amazon Music", scheme: null, web: "https://music.amazon.fr/" },
];

const ACTIONS: readonly MusicAction[] = ["play", "pause", "toggle", "next", "prev"];
export const isMusicAction = (v: unknown): v is MusicAction => typeof v === "string" && (ACTIONS as readonly string[]).includes(v);

export class MusicBridge {
  private child: BridgeChild | null = null;
  private ready: Promise<void> | null = null;
  private buf = "";
  private seq = 0;
  private readonly pending = new Map<string, (r: Reply | null) => void>();
  private failures = 0;
  private retryAt = 0;
  private lastError: string | null = null;
  private chosen: string | null = null;
  private last: { sessions: MusicSession[]; current: string | null } = { sessions: [], current: null };
  private readonly thumbs = new Map<string, string | null>();
  private readonly now: () => number;
  constructor(private readonly d: MusicDeps = {}) {
    this.now = d.now ?? Date.now;
  }

  get supported(): boolean {
    return (this.d.platform ?? process.platform) === "win32";
  }

  /** Appli choisie par le joueur (null : suivre Windows). */
  choose(id: string | null): void {
    this.chosen = id && SESSION_ID.test(id) ? id : null;
  }
  get choice(): string | null {
    return this.chosen;
  }

  private spawnDefault(): BridgeChild {
    const env = this.d.env ?? process.env;
    const ps = path.win32.join(env["SystemRoot"] ?? env["windir"] ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const encoded = Buffer.from(BRIDGE_SCRIPT, "utf16le").toString("base64");
    return spawn(ps, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }) as unknown as BridgeChild;
  }

  private start(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      let child: BridgeChild;
      try {
        child = (this.d.spawnBridge ?? (() => this.spawnDefault()))();
      } catch (e) {
        reject(e);
        return;
      }
      this.child = child;
      this.buf = "";
      const timer = setTimeout(() => {
        reject(new Error("le pont multimédia ne répond pas"));
        this.stop();
      }, 15_000);
      (timer as { unref?: () => void }).unref?.();
      const onLine = (line: string) => {
        let o: Reply;
        try {
          o = JSON.parse(line) as Reply;
        } catch {
          return;
        }
        if (typeof o["fatal"] === "string") {
          clearTimeout(timer);
          this.lastError = o["fatal"].slice(0, 300);
          this.d.log?.(`Musique : le pont n'a pas pu démarrer (${this.lastError}).`);
          reject(new Error(this.lastError));
          return;
        }
        if (o["ready"] === true) {
          clearTimeout(timer);
          resolve();
          return;
        }
        const id = typeof o["id"] === "string" ? o["id"] : "";
        const cb = this.pending.get(id);
        if (cb) {
          this.pending.delete(id);
          cb(o);
        }
      };
      child.stdout?.on("data", (b) => {
        this.buf += typeof b === "string" ? b : b.toString("utf8");
        if (this.buf.length > 8 * 1024 * 1024) this.buf = ""; // réponse anormale : ignorée
        let i: number;
        while ((i = this.buf.indexOf("\n")) >= 0) {
          const line = this.buf.slice(0, i).trim();
          this.buf = this.buf.slice(i + 1);
          if (line) onLine(line);
        }
      });
      const dead = (why: string) => {
        clearTimeout(timer);
        if (this.child !== child) return;
        this.child = null;
        this.ready = null;
        for (const cb of this.pending.values()) cb(null);
        this.pending.clear();
        const err = errText.replace(/\s+/g, " ").trim().slice(0, 600);
        if (err && !this.lastError) this.lastError = err.slice(0, 300);
        this.d.log?.(`Musique : pont arrêté (${why})${err ? ` : ${err}` : "."}`);
        reject(new Error(why));
      };
      let errText = "";
      child.stderr?.on("data", (b) => {
        if (errText.length < 4000) errText += typeof b === "string" ? b : b.toString("utf8");
      });
      child.on("error", (e) => dead(e instanceof Error ? e.message : String(e)));
      child.on("exit", (code) => dead(`code ${String(code)}`));
    });
    const mine = this.ready;
    mine.catch(() => {
      if (this.ready === mine) this.ready = null;
      this.failures++;
      this.retryAt = this.now() + Math.min(5 * 60_000, 5000 * 2 ** Math.min(this.failures, 6));
    });
    return mine;
  }

  private async call(cmd: string, arg = ""): Promise<Reply | null> {
    if (!this.supported) return null;
    if (!this.child && this.now() < this.retryAt) return null;
    try {
      await this.start();
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      return null;
    }
    const id = String(++this.seq);
    return new Promise<Reply | null>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(null);
      }, 8000);
      (timer as { unref?: () => void }).unref?.();
      this.pending.set(id, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
      try {
        this.child?.stdin?.write(`${id} ${cmd}${arg ? ` ${arg}` : ""}\n`);
      } catch {
        this.pending.delete(id);
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  private async thumbFor(s: MusicSession): Promise<string | null> {
    if (!s.hasThumb) return null;
    const key = `${s.id}\n${s.title}\n${s.artist}\n${s.album}`;
    if (this.thumbs.has(key)) return this.thumbs.get(key) ?? null;
    const r = await this.call("thumb", s.id);
    let url: string | null = null;
    const type = r && typeof r["type"] === "string" ? r["type"].split(";")[0]!.trim().toLowerCase() : "";
    const data = r && typeof r["data"] === "string" ? r["data"] : "";
    if (r?.["ok"] === true && /^image\/(png|jpe?g|webp|bmp)$/.test(type) && data && data.length < 3_000_000 && /^[A-Za-z0-9+/=]+$/.test(data)) url = `data:${type};base64,${data}`;
    if (this.thumbs.size > 16) this.thumbs.clear();
    this.thumbs.set(key, url);
    return url;
  }

  /** État courant : sessions ouvertes et morceau de la session pilotée (avec sa pochette). */
  async state(): Promise<MusicState> {
    if (!this.supported) return { available: false, reason: "Disponible seulement sous Windows.", sessions: [], selected: null, chosen: null, track: null };
    const r = await this.call("state");
    if (!r || r["ok"] !== true) {
      const why = this.lastError ? `Les commandes multimédias de Windows ne répondent pas (${this.lastError}).` : "Lecture de l'état impossible.";
      return { available: false, reason: why, sessions: [], selected: null, chosen: this.chosen, track: null };
    }
    const sessions = decodeSessions(r["sessions"]);
    const current = typeof r["current"] === "string" && r["current"] ? r["current"] : null;
    this.last = { sessions, current };
    this.failures = 0;
    this.lastError = null;
    const sel = pickSession(sessions, this.chosen, current);
    return { available: true, sessions, selected: sel?.id ?? null, chosen: this.chosen, track: sel ? { ...sel, thumb: await this.thumbFor(sel) } : null };
  }

  /** Dernier état connu, sans relancer le pont (pour le partage aux amis). */
  lastTrack(): MusicSession | null {
    return pickSession(this.last.sessions, this.chosen, this.last.current);
  }

  /** Commande sur une session vue dans le dernier état (ou sur la session pilotée si `id` est absent). */
  async control(action: MusicAction, id?: string | null): Promise<boolean> {
    if (!isMusicAction(action)) return false;
    if (!this.last.sessions.length) await this.state();
    const target = id ? this.last.sessions.find((s) => s.id === id) : pickSession(this.last.sessions, this.chosen, this.last.current);
    if (!target) return false;
    const r = await this.call(action, target.id);
    return r?.["ok"] === true;
  }

  stop(): void {
    const c = this.child;
    this.child = null;
    this.ready = null;
    try {
      c?.kill();
    } catch {
      // déjà arrêté
    }
  }
}
