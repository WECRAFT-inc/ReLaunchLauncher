// Mise à la corbeille d'un DOSSIER d'instance.
//
// Sous Windows, shell.trashItem d'Electron peut faire planter tout le processus principal sur certains
// dossiers (gros dossiers, fichiers verrouillés, chemins longs) : le launcher se fermait sans rien supprimer.
// On passe donc par un processus séparé (PowerShell, API Windows « SendToRecycleBin ») : s'il échoue ou
// plante, seul ce processus s'arrête et ReLaunch affiche l'erreur. Jamais d'effacement définitif : si la
// corbeille refuse (dossier trop gros pour elle, disque réseau), Windows demande avant tout effacement définitif
// (boîtes de dialogue du système activées) et rien n'est supprimé si le joueur refuse.
// Le chemin est transmis par une variable d'environnement, jamais inséré dans la commande (pas d'injection).
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";

const SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -AssemblyName Microsoft.VisualBasic",
  "$p = $env:RELAUNCH_TRASH_PATH",
  "if (-not (Test-Path -LiteralPath $p -PathType Container)) { exit 3 }",
  "[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p, [Microsoft.VisualBasic.FileIO.UIOption]::AllDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin, [Microsoft.VisualBasic.FileIO.UICancelOption]::ThrowException)",
].join("; ");

export async function trashFolder(folder: string, fallback: (f: string) => Promise<void>, platform: NodeJS.Platform = process.platform): Promise<void> {
  if (platform !== "win32") return fallback(folder);
  const ps = path.join(process.env["SystemRoot"] ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  await new Promise<void>((resolve, reject) => {
    execFile(
      ps,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SCRIPT],
      { windowsHide: true, timeout: 10 * 60 * 1000, env: { ...process.env, RELAUNCH_TRASH_PATH: folder } },
      (err) => (err ? reject(new Error("La corbeille a refusé ce dossier.")) : resolve()),
    );
  });
  // contrôle : le dossier ne doit plus exister
  if (await stat(folder).then(() => true, () => false)) throw new Error("Le dossier est toujours là.");
}
