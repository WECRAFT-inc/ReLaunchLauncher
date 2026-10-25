// Signature des releases (Ed25519) avec le module crypto intégré à Node : AUCUNE dépendance à installer.
// Utilisé par le job « signature » de release-relaunch.yml, qui reçoit la clé privée et n'exécute ni npm ni pip.
// Même message et même format que tools/sign_release.py (signature Ed25519 déterministe : résultat identique).
//
//   node tools/sign_release_node.mjs sign   <fichier> <version>              (clé : variable UPDATE_SIGNING_KEY)
//   node tools/sign_release_node.mjs verify <fichier> <version> <fichier.sig> <clé publique base64>
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { readFileSync } from "node:fs";

const CONTEXT = "WeCraft-update-v1"; // identique à SIGNATURE_CONTEXT (wecraft_launcher.py, signature.ts)
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex"); // clé privée Ed25519 brute -> PKCS#8
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex"); // clé publique Ed25519 brute -> SPKI

function b64strict(text, size, what) {
  const t = String(text).trim();
  if (t.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(t)) throw new Error(`${what} : base64 invalide`);
  const b = Buffer.from(t, "base64");
  if (b.length !== size) throw new Error(`${what} : ${size} octets attendus`);
  return b;
}
const message = (version, sha256) => Buffer.from(`${CONTEXT}\n${version.trim().replace(/^[vV]+/, "")}\n${sha256.trim().toLowerCase()}\n`, "utf8");
const sha256File = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");

const [cmd, file, version, sigFile, pub] = process.argv.slice(2);
try {
  if (cmd === "sign" && file && version) {
    const raw = b64strict(process.env.UPDATE_SIGNING_KEY ?? "", 32, "clé privée");
    const key = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, raw]), format: "der", type: "pkcs8" });
    process.stdout.write(`${sign(null, message(version, sha256File(file)), key).toString("base64")}\n`);
  } else if (cmd === "verify" && file && version && sigFile && pub) {
    const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, b64strict(pub, 32, "clé publique")]), format: "der", type: "spki" });
    const sig = b64strict(readFileSync(sigFile, "ascii"), 64, "signature");
    if (!verify(null, message(version, sha256File(file)), key, sig)) throw new Error("signature invalide");
    console.log("Signature valide.");
  } else {
    throw new Error("usage : sign <fichier> <version> | verify <fichier> <version> <fichier.sig> <clé publique>");
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e)); // jamais la clé
  process.exit(1);
}
