// Fermeture / ouverture du launcher officiel (lot E4), port de close_official_launcher et
// open_official_launcher (wecraft_launcher.py).
//
// - Fermeture NORMALE par défaut (le launcher enregistre ses fichiers) ; l'arrêt forcé (/F) n'est utilisé
//   qu'après accord explicite de l'utilisateur (paramètre `force`, décidé par l'interface).
// - Seuls les processus du launcher sont visés, jamais le jeu (javaw.exe).
// - Commandes lancées sans shell, par chemin absolu dans System32 (pas de recherche dans le PATH).
import { execFile, spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";

export const OFFICIAL_LAUNCHER_PROCESSES = ["MinecraftLauncher.exe", "Minecraft.exe"] as const;
export const STORE_APP = "shell:AppsFolder\\Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft";

export interface CommandRunner {
  /** Exécute et attend la fin ; renvoie la sortie standard (jamais d'exception pour un code de sortie ≠ 0). */
  run(file: string, args: string[]): Promise<{ code: number | null; stdout: string }>;
  /** Lance un programme détaché (sans attendre). */
  start(file: string, args: string[]): Promise<void>;
  exists(file: string): Promise<boolean>;
  sleep(ms: number): Promise<void>;
  now(): number;
}

export const nodeRunner: CommandRunner = {
  run: (file, args) =>
    new Promise((resolve, reject) => {
      execFile(file, args, { windowsHide: true, encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        const e = err as unknown as { code?: string | number; killed?: boolean } | null;
        if (e && (typeof e.code !== "number" || e.killed)) reject(e); // introuvable, délai dépassé ou arrêté
        else resolve({ code: e ? (e.code as number) : 0, stdout: String(stdout ?? "") });
      });
    }),
  start: (file, args) =>
    new Promise((resolve, reject) => {
      const child = spawn(file, args, { detached: true, stdio: "ignore", windowsHide: false });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    }),
  exists: async (file) => {
    try {
      return (await stat(file)).isFile();
    } catch {
      return false;
    }
  },
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
};

export interface LauncherEnv {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  runner: CommandRunner;
  /** Journal de diagnostic (aucune donnée de compte). */
  log?: (line: string) => void;
}

const defaultEnv = (): LauncherEnv => ({ platform: process.platform, env: process.env, runner: nodeRunner });

/** Nom du paquet Microsoft Store / Xbox du launcher officiel. */
export const STORE_PACKAGE = "Microsoft.4297127D64EC6";
const AUMID = /^Microsoft\.4297127D64EC6_[a-z0-9]{13}![A-Za-z][A-Za-z0-9._-]{0,63}$/;
/** Délai pour constater que le launcher officiel a réellement démarré. */
export const OPEN_CHECK_MS = 20_000;

function system32(env: NodeJS.ProcessEnv, exe: string): string {
  return path.win32.join(env["SystemRoot"] ?? env["windir"] ?? "C:\\Windows", "System32", exe);
}

async function winRunning(e: LauncherEnv, name: string): Promise<boolean> {
  const out = await e.runner.run(system32(e.env, "tasklist.exe"), ["/FI", `IMAGENAME eq ${name}`, "/NH"]);
  return out.stdout.toLowerCase().includes(name.toLowerCase());
}

export interface CloseResult {
  ok: boolean;
  message: string;
}

/** Ferme le launcher officiel ; `force` seulement après accord de l'utilisateur. */
export async function closeOfficialLauncher(opts: { timeoutMs?: number; force?: boolean } = {}, e: LauncherEnv = defaultEnv()): Promise<CloseResult> {
  const timeout = opts.timeoutMs ?? 8000;
  try {
    if (e.platform === "win32") {
      const running: string[] = [];
      for (const n of OFFICIAL_LAUNCHER_PROCESSES) if (await winRunning(e, n)) running.push(n);
      if (running.length === 0) return { ok: true, message: "Launcher officiel déjà fermé." };
      for (const n of running) await e.runner.run(system32(e.env, "taskkill.exe"), [...(opts.force ? ["/F"] : []), "/IM", n]);
      const deadline = e.runner.now() + timeout;
      while (e.runner.now() < deadline) {
        let any = false;
        for (const n of running) if (await winRunning(e, n)) any = true;
        if (!any) {
          await e.runner.sleep(1500); // laisse Windows libérer les fichiers
          return { ok: true, message: "Launcher officiel fermé." };
        }
        await e.runner.sleep(500);
      }
      return { ok: false, message: "Le launcher officiel ne s'est pas fermé." };
    }
    if (e.platform === "darwin") {
      await e.runner.run("/usr/bin/osascript", ["-e", 'tell application "Minecraft" to quit']);
    } else {
      for (const [file, args] of [["pkill", ["-x", "minecraft-launcher"]], ["flatpak", ["kill", "com.mojang.Minecraft"]]] as const) {
        await e.runner.run(file, [...args]).catch(() => null); // absent : ignoré (shutil.which en Python)
      }
    }
    await e.runner.sleep(1500);
    return { ok: true, message: "Launcher officiel fermé." };
  } catch (err) {
    return { ok: false, message: `Impossible de fermer le launcher officiel (${(err as Error).message}) : fermez-le à la main.` };
  }
}

/**
 * Identifiant d'application (AUMID) du launcher officiel installé par le Microsoft Store ou l'application Xbox,
 * lu dans le paquet installé ; null s'il n'est pas installé ou illisible. Commande fixe, sans donnée externe.
 */
export async function storeAppId(e: LauncherEnv): Promise<string | null> {
  const ps = path.win32.join(e.env["SystemRoot"] ?? e.env["windir"] ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const script =
    `$p = Get-AppxPackage -Name '${STORE_PACKAGE}' | Select-Object -First 1; ` +
    "if ($p) { $a = (Get-AppxPackageManifest $p).Package.Applications.Application | Select-Object -First 1; " +
    "Write-Output ($p.PackageFamilyName + '!' + $a.Id) }";
  try {
    const out = (await e.runner.run(ps, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])).stdout.trim();
    const id = out.split(/\r?\n/).pop()?.trim() ?? "";
    e.log?.(`Paquet Store/Xbox : ${id || "absent"}`);
    return AUMID.test(id) ? id : null;
  } catch (err) {
    e.log?.(`Paquet Store/Xbox : lecture impossible (${(err as Error).message})`);
    return null;
  }
}

async function anyLauncherRunning(e: LauncherEnv): Promise<boolean> {
  for (const n of OFFICIAL_LAUNCHER_PROCESSES) if (await winRunning(e, n)) return true;
  return false;
}

/**
 * Ouvre le launcher officiel (version classique, sinon Microsoft Store / Xbox). Sous Windows, le succès n'est
 * annoncé que si son processus est réellement apparu (jamais de réussite non vérifiée, §10.4).
 */
export async function openOfficialLauncher(e: LauncherEnv = defaultEnv()): Promise<boolean> {
  try {
    if (e.platform === "win32") {
      let started = false;
      for (const [name, def] of [["ProgramFiles(x86)", "C:\\Program Files (x86)"], ["ProgramFiles", "C:\\Program Files"]] as const) {
        const exe = path.win32.join(e.env[name] ?? def, "Minecraft Launcher", "MinecraftLauncher.exe");
        if (await e.runner.exists(exe)) {
          e.log?.(`Ouverture : ${exe}`);
          await e.runner.start(exe, []);
          started = true;
          break;
        }
      }
      if (!started) {
        const id = (await storeAppId(e)) ?? STORE_APP.slice("shell:AppsFolder\\".length);
        e.log?.(`Ouverture : explorer.exe shell:AppsFolder\\${id}`);
        await e.runner.start(path.win32.join(e.env["SystemRoot"] ?? e.env["windir"] ?? "C:\\Windows", "explorer.exe"), [`shell:AppsFolder\\${id}`]);
      }
      const deadline = e.runner.now() + OPEN_CHECK_MS;
      while (e.runner.now() < deadline) {
        if (await anyLauncherRunning(e)) {
          e.log?.("Launcher officiel démarré.");
          return true;
        }
        await e.runner.sleep(1000);
      }
      e.log?.(`Aucun processus ${OFFICIAL_LAUNCHER_PROCESSES.join(" / ")} après ${OPEN_CHECK_MS / 1000} s.`);
      return false;
    }
    if (e.platform === "darwin") {
      return (await e.runner.run("/usr/bin/open", ["-a", "Minecraft"])).code === 0;
    }
    for (const [file, args] of [["minecraft-launcher", []], ["flatpak", ["run", "com.mojang.Minecraft"]]] as const) {
      try {
        await e.runner.start(file, [...args]);
        return true;
      } catch {
        // essai suivant
      }
    }
  } catch (err) {
    e.log?.(`Ouverture impossible : ${(err as Error).message}`);
  }
  return false;
}
