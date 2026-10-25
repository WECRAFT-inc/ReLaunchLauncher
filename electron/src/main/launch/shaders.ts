// Shaders préférés (Réglages > Jeu) : au lancement, ReLaunch choisit le shader pack à activer parmi ceux qui
// sont RÉELLEMENT présents dans l'instance (dossier shaderpacks), avec cette règle :
//   1. le shader préféré, s'il est présent et qu'un mod de shaders (Iris, Oculus ou OptiFine) est installé ;
//   2. sinon le shader secondaire, aux mêmes conditions ;
//   3. sinon rien n'est changé : le choix déjà enregistré dans l'instance (celui de l'événement ou du joueur)
//      est conservé ; sans aucun shader, le jeu se lance normalement.
// Rien n'est téléchargé ici et aucun fichier n'est supprimé : seule la ligne « shaderPack » (et l'activation)
// du fichier de réglages du mod de shaders change ; toutes les autres lignes sont gardées telles quelles.
// Pour un modpack d'événement, le choix officiel est le fichier fourni par l'événement : la préférence n'est
// appliquée que si le shader préféré fait partie des shaders proposés par cet événement (ceux de shaderpacks).
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ShaderPrefs {
  on: boolean;
  primary: string | null;
  secondary: string | null;
}

export type ShaderMod = "iris" | "optifine" | null;

/** Nom comparable : sans extension .zip, minuscules, sans espaces ni séparateurs (« BSL_v8.2.09 » ~ « bsl v8.2.09 »). */
export function shaderKey(name: string): string {
  return name
    .replace(/\.zip$/i, "")
    .toLowerCase()
    .replace(/[\s_.+-]+/g, "");
}

/** Le pack `file` correspond-il à la préférence `pref` (même nom, ou nom de base sans numéro de version) ? */
export function matches(file: string, pref: string): boolean {
  const f = shaderKey(file);
  const p = shaderKey(pref);
  if (!p) return false;
  if (f === p) return true;
  // « Complementary » ~ « ComplementaryReimagined_r5.2.2 » : le nom choisi est le début du nom du fichier
  return p.length >= 3 && f.startsWith(p) && /^(v?\d|r\d)/.test(f.slice(p.length));
}

export interface ShaderChoice {
  /** Pack à activer, ou null : rien ne change. */
  pack: string | null;
  /** Explication montrée à l'utilisateur quand un remplacement a eu lieu (ou pourquoi rien n'a changé). */
  note: string | null;
}

/** Règle de choix (pure, testée). */
export function chooseShader(available: string[], mod: ShaderMod, prefs: ShaderPrefs): ShaderChoice {
  if (!prefs.on || (!prefs.primary && !prefs.secondary)) return { pack: null, note: null };
  if (!mod) return { pack: null, note: available.length ? "Shaders préférés : aucun mod de shaders (Iris, Oculus ou OptiFine) dans cette instance, réglage laissé tel quel." : null };
  const find = (p: string | null) => (p ? (available.find((f) => matches(f, p)) ?? null) : null);
  const a = find(prefs.primary);
  if (a) return { pack: a, note: `Shader activé : ${a} (préféré).` };
  const b = find(prefs.secondary);
  if (b) return { pack: b, note: prefs.primary ? `Shader préféré « ${prefs.primary} » absent de cette instance : ${b} (secondaire) activé.` : `Shader activé : ${b} (secondaire).` };
  return { pack: null, note: available.length ? "Shaders préférés absents de cette instance : le shader déjà choisi est conservé." : "Aucun shader dans cette instance : le jeu se lance sans shader." };
}

/** Mod de shaders installé (noms des .jar du dossier mods ; .disabled ignorés). */
export function shaderModOf(modFiles: string[]): ShaderMod {
  const jars = modFiles.filter((n) => /\.jar$/i.test(n)).map((n) => n.toLowerCase());
  if (jars.some((n) => /^(iris|oculus)[-_ ]/.test(n) || n.startsWith("iris") || n.startsWith("oculus"))) return "iris";
  if (jars.some((n) => n.startsWith("optifine"))) return "optifine";
  return null;
}

/** Remplace (ou ajoute) des clés « clé=valeur » d'un fichier de réglages en gardant tout le reste. */
export function setProperties(text: string, values: Record<string, string>, sep = "="): string {
  const lines = text.split(/\r?\n/);
  const done = new Set<string>();
  const out = lines.map((l) => {
    const m = new RegExp(`^\\s*([A-Za-z0-9_.]+)\\s*${sep === "=" ? "=" : ":"}`).exec(l);
    if (m && m[1]! in values) {
      done.add(m[1]!);
      return `${m[1]}${sep}${values[m[1]!]}`;
    }
    return l;
  });
  while (out.length && out[out.length - 1] === "") out.pop();
  for (const [k, v] of Object.entries(values)) if (!done.has(k)) out.push(`${k}${sep}${v}`);
  return out.join("\n") + "\n";
}

async function writeAtomic(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.relaunch.tmp`;
  await writeFile(tmp, text, "utf8");
  await rename(tmp, file);
}

/**
 * Applique les préférences à l'instance `gameDir` au lancement ; renvoie la note à afficher (ou null).
 * Ne lève jamais d'erreur : un échec laisse l'instance telle quelle et le jeu se lance normalement.
 */
export async function applyShaderPrefs(gameDir: string, prefs: ShaderPrefs): Promise<string | null> {
  if (!prefs.on) return null;
  try {
    const list = async (d: string) => readdir(path.join(gameDir, d)).catch(() => [] as string[]);
    const packs = (await list("shaderpacks")).filter((n) => !n.startsWith(".") && !/\.txt$/i.test(n));
    const mod = shaderModOf(await list("mods"));
    const c = chooseShader(packs, mod, prefs);
    if (!c.pack) return c.note;
    if (mod === "iris") {
      const f = path.join(gameDir, "config", "iris.properties");
      const old = await readFile(f, "utf8").catch(() => "");
      await writeAtomic(f, setProperties(old, { shaderPack: c.pack, enableShaders: "true" }));
    } else {
      const f = path.join(gameDir, "optionsshaders.txt");
      const old = await readFile(f, "utf8").catch(() => "");
      await writeAtomic(f, setProperties(old, { shaderPack: c.pack }));
    }
    return c.note;
  } catch (e) {
    return `Shaders préférés non appliqués (${e instanceof Error ? e.message : String(e)}) : le jeu se lance avec le réglage actuel.`;
  }
}

/** Packs présents dans les instances (pour proposer des noms dans les réglages). */
export async function knownShaderPacks(gameDirs: string[]): Promise<string[]> {
  const names = new Set<string>();
  for (const g of gameDirs.slice(0, 200)) {
    for (const n of await readdir(path.join(g, "shaderpacks")).catch(() => [] as string[])) if (/\.zip$/i.test(n) || !n.includes(".")) names.add(n.replace(/\.zip$/i, ""));
  }
  return [...names].sort((a, b) => a.localeCompare(b)).slice(0, 300);
}
