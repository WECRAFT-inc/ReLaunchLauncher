// Suppression d'une instance (lot E8), port de safe_to_delete / delete_instance (wecraft_launcher.py).
//
// Différence VOULUE avec la version Python : le dossier est envoyé à la CORBEILLE de Windows (récupérable),
// jamais effacé définitivement. Si la corbeille refuse (disque réseau, dossier trop gros…), rien n'est
// supprimé et l'utilisateur est prévenu : ReLaunch ne bascule jamais tout seul vers un effacement définitif.
//
// Garde-fous (identiques à Python) : le dossier doit être un vrai dossier, À L'INTÉRIEUR d'un dossier
// d'instances connu (WeCraft, CurseForge, Prism, Modrinth), après résolution des liens et des « .. », et ne
// doit être ni contenir aucun dossier protégé (dossier personnel, .minecraft, dossier WeCraft).
import { realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { minecraftDir, wecraftDataDir, type PathEnv } from "../paths";
import { instanceRoots, instancesDir, isInside } from "./detect";

async function resolved(p: string): Promise<string | null> {
  try {
    return await realpath(p);
  } catch {
    return null;
  }
}

const sameOrInside = (inner: string, outer: string, win: boolean): boolean => {
  const a = win ? inner.toLowerCase() : inner;
  const b = win ? outer.toLowerCase() : outer;
  const rel = path.relative(b, a);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/** safe_to_delete : true seulement pour un vrai dossier d'instance. */
export async function safeToDelete(folder: string, env: PathEnv, roots: string[] = instanceRoots(env)): Promise<boolean> {
  try {
    const p = await resolved(folder);
    if (!p || !(await stat(p)).isDirectory()) return false;
    // Python : len(Path.parts) >= 4, où la racine (« C:\ » ou « / ») compte pour une partie
    const root = path.parse(p).root;
    if (1 + p.slice(root.length).split(/[\\/]+/).filter(Boolean).length < 4) return false;
    let inside = false;
    for (const r of roots) if (await isInside(p, r)) inside = true;
    if (!inside) return false;
    const win = env.platform === "win32";
    const protectedDirs = [env.home || os.homedir(), wecraftDataDir(env), instancesDir(env), minecraftDir(env)];
    for (const q0 of protectedDirs) {
      const q = (await resolved(q0)) ?? q0;
      // ni le dossier protégé lui-même, ni un de ses parents
      if (sameOrInside(q, p, win)) return false;
    }
    return true;
  } catch {
    return false;
  }
}
