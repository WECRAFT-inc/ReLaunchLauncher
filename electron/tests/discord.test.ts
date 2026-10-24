// Lot E9 : statut Discord (protocole local, suivi du jeu), comparé à la version Python.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer, type Socket } from "node:net";
import path from "node:path";
import { test } from "node:test";
import { DiscordIpc, encode, pipePath, type Activity, type RpcClient } from "../src/main/discord/ipc";
import { DiscordPresence, discordClientId, LAUNCH_WAIT_MS, PS_COUNT_MINECRAFT, RETRY_MS } from "../src/main/discord/presence";
import { tempDir } from "./helpers";

const REPO = path.join(__dirname, "..", "..", "..");
const PY = ["python3", "python"].find((cmd) => spawnSync(cmd, ["--version"]).status === 0);

test("protocole local : poignée de main puis statut, comme l'appli Discord l'attend", { skip: process.platform === "win32" ? "canal nommé Windows non simulé" : false }, async () => {
  const { dir, cleanup } = tempDir("discord");
  const got: { op: number; data: Record<string, unknown> }[] = [];
  const server = createServer((s: Socket) => {
    let buf = Buffer.alloc(0);
    s.on("data", (c: Buffer) => {
      buf = Buffer.concat([buf, c]);
      while (buf.length >= 8 && buf.length >= 8 + buf.readUInt32LE(4)) {
        const op = buf.readUInt32LE(0);
        const len = buf.readUInt32LE(4);
        const data = JSON.parse(buf.toString("utf8", 8, 8 + len)) as Record<string, unknown>;
        buf = buf.subarray(8 + len);
        got.push({ op, data });
        s.write(encode(1, op === 0 ? { cmd: "DISPATCH", evt: "READY" } : { cmd: "SET_ACTIVITY", nonce: data["nonce"], evt: null }));
      }
    });
  });
  const sock = pipePath(0, "linux", { XDG_RUNTIME_DIR: dir });
  await new Promise<void>((r) => server.listen(sock, r));
  try {
    const c = new DiscordIpc("123", undefined, "linux");
    const env = process.env["XDG_RUNTIME_DIR"];
    process.env["XDG_RUNTIME_DIR"] = dir;
    try {
      await c.connect();
    } finally {
      if (env === undefined) delete process.env["XDG_RUNTIME_DIR"];
      else process.env["XDG_RUNTIME_DIR"] = env;
    }
    await c.setActivity({ details: "Joue à Pack", state: "Minecraft 1.20.1" });
    await c.setActivity(null);
    c.close();
    assert.deepEqual(got[0], { op: 0, data: { v: 1, client_id: "123" } });
    assert.equal(got[1]!.data["cmd"], "SET_ACTIVITY");
    assert.deepEqual((got[1]!.data["args"] as Record<string, unknown>)["activity"], { details: "Joue à Pack", state: "Minecraft 1.20.1" });
    assert.equal((got[2]!.data["args"] as Record<string, unknown>)["activity"], null);
  } finally {
    server.close();
    cleanup();
  }
});

test("canal : nom Windows exact ; Discord absent = erreur claire, jamais bloquant", async () => {
  assert.equal(pipePath(3, "win32"), "\\\\?\\pipe\\discord-ipc-3");
  const { dir, cleanup } = tempDir("discord-absent");
  try {
    const env = process.env["XDG_RUNTIME_DIR"];
    process.env["XDG_RUNTIME_DIR"] = dir;
    try {
      await assert.rejects(new DiscordIpc("1", undefined, process.platform === "win32" ? "linux" : process.platform).connect());
    } finally {
      if (env === undefined) delete process.env["XDG_RUNTIME_DIR"];
      else process.env["XDG_RUNTIME_DIR"] = env;
    }
  } finally {
    cleanup();
  }
});

function fakeWorld(opts: { failConnect?: number } = {}) {
  const sent: (Activity | null)[] = [];
  let connects = 0;
  let clock = 1_000_000;
  let running = false;
  const factory = (): RpcClient => ({
    connect: async () => {
      connects++;
      if (connects <= (opts.failConnect ?? 0)) throw new Error("Discord fermé");
    },
    setActivity: async (a) => void sent.push(a),
    close: () => undefined,
  });
  const p = new DiscordPresence({ clientId: "1", enabled: true, version: "2.0.0", factory, running: async () => running, now: () => clock, every: () => () => undefined });
  return { p, sent, advance: (ms: number) => (clock += ms), setRunning: (r: boolean) => (running = r), connects: () => connects };
}

test("suivi : dans le launcher → prépare → joue (durée) → retour au launcher ; rien d'envoyé si rien ne change", async () => {
  const w = fakeWorld();
  await w.p.idle();
  await w.p.idle();
  assert.equal(w.sent.length, 1, "pas de renvoi à l'identique");
  assert.equal(w.sent[0]!.details, "Dans le launcher");
  await w.p.launching("All the Mods 10", "1.21.1", "NeoForge");
  assert.deepEqual([w.sent[1]!.details, w.sent[1]!.state], ["Prépare All the Mods 10", "Lancement de Minecraft..."]);
  w.setRunning(true);
  await w.p.tick();
  assert.deepEqual([w.sent[2]!.details, w.sent[2]!.state, w.sent[2]!.timestamps], ["Joue à All the Mods 10", "Minecraft 1.21.1 · NeoForge", { start: 1000 }]);
  w.setRunning(false);
  await w.p.tick();
  assert.equal(w.sent[3]!.details, "Dans le launcher");
  // jeu jamais détecté : abandon après 5 minutes
  await w.p.launching("X", "1.20.1", null);
  w.advance(LAUNCH_WAIT_MS + 1);
  await w.p.tick();
  assert.equal(w.sent[w.sent.length - 1]!.details, "Dans le launcher");
  // désactivé : statut effacé, plus rien d'envoyé
  await w.p.setEnabled(false);
  assert.equal(w.sent[w.sent.length - 1], null);
  const n = w.sent.length;
  await w.p.launching("Y", "1.20.1", null);
  assert.equal(w.sent.length, n);
});

test("Discord fermé : nouvel essai seulement après 30 s", async () => {
  const w = fakeWorld({ failConnect: 1 });
  await w.p.idle();
  assert.equal(w.sent.length, 0);
  await w.p.tick();
  assert.equal(w.connects(), 1, "pas de nouvel essai immédiat");
  w.advance(RETRY_MS + 1);
  await w.p.tick();
  assert.equal(w.sent.length, 1);
});

test("textes du statut et détection du jeu : identiques à la version Python", { skip: PY ? false : "Python absent" }, async () => {
  const cases: [string, Record<string, string> | null][] = [
    ["idle", null],
    ["launching", { name: "Pack", version: "1.20.1", loader: "Fabric" }],
    ["playing", { name: "Pack", version: "1.20.1", loader: "Vanilla" }],
    ["playing", { name: "", version: "1.21", loader: "" }],
    ["playing", { name: "x".repeat(200), version: "1.21", loader: "Quilt" }],
  ];
  const code = [
    "import json, sys",
    `sys.path.insert(0, ${JSON.stringify(path.join(REPO, "tests"))})`,
    "from _harness import load",
    "wl = load()",
    "out = []",
    "for mode, info in json.loads(sys.argv[1]):",
    "    p = wl.DiscordPresence('1', enabled=True)",
    "    p.mode, p.info, p.t_start = mode, info, 42",
    "    s = p._status()",
    "    out.append([s['details'], s['state'], s.get('start')])",
    "print(json.dumps({'s': out, 'ps': wl._PS_COUNT_MINECRAFT, 'id': wl.DISCORD_CLIENT_ID}))",
  ].join("\n");
  const r = spawnSync(PY!, ["-c", code, JSON.stringify(cases)], { cwd: REPO, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const pyr = JSON.parse(r.stdout.trim().split("\n").pop()!) as { s: unknown[]; ps: string; id: string };
  const ts = cases.map(([mode, info]) => {
    const p = new DiscordPresence({ clientId: "1", enabled: true, version: "x" });
    Object.assign(p as unknown as Record<string, unknown>, { mode, info, tStart: 42 });
    const s = p.status();
    return [s.details, s.state, s.timestamps?.start ?? null];
  });
  assert.deepEqual(ts, pyr.s);
  assert.equal(PS_COUNT_MINECRAFT, pyr.ps, "PowerShell ne renvoie qu'un nombre, comme en Python");
  assert.equal(discordClientId(null, {}), pyr.id);
  assert.equal(discordClientId({ discord_app_id: "9" }, {}), "9");
  assert.equal(discordClientId({ discord_app_id: "9" }, { WECRAFT_DISCORD_ID: "7" }), "7");
});
