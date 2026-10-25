// Images de l'interface : type réel vérifié, noms opaques, aucun téléchargement d'une adresse fournie par
// l'interface, cache, captures listées par jeton, recadrage.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { cropRect, MediaStore, sniffImage, type ImageOps } from "../src/main/media/media";
import { fakeFetch } from "./fakeNet";
import { tempDir } from "./helpers";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("IHDR-fake-png")]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("fake-jpeg")]);
/** Fausses opérations : « décodent » PNG et JPEG, image de 400×300. */
const ops: ImageOps & { crops: unknown[] } = {
  crops: [],
  size: (b) => (sniffImage(b) === "png" || sniffImage(b) === "jpeg" ? { width: 400, height: 300 } : null),
  cropSquare(_b, r, out) {
    this.crops.push({ r, out });
    return Buffer.concat([PNG, Buffer.from(JSON.stringify(r))]);
  },
  shrinkJpeg: (b) => Buffer.concat([JPG, b.subarray(0, 4)]),
};

test("type réel d'une image : PNG, JPEG, GIF, WebP seulement (jamais SVG ni HTML)", () => {
  assert.equal(sniffImage(PNG), "png");
  assert.equal(sniffImage(JPG), "jpeg");
  assert.equal(sniffImage(Buffer.from("GIF89a......")), "gif");
  assert.equal(sniffImage(Buffer.from("RIFF\0\0\0\0WEBPVP8 ")), "webp");
  for (const bad of ['<svg xmlns="http://www.w3.org/2000/svg" onload="x()">', "<html><script>", "MZ\x90\0", ""]) assert.equal(sniffImage(Buffer.from(bad)), null);
});

test("cadrage carré : toujours dans l'image, zoom et centre bornés", () => {
  assert.deepEqual(cropRect(400, 300, { zoom: 1, cx: 0.5, cy: 0.5 }), { x: 50, y: 0, size: 300 });
  assert.deepEqual(cropRect(400, 300, { zoom: 2, cx: 0, cy: 1 }), { x: 0, y: 150, size: 150 });
  assert.deepEqual(cropRect(400, 300, { zoom: 99, cx: 9, cy: -9 }), { x: 325, y: 0, size: 75 });
  assert.deepEqual(cropRect(400, 300, { zoom: NaN, cx: NaN, cy: NaN }), { x: 50, y: 0, size: 300 });
});

test("images Modrinth : seules les adresses vues dans l'API et d'un hôte autorisé sont téléchargées, puis gardées en cache", async () => {
  const { dir, cleanup } = tempDir("media-remote");
  try {
    const log: string[] = [];
    const icon = "https://cdn.modrinth.com/data/AANobbMI/icon.png";
    const m = new MediaStore({ dataDir: dir, ops, net: { fetch: fakeFetch({ [icon]: { body: PNG }, "https://cdn.modrinth.com/data/x/page.png": { body: "<html>pas une image</html>" } }, log) } });
    const url = m.remoteUrl(icon)!;
    assert.match(url, /^app:\/\/wecraft\/remote\/[0-9a-f]{64}$/);
    for (const bad of ["http://cdn.modrinth.com/a.png", "https://evil.example/a.png", "https://cdn.modrinth.com/a.svg", "https://cdn.modrinth.com/a.svg?x=1", "javascript:alert(1)", 42, "https://user:pw@cdn.modrinth.com/a.png"])
      assert.equal(m.remoteUrl(bad), null, String(bad));
    const key = url.split("/").pop()!;
    const r = await m.serve(`/remote/${key}`);
    assert.deepEqual([r!.status, r!.type], [200, "image/png"]);
    // seconde fois : depuis le cache disque, même sans l'adresse en mémoire (nouveau démarrage)
    const m2 = new MediaStore({ dataDir: dir, ops, net: { fetch: fakeFetch({}, log) } });
    assert.equal((await m2.serve(`/remote/${key}`))!.status, 200);
    assert.equal(log.length, 1, "une seule requête réseau");
    // clé inconnue (jamais vue) : rien n'est téléchargé
    assert.equal((await m2.serve(`/remote/${"0".repeat(64)}`))!.status, 404);
    // réponse qui n'est pas une image : refusée, pas gardée
    const notImg = m.remoteUrl("https://cdn.modrinth.com/data/x/page.png")!;
    assert.equal((await m.serve(`/remote/${notImg.split("/").pop()}`))!.status, 404);
    for (const p of ["/remote/../../x", "/remote/ABC", "/user/icons/../../launcher_config.json", "/user/x", "/shot/zz"]) assert.equal((await m.serve(p))!.status, 404, p);
    assert.equal(await m.serve("/index.html"), null, "le reste de l'interface n'est pas concerné");
  } finally {
    cleanup();
  }
});

test("icône importée : vérifiée, recadrée en 256 px, servie sous un nom opaque ; fond copié dans .wecraft", async () => {
  const { dir, cleanup } = tempDir("media-import");
  try {
    const m = new MediaStore({ dataDir: dir, ops });
    await assert.rejects(m.importIconSource(Buffer.from("<svg/>")), /PNG ou JPEG/);
    await assert.rejects(m.importIconSource(Buffer.alloc(16 * 1024 * 1024)), /trop lourde/);
    const src = await m.importIconSource(PNG);
    assert.deepEqual([src.width, src.height, src.ext], [400, 300, "png"]);
    assert.equal((await m.serve(new URL(src.url).pathname))!.status, 200);
    const name = await m.makeIcon(src.key, src.ext, { zoom: 2, cx: 0.5, cy: 0.5 });
    assert.match(name, /^[0-9a-f]{64}\.png$/);
    assert.deepEqual(ops.crops.at(-1), { r: { x: 125, y: 75, size: 150 }, out: 256 });
    assert.equal((await m.serve(`/user/icons/${name}`))!.type, "image/png");
    await assert.rejects(m.makeIcon("../x", "png", { zoom: 1, cx: 0.5, cy: 0.5 }), /introuvable/);
    await assert.rejects(m.makeIcon(src.key, "exe", { zoom: 1, cx: 0.5, cy: 0.5 }), /introuvable/);
    const bg = await m.importBackground(JPG);
    assert.match(bg, /^[0-9a-f]{64}\.jpg$/);
    assert.ok(readFileSync(path.join(dir, "backgrounds", bg)).subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])));
  } finally {
    cleanup();
  }
});

test("captures d'une instance : listées par jeton (jamais de chemin), seulement png/jpg du dossier screenshots", async () => {
  const { dir, cleanup } = tempDir("media-shots");
  try {
    const game = path.join(dir, "Pack");
    mkdirSync(path.join(game, "screenshots"), { recursive: true });
    writeFileSync(path.join(game, "screenshots", "2026-01-01_10.00.00.png"), PNG);
    writeFileSync(path.join(game, "screenshots", "notes.txt"), "x");
    writeFileSync(path.join(game, "screenshots", "faux.png"), "<html>");
    writeFileSync(path.join(dir, "secret.png"), PNG);
    const m = new MediaStore({ dataDir: path.join(dir, "wecraft"), ops });
    const shots = await m.screenshots(game, (d) => readdir(d));
    assert.deepEqual(shots.map((s) => s.name).sort(), ["2026-01-01_10.00.00.png", "faux.png"]);
    const ok = shots.find((s) => s.name.startsWith("2026"))!;
    assert.match(ok.url, /^app:\/\/wecraft\/shot\/[0-9a-f]{32}$/);
    assert.equal((await m.serve(`/shot/${ok.token}`))!.status, 200);
    assert.equal((await m.serve(`/shot/${shots.find((s) => s.name === "faux.png")!.token}`))!.status, 404, "contenu qui n'est pas une image");
    assert.equal(await m.screenshots(path.join(dir, "absent"), (d) => readdir(d)).then((l) => l.length), 0);
    const bg = await m.backgroundFromShot(ok.token);
    assert.match(bg, /\.jpg$/);
    await assert.rejects(m.backgroundFromShot("f".repeat(32)), /introuvable/);
  } finally {
    cleanup();
  }
});
