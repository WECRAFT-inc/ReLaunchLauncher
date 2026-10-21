// Lot E4 : profil du launcher officiel (comparé à la vraie version Python) et fermeture/ouverture du launcher.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  closeOfficialLauncher,
  openOfficialLauncher,
  STORE_APP,
  type CommandRunner,
  type LauncherEnv,
} from "../src/main/launch/officialLauncher";
import { backupProfilesFile, defaultInstanceName, launcherDate, ProfileError, profileNameFor, setProfile, type ProfileDeps } from "../src/main/launch/profiles";
import { LaunchService, type LaunchStatus, type LaunchTarget } from "../src/main/launch/launch";
import { Settings } from "../src/main/config";
import { JsonStore } from "../src/main/storage/jsonStore";
import { tempDir } from "./helpers";

const REPO = path.join(__dirname, "..", "..", "..");
const PY = ["python3", "python"].find((cmd) => spawnSync(cmd, ["--version"]).status === 0);
const BOM = "\ufeff";

function deps(root: string, now?: () => Date): ProfileDeps {
  const d: ProfileDeps = {
    store: new JsonStore(),
    idsFile: path.join(root, "wecraft", "managed_profiles.json"),
    backupDir: path.join(root, "wecraft", "backups", "launcher_profiles"),
    platform: "linux",
  };
  if (now) d.now = now;
  return d;
}

const readJson = (f: string) => JSON.parse(readFileSync(f, "utf8").replace(/^\ufeff/, "")) as Record<string, any>;

test("noms : instance déduite du dossier, profil « WECRAFT - … », date du launcher", () => {
  assert.equal(defaultInstanceName("C:\\Jeux\\Survie\\.minecraft", "win32"), "Survie");
  assert.equal(defaultInstanceName("C:\\Jeux\\.monpack", "win32"), "monpack");
  assert.equal(defaultInstanceName("/home/a/Packs/Créatif/minecraft", "linux"), "Créatif");
  assert.equal(profileNameFor("Survie"), "WECRAFT - Survie");
  assert.equal(launcherDate(new Date("2026-10-21T08:09:10.456Z")), "2026-10-21T08:09:10.000Z");
});

// --------------------------------------------------------------- comparaison avec Python

interface Step {
  name: string;
  version: string;
  gameDir: string;
  ram: number;
}

const FIXTURES: Record<string, Record<string, string>> = {
  // anciens profils WeCraft, profil de l'utilisateur à ne jamais toucher, jetons, BOM
  heritage: {
    "launcher_profiles.json":
      BOM +
      JSON.stringify(
        {
          profiles: {
            user1: { name: "WeCraft Survie", type: "custom", lastVersionId: "1.20.1", javaArgs: "-Xmx2G -XX:+UseG1GC" },
            "123": { name: "Profil numéroté", type: "custom" },
            old1: { name: "Mon Lanceur - Ancien", lastUsed: "2024-01-01T00:00:00.000Z", javaArgs: "-Xmx3G -Dperso" },
            old2: { name: "WECRAFT - Vieux", lastUsed: "2025-05-05T00:00:00.000Z", javaArgs: "-Xmx٣G" },
            old3: { name: "mon LANCEUR", lastUsed: "2025-05-05T00:00:00.000Z" },
          },
          authenticationDatabase: { secret: "jeton" },
          clientToken: "abc",
          settings: { locale: "fr-fr", "émoji": "🎮" },
        },
        null,
        2,
      ),
  },
  // deux fichiers ; celui du Store sans « profiles », arguments Java vides sous forme de liste
  deuxFichiers: {
    "launcher_profiles.json": JSON.stringify({ profiles: { a: { name: "WECRAFT - Alpha", javaArgs: [] } }, version: 3 }),
    "launcher_profiles_microsoft_store.json": JSON.stringify({ version: 3 }),
  },
  // aucun profil de WeCraft : création d'un nouveau
  vide: { "launcher_profiles.json": JSON.stringify({ profiles: { x: { name: "Autre", javaArgs: "" } } }) },
};

const STEPS: Step[] = [
  { name: "WECRAFT - Alpha", version: "fabric-loader-0.16.9-1.21.4", gameDir: "/jeux/Alpha", ram: 6 },
  { name: "WECRAFT - Bêta", version: "1.20.1-forge-47.3.0", gameDir: "/jeux/Bêta", ram: 8 },
  { name: "WECRAFT - Bêta", version: "1.21.4", gameDir: "/jeux/Bêta", ram: 4 },
];

/** Dates et identifiants aléatoires remplacés pour comparer deux exécutions. */
function normalize(dir: string, before: Set<string>): string {
  let out = "";
  for (const n of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    let text = readFileSync(path.join(dir, n), "utf8");
    text = text.replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z/g, "<date>");
    text = text.replace(/"([0-9a-f]{32})"/g, (m, k: string) => (before.has(k) ? m : '"<nouveau>"'));
    out += `== ${n}\n${text}\n`;
  }
  return out;
}

function runPython(root: string, mcDir: string, steps: Step[]): { results: (string | null)[] } {
  const code = [
    "import json, sys",
    "from pathlib import Path",
    `sys.path.insert(0, ${JSON.stringify(path.join(REPO, "tests"))})`,
    "from _harness import load",
    "wl = load()",
    "root, mc, steps = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])",
    "wl.PROFILE_IDS_FILE = Path(root) / 'wecraft' / 'managed_profiles.json'",
    "wl.PROFILE_BACKUP_DIR = Path(root) / 'wecraft' / 'backups' / 'launcher_profiles'",
    "wl.PROFILE_IDS_FILE.parent.mkdir(parents=True, exist_ok=True)",
    "out = []",
    "for s in steps:",
    "    try:",
    "        wl.set_profile(mc, s['name'], s['version'], s['gameDir'], s['ram'])",
    "        out.append(None)",
    "    except RuntimeError as e:",
    "        out.append(str(e).splitlines()[0][:40])",
    "print(json.dumps({'results': out}))",
  ].join("\n");
  const r = spawnSync(PY!, ["-c", code, root, mcDir, JSON.stringify(steps)], { cwd: REPO, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim().split("\n").pop()!);
}

async function runTs(root: string, mcDir: string, steps: Step[]): Promise<{ results: (string | null)[] }> {
  const out: (string | null)[] = [];
  const d = deps(root);
  for (const s of steps) {
    try {
      await setProfile(mcDir, s.name, s.version, s.gameDir, s.ram, d);
      out.push(null);
    } catch (e) {
      assert.ok(e instanceof ProfileError, String(e));
      out.push(e.message.split("\n")[0]!.slice(0, 40));
    }
  }
  return { results: out };
}

for (const [label, files] of Object.entries(FIXTURES)) {
  test(`profil du launcher : mêmes fichiers que la version Python (${label})`, { skip: PY ? false : "Python absent" }, async () => {
    const { dir, cleanup } = tempDir(`profils-${label}`);
    try {
      for (const who of ["py", "ts"]) {
        mkdirSync(path.join(dir, who, "mc"), { recursive: true });
        for (const [n, c] of Object.entries(files)) writeFileSync(path.join(dir, who, "mc", n), c);
      }
      const before = new Set(Object.values(files).flatMap((c) => [...c.matchAll(/"([0-9a-f]{32})"/g)].map((m) => m[1]!)));
      const py = runPython(path.join(dir, "py"), path.join(dir, "py", "mc"), STEPS);
      const ts = await runTs(path.join(dir, "ts"), path.join(dir, "ts", "mc"), STEPS);
      assert.deepEqual(ts, py);
      assert.equal(normalize(path.join(dir, "ts", "mc"), before), normalize(path.join(dir, "py", "mc"), before));
      // même profil retrouvé : un seul profil WeCraft créé / repris, profils de l'utilisateur intacts
      const ids = readJson(path.join(dir, "ts", "wecraft", "managed_profiles.json"));
      const pyIds = readJson(path.join(dir, "py", "wecraft", "managed_profiles.json"));
      assert.deepEqual(Object.keys(ids).map((k) => path.basename(k)), Object.keys(pyIds).map((k) => path.basename(k)));
      // sauvegardes : aussi nombreuses, sans jetons
      const bk = (who: string) => readdirSync(path.join(dir, who, "wecraft", "backups", "launcher_profiles")).length;
      assert.equal(bk("ts"), bk("py"));
      for (const n of readdirSync(path.join(dir, "ts", "wecraft", "backups", "launcher_profiles"))) {
        const b = readJson(path.join(dir, "ts", "wecraft", "backups", "launcher_profiles", n));
        assert.equal(b["authenticationDatabase"], undefined);
        assert.equal(b["clientToken"], undefined);
      }
      for (const n of Object.keys(files)) {
        assert.equal(readFileSync(path.join(dir, "ts", "mc", `${n}.bak_wecraft`), "utf8"), files[n], "première sauvegarde = original exact");
      }
    } finally {
      cleanup();
    }
  });
}

test("profil du launcher : fichier illisible ou absent → erreur, rien n'est écrit (comme Python)", { skip: PY ? false : "Python absent" }, async () => {
  const { dir, cleanup } = tempDir("profils-illisible");
  try {
    for (const [label, content] of [["casse", "{pas du json"], ["liste", "[1,2]"], ["profilsListe", '{"profiles": []}'], ["binaire", "\xff\xfe{}"]] as const) {
      for (const who of ["py", "ts"]) {
        mkdirSync(path.join(dir, label, who, "mc"), { recursive: true });
        writeFileSync(path.join(dir, label, who, "mc", "launcher_profiles.json"), Buffer.from(content, "latin1"));
      }
      const py = runPython(path.join(dir, label, "py"), path.join(dir, label, "py", "mc"), STEPS.slice(0, 1));
      const ts = await runTs(path.join(dir, label, "ts"), path.join(dir, label, "ts", "mc"), STEPS.slice(0, 1));
      assert.equal(py.results[0]?.startsWith("Le fichier launcher_profiles.json du la"), true, label);
      assert.equal(ts.results[0], py.results[0], label);
      assert.deepEqual(readFileSync(path.join(dir, label, "ts", "mc", "launcher_profiles.json")), Buffer.from(content, "latin1"), label);
      assert.equal(existsSync(path.join(dir, label, "ts", "wecraft", "managed_profiles.json")), false, label);
    }
    mkdirSync(path.join(dir, "absent", "mc"), { recursive: true });
    await assert.rejects(setProfile(path.join(dir, "absent", "mc"), "WECRAFT - X", "1.21.4", "/x", 4, deps(path.join(dir, "absent"))), /introuvables/);
  } finally {
    cleanup();
  }
});

test("sauvegardes : 15 gardées, la plus ancienne supprimée, .bak_wecraft jamais remplacée", async () => {
  const { dir, cleanup } = tempDir("profils-sauvegardes");
  try {
    const f = path.join(dir, "launcher_profiles.json");
    writeFileSync(f, '{"profiles":{}}');
    let t = Date.UTC(2026, 0, 1);
    const d = deps(dir, () => new Date((t += 1000)));
    for (let i = 0; i < 17; i++) {
      writeFileSync(f, JSON.stringify({ profiles: {}, n: i }));
      await backupProfilesFile(f, d);
    }
    const kept = readdirSync(d.backupDir).sort();
    assert.equal(kept.length, 15);
    assert.equal(readJson(path.join(d.backupDir, kept[0]!))["n"], 2);
    assert.equal(readJson(path.join(d.backupDir, kept[14]!))["n"], 16);
    assert.equal(readFileSync(`${f}.bak_wecraft`, "utf8"), '{"profiles":{},"n":0}');
  } finally {
    cleanup();
  }
});

test("le profil retrouvé par son identifiant mémorisé, même renommé par l'utilisateur", async () => {
  const { dir, cleanup } = tempDir("profils-id");
  try {
    const mc = path.join(dir, "mc");
    mkdirSync(mc);
    writeFileSync(path.join(mc, "launcher_profiles.json"), JSON.stringify({ profiles: {} }));
    const d = deps(dir);
    await setProfile(mc, "WECRAFT - A", "1.21.4", "/a", 4, d);
    const p1 = readJson(path.join(mc, "launcher_profiles.json"))["profiles"];
    const key = Object.keys(p1)[0]!;
    p1[key].name = "Mon profil à moi";
    p1[key].javaArgs = "-Xmx4G -XX:+UseZGC";
    writeFileSync(path.join(mc, "launcher_profiles.json"), JSON.stringify({ profiles: p1 }));
    await setProfile(mc, "WECRAFT - B", "1.20.1", "/b", 10, d);
    const p2 = readJson(path.join(mc, "launcher_profiles.json"))["profiles"];
    assert.deepEqual(Object.keys(p2), [key]);
    assert.equal(p2[key].name, "WECRAFT - B");
    assert.equal(p2[key].gameDir, "/b");
    assert.equal(p2[key].javaArgs, "-Xmx4G -XX:+UseZGC", "arguments Java personnalisés conservés");
  } finally {
    cleanup();
  }
});

// --------------------------------------------------------------- launcher officiel

function fakeRunner(script: { running: Set<string>; stubborn?: boolean; files?: string[] }) {
  const calls: string[] = [];
  let clock = 0;
  const r: CommandRunner = {
    run: async (file, args) => {
      calls.push([path.win32.basename(file), ...args].join(" "));
      if (file.endsWith("tasklist.exe")) {
        const name = args[1]!.replace("IMAGENAME eq ", "");
        return { code: 0, stdout: script.running.has(name) ? `${name}   1234 Console` : "INFO: aucune tâche" };
      }
      if (file.endsWith("taskkill.exe")) {
        if (!script.stubborn || args.includes("/F")) script.running.delete(args[args.length - 1]!);
        return { code: 0, stdout: "" };
      }
      return { code: 0, stdout: "" };
    },
    start: async (file, args) => void calls.push(["start", file, ...args].join(" ")),
    exists: async (file) => (script.files ?? []).includes(file),
    sleep: async (ms) => void (clock += ms),
    now: () => clock,
  };
  return { r, calls };
}

const winEnv = (runner: CommandRunner): LauncherEnv => ({
  platform: "win32",
  env: { SystemRoot: "C:\\Windows", ProgramFiles: "C:\\Program Files", "ProgramFiles(x86)": "C:\\Program Files (x86)" },
  runner,
});

test("fermeture : déjà fermé, fermeture normale, arrêt forcé seulement si demandé", async () => {
  let f = fakeRunner({ running: new Set() });
  assert.deepEqual(await closeOfficialLauncher({}, winEnv(f.r)), { ok: true, message: "Launcher officiel déjà fermé." });
  assert.ok(!f.calls.some((c) => c.startsWith("taskkill")));

  f = fakeRunner({ running: new Set(["MinecraftLauncher.exe"]) });
  assert.deepEqual(await closeOfficialLauncher({}, winEnv(f.r)), { ok: true, message: "Launcher officiel fermé." });
  assert.deepEqual(f.calls.filter((c) => c.startsWith("taskkill")), ["taskkill.exe /IM MinecraftLauncher.exe"]);

  f = fakeRunner({ running: new Set(["MinecraftLauncher.exe", "Minecraft.exe"]), stubborn: true });
  assert.deepEqual(await closeOfficialLauncher({}, winEnv(f.r)), { ok: false, message: "Le launcher officiel ne s'est pas fermé." });
  assert.ok(!f.calls.some((c) => c.split(" ").includes("/F")), "jamais d'arrêt forcé sans accord");
  assert.deepEqual(await closeOfficialLauncher({ force: true }, winEnv(f.r)), { ok: true, message: "Launcher officiel fermé." });
  assert.deepEqual(f.calls.filter((c) => c.split(" ").includes("/F")), ["taskkill.exe /F /IM MinecraftLauncher.exe", "taskkill.exe /F /IM Minecraft.exe"]);
});

test("fermeture : commande impossible → message clair, pas de faux succès", async () => {
  const f = fakeRunner({ running: new Set() });
  f.r.run = async () => {
    throw new Error("spawn ENOENT");
  };
  const r = await closeOfficialLauncher({}, winEnv(f.r));
  assert.equal(r.ok, false);
  assert.match(r.message, /fermez-le à la main/);
});

test("ouverture : version classique si présente, sinon Microsoft Store", async () => {
  let f = fakeRunner({ running: new Set(), files: ["C:\\Program Files\\Minecraft Launcher\\MinecraftLauncher.exe"] });
  assert.equal(await openOfficialLauncher(winEnv(f.r)), true);
  assert.deepEqual(f.calls, ["start C:\\Program Files\\Minecraft Launcher\\MinecraftLauncher.exe"]);
  f = fakeRunner({ running: new Set() });
  assert.equal(await openOfficialLauncher(winEnv(f.r)), true);
  assert.deepEqual(f.calls, [`start C:\\Windows\\explorer.exe ${STORE_APP}`]);
  f = fakeRunner({ running: new Set() });
  f.r.start = async () => {
    throw new Error("échec");
  };
  assert.equal(await openOfficialLauncher(winEnv(f.r)), false);
});

// --------------------------------------------------------------- orchestration (play_worker)

function launchWorld(opts: { installed?: string[]; closeOk?: boolean[]; open?: boolean; failInstall?: boolean; offline?: boolean; platform?: NodeJS.Platform } = {}) {
  const { dir, cleanup } = tempDir("lancement");
  const mc = path.join(dir, "mc");
  mkdirSync(mc);
  writeFileSync(path.join(mc, "launcher_profiles.json"), JSON.stringify({ profiles: { u: { name: "Perso", javaArgs: "-Xmx2G" } } }));
  const calls: string[] = [];
  const installed = [...(opts.installed ?? [])];
  const closeOk = [...(opts.closeOk ?? [true])];
  const svc = new LaunchService({
    mcDir: mc,
    profile: deps(dir),
    xmcl: () => ({}) as never,
    platform: opts.platform ?? "win32",
    mkdir: async (d) => void calls.push(`mkdir ${path.basename(d)}`),
    close: async (o) => {
      calls.push(o.force ? "close-force" : "close");
      const ok = closeOk.shift() ?? true;
      return { ok, message: ok ? "Launcher officiel fermé." : "Le launcher officiel ne s'est pas fermé." };
    },
    open: async () => {
      calls.push("open");
      return opts.open ?? true;
    },
    install: {
      installedVersionIds: async () => [...installed],
      installVanilla: async (_m, id, o) => {
        calls.push(`vanilla ${id}`);
        o.onStep?.({ phase: "fichiers", progress: { filesDone: 3, filesTotal: 10, bytes: 0 } });
        if (opts.failInstall) throw new Error("Fichier refusé (empreinte différente) : https://x");
        installed.push(id);
        return { id, javaComponent: "java-runtime-delta", javaMajor: 21 };
      },
      loaderVersions: async () => {
        calls.push("fabric-list");
        if (opts.offline) throw new TypeError("fetch failed");
        return [{ version: "0.16.9", stable: true }, { version: "0.16.5", stable: true }];
      },
      installSimpleLoader: async (_m, loader, v, wanted) => {
        calls.push(`loader ${loader} ${wanted}`);
        return { id: `fabric-loader-${wanted}-${v}`, javaComponent: "x", javaMajor: null };
      },
      forgeVersions: async () => {
        calls.push("forge-list");
        if (opts.offline) throw new TypeError("fetch failed");
        return { available: ["1.20.1-47.2.0", "1.20.1-47.3.0"], preferred: "1.20.1-47.2.0" };
      },
      installForgeLike: async (_m, kind, v, artifact) => {
        calls.push(`forge ${kind} ${artifact}`);
        return { id: `${v}-forge-${(artifact ?? "").split("-").pop()}`, javaComponent: "x", javaMajor: null, java: "/j" };
      },
    },
  });
  const profiles = () => readJson(path.join(mc, "launcher_profiles.json"))["profiles"] as Record<string, any>;
  return { svc, calls, profiles, cleanup, mc };
}

const FABRIC: LaunchTarget = { gameDir: "/jeux/Alpha", profileName: "WECRAFT - Alpha", mc: "1.21.4", loader: "Fabric", loaderVersion: "0.16.5" };

async function finish(svc: LaunchService, job: string): Promise<LaunchStatus> {
  await svc.settled();
  return svc.status(job)!;
}

test("lancement : fermeture, installation, profil, ouverture — dans cet ordre", async () => {
  const w = launchWorld();
  try {
    const r = w.svc.start(FABRIC, { ram: 6 });
    assert.ok(r.ok);
    const st = await finish(w.svc, r.job);
    assert.equal(st.phase, "termine", st.message);
    assert.equal(st.opened, true);
    assert.equal(st.profile, "WECRAFT - Alpha");
    assert.match(st.message, /cliquez sur Jouer dans le launcher officiel/);
    assert.deepEqual(w.calls, ["mkdir Alpha", "close", "vanilla 1.21.4", "fabric-list", "loader Fabric 0.16.5", "open"]);
    const p = Object.values(w.profiles()).find((x) => x.name === "WECRAFT - Alpha");
    assert.equal(p.lastVersionId, "fabric-loader-0.16.5-1.21.4");
    assert.equal(p.gameDir, "/jeux/Alpha");
    assert.equal(p.javaArgs, "-Xmx6G");
    assert.equal(w.profiles()["u"].javaArgs, "-Xmx2G", "profil de l'utilisateur intact");
  } finally {
    w.cleanup();
  }
});

test("lancement : rien n'est réinstallé si tout est déjà là ; « réparer » réinstalle", async () => {
  const w = launchWorld({ installed: ["1.21.4", "fabric-loader-0.16.5-1.21.4"] });
  try {
    let r = w.svc.start(FABRIC, { ram: 4 });
    assert.ok(r.ok);
    assert.equal((await finish(w.svc, r.job)).phase, "termine");
    assert.deepEqual(w.calls, ["mkdir Alpha", "close", "fabric-list", "open"]);
    w.calls.length = 0;
    r = w.svc.start(FABRIC, { ram: 4, repair: true });
    assert.ok(r.ok);
    assert.equal((await finish(w.svc, r.job)).phase, "termine");
    assert.deepEqual(w.calls, ["mkdir Alpha", "close", "vanilla 1.21.4", "fabric-list", "loader Fabric 0.16.5", "open"]);
  } finally {
    w.cleanup();
  }
});

test("lancement : launcher officiel qui ne se ferme pas → l'utilisateur choisit ; refus = rien n'est modifié", async () => {
  const w = launchWorld({ closeOk: [false] });
  try {
    const before = readFileSync(path.join(w.mc, "launcher_profiles.json"), "utf8");
    const r = w.svc.start(FABRIC, { ram: 4 });
    assert.ok(r.ok);
    while (w.svc.status(r.job)!.phase !== "accord") await new Promise((res) => setImmediate(res));
    assert.equal(w.svc.answer("autre-job", true), false);
    assert.equal(w.svc.answer(r.job, false), true);
    const st = await finish(w.svc, r.job);
    assert.equal(st.phase, "erreur");
    assert.match(st.message, /Aucun fichier n'a été modifié/);
    assert.deepEqual(w.calls, ["mkdir Alpha", "close"]);
    assert.equal(readFileSync(path.join(w.mc, "launcher_profiles.json"), "utf8"), before);
  } finally {
    w.cleanup();
  }
  const w2 = launchWorld({ closeOk: [false, true] });
  try {
    const r = w2.svc.start(FABRIC, { ram: 4 });
    assert.ok(r.ok);
    while (w2.svc.status(r.job)!.phase !== "accord") await new Promise((res) => setImmediate(res));
    w2.svc.answer(r.job, true);
    assert.equal((await finish(w2.svc, r.job)).phase, "termine");
    assert.deepEqual(w2.calls.slice(0, 3), ["mkdir Alpha", "close", "close-force"]);
  } finally {
    w2.cleanup();
  }
});

test("lancement : hors ligne, loader déjà installé pour cette version réutilisé ; sinon erreur", async () => {
  const w = launchWorld({ offline: true, installed: ["1.21.4", "fabric-loader-0.16.9-1.21.4", "fabric-loader-0.16.9-1.21.40"] });
  try {
    const r = w.svc.start(FABRIC, { ram: 4 });
    assert.ok(r.ok);
    const st = await finish(w.svc, r.job);
    assert.equal(st.phase, "termine", st.message);
    assert.equal(Object.values(w.profiles()).find((x) => x.name === FABRIC.profileName).lastVersionId, "fabric-loader-0.16.9-1.21.4");
    assert.equal(st.notes.length, 1);
  } finally {
    w.cleanup();
  }
  const w2 = launchWorld({ offline: true, installed: ["1.21.4"] });
  try {
    const r = w2.svc.start(FABRIC, { ram: 4 });
    assert.ok(r.ok);
    const st = await finish(w2.svc, r.job);
    assert.equal(st.phase, "erreur");
    assert.match(st.message, /fetch failed/);
    assert.ok(!w2.calls.includes("open"), "jamais « prêt » sans profil");
  } finally {
    w2.cleanup();
  }
});

test("lancement : installation refusée → erreur, profil inchangé, launcher non ouvert", async () => {
  const w = launchWorld({ failInstall: true });
  try {
    const before = readFileSync(path.join(w.mc, "launcher_profiles.json"), "utf8");
    const r = w.svc.start(FABRIC, { ram: 4 });
    assert.ok(r.ok);
    const st = await finish(w.svc, r.job);
    assert.equal(st.phase, "erreur");
    assert.match(st.message, /empreinte différente/);
    assert.equal(st.profile, null);
    assert.equal(st.progress, null);
    assert.equal(readFileSync(path.join(w.mc, "launcher_profiles.json"), "utf8"), before);
    assert.ok(!w.calls.includes("open"));
  } finally {
    w.cleanup();
  }
});

test("lancement : Forge déjà installé reconnu ; NeoForge ne se confond pas avec Forge", async () => {
  const forge: LaunchTarget = { gameDir: "/jeux/F", profileName: "WECRAFT - F", mc: "1.20.1", loader: "Forge", loaderVersion: null };
  const w = launchWorld({ installed: ["1.20.1", "1.20.1-forge-47.2.0"] });
  try {
    const r = w.svc.start(forge, { ram: 4 });
    assert.ok(r.ok);
    assert.equal((await finish(w.svc, r.job)).phase, "termine");
    assert.deepEqual(w.calls, ["mkdir F", "close", "forge-list", "open"]);
    assert.equal(Object.values(w.profiles()).find((x) => x.name === "WECRAFT - F").lastVersionId, "1.20.1-forge-47.2.0");
  } finally {
    w.cleanup();
  }
  const w2 = launchWorld({ installed: ["1.20.1", "1.20.1-neoforge-47.2.0"] });
  try {
    const r = w2.svc.start(forge, { ram: 4 });
    assert.ok(r.ok);
    assert.equal((await finish(w2.svc, r.job)).phase, "termine");
    assert.ok(w2.calls.includes("forge Forge 1.20.1-47.2.0"), "un NeoForge installé n'est pas pris pour Forge");
  } finally {
    w2.cleanup();
  }
});

test("lancement : profil illisible → erreur, launcher non ouvert ; un seul lancement à la fois ; RAM vérifiée", async () => {
  const w = launchWorld({ installed: ["1.21.4", "fabric-loader-0.16.5-1.21.4"] });
  try {
    writeFileSync(path.join(w.mc, "launcher_profiles.json"), "{abîmé");
    assert.deepEqual(w.svc.start(FABRIC, { ram: 0 }), { ok: false, reason: "invalid" });
    assert.deepEqual(w.svc.start(FABRIC, { ram: 17 }), { ok: false, reason: "invalid" });
    assert.deepEqual(w.svc.start(FABRIC, { ram: 4.5 }), { ok: false, reason: "invalid" });
    const r = w.svc.start(FABRIC, { ram: 4 });
    assert.ok(r.ok);
    assert.deepEqual(w.svc.start(FABRIC, { ram: 4 }), { ok: false, reason: "busy" });
    const st = await finish(w.svc, r.job);
    assert.equal(st.phase, "erreur");
    assert.match(st.message, /illisible/);
    assert.ok(!w.calls.includes("open"));
    assert.equal(w.svc.status("inconnu"), null);
  } finally {
    w.cleanup();
  }
});

test("lancement : launcher officiel impossible à ouvrir → profil prêt, message honnête", async () => {
  const w = launchWorld({ open: false, installed: ["1.21.4", "fabric-loader-0.16.5-1.21.4"] });
  try {
    const r = w.svc.start(FABRIC, { ram: 4 });
    assert.ok(r.ok);
    const st = await finish(w.svc, r.job);
    assert.equal(st.phase, "termine");
    assert.equal(st.opened, false);
    assert.match(st.message, /n'a pas pu être ouvert/);
  } finally {
    w.cleanup();
  }
});

test("RAM proposée : clé « ram » de launcher_config.json (4 Go par défaut), les autres réglages conservés", async () => {
  const { dir, cleanup } = tempDir("ram");
  try {
    const f = path.join(dir, "launcher_config.json");
    const s = new Settings(new JsonStore(), f);
    assert.equal(await s.ram(), 4);
    writeFileSync(f, JSON.stringify({ theme: "aurore", ram: 99 }));
    assert.equal(await s.ram(), 4);
    assert.equal(await s.setRam(10), true);
    assert.equal(await s.ram(), 10);
    assert.deepEqual(readJson(f), { theme: "aurore", ram: 10 });
  } finally {
    cleanup();
  }
});
