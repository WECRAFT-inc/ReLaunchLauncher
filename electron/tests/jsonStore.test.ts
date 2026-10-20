// Port des tests Python « EcrituresEtLectures » (tests/test_donnees.py) + cas propres à Electron.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { JsonStore, SettingsBusy, SettingsNotBackedUp, SettingsUnreadable, stamp } from "../src/main/storage/jsonStore";
import { faultyFs, noSleep, sysError, tempDir } from "./helpers";

const copiesOf = (dir: string, name: string) => readdirSync(dir).filter((n) => n.startsWith(`${name}.invalide-`));

test("écriture atomique : aucun fichier temporaire laissé", async () => {
  const { dir, cleanup } = tempDir("io");
  try {
    const s = new JsonStore();
    const f = path.join(dir, "a.json");
    await s.writeAtomic(f, '{"x": 1}');
    await s.writeAtomic(f, '{"x": 2}');
    assert.deepEqual(JSON.parse(readFileSync(f, "utf8")), { x: 2 });
    assert.deepEqual(readdirSync(dir), ["a.json"]);
  } finally {
    cleanup();
  }
});

test("BOM UTF-8 accepté", async () => {
  const { dir, cleanup } = tempDir("bom");
  try {
    const f = path.join(dir, "bom.json");
    writeFileSync(f, Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from('{"ok": true}')]));
    assert.deepEqual(await new JsonStore().read(f), { ok: true });
  } finally {
    cleanup();
  }
});

test("encodage non UTF-8 : mis de côté sans planter (constat B1)", async () => {
  const { dir, cleanup } = tempDir("enc");
  try {
    const s = new JsonStore();
    for (const raw of [Buffer.from('{"nom": "\xe9t\xe9"}', "latin1"), Buffer.from([0xff, 0xfe, 0x7b, 0x00, 0x7d, 0x00])]) {
      const f = path.join(dir, `enc${raw.length}.json`);
      writeFileSync(f, raw);
      assert.equal(await s.read(f), null);
      assert.equal(copiesOf(dir, path.basename(f)).length, 1);
    }
  } finally {
    cleanup();
  }
});

test("contenus invalides (JSON tronqué, tableau, null) : mis de côté, original intact", async () => {
  const { dir, cleanup } = tempDir("inv");
  try {
    const s = new JsonStore();
    for (const [i, content] of ['{"a": ', "[1, 2]", "null", '"texte"'].entries()) {
      const f = path.join(dir, `f${i}.json`);
      writeFileSync(f, content, "utf8");
      assert.equal(await s.read(f), null);
      assert.equal(readFileSync(f, "utf8"), content, "l'original ne doit jamais être modifié par une lecture");
      const copies = copiesOf(dir, `f${i}.json`);
      assert.equal(copies.length, 1);
      assert.equal(readFileSync(path.join(dir, copies[0]!), "utf8"), content);
    }
    assert.equal(s.takeInvalidFiles().length, 4);
    assert.equal(s.takeInvalidFiles().length, 0, "chaque fichier n'est signalé qu'une fois");
  } finally {
    cleanup();
  }
});

test("fichier illisible conservé une seule fois malgré des relectures répétées", async () => {
  const { dir, cleanup } = tempDir("once");
  try {
    const s = new JsonStore();
    const f = path.join(dir, "cassé.json");
    writeFileSync(f, '{"a": ', "utf8");
    for (let i = 0; i < 5; i++) assert.equal(await s.read(f), null);
    assert.equal(copiesOf(dir, "cassé.json").length, 1);
    assert.equal(s.takeInvalidFiles().length, 1);
  } finally {
    cleanup();
  }
});

test("pas de nouvelle copie à chaque démarrage (copie identique déjà présente)", async () => {
  const { dir, cleanup } = tempDir("starts");
  try {
    const f = path.join(dir, "reste_casse.json");
    writeFileSync(f, '{"x": ', "utf8");
    for (let i = 0; i < 3; i++) await new JsonStore().read(f); // nouveau processus à chaque fois
    assert.equal(copiesOf(dir, "reste_casse.json").length, 1);
  } finally {
    cleanup();
  }
});

test("une copie faite par la version Python est reconnue (pas de doublon)", async () => {
  const { dir, cleanup } = tempDir("py");
  try {
    const f = path.join(dir, "launcher_config.json");
    writeFileSync(f, '{"ram": ', "utf8");
    writeFileSync(path.join(dir, "launcher_config.json.invalide-20261019-101500"), '{"ram": ', "utf8");
    const s = new JsonStore();
    await s.read(f);
    assert.equal(copiesOf(dir, "launcher_config.json").length, 1);
    assert.deepEqual(s.takeInvalidFiles().map((r) => path.basename(r.copy ?? "")), ["launcher_config.json.invalide-20261019-101500"]);
  } finally {
    cleanup();
  }
});

test("contenu modifié : nouvelle copie, nom unique si la seconde est identique", async () => {
  const { dir, cleanup } = tempDir("uniq");
  try {
    const fixed = new Date(2026, 9, 20, 10, 0, 0);
    const s = new JsonStore({ now: () => fixed });
    const f = path.join(dir, "c.json");
    writeFileSync(f, "{1", "utf8");
    await s.read(f);
    writeFileSync(f, "{22", "utf8"); // autre contenu, même horodatage
    await s.read(f);
    const copies = copiesOf(dir, "c.json").sort();
    assert.deepEqual(copies, [`c.json.invalide-${stamp(fixed)}`, `c.json.invalide-${stamp(fixed)}-1`]);
  } finally {
    cleanup();
  }
});

test("la copie conserve la date de modification de l'original", async () => {
  const { dir, cleanup } = tempDir("mtime");
  try {
    const f = path.join(dir, "d.json");
    writeFileSync(f, "{", "utf8");
    const s = new JsonStore();
    await s.read(f);
    const copy = path.join(dir, copiesOf(dir, "d.json")[0]!);
    assert.ok(Math.abs(statSync(copy).mtimeMs - statSync(f).mtimeMs) < 2000);
  } finally {
    cleanup();
  }
});

test("écriture : nouvel essai si un antivirus bloque le fichier (constat I5)", async () => {
  const { dir, cleanup } = tempDir("lock");
  try {
    let calls = 0;
    const fs = faultyFs({
      rename: async (a, b) => {
        calls++;
        if (calls < 3) throw sysError(calls === 1 ? "EPERM" : "EBUSY");
        const { rename } = await import("node:fs/promises");
        await rename(a, b);
      },
    });
    const f = path.join(dir, "verrou.json");
    await new JsonStore({ fs, sleep: noSleep }).writeAtomic(f, "{}");
    assert.equal(calls, 3);
    assert.equal(readFileSync(f, "utf8"), "{}");
    assert.deepEqual(readdirSync(dir), ["verrou.json"]);
  } finally {
    cleanup();
  }
});

test("écriture : abandon après 10 essais, ancien fichier intact, temporaire supprimé", async () => {
  const { dir, cleanup } = tempDir("giveup");
  try {
    let calls = 0;
    const fs = faultyFs({ rename: async () => { calls++; throw sysError("EPERM"); } });
    const f = path.join(dir, "g.json");
    writeFileSync(f, '{"garde": 1}', "utf8");
    await assert.rejects(new JsonStore({ fs, sleep: noSleep }).writeAtomic(f, "{}"));
    assert.equal(calls, 10);
    assert.equal(readFileSync(f, "utf8"), '{"garde": 1}');
    assert.deepEqual(readdirSync(dir), ["g.json"]);
  } finally {
    cleanup();
  }
});

test("fichier verrouillé à la lecture : jamais réécrit (constat I6)", async () => {
  const { dir, cleanup } = tempDir("i6");
  try {
    const f = path.join(dir, "launcher_config.json");
    writeFileSync(f, '{"ram": 6, "theme": "glace"}', "utf8");
    const fs = faultyFs({
      readFile: async (p) => {
        if (p === f) throw sysError("EACCES");
        const { readFile } = await import("node:fs/promises");
        return readFile(p);
      },
    });
    const s = new JsonStore({ fs });
    assert.equal(await s.read(f), null);
    assert.ok(s.unreadable.has(f));
    await assert.rejects(s.update(f, (d) => ({ ...d, theme: "aurore" })), SettingsUnreadable);
    assert.equal(readFileSync(f, "utf8"), '{"ram": 6, "theme": "glace"}');
  } finally {
    cleanup();
  }
});

test("mise à jour : seules les clés demandées changent, les autres (même inconnues) sont gardées", async () => {
  const { dir, cleanup } = tempDir("merge");
  try {
    const f = path.join(dir, "launcher_config.json");
    const original = { version: "1.20.1", ram: 6, discord: false, fav_popup: true, cle_future: { a: [1, 2] }, theme: "phenix" };
    writeFileSync(f, JSON.stringify(original), "utf8");
    await new JsonStore().update(f, (d) => ({ ...d, theme: "glace" }));
    assert.deepEqual(JSON.parse(readFileSync(f, "utf8")), { ...original, theme: "glace" });
  } finally {
    cleanup();
  }
});

test("mise à jour d'un fichier invalide : copie mise de côté AVANT la réécriture", async () => {
  const { dir, cleanup } = tempDir("rewrite");
  try {
    const f = path.join(dir, "instances_meta.json");
    const broken = '{"C:/a": {"name": "Ma super instance", "fav": true},';
    writeFileSync(f, broken, "utf8");
    const s = new JsonStore();
    await s.update(f, () => ({ "C:/c": { hidden: true } }));
    assert.deepEqual(JSON.parse(readFileSync(f, "utf8")), { "C:/c": { hidden: true } });
    const copies = copiesOf(dir, "instances_meta.json");
    assert.equal(copies.length, 1);
    assert.equal(readFileSync(path.join(dir, copies[0]!), "utf8"), broken);
  } finally {
    cleanup();
  }
});

test("écritures simultanées du même fichier : faites l'une après l'autre, aucune perdue", async () => {
  const { dir, cleanup } = tempDir("queue");
  try {
    const f = path.join(dir, "q.json");
    const s = new JsonStore();
    await Promise.all(Array.from({ length: 20 }, (_, i) => s.update(f, (d) => ({ ...d, [`k${i}`]: i }))));
    const data = JSON.parse(readFileSync(f, "utf8")) as Record<string, number>;
    assert.equal(Object.keys(data).length, 20);
    assert.deepEqual(readdirSync(dir), ["q.json"]);
  } finally {
    cleanup();
  }
});

test("une écriture échouée n'empêche pas les suivantes", async () => {
  const { dir, cleanup } = tempDir("after");
  try {
    const f = path.join(dir, "a.json");
    const s = new JsonStore();
    await assert.rejects(s.update(f, () => { throw new Error("boum"); }));
    await s.update(f, (d) => ({ ...d, ok: true }));
    assert.deepEqual(JSON.parse(readFileSync(f, "utf8")), { ok: true });
  } finally {
    cleanup();
  }
});

test("fichier anormalement gros : jamais chargé, jamais réécrit (revue E1, M4)", async () => {
  const { dir, cleanup } = tempDir("big");
  try {
    const f = path.join(dir, "big.json");
    const content = JSON.stringify({ x: "a".repeat(2000) });
    writeFileSync(f, content, "utf8");
    let reads = 0;
    const fs = faultyFs({
      readFile: async (p) => {
        if (p === f) reads++;
        const { readFile } = await import("node:fs/promises");
        return readFile(p);
      },
    });
    const s = new JsonStore({ fs, maxBytes: 1000 });
    assert.equal(await s.read(f), null);
    assert.equal(reads, 0);
    assert.ok(s.unreadable.has(f));
    await assert.rejects(s.update(f, (d) => ({ ...d, theme: "glace" })), SettingsUnreadable);
    assert.equal(readFileSync(f, "utf8"), content);
  } finally {
    cleanup();
  }
});

test("fichier invalide dont la copie échoue : jamais remplacé (revue E1, C1)", async () => {
  const { dir, cleanup } = tempDir("c1");
  try {
    const f = path.join(dir, "launcher_config.json");
    writeFileSync(f, '{"ram": 6, "version": "1.20', "utf8");
    let failCopy = true;
    const fs = faultyFs({
      writeNew: async (p, d) => {
        if (failCopy) throw sysError("ENOSPC");
        const { writeFile } = await import("node:fs/promises");
        await writeFile(p, d, { flag: "wx" });
      },
    });
    const s = new JsonStore({ fs });
    assert.equal(await s.read(f), null);
    assert.deepEqual(s.takeInvalidFiles(), [{ file: f, copy: null }]);
    await assert.rejects(s.update(f, (d) => ({ ...d, theme: "glace" })), SettingsNotBackedUp);
    await assert.rejects(s.update(f, (d) => ({ ...d, theme: "glace" })), SettingsNotBackedUp);
    assert.equal(readFileSync(f, "utf8"), '{"ram": 6, "version": "1.20');
    // La copie redevient possible : elle est retentée, puis seulement le fichier est remplacé
    failCopy = false;
    const r = await s.update(f, (d) => ({ ...d, theme: "glace" }));
    const copies = copiesOf(dir, "launcher_config.json");
    assert.equal(copies.length, 1);
    assert.equal(readFileSync(path.join(dir, copies[0]!), "utf8"), '{"ram": 6, "version": "1.20');
    assert.equal(r.reset?.copy, path.join(dir, copies[0]!));
    assert.deepEqual(JSON.parse(readFileSync(f, "utf8")), { theme: "glace" });
  } finally {
    cleanup();
  }
});

test("mise à jour d'un fichier valide : reset = null", async () => {
  const { dir, cleanup } = tempDir("noreset");
  try {
    const f = path.join(dir, "a.json");
    writeFileSync(f, '{"ram": 6}', "utf8");
    const r = await new JsonStore().update(f, (d) => ({ ...d, theme: "glace" }));
    assert.equal(r.reset, null);
    assert.deepEqual(r.data, { ram: 6, theme: "glace" });
  } finally {
    cleanup();
  }
});

test("copie de côté = exactement les octets jugés invalides (revue E1, M2)", async () => {
  const { dir, cleanup } = tempDir("m2");
  try {
    const f = path.join(dir, "c.json");
    writeFileSync(f, "{abîmé", "utf8");
    // Un autre programme réécrit le fichier juste après la lecture : la copie garde l'ancien contenu
    const fs = faultyFs({
      readdir: async (p) => {
        writeFileSync(f, '{"nouveau": true}', "utf8");
        const { readdir } = await import("node:fs/promises");
        return readdir(p);
      },
    });
    const s = new JsonStore({ fs });
    assert.equal(await s.read(f), null);
    const copies = copiesOf(dir, "c.json");
    assert.equal(copies.length, 1);
    assert.equal(readFileSync(path.join(dir, copies[0]!), "utf8"), "{abîmé");
  } finally {
    cleanup();
  }
});

test("fichier modifié par un autre programme pendant la mise à jour : recommencée (revue E1, M2)", async () => {
  const { dir, cleanup } = tempDir("race");
  try {
    const f = path.join(dir, "launcher_config.json");
    writeFileSync(f, '{"ram": 6}', "utf8");
    let once = true;
    const fs = faultyFs({
      writeFileSynced: async (p, d) => {
        if (once) {
          once = false;
          writeFileSync(f, '{"ram": 8, "python": true}', "utf8"); // écriture par la version Python
        }
        const { writeFile } = await import("node:fs/promises");
        await writeFile(p, d, { flag: "wx" });
      },
    });
    const r = await new JsonStore({ fs }).update(f, (d) => ({ ...d, theme: "glace" }));
    assert.deepEqual(r.data, { ram: 8, python: true, theme: "glace" });
    assert.deepEqual(JSON.parse(readFileSync(f, "utf8")), { ram: 8, python: true, theme: "glace" });
    assert.deepEqual(readdirSync(dir), ["launcher_config.json"]);
  } finally {
    cleanup();
  }
});

test("fichier modifié sans cesse : abandon sans rien écrire", async () => {
  const { dir, cleanup } = tempDir("busy");
  try {
    const f = path.join(dir, "b.json");
    writeFileSync(f, '{"n": 0}', "utf8");
    let n = 0;
    const fs = faultyFs({
      writeFileSynced: async (p, d) => {
        writeFileSync(f, JSON.stringify({ n: ++n, pad: "x".repeat(n) }), "utf8");
        const { writeFile } = await import("node:fs/promises");
        await writeFile(p, d, { flag: "wx" });
      },
    });
    await assert.rejects(new JsonStore({ fs }).update(f, (d) => ({ ...d, theme: "glace" })), SettingsBusy);
    assert.equal(JSON.parse(readFileSync(f, "utf8")).theme, undefined);
    assert.deepEqual(readdirSync(dir), ["b.json"]);
  } finally {
    cleanup();
  }
});
