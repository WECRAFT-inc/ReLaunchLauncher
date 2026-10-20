// Stockage sûr des fichiers de réglages JSON de WeCraft (lot E1).
// Port fidèle du comportement Python validé aux lots 1 et 1b (constats S5, B1, I5, I6 de l'audit) :
//
// - Fichier absent           -> null.
// - Impossible à lire (droits, verrou) -> null (ou SettingsUnreadable en mode strict) ; le fichier est
//   alors marqué « illisible » et n'est JAMAIS réécrit tant que c'est le cas.
// - Contenu invalide (JSON, encodage, pas un objet) -> une COPIE « <nom>.invalide-<date> » est faite
//   (une seule par contenu, y compris d'un démarrage à l'autre et avec les copies faites par la version
//   Python), le fichier est signalé à l'utilisateur, et null est renvoyé. L'original n'est jamais supprimé.
// - Fichier anormalement gros -> traité comme illisible (jamais chargé en mémoire, jamais réécrit).
// - Écriture : fichier temporaire dans le même dossier, écrit puis vidé sur le disque, puis remplacement
//   atomique (rename), avec 10 essais espacés de 100 ms si un antivirus garde le fichier ouvert.
// - Revue E1 (20/10/2026) : un fichier invalide n'est remplacé QUE si sa copie de côté existe
//   (SettingsNotBackedUp sinon) ; la copie contient exactement les octets jugés invalides ; si le fichier
//   change pendant une mise à jour (autre programme), la mise à jour est recommencée sur le nouveau contenu.
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

/** Fichier invalide dont la copie de côté a échoué : il ne doit pas être remplacé. */
export class SettingsNotBackedUp extends Error {
  constructor(readonly file: string) {
    super(`${path.basename(file)} est invalide et n'a pas pu être copié de côté : il n'est pas modifié`);
    this.name = "SettingsNotBackedUp";
  }
}

/** Le fichier change sans cesse pendant la mise à jour (autre programme) : rien n'a été écrit. */
export class SettingsBusy extends Error {
  constructor(readonly file: string) {
    super(`${path.basename(file)} est modifié par un autre programme`);
    this.name = "SettingsBusy";
  }
}

/** Résultat d'une mise à jour : `reset` = le fichier était invalide, il a été mis de côté puis remplacé. */
export interface UpdateResult {
  data: JsonObject;
  reset: QuarantineRecord | null;
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
  /** Copie sans jamais écraser une destination existante ; conserve si possible la date de modification. */
  copyNew(from: string, to: string): Promise<void>;
  /** Crée un fichier avec ces octets, sans jamais écraser un fichier existant (EEXIST). */
  writeNew(p: string, data: Uint8Array): Promise<void>;
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
    try {
      const st = await fsp.stat(from);
      await fsp.utimes(to, st.atime, st.mtime);
    } catch {
      // la copie est faite ; seule la date n'a pas pu être reprise
    }
  },
  writeNew: async (p, data) => {
    const h = await fsp.open(p, "wx");
    try {
      await h.writeFile(data);
      await h.sync();
    } finally {
      await h.close();
    }
  },
};

/** État d'un fichier de réglages au moment de la lecture. sig = taille:date (null si absent). */
type Loaded =
  | { state: "absent"; sig: null }
  | { state: "valid"; data: JsonObject; sig: string | null }
  | { state: "invalid"; record: QuarantineRecord; sig: string | null };

function sigOf(st: { size: number; mtimeMs: number }): string {
  return `${st.size}:${st.mtimeMs}`;
}

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
  /** Signalements déjà faits (fichier + version + copie), pour ne pas répéter le même avertissement. */
  private readonly notified = new Set<string>();
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
   * Impossible à lire (ou anormalement gros) -> null, ou SettingsUnreadable si strict.
   */
  async read(file: string, strict = false): Promise<JsonObject | null> {
    const l = await this.load(file, strict);
    return l.state === "valid" ? l.data : null;
  }

  private markUnreadable(file: string, strict: boolean, cause: unknown): Loaded {
    this.unreadable.add(file);
    if (strict) throw new SettingsUnreadable(file, cause);
    return { state: "absent", sig: null };
  }

  private async load(file: string, strict: boolean): Promise<Loaded> {
    let sig: string | null;
    try {
      const st = await this.fs.stat(file);
      if (st.size > this.maxBytes) return this.markUnreadable(file, strict, new Error("fichier trop gros"));
      sig = sigOf(st);
    } catch (e) {
      if (errCode(e) === "ENOENT") {
        this.unreadable.delete(file);
        return { state: "absent", sig: null };
      }
      return this.markUnreadable(file, strict, e);
    }
    let raw: Uint8Array;
    try {
      raw = await this.fs.readFile(file);
    } catch (e) {
      if (errCode(e) === "ENOENT") {
        this.unreadable.delete(file);
        return { state: "absent", sig: null };
      }
      return this.markUnreadable(file, strict, e);
    }
    if (raw.byteLength > this.maxBytes) return this.markUnreadable(file, strict, new Error("fichier trop gros"));
    this.unreadable.delete(file);
    const data = parseJsonObject(raw);
    if (data !== null) return { state: "valid", data, sig };

    // Invalide : copie de côté, vérifiée à chaque fois (une copie identique existante est réutilisée ; une
    // copie ratée est retentée). L'avertissement n'est fait qu'une fois par version du fichier.
    const record: QuarantineRecord = { file, copy: await this.quarantine(file, raw) };
    const notifiedKey = `${file}|${sig}|${record.copy ?? ""}`;
    if (!this.notified.has(notifiedKey)) {
      this.notified.add(notifiedKey);
      this.invalid.push(record);
    }
    return { state: "invalid", record, sig };
  }

  /**
   * Met de côté une copie « <nom>.invalide-<date> » d'un fichier invalide : les octets `raw` lus (ou, à
   * défaut, le fichier). Si une copie identique existe déjà (démarrage précédent, version Python), elle est
   * réutilisée. Renvoie le chemin de la copie, ou null.
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
          await this.fs.writeNew(dest, content);
        } catch (e) {
          if (errCode(e) === "EEXIST") continue;
          try {
            await this.fs.unlink(dest); // copie partielle éventuelle
          } catch {
            // rien à supprimer
          }
          return null;
        }
        // Vérification : la copie doit contenir exactement ces octets
        try {
          if (sameBytes(await this.fs.readFile(dest), content)) return dest;
        } catch {
          // illisible : considérée comme ratée
        }
        return null;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Écrit un fichier sans jamais laisser de version à moitié écrite (temporaire + remplacement atomique).
   * `beforeReplace` est appelé juste avant le remplacement : s'il renvoie false, rien n'est remplacé.
   */
  async writeAtomic(file: string, text: string, beforeReplace?: () => Promise<boolean>): Promise<boolean> {
    await this.fs.mkdir(path.dirname(file));
    const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${++this.tmpCounter}.tmp`);
    try {
      await this.fs.writeFileSynced(tmp, text);
      if (beforeReplace && !(await beforeReplace())) return false;
      for (let attempt = 1; ; attempt++) {
        try {
          await this.fs.rename(tmp, file);
          return true;
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

  private async currentSig(file: string): Promise<string | null | undefined> {
    try {
      return sigOf(await this.fs.stat(file));
    } catch (e) {
      return errCode(e) === "ENOENT" ? null : undefined;
    }
  }

  /**
   * Modifie un fichier de réglages : relit le fichier, applique `change` sur une copie, puis l'écrit.
   * - Fichier illisible (droits, verrou, trop gros) : SettingsUnreadable, RIEN n'est écrit.
   * - Fichier invalide : remplacé seulement si sa copie de côté existe (sinon SettingsNotBackedUp) ;
   *   le résultat l'indique (`reset`) pour que l'utilisateur en soit informé.
   * - Fichier modifié par un autre programme pendant l'opération : on recommence (3 fois, puis SettingsBusy).
   * Les écritures d'un même fichier sont faites l'une après l'autre.
   */
  update(file: string, change: (data: JsonObject) => JsonObject): Promise<UpdateResult> {
    const previous = this.queues.get(file) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async (): Promise<UpdateResult> => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const l = await this.load(file, true);
          if (l.state === "invalid" && l.record.copy === null) throw new SettingsNotBackedUp(file);
          const current = l.state === "valid" ? l.data : {};
          const result = change({ ...current });
          const unchanged = async () => (await this.currentSig(file)) === l.sig;
          if (await this.writeAtomic(file, JSON.stringify(result), unchanged)) {
            return { data: result, reset: l.state === "invalid" ? l.record : null };
          }
        }
        throw new SettingsBusy(file);
      });
    this.queues.set(file, next);
    void next.finally(() => {
      if (this.queues.get(file) === next) this.queues.delete(file);
    }).catch(() => undefined);
    return next;
  }
}
