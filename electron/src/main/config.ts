// Réglages WeCraft (launcher_config.json), partagés avec la version Python.
// Lecture tolérante et écriture sûre via JsonStore (lot E1). Seules les clés que la version Electron
// gère sont modifiées ; toutes les autres (y compris inconnues) sont conservées telles quelles.
import type { SettingResult, ThemeKey } from "../shared/api";
import path from "node:path";
import { JsonStore, SettingsNotBackedUp, SettingsUnreadable } from "./storage/jsonStore";
import type { ShaderPrefs } from "./launch/shaders";
import { isOfflineName } from "./auth/offline";

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

  /** « Ouvrir le launcher officiel pour jouer » (clé « relaunch_open_official ») : désactivé par défaut. */
  async openOfficial(): Promise<boolean> {
    return (await this.store.read(this.file))?.["relaunch_open_official"] === true;
  }

  async setOpenOfficial(on: boolean): Promise<boolean> {
    try {
      await this.store.update(this.file, (data) => ({ ...data, relaunch_open_official: on === true }));
      return true;
    } catch {
      return false;
    }
  }

  /** « Skin ReLink en jeu » (clé « relaunch_skin_mod ») : activé par défaut. */
  async skinMod(): Promise<boolean> {
    return (await this.store.read(this.file))?.["relaunch_skin_mod"] !== false;
  }

  async setSkinMod(on: boolean): Promise<boolean> {
    try {
      await this.store.update(this.file, (data) => ({ ...data, relaunch_skin_mod: on === true }));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Compte hors-ligne (clés « relaunch_offline_name », « relaunch_offline_active » et « relaunch_offline_changed_at »,
   * propres à ReLaunch ; ignorées par la version Python). `active` : le jeu démarre avec ce pseudo au lieu du compte
   * Microsoft. `changedAt` : date (ms) du dernier choix de pseudo, point de départ du délai de 90 jours.
   */
  async offlineAccount(): Promise<{ name: string | null; active: boolean; changedAt: number | null }> {
    const d = await this.store.read(this.file);
    const raw = d?.["relaunch_offline_name"];
    const name = isOfflineName(raw) ? raw : null;
    const at = d?.["relaunch_offline_changed_at"];
    return { name, active: name !== null && d?.["relaunch_offline_active"] === true, changedAt: name !== null && typeof at === "number" && Number.isFinite(at) ? at : null };
  }

  /** Enregistre le pseudo hors-ligne (le valide) ; `null` supprime le compte hors-ligne et son délai. */
  async setOfflineAccount(name: string | null, active = true, changedAt: number | null = null): Promise<boolean> {
    if (name !== null && !isOfflineName(name)) return false;
    try {
      await this.store.update(this.file, (data) => {
        const { relaunch_offline_name: _n, relaunch_offline_active: _a, relaunch_offline_changed_at: _c, ...rest } = data as Record<string, unknown>;
        return name === null ? rest : { ...rest, relaunch_offline_name: name, relaunch_offline_active: active === true, ...(changedAt !== null ? { relaunch_offline_changed_at: changedAt } : {}) };
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Active ou coupe l'usage du compte hors-ligne sans l'oublier (le délai de 90 jours n'est pas touché). */
  async setOfflineActive(on: boolean): Promise<boolean> {
    const cur = await this.offlineAccount();
    if (!cur.name) return false;
    return this.setOfflineAccount(cur.name, on === true, cur.changedAt);
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
