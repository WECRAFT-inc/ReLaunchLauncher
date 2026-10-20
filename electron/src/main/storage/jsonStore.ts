// Stockage sûr des fichiers de réglages JSON de WeCraft (lot E1).
// Port fidèle du comportement Python validé aux lots 1 et 1b (constats S5, B1, I5, I6 de l'audit) :
//
// - Fichier absent           -> null.
// - Impossible à lire (droits, verrou) -> null (ou SettingsUnreadable en mode strict) ; le fichier est
//   alors marqué « illisible » et n'est JAMAIS réécrit tant que c'est le cas.
// - Contenu invalide (JSON, encodage, pas un objet) -> une COPIE « <nom>.invalide-<date> » est faite
//   (une seule par contenu, y compris d'un démarrage à l'autre et avec les copies faites par la version
//   Python), le fichier est signalé à l'utilisateur, et null est renvoyé. L'original n'est jamais supprimé.
// - Écriture : fichier temporaire dans le même dossier, écrit puis vidé sur le disque, puis remplacement
//   atomique (rename), avec 10 essais espacés de 100 ms si un antivirus garde le fichier ouvert.
//
// Différence volontaire avec Python : les mises à jour relisent le fichier juste avant d'écrire et ne
// changent que les clés demandées (les autres réglages, y compris inconnus, sont conservés tels quels).
import * as fsp from "node:fs/promises";
import path from "node:path";

/** Le fichier existe mais ne peut pas être lu pour l'instant : ne surtout pas le réécrire. */
export class SettingsUnreadable extends Error {
  constructor(readonly file: string, cause: unknown) {
    super(`${path.basename(file)} ne peut pas être lu pour l'instant`, { cause });
    this.name = "SettingsUnreadable";
  }
}

/** Fichier invalide mis de côté (copy = null si la copie elle-même a échoué). */
export interface QuarantineRecord {
  file: string;
  copy: string | null;
}

export type JsonObject = Record<string, unknown>;

/** Opérations disque utilisées (remplaçables dans les tests pour simuler verrous et antivirus). */
export interface StoreFs {
  readFile(p: string): Promise<Uint8Array>;
  stat(p: string): Promise<{ size: number; mtimeMs: number }>;
  readdir(p: string): Promise<string[]>;
  mkdir(p: string): Promise<void>;
  writeFileSynced(p: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  unlink(p: string): Promise<void>;
  /** Copie sans jamais écraser une destination existante ; conserve la date de modification. */
  copyNew(from: string, to: string): Promise<void>;
}

export const nodeFs: StoreFs = {
  readFile: (p) => fsp.readFile(p),
  stat: (p) => fsp.stat(p),
  readdir: (p) => fsp.readdir(p),
  mkdir: async (p) => {
    await fsp.mkdir(p, { recursive: true });
  },
  writeFileSynced: async (p, data) => {
    const h = await fsp.open(p, "wx"); // « wx » : jamais d'écrasement d'un fichier existant
    try {
      await h.writeFile(data, "utf8");
      await h.sync();
    } finally {
      await h.close();
    }
  },
  rename: (from, to) => fsp.rename(from, to),
  unlink: (p) => fsp.unlink(p),
  copyNew: async (from, to) => {
    await fsp.copyFile(from, to, fsp.constants.COPYFILE_EXCL);
    const st = await fsp.stat(from);
    await fsp.utimes(to, st.atime, st.mtime);
  },
};

function errCode(e: unknown): string | undefined {
  return typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : undefined;
}

/** Erreurs transitoires de Windows quand un antivirus ou un indexeur tient le fichier ouvert. */
const RETRYABLE = new Set(["EPERM", "EACCES", "EBUSY"]);

/** Décode comme Python « utf-8-sig » : BOM accepté, octets invalides refusés. */
export function decodeUtf8Sig(raw: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(raw);
  } catch {
    return null;
  }
}

/** Contenu JSON objet ({…}) ou null si invalide. */
export function parseJsonObject(raw: Uint8Array): JsonObject | null {
  const text = decodeUtf8Sig(raw);
  if (text === null) return null;
  try {
    const data: unknown = JSON.parse(text);
    return typeof data === "object" && data !== null && !Array.isArray(data) ? (data as JsonObject) : null;
  } catch {
    return null;
  }
}

/** Horodatage local AAAAMMJJ-HHMMSS, comme time.strftime('%Y%m%d-%H%M%S') en Python. */
export function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

export interface JsonStoreOptions {
  fs?: StoreFs;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** Taille maximale lue (protection contre un fichier anormal) ; au-delà : traité comme invalide. */
  maxBytes?: number;
}

export class JsonStore {
  private readonly fs: StoreFs;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxBytes: number;
  /** Fichiers existants mais illisibles : jamais réécrits tant que c'est le cas. */
  readonly unreadable = new Set<string>();
  /** Dernière version (taille + date) de chaque fichier déjà mis de côté par CE processus. */
  private readonly quarantined = new Map<string, string>();
  /** Fichiers mis de côté, à signaler à l'utilisateur (vidé par takeInvalidFiles). */
  private invalid: QuarantineRecord[] = [];
  /** Écritures en cours, par fichier : elles sont faites l'une après l'autre. */
  private readonly queues = new Map<string, Promise<unknown>>();
  private tmpCounter = 0;

  constructor(opts: JsonStoreOptions = {}) {
    this.fs = opts.fs ?? nodeFs;
    this.now = opts.now ?? (() => new Date());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxBytes = opts.maxBytes ?? 8 * 1024 * 1024;
  }

  /** Fichiers mis de côté depuis le dernier appel (pour les signaler une seule fois). */
  takeInvalidFiles(): QuarantineRecord[] {
    const out = this.invalid;
    this.invalid = [];
    return out;
  }

  /**
   * Lit un fichier de réglages (objet JSON). Absent -> null. Invalide -> copie mise de côté, signalée, null.
   * Impossible à lire -> null, ou SettingsUnreadable si strict.
   */
  async read(file: string, strict = false): Promise<JsonObject | null> {
    let raw: Uint8Array;
    try {
      raw = await this.fs.readFile(file);
    } catch (e) {
      if (errCode(e) === "ENOENT") {
        this.unreadable.delete(file);
        return null;
      }
      this.unreadable.add(file);
      if (strict) throw new SettingsUnreadable(file, e);
      return null;
    }
    this.unreadable.delete(file);
    const data = raw.byteLength <= this.maxBytes ? parseJsonObject(raw) : null;
    if (data !== null) return data;

    let sig: string | null = null;
    try {
      const st = await this.fs.stat(file);
      sig = `${st.size}:${st.mtimeMs}`;
    } catch {
      sig = null;
    }
    if (sig === null || this.quarantined.get(file) !== sig) {
      if (sig !== null) this.quarantined.set(file, sig);
      this.invalid.push({ file, copy: await this.quarantine(file, raw) });
    }
    return null;
  }

  /**
   * Met de côté une copie « <nom>.invalide-<date> » d'un fichier invalide. Si une copie identique existe
   * déjà (démarrage précédent, version Python), elle est réutilisée. Renvoie le chemin de la copie, ou null.
   */
  async quarantine(file: string, raw?: Uint8Array): Promise<string | null> {
    try {
      const content = raw ?? (await this.fs.readFile(file));
      const dir = path.dirname(file);
      const base = path.basename(file);
      const prefix = `${base}.invalide-`;
      for (const name of await this.fs.readdir(dir)) {
        if (!name.startsWith(prefix)) continue;
        try {
          if (sameBytes(await this.fs.readFile(path.join(dir, name)), content)) return path.join(dir, name);
        } catch {
          // copie illisible : on en fera une autre
        }
      }
      const first = `${prefix}${stamp(this.now())}`;
      for (let n = 0; n < 100; n++) {
        const dest = path.join(dir, n === 0 ? first : `${first}-${n}`);
        try {
          await this.fs.copyNew(file, dest);
          return dest;
        } catch (e) {
          if (errCode(e) !== "EEXIST") return null;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Écrit un fichier sans jamais laisser de version à moitié écrite (temporaire + remplacement atomique). */
  async writeAtomic(file: string, text: string): Promise<void> {
    await this.fs.mkdir(path.dirname(file));
    const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${++this.tmpCounter}.tmp`);
    try {
      await this.fs.writeFileSynced(tmp, text);
      for (let attempt = 1; ; attempt++) {
        try {
          await this.fs.rename(tmp, file);
          return;
        } catch (e) {
          if (!RETRYABLE.has(errCode(e) ?? "") || attempt >= 10) throw e;
          await this.sleep(100);
        }
      }
    } finally {
      try {
        await this.fs.unlink(tmp);
      } catch {
        // déjà renommé (cas normal) ou impossible à supprimer : sans conséquence
      }
    }
  }

  /**
   * Modifie un fichier de réglages : relit le fichier, applique `change` sur une copie, puis l'écrit.
   * - Fichier illisible (droits, verrou) : SettingsUnreadable, RIEN n'est écrit.
   * - Fichier invalide : il a été mis de côté par read() ; on repart d'un objet vide.
   * Les écritures d'un même fichier sont faites l'une après l'autre.
   */
  update(file: string, change: (data: JsonObject) => JsonObject): Promise<JsonObject> {
    const previous = this.queues.get(file) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const current = (await this.read(file, true)) ?? {};
        const result = change({ ...current });
        await this.writeAtomic(file, JSON.stringify(result));
        return result;
      });
    this.queues.set(file, next);
    void next.finally(() => {
      if (this.queues.get(file) === next) this.queues.delete(file);
    }).catch(() => undefined);
    return next;
  }
}
