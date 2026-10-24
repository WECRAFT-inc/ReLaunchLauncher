// Assemble l'interface React (lot E6) en UN seul fichier dist/src/renderer/ui.js, sans outil externe.
//
// L'interface est compilée par TypeScript en modules CommonJS (dist/ui/...), puis ce script réunit ces modules
// et ceux de React (react, react-dom, scheduler, déjà dans node_modules) dans une fonction auto-exécutée :
// - « process.env.NODE_ENV » est remplacé par "production" (seules les versions de production de React sont
//   incluses ; une version de développement absente est remplacée par un module qui refuse de se charger) ;
// - aucun eval, aucun chargement à l'exécution : compatible avec la politique de sécurité (CSP) de l'interface ;
// - les mentions de licence des fichiers React sont conservées.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const isFile = (f) => {
  try {
    return statSync(f).isFile();
  } catch {
    return false;
  }
};
const REQUIRE = /\brequire\(\s*(["'])([^"']+)\1\s*\)/g;

export function bundle(entry, { root = ROOT } = {}) {
  const req = createRequire(path.join(root, "package.json"));
  const ids = new Map();
  const mods = [];
  function resolveFrom(spec, from) {
    if (spec.startsWith(".") || spec.startsWith("/")) {
      const base = path.resolve(path.dirname(from), spec);
      for (const c of [base, `${base}.js`, path.join(base, "index.js")]) if (isFile(c)) return c;
      return base.endsWith(".js") ? base : `${base}.js`; // absent : signalé (ou remplacé si version de développement)
    }
    return req.resolve(spec, { paths: [root] });
  }
  function add(file) {
    if (ids.has(file)) return ids.get(file);
    const id = mods.length;
    ids.set(file, id);
    mods.push(null);
    if (/\.development\.js$/.test(file) || !existsSync(file)) {
      if (!/\.development\.js$/.test(file)) throw new Error(`Module introuvable : ${file}`);
      mods[id] = { file, code: `throw new Error("Version de développement non incluse : ${path.basename(file)}");`, deps: {} };
      return id;
    }
    let code = readFileSync(file, "utf8").replace(/\bprocess\.env\.NODE_ENV\b/g, '"production"');
    if (/\beval\s*\(|new Function\s*\(/.test(code)) throw new Error(`eval interdit : ${file}`);
    const deps = {};
    for (const m of code.matchAll(REQUIRE)) deps[m[2]] = add(resolveFrom(m[2], file));
    code = code.replace(/^\/\/# sourceMappingURL=.*$/gm, "");
    mods[id] = { file, code, deps };
    return id;
  }
  const entryId = add(path.resolve(entry));
  const parts = mods.map(
    (m, i) =>
      `/* ${path.relative(root, m.file).replace(/\\/g, "/")} */\n${i}: [function (module, exports, require) {\n${m.code}\n}, ${JSON.stringify(m.deps)}]`,
  );
  return (
    `/* ReLaunch : interface assemblée par scripts/bundle-ui.mjs. Contient React (licence MIT, mentions ci-dessous). */\n` +
    `(function () {\n"use strict";\nvar defs = {\n${parts.join(",\n")}\n};\nvar cache = {};\n` +
    `function load(id) {\n  if (cache[id]) return cache[id].exports;\n  var d = defs[id], module = { exports: {} };\n  cache[id] = module;\n` +
    `  d[0].call(module.exports, module, module.exports, function (spec) {\n    if (!(spec in d[1])) throw new Error("Module non inclus : " + spec);\n    return load(d[1][spec]);\n  });\n  return module.exports;\n}\n` +
    `load(${entryId});\n})();\n`
  );
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("bundle-ui.mjs")) {
  const entry = path.join(ROOT, "dist", "ui", "src", "renderer", "ui", "main.js");
  const out = path.join(ROOT, "dist", "src", "renderer", "ui.js");
  mkdirSync(path.dirname(out), { recursive: true });
  const text = bundle(entry);
  writeFileSync(out, text, "utf8");
  console.log(`ui.js : ${(text.length / 1024).toFixed(0)} Ko`);
}
