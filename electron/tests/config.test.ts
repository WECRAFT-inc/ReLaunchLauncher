import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { readSavedTheme, themeFromConfigBytes } from "../src/main/config";

const enc = (s: string) => new TextEncoder().encode(s);

test("thème lu dans launcher_config.json", () => {
  assert.equal(themeFromConfigBytes(enc('{"theme": "glace", "ram": 4}')), "glace");
});

test("BOM UTF-8 accepté, comme « utf-8-sig » en Python", () => {
  const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc('{"theme":"aurore"}')]);
  assert.equal(themeFromConfigBytes(bom), "aurore");
});

test("contenus invalides : aucun thème, aucune erreur", () => {
  assert.equal(themeFromConfigBytes(enc('{"theme": "inconnu"}')), null);
  assert.equal(themeFromConfigBytes(enc('{"theme": 3}')), null);
  assert.equal(themeFromConfigBytes(enc("[1, 2]")), null);
  assert.equal(themeFromConfigBytes(enc("null")), null);
  assert.equal(themeFromConfigBytes(enc("{tronqué")), null);
  assert.equal(themeFromConfigBytes(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])), null); // octets non UTF-8
});

test("readSavedTheme : fichier absent -> null, et le fichier n'est jamais modifié", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wecraft-e0-"));
  try {
    assert.equal(await readSavedTheme(path.join(dir, "absent.json")), null);
    const f = path.join(dir, "launcher_config.json");
    const broken = '{"theme": "glace", tronqué';
    writeFileSync(f, broken, "utf8");
    const before = statSync(f).mtimeMs;
    assert.equal(await readSavedTheme(f), null);
    assert.equal(readFileSync(f, "utf8"), broken); // contenu intact
    assert.equal(statSync(f).mtimeMs, before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
