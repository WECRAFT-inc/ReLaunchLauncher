// Outil des skins ReLaunch (.rlskin) — Node 20+, AUCUNE dépendance.
//
//   node tools/relaunch-skin.mjs pack  <dossier du skin> [sortie.rlskin]
//       Vérifie le dossier (skin.json + fichiers référencés, types et tailles permis) et crée l'archive.
//   node tools/relaunch-skin.mjs sign  <fichier.rlskin>
//       Signe les OCTETS EXACTS du fichier (Ed25519) avec la clé privée de la variable RELAUNCH_SIGNING_KEY
//       (32 octets en base64) ; écrit <fichier>.sig (base64) et affiche le SHA-256. C'est ce que le Worker
//       vérifie avec RELAUNCH_SIGNING_PUBLIC_KEY, puis le launcher avec la même clé publique épinglée.
//   node tools/relaunch-skin.mjs verify <fichier.rlskin> <fichier.sig> <clé publique base64>
//
// Format complet : docs/SKINS-RELAUNCH.md. La vérification complète des valeurs (couleurs, animations…)
// est celle du launcher : Réglages > Apparence > « Aperçu d'un fichier skin » avant toute publication.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateRawSync } from "node:zlib";

const EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".woff2", ".woff", ".ttf", ".otf"]);
const MAX_FILE = 12 * 1024 * 1024;
const MAX_PACK = 40 * 1024 * 1024;
const PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI = Buffer.from("302a300506032b6570032100", "hex");
const die = (m) => {
  console.error(`Erreur : ${m}`);
  process.exit(1);
};

function walk(root, rel = "") {
  const out = [];
  for (const e of readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.name.startsWith(".")) continue;
    if (e.isDirectory()) out.push(...walk(root, r));
    else if (e.isFile()) out.push(r);
  }
  return out;
}

// CRC-32 (ZIP)
const TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (b) => {
  let c = -1;
  for (const x of b) c = TABLE[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

function zip(files) {
  const loc = [];
  const cen = [];
  let off = 0;
  for (const [name, data] of files) {
    const comp = deflateRawSync(data, { level: 9 });
    const n = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6); // noms en UTF-8
    lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(0x00210000, 10); // date fixe (archive reproductible)
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(0x00210000, 12);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(n.length, 28);
    ch.writeUInt32LE(off, 42);
    loc.push(lh, n, comp);
    cen.push(ch, n);
    off += 30 + n.length + comp.length;
  }
  const cd = Buffer.concat(cen);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(off, 16);
  return Buffer.concat([...loc, cd, end]);
}

function refs(m) {
  const r = [];
  for (const l of m.background?.layers ?? []) r.push(l.image);
  r.push(m.bars?.pattern, m.playButton?.image, m.launchScreen?.image, m.fonts?.display?.file, m.fonts?.body?.file);
  return r.filter((x) => typeof x === "string");
}

const [cmd, a, b, c] = process.argv.slice(2);
if (cmd === "pack" && a) {
  const root = path.resolve(a);
  let m;
  try {
    m = JSON.parse(readFileSync(path.join(root, "skin.json"), "utf8"));
  } catch (e) {
    die(`skin.json illisible (${e.message})`);
  }
  if (m.format !== "relaunch-skin" || m.version !== 1) die('skin.json : "format": "relaunch-skin" et "version": 1 attendus');
  if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(m.id ?? "")) die("skin.json : id invalide (minuscules, chiffres, tirets)");
  if (!m.name) die("skin.json : name manquant");
  const list = walk(root).sort();
  for (const f of list) {
    if (f === "skin.json") continue;
    if (!EXT.has(path.extname(f).toLowerCase())) die(`type de fichier refusé : ${f}`);
    if (statSync(path.join(root, f)).size > MAX_FILE) die(`fichier trop lourd (12 Mo max) : ${f}`);
    if (/[\\:*?"<>|]|(^|\/)\.\.?(\/|$)/.test(f)) die(`nom refusé : ${f}`);
  }
  for (const r of refs(m)) if (!list.includes(r)) die(`fichier référencé absent : ${r}`);
  for (const [k, an] of Object.entries(m.animations ?? {})) if (!Array.isArray(an.keyframes) || an.keyframes.length < 2) die(`animation « ${k} » : au moins 2 images-clés`);
  const out = path.resolve(b ?? `${m.id}-${m.skinVersion ?? "1"}.rlskin`);
  const buf = zip(list.map((f) => [f, readFileSync(path.join(root, f))]));
  if (buf.length > MAX_PACK) die("archive trop lourde (40 Mo max)");
  writeFileSync(out, buf);
  console.log(`${out}\n${list.length} fichiers · ${(buf.length / 1024).toFixed(0)} Kio · SHA-256 ${createHash("sha256").update(buf).digest("hex")}`);
  if (list.some((f) => f.toLowerCase().endsWith(".svg"))) console.log("Note : le SVG n'est accepté que dans un skin signé (refusé en aperçu local).");
} else if (cmd === "sign" && a) {
  const raw = Buffer.from((process.env.RELAUNCH_SIGNING_KEY ?? "").trim(), "base64");
  if (raw.length !== 32) die("RELAUNCH_SIGNING_KEY : clé privée Ed25519 de 32 octets en base64 attendue");
  const key = createPrivateKey({ key: Buffer.concat([PKCS8, raw]), format: "der", type: "pkcs8" });
  const data = readFileSync(a);
  const sig = sign(null, data, key).toString("base64");
  writeFileSync(`${a}.sig`, `${sig}\n`);
  console.log(`${a}.sig\nSHA-256 ${createHash("sha256").update(data).digest("hex")}\nClé publique : ${createPublicKey(key).export({ format: "der", type: "spki" }).subarray(12).toString("base64")}`);
} else if (cmd === "verify" && a && b && c) {
  const pub = Buffer.from(c, "base64");
  if (pub.length !== 32) die("clé publique : 32 octets en base64 attendus");
  const ok = verify(null, readFileSync(a), createPublicKey({ key: Buffer.concat([SPKI, pub]), format: "der", type: "spki" }), Buffer.from(readFileSync(b, "ascii").trim(), "base64"));
  console.log(ok ? "Signature valide." : "SIGNATURE INVALIDE");
  process.exit(ok ? 0 : 1);
} else {
  console.log("Usage :\n  node tools/relaunch-skin.mjs pack <dossier> [sortie.rlskin]\n  node tools/relaunch-skin.mjs sign <fichier.rlskin>   (clé : RELAUNCH_SIGNING_KEY)\n  node tools/relaunch-skin.mjs verify <fichier.rlskin> <fichier.sig> <clé publique base64>");
  process.exit(cmd ? 1 : 0);
}
