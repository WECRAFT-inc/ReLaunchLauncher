import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { curseforgeThumb, findArt } from "../src/main/instances/art";
import type { Instance } from "../src/main/instances/formats";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const inst = (folder: string, source: Instance["source"], extra: Partial<Instance> = {}): Instance => ({ name: "x", folder, path: folder, version: null, loader: null, loaderVersion: null, ram: null, source, ...extra });

test("image d'instance : CurseForge (image du profil, sinon vignette), Modrinth, Prism, icon.png", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "rl-art-"));
  try {
    // CurseForge : vignette du modpack
    const cf = path.join(root, "cf");
    await mkdir(cf);
    await writeFile(path.join(cf, "minecraftinstance.json"), JSON.stringify({ name: "ATM10", installedModpack: { thumbnailUrl: "https://media.forgecdn.net/avatars/thumbnails/1/2/256/256/atm.png" } }));
    assert.deepEqual(await findArt(inst(cf, "CurseForge")), { url: "https://media.forgecdn.net/avatars/thumbnails/1/2/256/256/atm.png" });
    // … mais l'image personnalisée du profil passe avant
    const own = path.join(root, "profil.png");
    await writeFile(own, PNG);
    await writeFile(path.join(cf, "minecraftinstance.json"), JSON.stringify({ profileImagePath: own, installedModpack: { thumbnailUrl: "https://media.forgecdn.net/a.png" } }));
    assert.deepEqual(await findArt(inst(cf, "CurseForge")), { file: own });
    // Modrinth : icon_path de app.db
    const mr = path.join(root, "mr");
    await mkdir(mr);
    assert.deepEqual(await findArt(inst(mr, "Modrinth", { iconHint: own })), { file: own });
    // Prism : iconKey → <prism>/icons/<clé>.png
    const prism = path.join(root, "prism");
    const pi = path.join(prism, "instances", "Pack");
    await mkdir(path.join(prism, "icons"), { recursive: true });
    await mkdir(pi, { recursive: true });
    await writeFile(path.join(prism, "icons", "monpack.png"), PNG);
    await writeFile(path.join(pi, "instance.cfg"), "[General]\r\niconKey=monpack\r\nname=Pack\r\n");
    assert.deepEqual(await findArt(inst(pi, "Prism"), { prismDir: prism }), { file: path.join(prism, "icons", "monpack.png") });
    // icône intégrée de Prism (pas de fichier) : rien
    await writeFile(path.join(pi, "instance.cfg"), "iconKey=flame\n");
    assert.equal(await findArt(inst(pi, "Prism"), { prismDir: prism }), null);
    // icon.png dans le dossier
    const wc = path.join(root, "wc");
    await mkdir(wc);
    await writeFile(path.join(wc, "icon.png"), PNG);
    assert.deepEqual(await findArt(inst(wc, "WeCraft")), { file: path.join(wc, "icon.png") });
    // clé Prism piégée : ignorée
    await writeFile(path.join(pi, "instance.cfg"), "iconKey=../../secret\n");
    assert.equal(await findArt(inst(pi, "Prism"), { prismDir: prism }), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("vignette CurseForge : seulement en HTTPS sur media.forgecdn.net", () => {
  assert.equal(curseforgeThumb("https://media.forgecdn.net/avatars/1.png"), "https://media.forgecdn.net/avatars/1.png");
  assert.equal(curseforgeThumb("http://media.forgecdn.net/avatars/1.png"), null);
  assert.equal(curseforgeThumb("https://evil.example/1.png"), null);
  assert.equal(curseforgeThumb("https://media.forgecdn.net/page.html"), null);
});
