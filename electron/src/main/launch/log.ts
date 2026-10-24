// Journal du lancement (lot E4) : %APPDATA%\.wecraft\logs\lancement.log, pour comprendre un échec sans
// demander à l'utilisateur de recopier quoi que ce soit. Aucune donnée de compte n'y est écrite (le compte
// Microsoft reste dans le launcher officiel). Taille limitée : au-delà de 512 Ko, l'ancien journal devient
// « lancement.log.1 » (un seul gardé).
import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";

export const LOG_MAX_BYTES = 512 * 1024;

export function fileLogger(file: string, now: () => Date = () => new Date()): (line: string) => void {
  let queue: Promise<void> = Promise.resolve();
  return (line: string) => {
    const text = `${now().toISOString()} ${line.replace(/[\r\n]+/g, " | ")}\n`;
    queue = queue
      .then(async () => {
        await mkdir(path.dirname(file), { recursive: true });
        try {
          if ((await stat(file)).size > LOG_MAX_BYTES) await rename(file, `${file}.1`);
        } catch {
          // pas encore de journal
        }
        await appendFile(file, text, "utf8");
      })
      .catch(() => undefined); // un journal impossible à écrire ne doit jamais bloquer le lancement
  };
}
