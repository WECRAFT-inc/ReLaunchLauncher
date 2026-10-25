// Garde-fous autour de xmcl (lot E3) : adresses, empreintes obligatoires, téléchargement vérifié.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { IntegrityError, UnsafeUrlError } from "../src/main/net/download";
import { allowedUrls, hardenFiles, publishedSha1, refuseJava, safeDownloader, type InstallFile } from "../src/main/install/xmcl";
import { fakeFetch } from "./fakeNet";
import { tempDir } from "./helpers";

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");
const L = "https://libraries.minecraft.net/";
const F = "https://maven.fabricmc.net/";

test("adresses : seuls les serveurs officiels en HTTPS sont gardés", () => {
  assert.deepEqual(
    allowedUrls([`${L}a.jar`, "https://repo1.maven.org/maven2/a.jar", "http://files.minecraftforge.net/a.jar", "https://bmclapi2.bangbang93.com/a", `${L}a.jar`]),
    [`${L}a.jar`],
  );
});

test("préparation : aucune confiance sur la taille ou la date, adresses filtrées", async () => {
  const files: InstallFile[] = [
    {
      path: "/x/a.png",
      urls: ["https://bmclapi2.bangbang93.com/a", "https://resources.download.minecraft.net/ab/abcd"],
      size: 4,
      checksum: { algorithm: "sha1", value: sha1("DATA").toUpperCase() },
      trustExistingSize: true,
      validatedAt: 123,
    },
  ];
  const [f] = await hardenFiles(files, { fetch: fakeFetch({}) });
  assert.deepEqual(f, {
    path: "/x/a.png",
    urls: ["https://resources.download.minecraft.net/ab/abcd"],
    size: 4,
    checksum: { algorithm: "sha1", value: sha1("DATA") },
  });
});

test("préparation : fichier sans empreinte -> « .sha1 » publié par le dépôt Maven (constat X6)", async () => {
  const log: string[] = [];
  const f = fakeFetch({ [`${F}loader.jar.sha1`]: { body: `${sha1("JAR")}  loader.jar\n` } }, log);
  const [h] = await hardenFiles([{ path: "/x/loader.jar", urls: [`${F}loader.jar`], validator: "zip" }], { fetch: f });
  assert.equal(h?.checksum?.value, sha1("JAR"));
  assert.equal(h?.validator, "zip");
  assert.deepEqual(log, [`${F}loader.jar.sha1`]);
});

test("préparation : sans empreinte publiée, le fichier est refusé", async () => {
  await assert.rejects(hardenFiles([{ path: "/x/a.jar", urls: [`${F}a.jar`] }], { fetch: fakeFetch({}) }), IntegrityError);
  // profil de loader qui ferait écrire hors de .minecraft : refusé avant tout téléchargement
  const mc = path.resolve("/x/.minecraft");
  await assert.rejects(hardenFiles([{ path: path.join(mc, "libraries", "..", "..", "evil.jar"), urls: [`${F}a.jar`] }], { fetch: fakeFetch({}) }, new Map(), mc), /hors du dossier/);
  const bad = fakeFetch({ [`${F}a.jar.sha1`]: { body: "<html>pas une empreinte</html>" } });
  await assert.rejects(publishedSha1([`${F}a.jar`], { fetch: bad }), IntegrityError);
});

test("préparation : fichier sans adresse autorisée refusé", async () => {
  await assert.rejects(
    hardenFiles([{ path: "/x/a.jar", urls: ["http://evil.example/a.jar"], checksum: { algorithm: "sha1", value: sha1("x") } }]),
    UnsafeUrlError,
  );
});

test("téléchargement : vérifié, adresse suivante si la première échoue, progression réelle", async () => {
  const { dir, cleanup } = tempDir("xmcl-dl");
  try {
    const dest = path.join(dir, "lib", "a.jar");
    const steps: number[] = [];
    const download = safeDownloader({
      fetch: fakeFetch({ [`${L}a.jar`]: { status: 503 }, [`${F}a.jar`]: { body: "JAR" } }),
      onProgress: (p) => steps.push(p.filesDone),
    });
    await download([{ path: dest, urls: [`${L}a.jar`, `${F}a.jar`], size: 3, checksum: { algorithm: "sha1", value: sha1("JAR") } }]);
    assert.equal(readFileSync(dest, "utf8"), "JAR");
    assert.deepEqual(steps, [0, 1]);
  } finally {
    cleanup();
  }
});

test("téléchargement : contenu modifié en route -> échec, ancien fichier intact (constat X1)", async () => {
  const { dir, cleanup } = tempDir("xmcl-bad");
  try {
    const dest = path.join(dir, "a.jar");
    writeFileSync(dest, "ANCIEN", "utf8");
    const download = safeDownloader({ fetch: fakeFetch({ [`${L}a.jar`]: { body: "PIEGE" } }) });
    await assert.rejects(download([{ path: dest, urls: [`${L}a.jar`], checksum: { algorithm: "sha1", value: sha1("JAR") } }]), IntegrityError);
    assert.equal(readFileSync(dest, "utf8"), "ANCIEN");
    await assert.rejects(download([{ path: path.join(dir, "b.jar"), urls: [`${L}b.jar`] }]), IntegrityError);
    assert.equal(existsSync(path.join(dir, "b.jar")), false);
  } finally {
    cleanup();
  }
});

test("commande Java inattendue : refusée", async () => {
  await assert.rejects(refuseJava({ executable: "java", args: ["-jar", "x.jar"] }), /refusée/);
});
