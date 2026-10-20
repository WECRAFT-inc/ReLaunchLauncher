// Correctif d'un paquet mal publié (audit E3, constat X12), appliqué à chaque compilation.
//
// @xmcl/unzip 2.2.0 a été publié sans que son package.json soit réécrit pour la publication : « main »
// pointe vers ./index.ts (absent du paquet) au lieu de ./dist/index.js (présent). Les fichiers du paquet
// sont ceux vérifiés par npm (empreinte du package-lock.json) ; seul ce champ est corrigé.
// Si la version change, le script s'arrête en erreur : il faut alors vérifier si le correctif est encore utile.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "node_modules", "@xmcl", "unzip");
const file = join(dir, "package.json");

if (!existsSync(file)) {
  console.log("[correctif] @xmcl/unzip non installé : rien à faire.");
  process.exit(0);
}
const pkg = JSON.parse(readFileSync(file, "utf8"));
if (pkg.version !== "2.2.0") {
  console.error(`[correctif] @xmcl/unzip ${pkg.version} : version inattendue, vérifier si le correctif est encore nécessaire.`);
  process.exit(1);
}
if (pkg.main === "./dist/index.js") {
  console.log("[correctif] @xmcl/unzip déjà corrigé.");
  process.exit(0);
}
if (pkg.main !== "./index.ts" || !existsSync(join(dir, "dist", "index.js"))) {
  console.error("[correctif] @xmcl/unzip : contenu inattendu, correctif non appliqué.");
  process.exit(1);
}
pkg.main = "./dist/index.js";
pkg.module = "./dist/index.mjs";
pkg.types = "./dist/index.d.ts";
writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
console.log("[correctif] @xmcl/unzip : « main » corrigé (./index.ts -> ./dist/index.js).");
