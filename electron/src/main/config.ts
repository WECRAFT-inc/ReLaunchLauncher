// Réglages WeCraft (launcher_config.json), partagés avec la version Python.
// Lecture tolérante et écriture sûre via JsonStore (lot E1). Seules les clés que la version Electron
// gère sont modifiées ; toutes les autres (y compris inconnues) sont conservées telles quelles.
import type { SettingResult, ThemeKey } from "../shared/api";
import path from "node:path";
import { JsonStore, SettingsNotBackedUp, SettingsUnreadable } from "./storage/jsonStore";
import type { ShaderPrefs } from "./launch/shaders";

/** Préférences de shaders vérifiées (noms courts, sans chemin). */
export function cleanShaderPrefs(v: unknown): ShaderPrefs {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  const name = (x: unknown) => (typeof x === "string" && x.trim() && !/[\\/:*?"<>|\x00-\x1f]/.test(x) ? x.trim().slice(0, 120) : null);
  return { on: o["on"] === true, primary: name(o["primary"]), secondary: name(o["secondary"]) };
}

export const THEME_KEYS: readonly ThemeKey[] = ["phenix", "relink", "aurore", "glace"];

export function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === "string" && (THEME_KEYS as readonly string[]).includes(value);
}

export class Settings {
  constructor(
    private readonly store: JsonStore,
    readonly file: string,
  ) {}

  /** Thème enregistré (même clé « theme » que la version Python) ; null si absent, invalide ou illisible. */
  async theme(): Promise<ThemeKey | null> {
    const data = await this.store.read(this.file);
    const theme = data?.["theme"];
    return isThemeKey(theme) ? theme : null;
  }

  /** RAM proposée au lancement (clé « ram » de la version Python, 4 Go par défaut comme elle). */
  async ram(): Promise<number> {
    const r = (await this.store.read(this.file))?.["ram"];
    return typeof r === "number" && Number.isInteger(r) && r >= 1 && r <= 16 ? r : 4;
  }

  /** Mémorise la RAM choisie (devient la valeur proposée la prochaine fois). Un échec n'empêche pas de jouer. */
  async setRam(ram: number): Promise<boolean> {
    try {
      await this.store.update(this.file, (data) => ({ ...data, ram }));
      return true;
    } catch {
      return false;
    }
  }

  /** Statut Discord (clés « discord » et « discord_asked_version » de la version Python ; désactivé par défaut). */
  async discord(version: string): Promise<{ enabled: boolean; askNow: boolean; config: Record<string, unknown> | null }> {
    const d = await this.store.read(this.file);
    return { enabled: d?.["discord"] === true, askNow: d?.["discord_asked_version"] !== version, config: d };
  }

  /** Active ou coupe le statut Discord ; `asked` : la question du premier démarrage a reçu sa réponse. */
  async setDiscord(on: boolean, askedVersion?: string): Promise<boolean> {
    try {
      await this.store.update(this.file, (data) => ({ ...data, discord: on, ...(askedVersion ? { discord_asked_version: askedVersion } : {}) }));
      return true;
    } catch {
      return false;
    }
  }

  /** « Participer à la bêta » (clé « relaunch_beta ») : désactivé par défaut, les installations suivent le canal stable. */
  async beta(): Promise<boolean> {
    return (await this.store.read(this.file))?.["relaunch_beta"] === true;
  }

  async setBeta(on: boolean): Promise<boolean> {
    try {
      await this.store.update(this.file, (data) => ({ ...data, relaunch_beta: on === true }));
      return true;
    } catch {
      return false;
    }
  }

  /** Shaders préférés (clé « relaunch_shaders », propre à ReLaunch ; ignorée par la version Python). */
  async shaders(): Promise<ShaderPrefs> {
    const v = (await this.store.read(this.file))?.["relaunch_shaders"];
    return cleanShaderPrefs(v);
  }

  async setShaders(p: unknown): Promise<boolean> {
    const v = cleanShaderPrefs(p);
    try {
      await this.store.update(this.file, (data) => ({ ...data, relaunch_shaders: v }));
      return true;
    } catch {
      return false;
    }
  }

  /** Enregistre le thème. N'écrit jamais dans un fichier qui ne peut pas être lu. */
  async setTheme(theme: unknown): Promise<SettingResult> {
    if (!isThemeKey(theme)) return { ok: false, reason: "invalid" };
    try {
      const { reset } = await this.store.update(this.file, (data) => ({ ...data, theme }));
      // Fichier invalide remplacé : l'utilisateur doit le savoir (ses autres réglages sont dans la copie).
      if (reset) return { ok: true, reset: { name: path.basename(reset.file), copyName: path.basename(reset.copy ?? "") } };
      return { ok: true };
    } catch (e) {
      if (e instanceof SettingsUnreadable) return { ok: false, reason: "unreadable" };
      if (e instanceof SettingsNotBackedUp) return { ok: false, reason: "not-backed-up" };
      return { ok: false, reason: "write-failed" };
    }
  }
}
