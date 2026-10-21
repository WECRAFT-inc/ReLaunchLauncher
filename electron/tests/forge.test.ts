// Forge / NeoForge (lot E3) : choix de version et garde-fous du plan (commandes Java, écritures).
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import {
  checkJavaCommand,
  chooseForgeVersion,
  hardenPlan,
  installerFile,
  isModernForgeMc,
  neoForgePrefix,
  parseMavenVersions,
  runJavaCommand,
  UnsafePlanError,
} from "../src/main/install/forge";
import { fakeFetch } from "./fakeNet";

const MC = path.resolve("/tmp/mc-test");
const JAVA = path.join(MC, "runtime", "java-runtime-delta", "windows-x64", "java-runtime-delta", "bin", "java.exe");
const lib = (...p: string[]) => path.join(MC, "libraries", ...p);

test("métadonnées Maven, préfixes NeoForge, versions prises en charge", () => {
  assert.deepEqual(parseMavenVersions("<versions><version>1.20.1-47.1.0</version><version> 1.20.1-47.2.0 </version><version>bad version</version></versions>"), ["1.20.1-47.1.0", "1.20.1-47.2.0"]);
  assert.equal(neoForgePrefix("1.21.1"), "21.1.");
  assert.equal(neoForgePrefix("1.21"), "21.0.");
  assert.equal(neoForgePrefix("24w14a"), null);
  assert.ok(isModernForgeMc("1.13.2") && isModernForgeMc("1.21.4") && !isModernForgeMc("1.12.2") && !isModernForgeMc("1.7.10"));
});

test("choix de version comme ensure_loader (exacte, sinon recommandée, sinon la plus récente stable)", () => {
  const forge = ["1.20.1-47.1.0", "1.20.1-47.2.0", "1.20.1-47.3.0"];
  assert.deepEqual(chooseForgeVersion("Forge", "1.20.1", forge, "47.2.0"), { project: "forge", artifact: "1.20.1-47.2.0", note: null });
  assert.equal(chooseForgeVersion("Forge", "1.20.1", forge, null, "1.20.1-47.1.0").artifact, "1.20.1-47.1.0");
  assert.equal(chooseForgeVersion("Forge", "1.20.1", forge, null).artifact, "1.20.1-47.3.0");
  assert.equal(chooseForgeVersion("Forge", "1.20.1", forge, "1.0").note, "Forge 1.0 introuvable : dernière version utilisée.");
  const neo = ["21.1.1", "21.1.5", "21.1.6-beta"];
  assert.deepEqual(chooseForgeVersion("NeoForge", "1.21.1", neo, null), { project: "neoforge", artifact: "21.1.5", note: null });
  assert.equal(chooseForgeVersion("NeoForge", "1.20.1", ["1.20.1-47.1.106"], "47.1.106").project, "forge");
  assert.throws(() => chooseForgeVersion("NeoForge", "1.19.2", [], null), /ne supporte pas/);
});

test("installeur : chemin dans libraries, serveur officiel", () => {
  const f = installerFile(MC, "NeoForge", { project: "neoforge", artifact: "21.1.5", note: null });
  assert.equal(f.path, lib("net", "neoforged", "neoforge", "21.1.5", "neoforge-21.1.5-installer.jar"));
  assert.deepEqual(f.urls, ["https://maven.neoforged.net/releases/net/neoforged/neoforge/21.1.5/neoforge-21.1.5-installer.jar"]);
  const g = installerFile(MC, "Forge", { project: "forge", artifact: "1.20.1-47.2.0", note: null });
  assert.deepEqual(g.urls, ["https://maven.minecraftforge.net/net/minecraftforge/forge/1.20.1-47.2.0/forge-1.20.1-47.2.0-installer.jar"]);
  assert.throws(() => installerFile(MC, "Forge", { project: "forge", artifact: "../../x", note: null }));
});

test("commandes Java : seulement notre Java, classpath dans libraries, pas d'agent", () => {
  const ok = { executable: JAVA, args: ["-cp", [lib("a.jar"), lib("b", "c.jar")].join(path.delimiter), "net.Main", "--x", "y"] };
  checkJavaCommand(ok, JAVA, MC);
  const bad = [
    { ...ok, executable: "C:\\Windows\\System32\\cmd.exe" },
    { ...ok, executable: "java" },
    { ...ok, args: ["-cp", path.join(MC, "..", "evil.jar"), "Main"] },
    { ...ok, args: ["-cp", lib("a.exe"), "Main"] },
    { ...ok, args: ["-javaagent:x.jar", "-cp", lib("a.jar"), "Main"] },
    { ...ok, args: ["Main"] },
    { ...ok, cwd: path.resolve("/") },
  ];
  for (const b of bad) assert.throws(() => checkJavaCommand(b, JAVA, MC), UnsafePlanError, JSON.stringify(b));
});

test("plan : écritures hors de .minecraft et tâches inconnues refusées ; fichiers durcis", async () => {
  await assert.rejects(hardenPlan({ schemaVersion: 1, tasks: [{ id: "m", type: "materialize", operations: [{ type: "write", path: path.join(MC, "..", "x.txt") }], outputs: [] }] }, MC, JAVA, {}), UnsafePlanError);
  await assert.rejects(hardenPlan({ schemaVersion: 1, tasks: [{ id: "x", type: "shell" }] }, MC, JAVA, {}), UnsafePlanError);
  await assert.rejects(hardenPlan({ schemaVersion: 1, tasks: [{ id: "f", type: "files", files: [{ path: path.resolve("/etc/x"), urls: ["https://maven.neoforged.net/x"] }] }] }, MC, JAVA, {}), UnsafePlanError);
  const plan = { schemaVersion: 1 as const, tasks: [{ id: "f", type: "files", files: [{ path: lib("x.jar"), urls: ["https://evil.example/x.jar", "https://maven.neoforged.net/releases/x.jar"] }] }] };
  await hardenPlan(plan, MC, JAVA, { fetch: fakeFetch({ "https://maven.neoforged.net/releases/x.jar.sha1": { body: "a".repeat(40) } }) });
  assert.deepEqual(plan.tasks[0]!.files![0], { path: lib("x.jar"), urls: ["https://maven.neoforged.net/releases/x.jar"], checksum: { algorithm: "sha1", value: "a".repeat(40) } });
});

test("exécution Java : un programme non autorisé n'est jamais lancé", async () => {
  await assert.rejects(runJavaCommand({ executable: process.execPath, args: ["-e", "1"] }, JAVA, MC), UnsafePlanError);
});
