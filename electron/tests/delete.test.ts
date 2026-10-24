// Lot E8 : suppression d'instance (corbeille uniquement), port de safe_to_delete et delete_instance.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { safeToDelete } from "../src/main/instances/delete";
import { instancesDir, launcherDirs, metaKey } from "../src/main/instances/detect";
import { InstanceService } from "../src/main/instances/service";
import { minecraftDir, wecraftDataDir, type PathEnv } from "../src/main/paths";
import { JsonStore } from "../src/main/storage/jsonStore";
import { tempDir } from "./helpers";

const envFor = (home: string): PathEnv => ({ platform: "linux", env: { HOME: home }, home });

test("safe_to_delete : seulement un sous-dossier d'un dossier d'instances (tests Python portés + pièges)", async () => {
  const { dir, cleanup } = tempDir("e8-sur");
  try {
    const e = envFor(dir);
    const root = path.join(dir, "a", "b", "instances");
    mkdirSync(path.join(root, "MonPack", "mods"), { recursive: true });
    mkdirSync(path.join(dir, "a", "b", "Documents"), { recursive: true });
    const roots = [root];
    assert.equal(await safeToDelete(path.join(root, "MonPack"), e, roots), true);
    assert.equal(await safeToDelete(root, e, roots), false, "le dossier racine lui-même");
    assert.equal(await safeToDelete(path.join(dir, "a", "b", "Documents"), e, roots), false, "hors des dossiers d'instances");
    assert.equal(await safeToDelete(path.join(root, "MonPack", "..", ".."), e, roots), false, "remontée par ..");
    assert.equal(await safeToDelete(path.join(root, "Absent"), e, roots), false, "dossier absent");
    writeFileSync(path.join(root, "fichier"), "x");
    assert.equal(await safeToDelete(path.join(root, "fichier"), e, roots), false, "pas un dossier");
    // lien vers un dossier extérieur : résolu, refusé
    symlinkSync(path.join(dir, "a", "b", "Documents"), path.join(root, "Lien"));
    assert.equal(await safeToDelete(path.join(root, "Lien"), e, roots), false, "lien vers l'extérieur");
    // dossier d'instances qui contient un dossier protégé (.minecraft, dossier WeCraft, dossier personnel)
    const tricky = path.join(dir, "x", "y", "instances");
    mkdirSync(path.join(tricky, "Piège"), { recursive: true });
    const e2: PathEnv = { platform: "linux", env: { HOME: path.join(tricky, "Piège", "maison") }, home: path.join(tricky, "Piège", "maison") };
    mkdirSync(e2.home, { recursive: true });
    assert.equal(await safeToDelete(path.join(tricky, "Piège"), e2, [tricky]), false, "contient le dossier personnel");
    assert.equal(await safeToDelete(dir, e, [path.dirname(dir)]), false, "le dossier personnel lui-même");
    assert.equal(await safeToDelete("/tmp", e, ["/"]), false, "trop près de la racine");
    // vrais emplacements : dossier WeCraft et .minecraft jamais supprimables
    mkdirSync(path.join(instancesDir(e), "Pack"), { recursive: true });
    mkdirSync(minecraftDir(e), { recursive: true });
    assert.equal(await safeToDelete(path.join(instancesDir(e), "Pack"), e), true);
    assert.equal(await safeToDelete(instancesDir(e), e), false);
    assert.equal(await safeToDelete(wecraftDataDir(e), e), false);
    assert.equal(await safeToDelete(minecraftDir(e), e), false);
  } finally {
    cleanup();
  }
});

test("suppression : corbeille puis réglages oubliés ; refus et corbeille impossible = rien d'effacé", async () => {
  const { dir, cleanup } = tempDir("e8-service");
  try {
    const e = envFor(dir);
    const local = instancesDir(e);
    mkdirSync(path.join(local, "Garder", "saves"), { recursive: true });
    mkdirSync(path.join(local, "Jeter", "saves"), { recursive: true });
    const cf = launcherDirs(e).curseforge[0]!;
    mkdirSync(path.join(cf, "PackCF"), { recursive: true });
    writeFileSync(path.join(cf, "PackCF", "minecraftinstance.json"), JSON.stringify({ name: "Pack CF", gameVersion: "1.20.1" }));
    const svc = new InstanceService(new JsonStore(), e);
    const metaFile = svc.metaFile;
    mkdirSync(path.dirname(metaFile), { recursive: true });
    writeFileSync(
      metaFile,
      JSON.stringify({ [metaKey(path.join(local, "Jeter"), "linux")]: { fav: true }, [metaKey(path.join(local, "Garder"), "linux")]: { name: "G" } }),
    );
    const list = (await svc.list()).instances;
    const id = (n: string) => list.find((i) => i.name === n)!.id;
    const trashed: string[] = [];
    const trash = async (f: string) => void trashed.push(f);

    // corbeille impossible : rien n'est touché
    assert.deepEqual(
      await svc.remove(id("Jeter"), async () => {
        throw new Error("corbeille pleine");
      }),
      { ok: false, reason: "trash-failed" },
    );
    assert.ok(existsSync(path.join(local, "Jeter", "saves")));
    assert.ok(readFileSync(metaFile, "utf8").includes("Jeter"));

    assert.deepEqual(await svc.remove(id("Jeter"), trash), { ok: true, metaForgotten: true });
    assert.deepEqual(trashed, [path.join(local, "Jeter")]);
    const meta = JSON.parse(readFileSync(metaFile, "utf8"));
    assert.deepEqual(Object.keys(meta), [metaKey(path.join(local, "Garder"), "linux")], "seule l'entrée supprimée est oubliée");
    assert.deepEqual(await svc.remove(id("Jeter"), trash), { ok: false, reason: "invalid" }, "identifiant oublié");

    // instance CurseForge : son dossier est dans un dossier d'instances connu, supprimable
    assert.deepEqual(await svc.remove(id("Pack CF"), trash), { ok: true, metaForgotten: true });
    assert.deepEqual(await svc.remove("../../etc", trash), { ok: false, reason: "invalid" });
    assert.equal(trashed.length, 2);
  } finally {
    cleanup();
  }
});
