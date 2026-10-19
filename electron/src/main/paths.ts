// Emplacements des données WeCraft, calculés EXACTEMENT comme la version Python
// (minecraft_launcher_lib.utils.get_minecraft_directory + sibling_dir), pour que les deux versions
// partagent les mêmes réglages. Fonctions pures : testées sans Electron (tests/paths.test.ts).
import path from "node:path";

/** Jeu de fonctions de chemins (posix ou win32). */
export type PathLib = typeof path.posix;

export interface PathEnv {
  platform: NodeJS.Platform;
  /** Variables d'environnement utiles (APPDATA sous Windows). */
  env: Readonly<Record<string, string | undefined>>;
  home: string;
}

function lib(platform: NodeJS.Platform): PathLib {
  return platform === "win32" ? path.win32 : path.posix;
}

/** Dossier « .minecraft » officiel, comme minecraft_launcher_lib.utils.get_minecraft_directory(). */
export function minecraftDir({ platform, env, home }: PathEnv): string {
  const p = lib(platform);
  if (platform === "win32") {
    const appData = env["APPDATA"] || p.join(home, "AppData", "Roaming");
    return p.join(appData, ".minecraft");
  }
  if (platform === "darwin") {
    return p.join(home, "Library", "Application Support", "minecraft");
  }
  return p.join(home, ".minecraft");
}

/**
 * « …\.minecraft » -> « …\.<name> » : seul le DERNIER dossier est renommé
 * (même règle que sibling_dir en Python, corrigée au lot 1 pour le constat S8).
 */
export function siblingDir(mcDir: string, name: string, platform: NodeJS.Platform): string {
  const p = lib(platform);
  const parsed = p.parse(mcDir);
  const dot = parsed.base.startsWith(".") ? "." : "";
  return p.join(parsed.dir, dot + name);
}

/** Dossier des réglages WeCraft (%APPDATA%\.wecraft sous Windows). */
export function wecraftDataDir(e: PathEnv): string {
  return siblingDir(minecraftDir(e), "wecraft", e.platform);
}

/** Fichier de configuration partagé avec la version Python. */
export function configFile(e: PathEnv): string {
  return lib(e.platform).join(wecraftDataDir(e), "launcher_config.json");
}
