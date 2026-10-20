// Java de Mojang (lot E3, constats X2 et X8) avec un réseau simulé.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  installJavaRuntime,
  JAVA_RUNTIMES_URL,
  javaComponentOf,
  mojangPlatform,
  runtimeDir,
  safeJoin,
} from "../src/main/install/javaRuntime";
import { IntegrityError, UnsafeUrlError } from "../src/main/net/download";
import { fakeFetch, type Route } from "./fakeNet";
import { tempDir } from "./helpers";

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");
const P = "https://piston-meta.mojang.com/v1/objects/";
const D = "https://piston-data.mojang.com/v1/objects/";

function world(files: Record<string, unknown>, opts: { tamperManifest?: boolean } = {}) {
  const manifest = JSON.stringify({ files });
  const all = JSON.stringify({
    "windows-x64": {
      "java-runtime-delta": [
        { manifest: { sha1: sha1(opts.tamperManifest ? "autre" : manifest), size: manifest.length, url: `${P}m.json` }, version: { name: "21.0.7" } },
      ],
    },
  });
  return { [JAVA_RUNTIMES_URL]: { body: all }, [`${P}m.json`]: { body: manifest } } as Record<string, Route>;
}

const file = (content: string, name: string) => ({
  type: "file",
  executable: false,
  downloads: { raw: { sha1: sha1(content), size: content.length, url: `${D}${name}` } },
});

test("plateforme et composant comme minecraft_launcher_lib", () => {
  assert.equal(mojangPlatform("win32", "x64"), "windows-x64");
  assert.equal(mojangPlatform("win32", "arm64"), "windows-arm64");
  assert.equal(javaComponentOf({ javaVersion: { component: "java-runtime-delta", majorVersion: 21 } }), "java-runtime-delta");
  assert.equal(javaComponentOf({}), "jre-legacy");
  assert.equal(javaComponentOf({ javaVersion: { component: "../../x" } }), "jre-legacy");
  assert.equal(
    runtimeDir("C:/mc", "java-runtime-delta", "windows-x64"),
    path.join("C:/mc", "runtime", "java-runtime-delta", "windows-x64", "java-runtime-delta"),
  );
  assert.throws(() => runtimeDir("C:/mc", "../x", "windows-x64"));
});

test("chemins du manifeste : impossible de sortir du dossier Java", () => {
  const root = path.join(path.sep, "r");
  assert.equal(safeJoin(root, "bin/java.exe"), path.join(root, "bin", "java.exe"));
  for (const bad of ["../x", "bin/../../x", "/etc/x", "C:/Windows/x", "a\\..\\x", "a//b", "./a", ""]) {
    assert.throws(() => safeJoin(root, bad), IntegrityError, bad);
  }
});

test("installation complète, puis seconde fois sans rien télécharger", async () => {
  const { dir, cleanup } = tempDir("java");
  try {
    const files = {
      bin: { type: "directory" },
      "bin/java.exe": file("JAVA", "java"),
      "lib/modules": file("MODULES", "modules"),
      "legal/lien": { type: "link", target: "../bin" },
    };
    const routes = { ...world(files), [`${D}java`]: { body: "JAVA" }, [`${D}modules`]: { body: "MODULES" } };
    const steps: number[] = [];
    const r = await installJavaRuntime(dir, "java-runtime-delta", {
      platform: "windows-x64",
      fetch: fakeFetch(routes),
      onProgress: (p) => steps.push(p.filesDone),
    });
    assert.equal(r.version, "21.0.7");
    assert.equal(r.downloaded, 2);
    assert.equal(r.executable, path.join(dir, "runtime", "java-runtime-delta", "windows-x64", "java-runtime-delta", "bin", "java.exe"));
    assert.equal(readFileSync(r.executable, "utf8"), "JAVA");
    assert.deepEqual(steps, [0, 1, 2]);

    const log: string[] = [];
    const again = await installJavaRuntime(dir, "java-runtime-delta", { platform: "windows-x64", fetch: fakeFetch(routes, log) });
    assert.equal(again.downloaded, 0);
    assert.ok(!log.some((u) => u.startsWith(D)));
  } finally {
    cleanup();
  }
});

test("fichier local abîmé : retéléchargé", async () => {
  const { dir, cleanup } = tempDir("java-fix");
  try {
    const files = { "bin/java.exe": file("JAVA", "java") };
    const routes = { ...world(files), [`${D}java`]: { body: "JAVA" } };
    const exe = path.join(runtimeDir(dir, "java-runtime-delta", "windows-x64"), "bin", "java.exe");
    mkdirSync(path.dirname(exe), { recursive: true });
    writeFileSync(exe, "ABIMÉ", "utf8");
    const r = await installJavaRuntime(dir, "java-runtime-delta", { platform: "windows-x64", fetch: fakeFetch(routes) });
    assert.equal(r.downloaded, 1);
    assert.equal(readFileSync(exe, "utf8"), "JAVA");
  } finally {
    cleanup();
  }
});

test("manifeste modifié en route : refusé, rien n'est téléchargé (constat X2)", async () => {
  const { dir, cleanup } = tempDir("java-manifest");
  try {
    const log: string[] = [];
    const routes = { ...world({ "bin/java.exe": file("JAVA", "java") }, { tamperManifest: true }), [`${D}java`]: { body: "JAVA" } };
    await assert.rejects(
      installJavaRuntime(dir, "java-runtime-delta", { platform: "windows-x64", fetch: fakeFetch(routes, log) }),
      IntegrityError,
    );
    assert.ok(!log.some((u) => u.startsWith(D)));
    assert.equal(existsSync(path.join(dir, "runtime")), false);
  } finally {
    cleanup();
  }
});

test("fichier Java modifié en route : échec, java.exe absent, jamais « prêt »", async () => {
  const { dir, cleanup } = tempDir("java-file");
  try {
    const routes = { ...world({ "bin/java.exe": file("JAVA", "java") }), [`${D}java`]: { body: "JAVX" } };
    await assert.rejects(installJavaRuntime(dir, "java-runtime-delta", { platform: "windows-x64", fetch: fakeFetch(routes) }), IntegrityError);
    assert.equal(existsSync(path.join(runtimeDir(dir, "java-runtime-delta", "windows-x64"), "bin", "java.exe")), false);
  } finally {
    cleanup();
  }
});

test("manifeste malveillant : chemin hors du dossier ou adresse non autorisée refusés avant tout écrit", async () => {
  const { dir, cleanup } = tempDir("java-evil");
  try {
    const escape = { ...world({ "../../../evil.exe": file("X", "x") }), [`${D}x`]: { body: "X" } };
    await assert.rejects(installJavaRuntime(dir, "java-runtime-delta", { platform: "windows-x64", fetch: fakeFetch(escape) }), IntegrityError);
    assert.equal(existsSync(path.join(dir, "evil.exe")), false);

    const evilUrl = {
      ...world({ "bin/java.exe": { type: "file", downloads: { raw: { sha1: sha1("X"), size: 1, url: "http://evil.example/x" } } } }),
    };
    await assert.rejects(installJavaRuntime(dir, "java-runtime-delta", { platform: "windows-x64", fetch: fakeFetch(evilUrl) }), UnsafeUrlError);
  } finally {
    cleanup();
  }
});

test("composant inconnu : message clair", async () => {
  const { dir, cleanup } = tempDir("java-none");
  try {
    await assert.rejects(
      installJavaRuntime(dir, "jre-legacy", { platform: "windows-x64", fetch: fakeFetch(world({})) }),
      /indisponible/,
    );
  } finally {
    cleanup();
  }
});

test("fichier exécutable : droits posés hors Windows", { skip: process.platform === "win32" }, async () => {
  const { dir, cleanup } = tempDir("java-exec");
  try {
    const f = { ...file("JAVA", "java"), executable: true };
    const routes = { ...world({ "bin/java.exe": f }), [`${D}java`]: { body: "JAVA" } };
    const r = await installJavaRuntime(dir, "java-runtime-delta", { platform: "windows-x64", fetch: fakeFetch(routes) });
    assert.ok((statSync(r.executable).mode & 0o111) !== 0);
  } finally {
    cleanup();
  }
});
