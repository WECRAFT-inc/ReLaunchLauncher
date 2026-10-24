// Signature des mises à jour (lot E5), port EXACT de update_signed_message / verify_update_signature /
// check_update_signature (wecraft_launcher.py) : même clé publique, même message signé, signature obligatoire.
// La clé PRIVÉE n'est jamais dans le dépôt (secret GitHub UPDATE_SIGNING_KEY, tools/sign_release.py).
import { createPublicKey, verify } from "node:crypto";

export const UPDATE_PUBLIC_KEY = "pELCCH6Cv98mKYOqqA/gTQsb2+EoV/MIAuG0gT2hx5Q=";
export const SIGNATURE_CONTEXT = "WeCraft-update-v1";
/** En-tête DER d'une clé publique Ed25519 (SubjectPublicKeyInfo) devant les 32 octets bruts. */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Texte signé : lie le fichier (empreinte) à SA version. */
export function updateSignedMessage(version: string, sha256: string): Buffer {
  return Buffer.from(`${SIGNATURE_CONTEXT}\n${String(version).trim()}\n${String(sha256).trim().toLowerCase()}\n`, "utf8");
}

/** base64.b64decode(..., validate=True) : refuse tout caractère hors alphabet (sauf espaces de début/fin). */
function strictB64(text: string): Buffer | null {
  const t = text.trim();
  if (t.length % 4 !== 0 || !B64.test(t)) return null;
  return Buffer.from(t, "base64");
}

export function verifyUpdateSignature(version: string, sha256: string, signatureB64: string | null | undefined, publicKeyB64: string = UPDATE_PUBLIC_KEY): boolean {
  const key = publicKeyB64.trim();
  if (!key || !signatureB64) return false;
  const raw = strictB64(key);
  const sig = strictB64(String(signatureB64));
  if (!raw || raw.length !== 32 || !sig || sig.length !== 64) return false;
  try {
    const pub = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: "der", type: "spki" });
    return verify(null, updateSignedMessage(version, sha256), pub, sig);
  } catch {
    return false;
  }
}

export class UpdateRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpdateRefused";
  }
}

/** Décision pour une mise à jour dont l'empreinte est sha256 : lève UpdateRefused, sinon renvoie une note. */
export function checkUpdateSignature(info: { version: string; signature: string | null }, sha256: string): string {
  if (info.signature) {
    if (verifyUpdateSignature(info.version, sha256, info.signature)) return "signature vérifiée";
    throw new UpdateRefused(
      "La signature de cette mise à jour est invalide : elle n'a pas été publiée par l'auteur de WeCraft, ou a été modifiée. Mise à jour annulée.",
    );
  }
  throw new UpdateRefused("Cette mise à jour n'est pas signée par l'auteur de WeCraft : mise à jour annulée par sécurité.");
}

/** version_key : « 1.2.1-rc1 » < « 1.2.1 » < « 1.2.2 ». */
export function versionKey(text: string): [number[], number, number[]] {
  const t = String(text).trim().replace(/^[vV]+/, "");
  const dash = t.indexOf("-");
  const main = dash >= 0 ? t.slice(0, dash) : t;
  const pre = dash >= 0 ? t.slice(dash + 1) : "";
  const nums = (main.match(/\d+/g) ?? []).slice(0, 4).map(Number);
  while (nums.length < 4) nums.push(0);
  return [nums, pre ? 0 : 1, (pre.match(/\d+/g) ?? []).map(Number)];
}

function cmpList(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i >= a.length) return -1;
    if (i >= b.length) return 1;
    if (a[i]! !== b[i]!) return a[i]! < b[i]! ? -1 : 1;
  }
  return 0;
}

export function isNewer(remote: string, local: string): boolean {
  const [ra, rb, rc] = versionKey(remote);
  const [la, lb, lc] = versionKey(local);
  return (cmpList(ra, la) || rb - lb || cmpList(rc, lc)) > 0;
}
