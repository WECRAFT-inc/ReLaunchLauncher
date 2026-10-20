import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { Settings } from "../src/main/config";
import { JsonStore } from "../src/main/storage/jsonStore";
import { faultyFs, sysError, tempDir } from "./helpers";

test("thème : lu, enregistré, autres réglages conservés", async () => {
  const { dir, cleanup } = tempDir("theme");
  try {
    const f = path.join(dir, "launcher_config.json");
    writeFileSync(f, '\ufeff{"theme": "aurore", "ram": 8}', "utf8");
    const s = new Settings(new JsonStore(), f);
    assert.equal(await s.theme(), "aurore");
    assert.deepEqual(await s.setTheme("relink"), { ok: true });
    assert.deepEqual(JSON.parse(readFileSync(f, "utf8")), { theme: "relink", ram: 8 });
    assert.equal(await s.theme(), "relink");
  } finally {
    cleanup();
  }
});

test("thème inconnu refusé sans rien écrire", async () => {
  const { dir, cleanup } = tempDir("theme-bad");
  try {
    const f = path.join(dir, "launcher_config.json");
    writeFileSync(f, '{"ram": 8}', "utf8");
    const s = new Settings(new JsonStore(), f);
    for (const bad of ["rouge", "", null, 3, { theme: "glace" }, "__proto__"]) {
      assert.deepEqual(await s.setTheme(bad), { ok: false, reason: "invalid" });
    }
    assert.equal(readFileSync(f, "utf8"), '{"ram": 8}');
  } finally {
    cleanup();
  }
});

test("fichier absent : créé avec le seul thème", async () => {
  const { dir, cleanup } = tempDir("theme-new");
  try {
    const f = path.join(dir, "sous", "launcher_config.json");
    const s = new Settings(new JsonStore(), f);
    assert.equal(await s.theme(), null);
    assert.deepEqual(await s.setTheme("glace"), { ok: true });
    assert.deepEqual(JSON.parse(readFileSync(f, "utf8")), { theme: "glace" });
  } finally {
    cleanup();
  }
});

test("fichier verrouillé : refus « unreadable », fichier intact", async () => {
  const { dir, cleanup } = tempDir("theme-lock");
  try {
    const f = path.join(dir, "launcher_config.json");
    writeFileSync(f, '{"theme": "phenix"}', "utf8");
    const fs = faultyFs({ readFile: async () => { throw sysError("EBUSY"); } });
    const s = new Settings(new JsonStore({ fs }), f);
    assert.deepEqual(await s.setTheme("glace"), { ok: false, reason: "unreadable" });
    assert.equal(readFileSync(f, "utf8"), '{"theme": "phenix"}');
  } finally {
    cleanup();
  }
});

test("fichier abîmé remplacé lors d'un enregistrement : signalé avec le nom de la copie (revue E1, I1)", async () => {
  const { dir, cleanup } = tempDir("theme-reset");
  try {
    const f = path.join(dir, "launcher_config.json");
    writeFileSync(f, '{"ram": 6', "utf8");
    const r = await new Settings(new JsonStore(), f).setTheme("glace");
    assert.equal(r.ok, true);
    assert.ok(r.ok && r.reset && r.reset.name === "launcher_config.json");
    assert.ok(r.ok && r.reset && r.reset.copyName.startsWith("launcher_config.json.invalide-"));
    assert.equal(readFileSync(path.join(dir, r.ok && r.reset ? r.reset.copyName : ""), "utf8"), '{"ram": 6');
  } finally {
    cleanup();
  }
});

test("fichier abîmé non copiable : refus « not-backed-up », fichier intact", async () => {
  const { dir, cleanup } = tempDir("theme-nobackup");
  try {
    const f = path.join(dir, "launcher_config.json");
    writeFileSync(f, '{"ram": 6', "utf8");
    const fs = faultyFs({ writeNew: async () => { throw sysError("EACCES"); } });
    const s = new Settings(new JsonStore({ fs }), f);
    assert.deepEqual(await s.setTheme("glace"), { ok: false, reason: "not-backed-up" });
    assert.equal(readFileSync(f, "utf8"), '{"ram": 6');
  } finally {
    cleanup();
  }
});
