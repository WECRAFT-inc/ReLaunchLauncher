// Images de l'interface (grosse mise à jour) : icônes et fonds d'instances, captures d'écran, images Modrinth.
//
// L'interface n'a NI accès au disque NI accès au réseau (CSP : img-src app://wecraft data:). Toutes les images
// lui sont servies par le protocole app://wecraft, sous des noms OPAQUES fabriqués ici :
//   user/icons/<sha256>.png           icône d'instance (256 px, recadrée)
//   user/icons/src/<sha256>.<ext>     image importée, avant recadrage
//   user/backgrounds/<sha256>.jpg     fond d'instance (copié dans .wecraft : le chemin reste valable)
//   shot/<jeton>                       capture d'écran d'une instance (jeton en mémoire -> fichier vérifié)
//   remote/<sha256>                    image Modrinth, téléchargée par le processus principal puis gardée en cache
// Une adresse fournie par l'interface n'est JAMAIS téléchargée : seules les adresses vues dans les réponses de
// l'API Modrinth (et d'hôtes autorisés) sont enregistrées, sous la clé sha256(adresse).
// Chaque fichier est contrôlé par ses premiers octets (PNG, JPEG, GIF, WebP) : jamais de SVG, jamais de HTML.
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { checkUrl, fetchBytes, type NetOptions } from "../net/download";

export type ImageKind = "png" | "jpeg" | "gif" | "webp";
export const MIME_OF: Record<ImageKind, string> = { png: "image/png", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
const EXT_OF: Record<ImageKind, string> = { png: "png", jpeg: "jpg", gif: "gif", webp: "webp" };

/** Hôtes dont les images peuvent être affichées (icônes, galeries et images des descriptions Modrinth). */
export const IMAGE_HOSTS: ReadonlySet<string> = new Set(["cdn.modrinth.com", "cdn-raw.modrinth.com"]);
export const MAX_REMOTE_IMAGE = 8 * 1024 * 1024;
export const MAX_IMPORT = 15 * 1024 * 1024;

/** Type réel d'une image, d'après ses premiers octets ; null pour tout le reste (SVG, HTML, exécutable…). */
export function sniffImage(b: Uint8Array): ImageKind | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return "gif";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}

const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Opérations sur les pixels (Electron nativeImage dans l'application, simulées dans les tests).
 * nativeImage ne lit que PNG et JPEG : `size` renvoie null pour le reste, et l'import est alors refusé.
 */
export interface ImageOps {
  size(buf: Buffer): { width: number; height: number } | null;
  /** Découpe `rect` (pixels de l'image) puis redimensionne en `out`×`out` ; PNG. */
  cropSquare(buf: Buffer, rect: { x: number; y: number; size: number }, out: number): Buffer;
  /** Réduit à `maxWidth` de large au plus ; JPEG. */
  shrinkJpeg(buf: Buffer, maxWidth: number): Buffer;
}

export interface Crop {
  /** Zoom de 1 (image entière, carré inscrit) à 4. */
  zoom: number;
  /** Centre du cadrage, de 0 à 1 dans chaque direction. */
  cx: number;
  cy: number;
}

/** Rectangle carré à découper (pixels entiers, toujours dans l'image). */
export function cropRect(w: number, h: number, c: Crop): { x: number; y: number; size: number } {
  const zoom = Math.min(4, Math.max(1, Number.isFinite(c.zoom) ? c.zoom : 1));
  const size = Math.max(1, Math.floor(Math.min(w, h) / zoom));
  const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.5));
  const x = Math.round(Math.min(w - size, Math.max(0, clamp01(c.cx) * w - size / 2)));
  const y = Math.round(Math.min(h - size, Math.max(0, clamp01(c.cy) * h - size / 2)));
  return { x, y, size };
}

/** Écriture atomique (fichier temporaire du même dossier puis renommage). */
async function writeAtomicBin(file: string, data: Buffer): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, data);
  try {
    await rename(tmp, file);
  } catch (e) {
    await unlink(tmp).catch(() => undefined);
    throw e;
  }
}

export class MediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaError";
  }
}

export interface MediaDeps {
  dataDir: string;
  ops: ImageOps;
  net?: NetOptions;
  /** Dossier du cache des images distantes (par défaut <dataDir>/cache/images). */
  cacheDir?: string;
}

export class MediaStore {
  private readonly remote = new Map<string, string>();
  private readonly shots = new Map<string, string>();
  private readonly inflight = new Map<string, Promise<{ data: Buffer; kind: ImageKind } | null>>();

  constructor(private readonly d: MediaDeps) {}

  get iconsDir(): string {
    return path.join(this.d.dataDir, "icons");
  }
  get backgroundsDir(): string {
    return path.join(this.d.dataDir, "backgrounds");
  }
  private get cacheDir(): string {
    return this.d.cacheDir ?? path.join(this.d.dataDir, "cache", "images");
  }

  // ------------------------------------------------------------ images distantes (Modrinth)
  /**
   * Enregistre une adresse VUE dans une réponse de l'API ; renvoie l'adresse app:// à afficher, ou null si
   * l'adresse n'est pas une image d'un hôte autorisé (l'interface affiche alors une image de remplacement).
   */
  remoteUrl(url: unknown): string | null {
    if (typeof url !== "string" || url.length > 2048) return null;
    try {
      checkUrl(url, IMAGE_HOSTS);
    } catch {
      return null;
    }
    if (/\.svgz?(\?|#|$)/i.test(url)) return null; // jamais de SVG
    const key = sha(url);
    if (this.remote.size > 20_000) this.remote.clear(); // garde-fou mémoire
    this.remote.set(key, url);
    return `app://wecraft/remote/${key}`;
  }

  private async remoteImage(key: string): Promise<{ data: Buffer; kind: ImageKind } | null> {
    if (!HEX64.test(key)) return null;
    const cached = path.join(this.cacheDir, key);
    try {
      const data = await readFile(cached);
      const kind = sniffImage(data);
      if (kind) return { data, kind };
    } catch {
      // pas encore en cache
    }
    const url = this.remote.get(key);
    if (!url) return null; // adresse jamais vue dans une réponse de l'API : rien n'est téléchargé
    let p = this.inflight.get(key);
    if (!p) {
      p = (async () => {
        try {
          const data = await fetchBytes(url, MAX_REMOTE_IMAGE, {}, { ...(this.d.net ?? {}), allowedHosts: IMAGE_HOSTS });
          const kind = sniffImage(data);
          if (!kind) return null;
          await writeAtomicBin(cached, data).catch(() => undefined); // cache facultatif
          return { data, kind };
        } catch {
          return null; // réseau coupé, 404… : l'interface affiche l'image de remplacement
        } finally {
          this.inflight.delete(key);
        }
      })();
      this.inflight.set(key, p);
    }
    return p;
  }

  // ------------------------------------------------------------ captures d'écran d'une instance
  /** Captures (png/jpg) du dossier « screenshots » d'une instance, les plus récentes d'abord (60 au plus). */
  async screenshots(gameDir: string, list: (dir: string) => Promise<string[]>): Promise<{ token: string; name: string; url: string }[]> {
    const dir = path.join(gameDir, "screenshots");
    let names: string[];
    try {
      names = (await list(dir)).filter((n) => /^[^/\\]{1,200}\.(png|jpe?g)$/i.test(n));
    } catch {
      return [];
    }
    const withTime = await Promise.all(
      names.map(async (n) => {
        try {
          const s = await stat(path.join(dir, n));
          return s.isFile() ? { n, t: s.mtimeMs } : null;
        } catch {
          return null;
        }
      }),
    );
    return withTime
      .filter((x): x is { n: string; t: number } => !!x)
      .sort((a, b) => b.t - a.t)
      .slice(0, 60)
      .map(({ n }) => {
        const file = path.join(dir, n);
        const token = sha(`${file}\0${randomBytes(8).toString("hex")}`).slice(0, 32);
        this.shots.set(token, file);
        return { token, name: n, url: `app://wecraft/shot/${token}` };
      });
  }

  /** Fichier d'une capture déjà listée (jeton), sinon null. */
  shotFile(token: unknown): string | null {
    return typeof token === "string" && /^[0-9a-f]{32}$/.test(token) ? (this.shots.get(token) ?? null) : null;
  }

  // ------------------------------------------------------------ icônes et fonds importés
  /** Image importée (fichier choisi par l'utilisateur dans la fenêtre du système) gardée avant recadrage. */
  async importIconSource(buf: Buffer): Promise<{ key: string; ext: string; width: number; height: number; url: string }> {
    if (buf.length > MAX_IMPORT) throw new MediaError("Image trop lourde (15 Mo au plus).");
    const kind = sniffImage(buf);
    const dims = kind ? this.d.ops.size(buf) : null;
    if (!kind || !dims || dims.width < 16 || dims.height < 16) throw new MediaError("Ce fichier n'est pas une image PNG ou JPEG valide (16 px au moins).");
    const key = sha(buf);
    const ext = EXT_OF[kind];
    await writeAtomicBin(path.join(this.iconsDir, "src", `${key}.${ext}`), buf);
    return { key, ext, width: dims.width, height: dims.height, url: `app://wecraft/user/icons/src/${key}.${ext}` };
  }

  /** Recadre une image importée en icône carrée de 256 px ; renvoie le nom à noter dans instances_meta.json. */
  async makeIcon(srcKey: unknown, srcExt: unknown, crop: Crop): Promise<string> {
    if (typeof srcKey !== "string" || !HEX64.test(srcKey) || typeof srcExt !== "string" || !Object.values(EXT_OF).includes(srcExt)) throw new MediaError("Image introuvable.");
    const src = await readFile(path.join(this.iconsDir, "src", `${srcKey}.${srcExt}`));
    const dims = this.d.ops.size(src);
    if (!dims) throw new MediaError("Image illisible.");
    const png = this.d.ops.cropSquare(src, cropRect(dims.width, dims.height, crop), 256);
    if (sniffImage(png) !== "png") throw new MediaError("Recadrage impossible.");
    const name = `${sha(png)}.png`;
    await writeAtomicBin(path.join(this.iconsDir, name), png);
    return name;
  }

  /** Fond d'instance : copié et réduit (1920 px de large au plus) dans .wecraft\backgrounds. */
  async importBackground(buf: Buffer): Promise<string> {
    if (buf.length > MAX_IMPORT) throw new MediaError("Image trop lourde (15 Mo au plus).");
    const kind = sniffImage(buf);
    if (!kind || !this.d.ops.size(buf)) throw new MediaError("Ce fichier n'est pas une image PNG ou JPEG valide.");
    const jpg = this.d.ops.shrinkJpeg(buf, 1920);
    if (sniffImage(jpg) !== "jpeg") throw new MediaError("Conversion de l'image impossible.");
    const name = `${sha(jpg)}.jpg`;
    await writeAtomicBin(path.join(this.backgroundsDir, name), jpg);
    return name;
  }

  /** Une capture listée devient le fond de l'instance (copie, la capture d'origine n'est pas touchée). */
  async backgroundFromShot(token: unknown): Promise<string> {
    const f = this.shotFile(token);
    if (!f) throw new MediaError("Capture introuvable.");
    return this.importBackground(await readFile(f));
  }

  static isIconName(v: unknown): v is string {
    return typeof v === "string" && /^[0-9a-f]{64}\.png$/.test(v);
  }
  static isBackgroundName(v: unknown): v is string {
    return typeof v === "string" && /^[0-9a-f]{64}\.jpg$/.test(v);
  }

  // ------------------------------------------------------------ service par le protocole app://
  /**
   * Réponse à une adresse app://wecraft/<chemin> concernant les images ; null si le chemin n'en est pas une
   * (le reste de l'interface est servi normalement). Aucun chemin n'est construit à partir d'autre chose que
   * des noms vérifiés (empreintes hexadécimales, jetons connus).
   */
  async serve(pathname: string): Promise<{ status: number; data?: Buffer; type?: string } | null> {
    const p = pathname.replace(/^\/+/, "");
    let m: RegExpExecArray | null;
    let file: string | null = null;
    if ((m = /^remote\/([0-9a-f]{64})$/.exec(p))) {
      const img = await this.remoteImage(m[1]!);
      return img ? { status: 200, data: img.data, type: MIME_OF[img.kind] } : { status: 404 };
    }
    if ((m = /^shot\/([0-9a-f]{32})$/.exec(p))) file = this.shotFile(m[1]);
    else if ((m = /^user\/icons\/([0-9a-f]{64}\.png)$/.exec(p))) file = path.join(this.iconsDir, m[1]!);
    else if ((m = /^user\/icons\/src\/([0-9a-f]{64}\.(?:png|jpg|gif|webp))$/.exec(p))) file = path.join(this.iconsDir, "src", m[1]!);
    else if ((m = /^user\/backgrounds\/([0-9a-f]{64}\.jpg)$/.exec(p))) file = path.join(this.backgroundsDir, m[1]!);
    else if (p.startsWith("remote/") || p.startsWith("shot/") || p.startsWith("user/")) return { status: 404 };
    else return null;
    if (!file) return { status: 404 };
    try {
      const data = await readFile(file);
      if (data.length > MAX_IMPORT) return { status: 404 };
      const kind = sniffImage(data);
      return kind ? { status: 200, data, type: MIME_OF[kind] } : { status: 404 };
    } catch {
      return { status: 404 };
    }
  }
}
