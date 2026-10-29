// Compte hors-ligne (« offline ») : un simple pseudo, sans Microsoft ni jeton.
// Porté du launcher Cubic (crates/zellkern/src/identity.rs et AccountSetup.svelte) :
//  - identité Minecraft hors-ligne = UUID v3 de « OfflinePlayer:<pseudo> » (équivalent de
//    UUID.nameUUIDFromBytes en Java, sensible à la casse), donc le même UUID que sur un serveur « online-mode=false » ;
//  - pseudo : 3 à 16 caractères, lettres, chiffres ou « _ » ;
//  - jeton factice « 0 » : rien n'est envoyé à Mojang ni à Microsoft pour jouer.
// Ajout ReLaunch : le pseudo est vérifié et verrouillé 90 jours par le Worker ReLink (voir relink/account.ts) ;
// un compte hors-ligne ne peut jouer que dans les events qui l'acceptent (voir main.ts, lancement).
// Un compte hors-ligne ne peut pas rejoindre les serveurs qui vérifient le compte (online-mode) ni afficher
// un skin officiel ; il sert à jouer en solo et sur les serveurs hors-ligne.
import { createHash } from "node:crypto";

/** Délai minimal entre deux changements de pseudo hors-ligne (le tout premier pseudo est libre). */
export const OFFLINE_NAME_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;

/** Date (ms) avant laquelle le pseudo ne peut pas changer, ou null s'il peut changer maintenant. */
export function offlineLockedUntil(changedAt: number | null, now: number = Date.now()): number | null {
  if (changedAt === null || !Number.isFinite(changedAt)) return null;
  const until = changedAt + OFFLINE_NAME_COOLDOWN_MS;
  return until > now ? until : null;
}

const OFFLINE_NAME = /^[a-zA-Z0-9_]{3,16}$/;

export function isOfflineName(v: unknown): v is string {
  return typeof v === "string" && OFFLINE_NAME.test(v);
}

/** UUID hors-ligne de Minecraft (UUID v3 de « OfflinePlayer:<pseudo> »), au format 8-4-4-4-12. */
export function offlineUuid(username: string): string {
  const d = createHash("md5").update(`OfflinePlayer:${username}`, "utf8").digest();
  d[6] = (d[6]! & 0x0f) | 0x30; // version 3
  d[8] = (d[8]! & 0x3f) | 0x80; // variante IETF
  const h = d.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Session de jeu hors-ligne : même forme que celle d'un compte Microsoft (UUID sans tirets, comme Mojang). */
export function offlineSession(username: string): { name: string; uuid: string; accessToken: string } | null {
  if (!isOfflineName(username)) return null;
  return { name: username, uuid: offlineUuid(username).replace(/-/g, ""), accessToken: "0" };
}

/**
 * Options JVM du mode hors-ligne (comme Cubic) : les services Mojang du jeu pointent vers une adresse
 * invalide, pour que le jeu n'essaie ni de vérifier le compte ni de contacter les services en ligne.
 */
export const OFFLINE_JVM_ARGS: readonly string[] = [
  "-Dminecraft.api.env=custom",
  ...["auth.host", "account.host", "session.host", "services.host"].map((h) => `-Dminecraft.api.${h}=https://invalid.invalid`),
];

/** Adresse de serveur « domaine[:port] » (port 25565 par défaut) ; null si invalide. */
export function parseServerAddress(v: unknown): { host: string; port: number } | null {
  if (typeof v !== "string") return null;
  const m = /^([A-Za-z0-9](?:[A-Za-z0-9.-]{0,253}[A-Za-z0-9])?)(?::(\d{1,5}))?$/.exec(v.trim());
  if (!m || m[1]!.includes("..")) return null;
  const port = m[2] === undefined ? 25565 : Number(m[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host: m[1]!.toLowerCase(), port };
}

/**
 * Arguments du jeu pour se connecter tout de suite au serveur de l'event : « Quick Play » (--quickPlayMultiplayer)
 * depuis Minecraft 1.20, « --server / --port » avant. Le joueur n'a aucun écran de choix : la connexion est automatique.
 */
export function joinArgs(mc: string, address: string): string[] {
  const a = parseServerAddress(address);
  if (!a) return [];
  const m = /^(\d+)\.(\d+)/.exec(mc);
  const before120 = !!m && Number(m[1]) === 1 && Number(m[2]) < 20;
  return before120 ? ["--server", a.host, "--port", String(a.port)] : ["--quickPlayMultiplayer", `${a.host}:${a.port}`];
}
