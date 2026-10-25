// Outil des modpacks ReLaunch (manifeste « relaunch-pack » v1) — Node 20+, AUCUNE dépendance.
//
//   node tools/relaunch-pack.mjs build <dossier de l'instance> --id <id du modpack> --version <x.y.z>
//        --mc <version Minecraft> --loader <fabric|quilt|forge|neoforge|vanilla>[:<version>]
//        [--name "Nom affiché"] [--event <id d'event>] [--java 21] [--out <dossier>]
//        [--editable resourcepacks,shaderpacks,options.txt] [--shader <fichier de shaderpacks/>]
//       Parcourt l'instance, retrouve chaque mod / pack de ressources / shader sur Modrinth par son empreinte
//       (aucun fichier n'est envoyé, seulement les SHA-1), et met le reste (configs, fichiers absents de Modrinth)
//       dans une archive overrides.zip reproductible. Écrit <id>-<version>.relaunch.json (+ -overrides.zip).
//   node tools/relaunch-pack.mjs sign <fichier>
//       Signe les OCTETS EXACTS du fichier (Ed25519, clé RELAUNCH_SIGNING_KEY, 32 octets base64) -> <fichier>.sig
//   node tools/relaunch-pack.mjs verify <fichier> <fichier.sig> <clé publique base64>
//   node tools/relaunch-pack.mjs check <manifeste.relaunch.json>
//       Vérifie le manifeste avec les mêmes règles que le Worker.
//
// Format : docs/MANIFESTE-RELAUNCH-PACK.md. Le manifeste ET l'archive overrides se signent tous les deux.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { deflateRawSync } from "node:zlib";

const PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI = Buffer.from("302a300506032b6570032100", "hex");
const ROOTS = ["mods", "resourcepacks", "shaderpacks", "config", "defaultconfigs", "kubejs", "scripts", "datapacks", "global_packs", "emotes", "options.txt", "servers.dat"];
const RESOLVABLE = new Set(["mods", "resourcepacks", "shaderpacks", "datapacks"]);
const HOSTS = new Set(["cdn.modrinth.com", "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com", "edge.forgecdn.net", "mediafilez.forgecdn.net"]);
const LOADERS = ["vanilla", "fabric", "quilt", "forge", "neoforge"];
const SKIP = /(^|\/)(\.|__MACOSX|Thumbs\.db$|desktop\.ini$)|\.(log|tmp|bak|old|disabled)$/i;
const BLOCKED_EXT = /\.(exe|bat|cmd|ps1|vbs|msi|scr|com|lnk|dll|sys)$/i;
const MAX_OVERRIDES = 90 * 1024 * 1024;
const UA = "WeCraft/relaunch-pack (github.com/Rexidelamort/WeCraft-Launcher)";

const die = (m) => {
  console.error(`Erreur : ${m}`);
  process.exit(1);
};
const hash = (algo, b) => createHash(algo).update(b).digest("hex");

function walk(root, rel = "") {
  const out = [];
  for (const e of readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (SKIP.test(r)) continue;
    if (e.isDirectory()) out.push(...walk(root, r));
    else if (e.isFile()) out.push(r);
  }
  return out;
}

// ── ZIP reproductible (même code que relaunch-skin.mjs) ──
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
  const loc = [], cen = [];
  let off = 0;
  for (const [name, data] of files) {
    const comp = deflateRawSync(data, { level: 9 });
    const n = Buffer.from(name, "utf8"), crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(0x00210000, 10); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(0x00210000, 12); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    loc.push(lh, n, comp); cen.push(ch, n);
    off += 30 + n.length + comp.length;
  }
  const cd = Buffer.concat(cen), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...loc, cd, end]);
}

function okPath(p) {
  if (typeof p !== "string" || !p || p.length > 240 || p.startsWith("/") || p.includes("\\") || p.includes("\0")) return false;
  const parts = p.split("/");
  if (parts.some((s) => !s || s === "." || s === ".." || /[<>:"|?*]/.test(s) || /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(s) || /[. ]$/.test(s))) return false;
  return !BLOCKED_EXT.test(p) && ROOTS.includes(parts[0]);
}

/** Mêmes règles que launcherValidatePackManifest du Worker. */
export function checkManifest(m) {
  const err = (e) => ({ error: e });
  if (!m || m.format !== "relaunch-pack" || m.formatVersion !== 1) return err("format « relaunch-pack » et formatVersion 1 attendus");
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(m.pack?.id ?? "")) return err("pack.id invalide");
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(m.pack?.version ?? "")) return err("pack.version invalide (3.2.1)");
  if (!/^[0-9][0-9A-Za-z._-]{0,31}$/.test(m.minecraft ?? "")) return err("minecraft invalide");
  if (!LOADERS.includes(m.loader?.type)) return err(`loader.type : ${LOADERS.join(", ")}`);
  if (m.loader.type !== "vanilla" && !/^[0-9A-Za-z._+-]{1,60}$/.test(m.loader.version ?? "")) return err("loader.version requis");
  if (!Array.isArray(m.files) || m.files.length > 5000) return err("files : liste de 5000 fichiers maximum");
  const seen = new Set();
  for (const [i, f] of m.files.entries()) {
    if (!okPath(f?.path)) return err(`files[${i}].path refusé : ${f?.path}`);
    if (seen.has(f.path.toLowerCase())) return err(`chemin en double : ${f.path}`);
    seen.add(f.path.toLowerCase());
    if (!/^[0-9a-f]{128}$/i.test(f.hashes?.sha512 ?? "") && !/^[0-9a-f]{64}$/i.test(f.hashes?.sha256 ?? "")) return err(`files[${i}] : sha512 ou sha256 obligatoire`);
    if (!Number.isSafeInteger(f.size) || f.size < 0) return err(`files[${i}].size invalide`);
    if (!Array.isArray(f.downloads) || !f.downloads.length || f.downloads.length > 5) return err(`files[${i}].downloads : 1 à 5 adresses`);
    for (const u of f.downloads) {
      let url;
      try { url = new URL(u); } catch { return err(`files[${i}] : adresse invalide`); }
      if (url.protocol !== "https:" || !HOSTS.has(url.hostname)) return err(`files[${i}] : hôte non autorisé ${url.hostname}`);
    }
    if (f.side !== undefined && !["client", "both", "server"].includes(f.side)) return err(`files[${i}].side invalide`);
  }
  if (m.remove !== undefined && (!Array.isArray(m.remove) || m.remove.some((p) => !okPath(p)))) return err("remove : chemins permis seulement");
  if (m.editable !== undefined && (!Array.isArray(m.editable) || m.editable.some((p) => !/^(resourcepacks|shaderpacks|options\.txt|config)(\/.*)?$/.test(p)))) return err("editable : resourcepacks/, shaderpacks/, options.txt ou config/");
  if (m.overrides != null && (!/^[0-9a-f]{64}$/i.test(m.overrides.sha256 ?? "") || !Number.isSafeInteger(m.overrides.size) || m.overrides.size < 1 || m.overrides.size > MAX_OVERRIDES)) return err("overrides : { sha256, size } attendus (90 Mio max)");
  return { ok: true, files: m.files.length, mods: m.files.filter((f) => f.path.startsWith("mods/") && f.side !== "server").length };
}

function args(list) {
  const o = {};
  for (let i = 0; i < list.length; i++) {
    if (!list[i].startsWith("--")) continue;
    o[list[i].slice(2)] = list[i + 1];
    i++;
  }
  return o;
}

async function modrinthLookup(sha1s) {
  const found = {};
  for (let i = 0; i < sha1s.length; i += 500) {
    const res = await fetch("https://api.modrinth.com/v2/version_files", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ hashes: sha1s.slice(i, i + 500), algorithm: "sha1" }),
    });
    if (!res.ok) die(`Modrinth a répondu HTTP ${res.status}`);
    Object.assign(found, await res.json());
  }
  return found;
}

async function build(dir, o) {
  const root = path.resolve(dir);
  if (!o.id || !o.version || !o.mc || !o.loader) die("--id, --version, --mc et --loader sont obligatoires");
  const [ltype, lver] = o.loader.split(":");
  const list = walk(root).filter((f) => ROOTS.includes(f.split("/")[0])).sort();
  if (!list.length) die(`aucun fichier de jeu (${ROOTS.join(", ")}) dans ${root}`);
  for (const f of list) if (!okPath(f)) die(`chemin refusé : ${f}`);
  const entries = list.map((p) => {
    const data = readFileSync(path.join(root, p));
    return { path: p, data, sha1: hash("sha1", data), sha512: hash("sha512", data) };
  });
  const candidates = entries.filter((e) => RESOLVABLE.has(e.path.split("/")[0]) && /\.(jar|zip)$/i.test(e.path));
  console.log(`${entries.length} fichiers, recherche de ${candidates.length} sur Modrinth…`);
  const found = candidates.length ? await modrinthLookup(candidates.map((e) => e.sha1)) : {};
  const files = [], overrides = [];
  for (const e of entries) {
    const v = found[e.sha1];
    const file = v?.files?.find((x) => x.hashes?.sha1 === e.sha1);
    if (file && file.hashes?.sha512 === e.sha512 && new URL(file.url).hostname === "cdn.modrinth.com") {
      files.push({ path: e.path, hashes: { sha512: e.sha512, sha1: e.sha1 }, size: e.data.length, downloads: [file.url], project: v.project_id, versionId: v.id });
    } else overrides.push(e);
  }
  const out = path.resolve(o.out ?? ".");
  mkdirSync(out, { recursive: true });
  const base = `${o.id}-${o.version}`;
  const manifest = {
    format: "relaunch-pack", formatVersion: 1,
    pack: { id: o.id, name: o.name ?? o.id, version: o.version, ...(o.event ? { event: o.event } : {}) },
    minecraft: o.mc,
    loader: ltype === "vanilla" ? { type: "vanilla" } : { type: ltype, version: lver },
    ...(o.java ? { java: { major: Number(o.java) } } : {}),
    files,
    overrides: null,
    remove: [],
    editable: o.editable ? o.editable.split(",").map((s) => s.trim()).filter(Boolean) : ["resourcepacks", "shaderpacks", "options.txt"],
    ...(o.shader ? { defaults: { shader: o.shader } } : {}),
  };
  if (overrides.length) {
    const buf = zip(overrides.map((e) => [e.path, e.data]));
    if (buf.length > MAX_OVERRIDES) die(`overrides.zip trop lourd (${(buf.length / 1048576).toFixed(1)} Mio, 90 Mio max) : publie plus de fichiers sur Modrinth`);
    writeFileSync(path.join(out, `${base}-overrides.zip`), buf);
    manifest.overrides = { sha256: hash("sha256", buf), size: buf.length };
  }
  const check = checkManifest(manifest);
  if (check.error) die(`manifeste refusé : ${check.error}`);
  const json = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(path.join(out, `${base}.relaunch.json`), json);
  console.log(`${path.join(out, `${base}.relaunch.json`)}\n  ${files.length} fichiers téléchargés depuis Modrinth, ${overrides.length} dans overrides${overrides.length ? ` (${path.join(out, `${base}-overrides.zip`)})` : ""}`);
  const unresolved = overrides.filter((e) => RESOLVABLE.has(e.path.split("/")[0]) && /\.(jar|zip)$/i.test(e.path));
  if (unresolved.length) console.log(`  Attention, absents de Modrinth (copiés dans overrides, vérifie que la licence permet de les redistribuer) :\n    ${unresolved.map((e) => e.path).join("\n    ")}`);
  console.log(`Ensuite : signe ${overrides.length ? "les deux fichiers" : "le manifeste"} (commande sign), puis publie-les dans le panel.`);
}

const [cmd, a, b, c] = process.argv.slice(2);
if (cmd === "build" && a) await build(a, args(process.argv.slice(4)));
else if (cmd === "check" && a) {
  let m;
  try { m = JSON.parse(readFileSync(a, "utf8")); } catch (e) { die(`JSON illisible (${e.message})`); }
  const r = checkManifest(m);
  if (r.error) die(r.error);
  console.log(`Manifeste valide : ${r.files} fichiers dont ${r.mods} mods.`);
} else if (cmd === "sign" && a) {
  const raw = Buffer.from((process.env.RELAUNCH_SIGNING_KEY ?? "").trim(), "base64");
  if (raw.length !== 32) die("RELAUNCH_SIGNING_KEY : clé privée Ed25519 de 32 octets en base64 attendue");
  const key = createPrivateKey({ key: Buffer.concat([PKCS8, raw]), format: "der", type: "pkcs8" });
  const data = readFileSync(a);
  writeFileSync(`${a}.sig`, `${sign(null, data, key).toString("base64")}\n`);
  console.log(`${a}.sig\nSHA-256 ${hash("sha256", data)}\nClé publique : ${createPublicKey(key).export({ format: "der", type: "spki" }).subarray(12).toString("base64")}`);
} else if (cmd === "verify" && a && b && c) {
  const pub = Buffer.from(c, "base64");
  if (pub.length !== 32) die("clé publique : 32 octets en base64 attendus");
  const ok = verify(null, readFileSync(a), createPublicKey({ key: Buffer.concat([SPKI, pub]), format: "der", type: "spki" }), Buffer.from(readFileSync(b, "ascii").trim(), "base64"));
  console.log(ok ? "Signature valide." : "SIGNATURE INVALIDE");
  process.exit(ok ? 0 : 1);
} else {
  console.log("Usage :\n  node tools/relaunch-pack.mjs build <instance> --id <id> --version <x.y.z> --mc <mc> --loader <type>[:<version>]\n  node tools/relaunch-pack.mjs check <manifeste>\n  node tools/relaunch-pack.mjs sign <fichier>   (clé : RELAUNCH_SIGNING_KEY)\n  node tools/relaunch-pack.mjs verify <fichier> <fichier.sig> <clé publique base64>");
  process.exit(cmd ? 1 : 0);
}
