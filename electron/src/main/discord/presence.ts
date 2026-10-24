// Statut Discord « Joue à <instance> » (lot E9), port de DiscordPresence (wecraft_launcher.py).
// Désactivé par défaut (clé « discord » de launcher_config.json, partagée avec la version Python) ; tout est
// facultatif et silencieux : Discord fermé ou identifiant invalide = rien ne se passe.
// Le jeu est détecté par son processus Java ; la recherche est faite PAR POWERSHELL, qui ne renvoie qu'un nombre :
// les lignes de commande de Java (celle de Minecraft contient le jeton de session) ne sont jamais lues par ReLaunch.
import { execFile } from "node:child_process";
import path from "node:path";
import { DiscordIpc, type Activity, type RpcClient } from "./ipc";

export const DISCORD_CLIENT_ID = "1557352573097218068";
export const PS_COUNT_MINECRAFT =
  "@(Get-CimInstance Win32_Process -Filter \"Name='javaw.exe' OR Name='java.exe'\" " + "| Where-Object { $_.CommandLine -match '(?i)--gameDir|net\\.minecraft' }).Count";

/** discord_client_id : variable WECRAFT_DISCORD_ID, sinon « discord_app_id » de la config, sinon la constante. */
export function discordClientId(config: Record<string, unknown> | null, env: NodeJS.ProcessEnv = process.env): string {
  return String(env["WECRAFT_DISCORD_ID"] || config?.["discord_app_id"] || DISCORD_CLIENT_ID).trim();
}

/** minecraft_running : Windows (PowerShell, nombre seulement ; repli tasklist) ou pgrep. */
export function minecraftRunning(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const run = (file: string, args: string[]) =>
    new Promise<{ ok: boolean; out: string }>((resolve) =>
      execFile(file, args, { windowsHide: true, timeout: 15_000, encoding: "utf8" }, (err, stdout) => resolve({ ok: !err || typeof (err as { code?: unknown }).code === "number", out: String(stdout ?? "") })),
    );
  if (platform === "win32") {
    const sys = path.win32.join(env["SystemRoot"] ?? "C:\\Windows", "System32");
    return run(path.win32.join(sys, "WindowsPowerShell", "v1.0", "powershell.exe"), ["-NoProfile", "-NonInteractive", "-Command", PS_COUNT_MINECRAFT]).then(async (r) => {
      const n = Number(r.out.trim() || "NaN");
      if (r.ok && Number.isFinite(n)) return n > 0;
      const t = await run(path.win32.join(sys, "tasklist.exe"), ["/FI", "IMAGENAME eq javaw.exe", "/NH"]);
      return t.out.toLowerCase().includes("javaw.exe");
    });
  }
  return run("pgrep", ["-f", "gameDir|net\\.minecraft"]).then((r) => r.ok && r.out.trim() !== "");
}

export interface PresenceDeps {
  clientId: string;
  enabled: boolean;
  version: string;
  factory?: (clientId: string) => RpcClient;
  running?: () => Promise<boolean>;
  now?: () => number;
  /** Lance la vérification régulière (remplaçable dans les tests). */
  every?: (ms: number, fn: () => void) => () => void;
}

type Mode = "idle" | "launching" | "playing";
export const POLL_MS = 15_000;
export const LAUNCH_WAIT_MS = 300_000;
export const RETRY_MS = 30_000;

export class DiscordPresence {
  enabled: boolean;
  private rpc: RpcClient | null = null;
  private sent: string | null = null;
  private retryAt = 0;
  private mode: Mode = "idle";
  private info: { name?: string; version?: string; loader?: string } | null = null;
  private tLaunch = 0;
  private tStart = 0;
  private chain: Promise<void> = Promise.resolve();
  private stop: (() => void) | null = null;

  constructor(private readonly d: PresenceDeps) {
    this.enabled = d.enabled;
  }

  get usable(): boolean {
    return !!this.d.clientId;
  }

  private now(): number {
    return (this.d.now ?? Date.now)();
  }

  /** Toutes les opérations passent l'une après l'autre (comme le thread unique de la version Python). */
  private post(fn: () => Promise<void>): Promise<void> {
    if (!this.usable) return Promise.resolve();
    if (!this.stop) this.stop = (this.d.every ?? ((ms, f) => ((t) => () => clearInterval(t))(setInterval(f, ms))))(POLL_MS, () => void this.post(() => this.tick()));
    this.chain = this.chain.then(fn).catch(() => undefined);
    return this.chain;
  }

  idle(): Promise<void> {
    return this.post(async () => {
      this.mode = "idle";
      this.info = null;
      await this.push();
    });
  }

  launching(name: string, version: string, loader: string | null): Promise<void> {
    return this.post(async () => {
      this.mode = "launching";
      this.info = { name, version, loader: loader ?? "" };
      this.tLaunch = this.now();
      await this.push();
    });
  }

  setEnabled(flag: boolean): Promise<void> {
    this.enabled = flag;
    return this.post(async () => {
      if (!this.enabled) await this.clear();
      else await this.push();
    });
  }

  /** Suit le jeu : lancement demandé -> jeu détecté -> jeu fermé. */
  async tick(): Promise<void> {
    if (!this.enabled) return;
    if (this.mode === "launching" || this.mode === "playing") {
      const running = await (this.d.running ?? (() => minecraftRunning()))();
      if (this.mode === "launching" && running) {
        this.mode = "playing";
        this.tStart = Math.floor(this.now() / 1000);
      } else if (this.mode === "launching" && this.now() - this.tLaunch > LAUNCH_WAIT_MS) this.mode = "idle";
      else if (this.mode === "playing" && !running) this.mode = "idle";
    }
    await this.push();
  }

  /** _status : ce qui est affiché sur le profil Discord. */
  status(): Activity {
    const info = this.info ?? {};
    const name = info.name || (info.version ? `Minecraft ${info.version}` : "Minecraft");
    const parts: string[] = [];
    if (info.name && info.version) parts.push(`Minecraft ${info.version}`);
    if (info.loader && info.loader !== "Vanilla") parts.push(info.loader);
    const base = {
      assets: { large_image: "wecraft", large_text: `ReLaunch v${this.d.version}` },
      buttons: [{ label: "Télécharger WeCraft", url: "https://github.com/Rexidelamort/WeCraft-Releases" }],
    };
    let a: Activity;
    if (this.mode === "playing") a = { details: `Joue à ${name}`, state: parts.join(" · ") || "Minecraft", timestamps: { start: this.tStart }, ...base };
    else if (this.mode === "launching") a = { details: `Prépare ${name}`, state: "Lancement de Minecraft...", ...base };
    else a = { details: "Dans le launcher", state: "Choisit une instance", ...base };
    a.details = a.details.slice(0, 120);
    a.state = a.state.slice(0, 120);
    return a;
  }

  private async push(): Promise<void> {
    if (!this.enabled) return;
    const st = this.status();
    const key = JSON.stringify(st);
    if (this.rpc && key === this.sent) return; // rien de changé : rien n'est envoyé
    if (!(await this.connect())) return;
    try {
      await this.rpc!.setActivity(st);
      this.sent = key;
    } catch {
      this.drop();
    }
  }

  private async connect(): Promise<boolean> {
    if (this.rpc) return true;
    if (this.now() < this.retryAt) return false;
    try {
      const rpc = (this.d.factory ?? ((id) => new DiscordIpc(id)))(this.d.clientId);
      await rpc.connect();
      this.rpc = rpc;
      return true;
    } catch {
      this.retryAt = this.now() + RETRY_MS; // Discord fermé : nouvel essai plus tard
      return false;
    }
  }

  private drop(): void {
    try {
      this.rpc?.close();
    } catch {
      // déjà fermé
    }
    this.rpc = null;
    this.sent = null;
    this.retryAt = this.now() + RETRY_MS;
  }

  private async clear(): Promise<void> {
    if (this.rpc) {
      try {
        await this.rpc.setActivity(null);
      } catch {
        this.drop();
      }
    }
    this.sent = null;
  }

  dispose(): void {
    this.stop?.();
    this.stop = null;
    this.rpc?.close();
    this.rpc = null;
  }
}
