// Lot E6 : interface React assemblée en un seul fichier, sans eval, sans version de développement, licences gardées.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { tempDir } from "./helpers";

const ROOT = path.join(__dirname, "..", "..");

async function bundler(): Promise<{ bundle: (entry: string, o?: { root?: string }) => string }> {
  return (await import(path.join(ROOT, "scripts", "bundle-ui.mjs"))) as { bundle: (entry: string, o?: { root?: string }) => string };
}

test("assemblage : modules CommonJS reliés, NODE_ENV fixé, versions de développement exclues", async () => {
  const { bundle } = await bundler();
  const { dir, cleanup } = tempDir("bundle");
  try {
    writeFileSync(path.join(dir, "package.json"), "{}");
    mkdirSync(path.join(dir, "node_modules", "lib", "cjs"), { recursive: true });
    writeFileSync(path.join(dir, "node_modules", "lib", "package.json"), JSON.stringify({ name: "lib", main: "index.js" }));
    writeFileSync(
      path.join(dir, "node_modules", "lib", "index.js"),
      "if (process.env.NODE_ENV === 'production') module.exports = require('./cjs/lib.production.js'); else module.exports = require('./cjs/lib.development.js');",
    );
    writeFileSync(path.join(dir, "node_modules", "lib", "cjs", "lib.production.js"), "/** @license Lib MIT */ exports.v = 'prod';");
    writeFileSync(path.join(dir, "node_modules", "lib", "cjs", "lib.development.js"), "exports.v = 'dev';");
    writeFileSync(path.join(dir, "util.js"), "exports.twice = (x) => x * 2;");
    writeFileSync(path.join(dir, "main.js"), "const u = require('./util'); const l = require('lib'); globalThis.out = l.v + ':' + u.twice(21);");
    const text = bundle(path.join(dir, "main.js"), { root: dir });
    assert.ok(text.includes("@license Lib MIT"));
    assert.ok(!text.includes("exports.v = 'dev'"), "version de développement exclue");
    const g: { out?: string } = {};
    runInNewContext(text, { globalThis: g });
    assert.equal(g.out, "prod:42");
    writeFileSync(path.join(dir, "evil.js"), "eval('1');");
    writeFileSync(path.join(dir, "main2.js"), "require('./evil');");
    assert.throws(() => bundle(path.join(dir, "main2.js"), { root: dir }), /eval interdit/);
    writeFileSync(path.join(dir, "main3.js"), "require('./absent');");
    assert.throws(() => bundle(path.join(dir, "main3.js"), { root: dir }), /Module introuvable/);
  } finally {
    cleanup();
  }
});
