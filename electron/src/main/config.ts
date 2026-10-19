// Lecture SEULE de launcher_config.json au lot E0.
// Règle de sécurité des données (§7 du prompt maître, constat S5) : ce module n'écrit jamais rien.
// Un fichier absent, illisible ou invalide donne simplement « pas de thème » ; la mise de côté des
// fichiers invalides (quarantine) sera portée au lot E1, avec l'écriture.
import { readFile } from "node:fs/promises";
import type { ThemeKey } from "../shared/api";

export const THEME_KEYS: readonly ThemeKey[] = ["phenix", "relink", "aurore", "glace"];

export function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === "string" && (THEME_KEYS as readonly string[]).includes(value);
}

/** Décode comme Python « utf-8-sig » : BOM accepté, octets invalides refusés. */
export function decodeUtf8Sig(raw: Uint8Array): string | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(raw);
    return text;
  } catch {
    return null;
  }
}

/** Analyse le contenu de launcher_config.json et renvoie le thème s'il est valide et connu. */
export function themeFromConfigBytes(raw: Uint8Array): ThemeKey | null {
  const text = decodeUtf8Sig(raw);
  if (text === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const theme = (data as Record<string, unknown>)["theme"];
  return isThemeKey(theme) ? theme : null;
}

/** Lit le thème enregistré par WeCraft ; ne lève jamais d'erreur. */
export async function readSavedTheme(file: string): Promise<ThemeKey | null> {
  try {
    const raw = await readFile(file);
    if (raw.byteLength > 1024 * 1024) return null; // réglages anormalement gros : ignorés
    return themeFromConfigBytes(raw);
  } catch {
    return null;
  }
}
