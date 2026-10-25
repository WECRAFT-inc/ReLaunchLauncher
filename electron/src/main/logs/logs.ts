// Journaux de ReLaunch (Réglages > Logs) : lecture limitée, niveaux, masquage des données sensibles.
//
// Fichiers lus (dans %APPDATA%\.wecraft, jamais ailleurs) :
//   logs/relaunch.log    journal de l'application : « AAAA-MM-JJTHH:MM:SS.mmmZ [NIVEAU] [origine] message »
//   logs/lancement.log   lancements (lot E4) : « date message » (niveau déduit du message, voir levelOf)
//   update.log           mises à jour, même format que la version Python : « AAAA-MM-JJ HH:MM:SS  message »
// Seule la fin de chaque fichier est lue (256 Ko au plus) : un gros journal ne bloque jamais l'interface.
// Aucun mot de passe ni jeton n'est écrit dans ces journaux ; par précaution, tout texte affiché, copié ou
// exporté passe par `redact` (jetons, identifiants de session, nom d'utilisateur Windows dans les chemins).
import { appendFile, mkdir, open, rename, stat } from "node:fs/promises";
import path from "node:path";

export type LogLevel = "error" | "warn" | "info";
export interface LogEntry {
  time: string;
  level: LogLevel;
  origin: string;
  text: string;
  /** Niveau déduit du texte (journaux sans niveau écrit). */
  guessed: boolean;
}

export const LOG_TAIL_BYTES = 256 * 1024;
export const APP_LOG_MAX = 1024 * 1024;
const MAX_ENTRIES = 3000;

/** Masque ce qui pourrait identifier une session ou un compte. */
export function redact(s: string): string {
  return s
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[jeton masqué]")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [masqué]")
    .replace(/("?(?:access_?token|refresh_?token|client_?token|id_?token|session(?:_?id)?|password|mot_de_passe|secret|api_?key|xuid|authorization)"?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&}]+)/gi, "$1[masqué]")
    .replace(/([?&](?:token|access_token|key|sig|signature|code)=)[^&\s#]+/gi, "$1[masqué]")
    .replace(/--accessToken\s+\S+/gi, "--accessToken [masqué]")
    .replace(/([A-Za-z]:\\Users\\)[^\\/:*?"<>|\r\n]+/gi, "$1[utilisateur]")
    .replace(/(\/(?:home|Users)\/)[^/\s]+/g, "$1[utilisateur]");
}

/** Niveau d'une ligne sans niveau écrit (journaux de lancement et de mises à jour). */
export function levelOf(text: string): LogLevel {
  if (/^(erreur|error)\b|refusée?\b|corrompu|invalide|échec|echec/i.test(text)) return "error";
  if (/impossible|NON ouvert|aucun processus|retour à v|ne démarrait pas|inaccessible|illisible|abandonn|introuvable/i.test(text)) return "warn";
  return "info";
}

/** Une ligne d'un des trois formats ; null si elle n'en suit aucun (ligne ignorée). */
export function parseLine(line: string, origin: string): LogEntry | null {
  let m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) \[(ERREUR|AVERTISSEMENT|INFO)\] \[([^\]]{1,40})\] (.*)$/.exec(line);
  if (m) return { time: m[1]!, level: m[2] === "ERREUR" ? "error" : m[2] === "AVERTISSEMENT" ? "warn" : "info", origin: m[3]!, text: redact(m[4]!), guessed: false };
  m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) (.*)$/.exec(line);
  if (m) return { time: m[1]!, level: levelOf(m[2]!), origin, text: redact(m[2]!), guessed: true };
  m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})  (.*)$/.exec(line);
  if (m) {
    const local = new Date(`${m[1]}T${m[2]}`); // heure locale, comme la version Python
    return { time: Number.isNaN(local.getTime()) ? `${m[1]}T${m[2]}` : local.toISOString(), level: levelOf(m[3]!), origin, text: redact(m[3]!), guessed: true };
  }
  return null;
}

/** Fin d'un fichier (au plus `max` octets), en commençant à une ligne entière. */
export async function readTail(file: string, max = LOG_TAIL_BYTES): Promise<string> {
  let fh;
  try {
    fh = await open(file, "r");
  } catch {
    return "";
  }
  try {
    const size = (await fh.stat()).size;
    const len = Math.min(size, max);
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, size - len);
    let text = buf.toString("utf8");
    if (size > len) text = text.slice(text.indexOf("\n") + 1); // première ligne coupée : ignorée
    return text;
  } finally {
    await fh.close();
  }
}

export interface LogSource {
  file: string;
  origin: string;
}

export function logSources(dataDir: string): LogSource[] {
  return [
    { file: path.join(dataDir, "logs", "relaunch.log"), origin: "ReLaunch" },
    { file: path.join(dataDir, "logs", "lancement.log"), origin: "Lancement" },
    { file: path.join(dataDir, "update.log"), origin: "Mises à jour" },
  ];
}

/** Entrées récentes de tous les journaux, les plus récentes d'abord (3000 au plus). */
export async function readLogs(sources: LogSource[]): Promise<{ entries: LogEntry[]; truncated: boolean }> {
  const all: LogEntry[] = [];
  let truncated = false;
  for (const s of sources) {
    const text = await readTail(s.file);
    try {
      if ((await stat(s.file)).size > LOG_TAIL_BYTES) truncated = true;
    } catch {
      // fichier absent
    }
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const e = parseLine(line.slice(0, 4000), s.origin);
      if (e) all.push(e);
    }
  }
  all.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0));
  if (all.length > MAX_ENTRIES) truncated = true;
  return { entries: all.slice(0, MAX_ENTRIES), truncated };
}

/** Journal de l'application (niveaux, origine), masqué avant écriture, taille limitée (« .1 » gardé). */
export function appLogger(file: string, now: () => Date = () => new Date()) {
  let queue: Promise<void> = Promise.resolve();
  const write = (level: LogLevel, origin: string, msg: string) => {
    const lv = level === "error" ? "ERREUR" : level === "warn" ? "AVERTISSEMENT" : "INFO";
    const line = `${now().toISOString()} [${lv}] [${origin.replace(/[[\]\r\n]/g, "").slice(0, 40)}] ${redact(msg).replace(/[\r\n]+/g, " | ").slice(0, 2000)}\n`;
    queue = queue
      .then(async () => {
        await mkdir(path.dirname(file), { recursive: true });
        try {
          if ((await stat(file)).size > APP_LOG_MAX) await rename(file, `${file}.1`);
        } catch {
          // pas encore de journal
        }
        await appendFile(file, line, "utf8");
      })
      .catch(() => undefined); // un journal impossible à écrire ne bloque jamais ReLaunch
    return queue;
  };
  return {
    info: (origin: string, msg: string) => write("info", origin, msg),
    warn: (origin: string, msg: string) => write("warn", origin, msg),
    error: (origin: string, msg: string) => write("error", origin, msg),
  };
}
export type AppLogger = ReturnType<typeof appLogger>;
