// Règles de sécurité Electron (§4.4 du prompt maître), regroupées dans des fonctions PURES pour être
// testées sans lancer Electron (tests/security.test.ts). main.ts ne fait que les appliquer.
import path from "node:path";
import type { PathLib } from "./paths";
import type { ExternalLinkId } from "../shared/api";

/** L'interface est servie par un protocole privé (pas file://, cf. guide de sécurité Electron). */
export const APP_SCHEME = "app";
export const APP_HOST = "wecraft";
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const APP_ENTRY = `${APP_ORIGIN}/index.html`;

/**
 * Content Security Policy de l'interface : uniquement les fichiers de l'application.
 * Pas d'eval, pas de script en ligne, pas de connexion réseau depuis l'interface
 * (tout passe par le processus principal), pas de cadre, pas d'objet.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  `script-src ${APP_ORIGIN}`,
  `style-src ${APP_ORIGIN}`,
  `img-src ${APP_ORIGIN} data:`,
  `font-src ${APP_ORIGIN}`,
  "connect-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "child-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

/** Liens externes autorisés, ouverts dans le navigateur de l'utilisateur. */
export const EXTERNAL_LINKS: Readonly<Record<ExternalLinkId, string>> = {
  modrinth: "https://modrinth.com/",
  releases: "https://github.com/Rexidelamort/WeCraft-Releases/releases",
  github: "https://github.com/Rexidelamort",
};

export function isExternalLinkId(value: unknown): value is ExternalLinkId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(EXTERNAL_LINKS, value);
}

/** L'adresse appartient-elle à l'interface de WeCraft ? (sert à vérifier l'expéditeur des messages IPC) */
export function isAppUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === `${APP_SCHEME}:` && u.host === APP_HOST && u.username === "" && u.password === "";
  } catch {
    return false;
  }
}

/**
 * Traduit une adresse app://wecraft/… en fichier À L'INTÉRIEUR de `root`, ou null.
 * Refuse : autre hôte, octet nul, barre oblique inverse, remontée « .. », chemin absolu,
 * et tout ce qui sortirait de `root` après normalisation.
 */
export function resolveAppAsset(root: string, requestUrl: string, p: PathLib = path): string | null {
  let u: URL;
  try {
    u = new URL(requestUrl);
  } catch {
    return null;
  }
  if (u.protocol !== `${APP_SCHEME}:` || u.host !== APP_HOST) return null;
  let rel: string;
  try {
    rel = decodeURIComponent(u.pathname);
  } catch {
    return null;
  }
  if (rel.includes("\0") || rel.includes("\\")) return null;
  rel = rel.replace(/^\/+/, "");
  if (rel === "") rel = "index.html";
  const segments = rel.split("/");
  if (segments.some((s) => s === ".." || s === "." || s === "" || /^[a-zA-Z]:/.test(s))) return null;
  const rootResolved = p.resolve(root);
  const full = p.resolve(rootResolved, ...segments);
  const relCheck = p.relative(rootResolved, full);
  if (relCheck === "" || relCheck.startsWith("..") || p.isAbsolute(relCheck)) return null;
  return full;
}

const MIME: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff2": "font/woff2",
};

/** Type MIME d'un fichier de l'interface ; null = type non servi. */
export function mimeType(file: string): string | null {
  return MIME[path.extname(file).toLowerCase()] ?? null;
}

/**
 * Options de la fenêtre : isolées, sans Node, en bac à sable, sans fonctions expérimentales.
 * Les outils de développement ne sont disponibles que hors de l'exe distribué.
 */
export function secureWebPreferences(preloadPath: string, devTools: boolean) {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    enableBlinkFeatures: "",
    webviewTag: false,
    navigateOnDragDrop: false,
    spellcheck: false,
    devTools,
  } as const;
}
