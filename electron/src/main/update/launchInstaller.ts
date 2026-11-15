// Lancement de l'installeur d'une mise à jour (ou d'un retour arrière), avec méthodes de secours.
//
// Sur certains PC, Windows ou l'antivirus refusent à ReLaunch de créer un processus détaché (`spawn EPERM`) :
// l'installeur ne démarrait pas et ReLaunch restait sur l'ancienne version. Méthodes essayées dans l'ordre :
//   1. lancement direct détaché (comme avant) ;
//   2. PowerShell `Start-Process` (appel PowerShell en clair, comme ceux qui marchent déjà sur ces PC) ;
//   3. ouverture par le shell Windows (ShellExecute, sans processus enfant de ReLaunch) : sans arguments,
//      l'installeur « en un clic » s'installe quand même, avec sa fenêtre de progression.
// Le fichier est toujours un installeur gardé et revérifié par l'appelant ; les arguments viennent d'une liste fixe.
import path from "node:path";

export interface InstallerStarter {
  /** Lancement direct, détaché. */
  spawnDetached: (file: string, args: string[]) => Promise<void>;
  /** Exécute PowerShell avec ces arguments ; renvoie le code de sortie. */
  powershell?: (args: string[]) => Promise<number>;
  /** Ouverture par le shell Windows (sans arguments). */
  shellOpen?: (file: string) => Promise<void>;
  log?: (line: string) => void;
}

const SAFE_ARG = /^[/-][A-Za-z-]{1,30}$/;
const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Commande PowerShell `Start-Process` pour un installeur et des arguments sûrs (refuse tout le reste). */
export function startProcessScript(file: string, args: string[]): string {
  if (!path.win32.isAbsolute(file) || /[\r\n\0]/.test(file) || !/\.exe$/i.test(file)) throw new Error("Chemin d'installeur refusé.");
  if (!args.every((a) => SAFE_ARG.test(a))) throw new Error("Arguments d'installeur refusés.");
  const list = args.length ? ` -ArgumentList ${args.map(psQuote).join(",")}` : "";
  return `Start-Process -FilePath ${psQuote(file)}${list}`;
}

export async function startInstaller(file: string, args: string[], d: InstallerStarter): Promise<string> {
  const errors: string[] = [];
  const attempt = async (label: string, run: () => Promise<void>): Promise<boolean> => {
    try {
      await run();
      d.log?.(`installeur lancé (${label})`);
      return true;
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      errors.push(`${label} : ${m}`);
      d.log?.(`installeur : lancement ${label} refusé (${m})`);
      return false;
    }
  };
  if (await attempt("direct", () => d.spawnDetached(file, args))) return "direct";
  const ps = d.powershell;
  if (ps) {
    const script = startProcessScript(file, args);
    const ok = await attempt("PowerShell", async () => {
      const code = await ps(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]);
      if (code !== 0) throw new Error(`code ${code}`);
    });
    if (ok) return "PowerShell";
  }
  const open = d.shellOpen;
  if (open && (await attempt("shell Windows", () => open(file)))) return "shell Windows";
  throw new Error(`L'installeur n'a pas pu être lancé (${errors.join(" ; ")}). Ton antivirus le bloque peut-être : ajoute ReLaunch à ses exceptions.`);
}
