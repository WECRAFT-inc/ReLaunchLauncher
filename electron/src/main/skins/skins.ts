// Skins du launcher (« La Grande Vague », « Orient Express »…) : fichiers .rlskin créés par l'équipe et
// publiés via le panneau d'administration, puis obtenus dans le launcher SANS nouvelle version.
//
// Un .rlskin est une archive ZIP : skin.json (description DÉCLARATIVE, format documenté dans
// docs/SKINS-RELAUNCH.md) + images et polices. Aucun code : ni script, ni CSS libre, ni HTML. Le launcher
// lit seulement des valeurs contrôlées ici (couleurs, tailles, chemins d'images, images-clés d'animation
// limitées à quelques propriétés), puis l'interface les applique elle-même.
//
// Provenance :
// - ReLink : fichier téléchargé depuis le Worker, empreinte SHA-256 ET signature Ed25519 (clé publique
//   épinglée ci-dessous, octets exacts du fichier) vérifiées AVANT de l'ouvrir ;
// - aperçu local : fichier choisi par l'utilisateur sur son PC (pour créer et tester un skin), mêmes
//   contrôles de contenu, marqué « non signé » ; le SVG y est refusé.
import { createHash, createPublicKey, verify } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { InstalledSkin, SkinManifest } from "../../shared/api";
import { listZip, readEntry, safeRelPath } from "../modpacks/mrpack";

export const SKIN_FORMAT = "relaunch-skin";
export const MAX_PACK = 40 * 1024 * 1024;
export const MAX_FILE = 12 * 1024 * 1024;
export const MAX_FILES = 300;
/**
 * Clé publique Ed25519 (32 octets, base64) correspondant à RELAUNCH_SIGNING_PUBLIC_KEY du Worker.
 * null tant qu'elle n'est pas fournie : aucun skin téléchargé ne peut alors être installé.
 */
export const RELINK_SIGNING_PUBLIC_KEY: string | null = "MgGSWwwFZQsyGY0oVhUUcuKOOnlAjvg6HMZ7r/FUB7c=";

const EXT_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf" };

export class SkinError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkinError";
  }
}

// ---------------------------------------------------------------- validation du skin.json
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "");
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)|hsla?\(\s*\d{1,3}(deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/i;
const color = (v: unknown) => (typeof v === "string" && COLOR.test(v.trim()) ? v.trim() : undefined);
const numIn = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : undefined);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]) => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined);
/** Dégradé simple : « linear-gradient(<angle>deg, couleur [n%], couleur [n%]…) » avec des couleurs permises. */
function gradient(v: unknown): string | undefined {
  if (typeof v !== "string" || v.length > 300) return undefined;
  const m = /^(linear|radial)-gradient\((.*)\)$/i.exec(v.trim());
  if (!m) return color(v);
  const parts = m[2]!.split(/,(?![^()]*\))/).map((p) => p.trim());
  const first = parts[0]!;
  const head = /^\d{1,3}deg$/.test(first) || /^(circle|ellipse)( at (center|top|bottom|left|right)( (center|top|bottom|left|right))?)?$/.test(first) ? [first] : [];
  const stops = parts.slice(head.length);
  if (stops.length < 2 || stops.length > 8) return undefined;
  for (const s of stops) {
    const sm = /^(.+?)(\s+\d{1,3}%)?$/.exec(s);
    if (!sm || !color(sm[1])) return undefined;
  }
  return v.trim();
}
const SIZE = /^(cover|contain|auto|\d{1,4}(px|%)( \d{1,4}(px|%))?)$/;
const POS = /^((left|right|center|top|bottom|\d{1,3}%)( (left|right|center|top|bottom|\d{1,3}%))?)$/;
const BLENDS = ["normal", "screen", "multiply", "overlay", "soft-light", "lighten", "darken", "color-dodge"] as const;
const EASINGS = ["linear", "ease", "ease-in", "ease-out", "ease-in-out"] as const;
/** Valeurs d'images-clés permises : transformations, opacité, quelques filtres, position du fond. */
const TRANSFORM = /^((translate[XY]?|scale[XY]?|rotate|skew[XY]?)\(\s*-?\d{1,4}(\.\d+)?(px|%|deg)?(\s*,\s*-?\d{1,4}(\.\d+)?(px|%|deg)?)?\s*\)\s*){1,6}$/;
const FILTER = /^((hue-rotate|blur|brightness|saturate|contrast)\(\s*-?\d{1,4}(\.\d+)?(px|deg|%)?\s*\)\s*){1,4}$/;

function keyframes(v: unknown): Record<string, string | number>[] | undefined {
  if (!Array.isArray(v) || v.length < 2 || v.length > 12) return undefined;
  const out: Record<string, string | number>[] = [];
  for (const k0 of v) {
    const k = obj(k0);
    const f: Record<string, string | number> = {};
    const off = numIn(k["offset"], 0, 1);
    if (off !== undefined) f["offset"] = off;
    if (typeof k["transform"] === "string" && TRANSFORM.test(k["transform"].trim())) f["transform"] = k["transform"].trim();
    const op = numIn(k["opacity"], 0, 1);
    if (op !== undefined) f["opacity"] = op;
    if (typeof k["filter"] === "string" && FILTER.test(k["filter"].trim())) f["filter"] = k["filter"].trim();
    if (typeof k["backgroundPosition"] === "string" && POS.test(k["backgroundPosition"].trim())) f["backgroundPosition"] = k["backgroundPosition"].trim();
    if (Object.keys(f).filter((x) => x !== "offset").length === 0) return undefined;
    out.push(f);
  }
  return out;
}

const TOKENS = ["acc", "acc2", "accDeep", "spark", "night", "ink", "inkSoft", "inkFaint", "line", "card"] as const;
function tokens(v: unknown): Record<string, string> {
  const o = obj(v);
  const out: Record<string, string> = {};
  for (const k of TOKENS) {
    const c = color(o[k]);
    if (c) out[k] = c;
  }
  return out;
}

/** Vérifie et nettoie skin.json ; `has(chemin)` dit si un fichier existe dans l'archive. */
export function validateManifest(raw: unknown, has: (p: string) => boolean, allowSvg: boolean): SkinManifest {
  const o = obj(raw);
  if (o["format"] !== SKIN_FORMAT || o["version"] !== 1) throw new SkinError("Ce fichier n'est pas un skin ReLaunch (format « relaunch-skin », version 1).");
  const idv = str(o["id"], 60);
  if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(idv)) throw new SkinError("Identifiant du skin invalide (lettres minuscules, chiffres et tirets).");
  const name = str(o["name"], 60);
  if (!name) throw new SkinError("Nom du skin manquant.");
  const file = (p: unknown, kinds: "image" | "font"): string | undefined => {
    if (typeof p !== "string") return undefined;
    const rel = safeRelPath(p);
    if (!rel) throw new SkinError(`Chemin refusé : ${String(p).slice(0, 80)}`);
    const ext = path.extname(rel).toLowerCase();
    const okExt = kinds === "image" ? [".png", ".jpg", ".jpeg", ".webp", ".gif", ...(allowSvg ? [".svg"] : [])] : [".woff2", ".woff", ".ttf", ".otf"];
    if (!okExt.includes(ext)) throw new SkinError(`Type de fichier refusé pour « ${rel} »${ext === ".svg" ? " (SVG : seulement dans un skin signé)" : ""}.`);
    if (!has(rel)) throw new SkinError(`Fichier absent de l'archive : ${rel}`);
    return rel;
  };
  const anims: SkinManifest["animations"] = {};
  for (const [k, a0] of Object.entries(obj(o["animations"])).slice(0, 20)) {
    if (!/^[a-z0-9-]{1,30}$/.test(k)) continue;
    const a = obj(a0);
    const kf = keyframes(a["keyframes"]);
    const dur = numIn(a["durationMs"], 100, 600000);
    if (!kf || !dur) throw new SkinError(`Animation « ${k} » invalide (images-clés ou durée).`);
    const it = a["iterations"] === "infinite" ? "infinite" : numIn(a["iterations"], 1, 1000) ?? 1;
    anims[k] = { keyframes: kf, durationMs: dur, iterations: it, direction: oneOf(a["direction"], ["normal", "reverse", "alternate", "alternate-reverse"] as const) ?? "normal", easing: oneOf(a["easing"], EASINGS) ?? "ease-in-out", delayMs: numIn(a["delayMs"], 0, 60000) ?? 0 };
  }
  const anim = (v: unknown) => (typeof v === "string" && anims[v] ? v : undefined);
  const bg = obj(o["background"]);
  const layers = (Array.isArray(bg["layers"]) ? bg["layers"] : []).slice(0, 8).map((l0) => {
    const l = obj(l0);
    const image = file(l["image"], "image");
    if (!image) throw new SkinError("Calque de fond sans image.");
    return {
      image,
      size: typeof l["size"] === "string" && SIZE.test(l["size"]) ? l["size"] : "cover",
      position: typeof l["position"] === "string" && POS.test(l["position"]) ? l["position"] : "center",
      repeat: l["repeat"] === true,
      opacity: numIn(l["opacity"], 0, 1) ?? 1,
      blend: oneOf(l["blend"], BLENDS) ?? "normal",
      animation: anim(l["animation"]),
    };
  });
  const bars = obj(o["bars"]);
  const frames = obj(o["frames"]);
  const play = obj(o["playButton"]);
  const fonts = obj(o["fonts"]);
  const font = (v: unknown) => {
    const f = obj(v);
    const fileRel = file(f["file"], "font");
    const family = str(f["family"], 40);
    return fileRel && /^[A-Za-z0-9 _-]{1,40}$/.test(family) ? { file: fileRel, family } : undefined;
  };
  const tr = obj(o["transition"]);
  const ls = obj(o["launchScreen"]);
  const variant = (v: unknown) => {
    const x = obj(v);
    return { tokens: tokens(x["tokens"]), barBackground: gradient(obj(x["bars"])["background"]), cardBackground: gradient(x["cardBackground"]) };
  };
  const vs = obj(o["variants"]);
  const m: SkinManifest = {
    id: idv,
    name,
    author: str(o["author"], 60),
    skinVersion: str(o["skinVersion"], 20),
    description: str(o["description"], 400),
    followsTheme: o["followsTheme"] === true,
    tokens: tokens(o["tokens"]),
    fonts: { display: font(fonts["display"]), body: font(fonts["body"]) },
    background: { color: color(bg["color"]), gradient: gradient(bg["gradient"]), layers, overlay: oneOf(bg["overlay"], ["none", "vignette", "grain"] as const) ?? "none" },
    bars: { pattern: file(bars["pattern"], "image"), patternOpacity: numIn(bars["patternOpacity"], 0, 1) ?? 0.25, background: gradient(bars["background"]), border: color(bars["border"]), radius: numIn(bars["radius"], 0, 40) },
    frames: { radius: numIn(frames["radius"], 0, 40), border: color(frames["border"]), glow: color(frames["glow"]), background: gradient(frames["background"]) },
    playButton: { image: file(play["image"], "image"), background: gradient(play["background"]), text: color(play["text"]), radius: numIn(play["radius"], 0, 999), animation: anim(play["animation"]) },
    transition: { type: oneOf(tr["type"], ["none", "fade", "slide", "wave", "zoom"] as const) ?? "fade", durationMs: numIn(tr["durationMs"], 0, 3000) ?? 300 },
    launchScreen: { image: file(ls["image"], "image"), text: str(ls["text"], 120), animation: anim(ls["animation"]) },
    animations: anims,
    variants: { liquidGlass: vs["liquidGlass"] ? variant(vs["liquidGlass"]) : undefined, mat: vs["mat"] ? variant(vs["mat"]) : undefined },
  };
  return m;
}

// ---------------------------------------------------------------- signature (octets exacts du fichier)
const SPKI = Buffer.from("302a300506032b6570032100", "hex");
export function verifyDetached(data: Buffer, sig: Buffer, publicKeyB64: string): boolean {
  const raw = Buffer.from(publicKeyB64, "base64");
  if (raw.length !== 32) return false;
  let s = sig;
  const txt = sig.toString("ascii").trim();
  if (sig.length !== 64 && /^[A-Za-z0-9+/=]+$/.test(txt)) s = Buffer.from(txt, "base64"); // signature brute (64 octets) ou en base64
  if (s.length !== 64) return false;
  try {
    return verify(null, data, createPublicKey({ key: Buffer.concat([SPKI, raw]), format: "der", type: "spki" }), s);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- magasin local
export interface SkinStoreDeps {
  dataDir: string;
  /** Téléchargement en mémoire (Worker seulement), limité en taille. */
  fetchBytes?: (url: string, max: number) => Promise<Buffer>;
  assetUrl?: (assetId: string, signature: boolean) => string;
  publicKey?: string | null;
}

const KEY = /^(rl|local)-[a-z0-9-]{1,80}$/;

export class SkinStore {
  constructor(private readonly d: SkinStoreDeps) {}
  private get root() {
    return path.join(this.d.dataDir, "skins");
  }

  /** Skins installés (manifeste revérifié à chaque lecture). */
  async list(): Promise<InstalledSkin[]> {
    const out: InstalledSkin[] = [];
    let names: string[] = [];
    try {
      names = (await readdir(this.root)).filter((n) => KEY.test(n));
    } catch {
      return [];
    }
    for (const key of names) {
      try {
        const dir = path.join(this.root, key);
        const info = obj(JSON.parse(await readFile(path.join(dir, "install.json"), "utf8")));
        const files = new Set<string>((Array.isArray(info["files"]) ? info["files"] : []).filter((x): x is string => typeof x === "string"));
        const signed = info["signed"] === true;
        const manifest = validateManifest(JSON.parse(await readFile(path.join(dir, "files", "skin.json"), "utf8")), (p) => files.has(p), signed);
        out.push({ key, signed, source: key.startsWith("rl-") ? "relink" : "local", relinkId: typeof info["relinkId"] === "string" ? info["relinkId"] : null, sha256: String(info["sha256"] ?? ""), base: `app://wecraft/skin/${key}/`, manifest });
      } catch {
        // skin abîmé : ignoré (jamais appliqué)
      }
    }
    return out;
  }

  /** Ouvre une archive .rlskin (déjà vérifiée si elle vient de ReLink) et l'installe sous `key`. */
  async installArchive(file: string, key: string, signed: boolean, extra: Obj = {}): Promise<InstalledSkin> {
    if (!KEY.test(key)) throw new SkinError("Nom de skin refusé.");
    const st = await stat(file);
    if (st.size > MAX_PACK) throw new SkinError("Fichier skin trop lourd (40 Mo au plus).");
    const { entries } = await listZip(file);
    if (entries.length > MAX_FILES) throw new SkinError("Trop de fichiers dans le skin.");
    const files = new Map<string, (typeof entries)[number]>();
    let total = 0;
    for (const e of entries) {
      if (e.name.endsWith("/")) continue;
      const rel = safeRelPath(e.name);
      if (!rel) throw new SkinError(`Chemin refusé dans l'archive : ${e.name.slice(0, 80)}`);
      if (rel !== "skin.json" && !EXT_TYPES[path.extname(rel).toLowerCase()]) throw new SkinError(`Type de fichier refusé : ${rel}`);
      if (!signed && path.extname(rel).toLowerCase() === ".svg") throw new SkinError("SVG refusé dans un aperçu local (accepté seulement dans un skin signé).");
      if (e.usize > MAX_FILE) throw new SkinError(`Fichier trop lourd : ${rel}`);
      total += e.usize;
      if (total > MAX_PACK * 2) throw new SkinError("Contenu du skin trop lourd.");
      files.set(rel, e);
    }
    const mf = files.get("skin.json");
    if (!mf) throw new SkinError("skin.json absent de l'archive.");
    let raw: unknown;
    try {
      raw = JSON.parse((await readEntry(file, mf, 512 * 1024)).toString("utf8"));
    } catch {
      throw new SkinError("skin.json illisible.");
    }
    const manifest = validateManifest(raw, (p) => files.has(p), signed);
    const dir = path.join(this.root, key);
    const tmp = `${dir}.tmp`;
    await rm(tmp, { recursive: true, force: true });
    await mkdir(path.join(tmp, "files"), { recursive: true });
    for (const [rel, e] of files) {
      const dest = path.join(tmp, "files", ...rel.split("/"));
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, await readEntry(file, e, MAX_FILE));
    }
    const sha256 = createHash("sha256").update(await readFile(file)).digest("hex");
    await writeFile(path.join(tmp, "install.json"), JSON.stringify({ signed, sha256, files: [...files.keys()], installedAt: new Date().toISOString(), ...extra }, null, 2));
    await rm(dir, { recursive: true, force: true });
    await rename(tmp, dir);
    return { key, signed, source: key.startsWith("rl-") ? "relink" : "local", relinkId: typeof extra["relinkId"] === "string" ? extra["relinkId"] : null, sha256, base: `app://wecraft/skin/${key}/`, manifest };
  }

  /** Aperçu local : fichier choisi sur ce PC (non signé). */
  async importLocal(file: string): Promise<InstalledSkin> {
    const head = obj(await this.peek(file));
    const idv = typeof head["id"] === "string" && /^[a-z0-9][a-z0-9-]{1,59}$/.test(head["id"]) ? head["id"] : "skin";
    return this.installArchive(file, `local-${idv}`, false);
  }

  private async peek(file: string): Promise<unknown> {
    const { entries } = await listZip(file);
    const e = entries.find((x) => x.name === "skin.json");
    if (!e) throw new SkinError("skin.json absent de l'archive.");
    try {
      return JSON.parse((await readEntry(file, e, 512 * 1024)).toString("utf8"));
    } catch {
      throw new SkinError("skin.json illisible.");
    }
  }

  /** Skin publié sur ReLink : téléchargé, empreinte + signature vérifiées, puis installé. */
  async installRemote(skin: { id: string; file: { id: string; sha256: string; size: number } | null }): Promise<InstalledSkin> {
    if (!skin.file) throw new SkinError("Ce skin n'a pas encore de fichier publié sur ReLink.");
    const key = this.d.publicKey ?? null;
    if (!key) throw new SkinError("Installation impossible : la clé publique de signature ReLink n'est pas encore intégrée à ce launcher.");
    if (!this.d.fetchBytes || !this.d.assetUrl) throw new SkinError("Service ReLink indisponible.");
    const data = await this.d.fetchBytes(this.d.assetUrl(skin.file.id, false), MAX_PACK);
    const sha = createHash("sha256").update(data).digest("hex");
    if (sha !== skin.file.sha256) throw new SkinError("Fichier skin refusé : empreinte SHA-256 différente de celle annoncée.");
    const sig = await this.d.fetchBytes(this.d.assetUrl(skin.file.id, true), 4096);
    if (!verifyDetached(data, sig, key)) throw new SkinError("Fichier skin refusé : signature invalide.");
    const dir = path.join(this.d.dataDir, "cache", "skins");
    await mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `${sha}.rlskin`);
    await writeFile(tmp, data);
    try {
      const safeId = skin.id.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 80);
      return await this.installArchive(tmp, `rl-${safeId}`, true, { relinkId: skin.id });
    } finally {
      await rm(tmp, { force: true });
    }
  }

  async remove(key: unknown): Promise<boolean> {
    if (typeof key !== "string" || !KEY.test(key)) return false;
    await rm(path.join(this.root, key), { recursive: true, force: true });
    return true;
  }

  /** app://wecraft/skin/<clé>/<chemin> : seulement un fichier installé, au type connu. */
  async serve(pathname: string): Promise<{ data: Buffer; type: string } | null | false> {
    if (!pathname.startsWith("/skin/")) return null;
    const m = /^\/skin\/([a-z0-9-]+)\/(.+)$/.exec(pathname);
    if (!m || !KEY.test(m[1]!)) return false;
    const rel = safeRelPath(m[2]);
    const type = rel ? EXT_TYPES[path.extname(rel).toLowerCase()] : undefined;
    if (!rel || !type) return false;
    try {
      const info = obj(JSON.parse(await readFile(path.join(this.root, m[1]!, "install.json"), "utf8")));
      if (!Array.isArray(info["files"]) || !info["files"].includes(rel)) return false;
      if (type === "image/svg+xml" && info["signed"] !== true) return false;
      return { data: await readFile(path.join(this.root, m[1]!, "files", ...rel.split("/"))), type };
    } catch {
      return false;
    }
  }
}
