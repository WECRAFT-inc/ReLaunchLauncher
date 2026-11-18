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
import fs from "node:fs";
import path from "node:path";
import type { MusicAction, MusicSession, MusicState } from "../../shared/api";

/**
 * Script PowerShell du pont (ASCII, sans guillemet double : il passe tel quel en argument `-Command`).
 * Pas de `-EncodedCommand` : un script encodé en base64 est le schéma classique des malwares et certains
 * antivirus (ex. 360 Total Security) refusent alors le lancement (`spawn EPERM`).
 */
export const BRIDGE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
# Lance sans console : ne jamais toucher a [Console]::*Encoding ; flux standard lus et ecrits en UTF-8.
$rlUtf8 = New-Object Text.UTF8Encoding $false
$rlIn = New-Object IO.StreamReader([Console]::OpenStandardInput(), $rlUtf8)
$rlOut = New-Object IO.StreamWriter([Console]::OpenStandardOutput(), $rlUtf8)
$rlOut.AutoFlush = $true
function Out-Line($o) { $rlOut.WriteLine(($o | ConvertTo-Json -Compress -Depth 5)) }
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation${"`"}1' } | Select-Object -First 1
  if (-not $asTask) { throw 'AsTask introuvable' }
  function Wait-Op($op, [Type]$type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); [void]$t.Wait(5000); return $t.Result }
  $mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
  $propType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
  $mgr = Wait-Op ($mgrType::RequestAsync()) $mgrType
  if (-not $mgr) { throw 'gestionnaire multimedia indisponible' }
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
      $n = [uint32]$st.Size
      if ($n -eq 0) { $st.Dispose(); Out-Line @{ id = $rid; ok = $false; error = 'empty' }; continue }
      $bytes = $null
      try {
        $rd = New-Object Windows.Storage.Streams.DataReader($st.GetInputStreamAt(0))
        $got = Wait-Op ($rd.LoadAsync($n)) ([uint32])
        $bytes = New-Object byte[] $got
        $rd.ReadBytes($bytes)
        $rd.Dispose()
      } catch {
        $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($st)
        $ms = New-Object IO.MemoryStream; $net.CopyTo($ms); $net.Dispose()
        $bytes = $ms.ToArray()
      }
      $ctype = [string]$st.ContentType
      $st.Dispose()
      Out-Line @{ id = $rid; ok = $true; type = $ctype; data = [Convert]::ToBase64String($bytes) }
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
  /** Lancement du pont (tests) ; `mode` : 0 = -Command, 1 = fichier .ps1. */
  spawnBridge?: (mode: number) => BridgeChild;
  /** Dossier où écrire le script si le lancement en `-Command` est refusé (secours `-File`). */
  dataDir?: string;
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

/** Pochette renvoyée par le pont, vérifiée (type d'image, taille, base64), en data:. */
export function thumbUrl(r: Record<string, unknown> | null): string | null {
  if (!r || r["ok"] !== true) return null;
  let type = typeof r["type"] === "string" ? r["type"].split(";")[0]!.trim().toLowerCase() : "";
  const data = typeof r["data"] === "string" ? r["data"] : "";
  if (!data || data.length > 3_000_000 || !/^[A-Za-z0-9+/=]+$/.test(data)) return null;
  if (!/^image\/(png|jpe?g|webp|bmp)$/.test(type)) {
    // type absent ou générique (« application/octet-stream ») : reconnu d'après les premiers octets
    const head = Buffer.from(data.slice(0, 24), "base64");
    if (head[0] === 0xff && head[1] === 0xd8) type = "image/jpeg";
    else if (head.subarray(0, 4).toString("latin1") === "\x89PNG") type = "image/png";
    else if (head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") type = "image/webp";
    else if (head.subarray(0, 2).toString("latin1") === "BM") type = "image/bmp";
    else return null;
  }
  return `data:${type};base64,${data}`;
}

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

  /** Méthode de lancement : 0 = script en clair (`-Command`, comme les autres appels PowerShell), 1 = fichier .ps1. */
  private mode = 0;
  private spawnRefused = false;

  private spawnDefault(): BridgeChild {
    const env = this.d.env ?? process.env;
    const ps = path.win32.join(env["SystemRoot"] ?? env["windir"] ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const base = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass"];
    let args: string[];
    if (this.mode === 1 && this.d.dataDir) {
      const file = path.join(this.d.dataDir, "music-bridge.ps1");
      fs.mkdirSync(this.d.dataDir, { recursive: true });
      fs.writeFileSync(file, `\ufeff${BRIDGE_SCRIPT}`, "utf8"); // réécrit à chaque lancement : toujours le script livré
      args = [...base, "-File", file];
    } else {
      args = [...base, "-Command", BRIDGE_SCRIPT];
    }
    this.d.log?.(`Musique : démarrage du pont (${this.mode === 1 ? "fichier .ps1" : "-Command"}).`);
    return spawn(ps, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }) as unknown as BridgeChild;
  }

  private start(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      let child: BridgeChild;
      try {
        child = this.d.spawnBridge ? this.d.spawnBridge(this.mode) : this.spawnDefault();
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
      child.on("error", (e) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (/EPERM|EACCES/.test(msg)) this.spawnRefused = true;
        dead(msg);
      });
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
      this.spawnRefused = false;
      await this.start();
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      // lancement refusé par Windows / l'antivirus : on essaie l'autre méthode tout de suite
      if (!(this.spawnRefused && this.mode === 0 && this.d.dataDir)) return null;
      this.mode = 1;
      this.retryAt = 0;
      try {
        this.spawnRefused = false;
        await this.start();
      } catch (e2) {
        const m = e2 instanceof Error ? e2.message : String(e2);
        this.lastError = /EPERM|EACCES/.test(m) ? `${m} : lancement de PowerShell bloqué, sans doute par l'antivirus` : m;
        return null;
      }
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

  /** Pochette (data:) : gardée par morceau ; un échec est retenté après quelques secondes (Spotify la fournit parfois en retard). */
  private thumbFail = new Map<string, number>();
  private async thumbFor(s: MusicSession): Promise<string | null> {
    if (!s.hasThumb) return null;
    const key = `${s.id}\n${s.title}\n${s.artist}\n${s.album}`;
    const ok = this.thumbs.get(key);
    if (ok) return ok;
    const failed = this.thumbFail.get(key);
    if (failed && Date.now() - failed < 6000) return null;
    const r = await this.call("thumb", s.id);
    const url = thumbUrl(r);
    if (this.thumbs.size > 16) this.thumbs.clear();
    if (this.thumbFail.size > 32) this.thumbFail.clear();
    if (url) {
      this.thumbs.set(key, url);
      this.thumbFail.delete(key);
    } else {
      this.thumbFail.set(key, Date.now());
      const why = r ? String(r["error"] ?? r["type"] ?? "format") : "pas de réponse";
      if (why !== this.lastThumbErr) this.d.log?.(`Musique : pochette indisponible (${why}).`);
      this.lastThumbErr = why;
    }
    return url;
  }
  private lastThumbErr = "";

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
