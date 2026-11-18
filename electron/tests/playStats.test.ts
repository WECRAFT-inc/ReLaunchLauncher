import { test } from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { localDay, PlayStats } from "../src/main/stats/playStats";
import { cleanUuid, SkinHeads, skinUrlFromProfile } from "../src/main/relink/heads";
import { decodeFriendStats, parisDay, streakExtra } from "../src/main/relink/account";

// chiffrement authentifié, comme safeStorage (AES-GCM) : toute retouche fait échouer le déchiffrement
const KEY = randomBytes(32);
const secrets = {
  isEncryptionAvailable: () => true,
  encryptString: (t: string) => {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", KEY, iv);
    const body = Buffer.concat([c.update(t, "utf8"), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), body]);
  },
  decryptString: (b: Buffer) => {
    const d = createDecipheriv("aes-256-gcm", KEY, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
  },
};

test("stats de jeu : temps cumulé, lancements, top instances, amis, plafond de veille, persistance", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "rl-stats-"));
  try {
    let now = new Date(2026, 10, 10, 20, 0, 0).getTime();
    const s = new PlayStats({ dataDir: dir, now: () => now, secrets });
    await s.start("A", { key: "a", name: "Créa", mc: "1.21.1", group: "pack:p1" });
    for (let i = 0; i < 30; i++) {
      now += 60_000;
      await s.tick();
    }
    assert.deepEqual(s.groups(), ["pack:p1"]);
    await s.coplay([{ id: "123456789", name: "Bob" }], 120);
    await s.coplay([{ id: "123456789", name: "Bob" }, { id: "x", name: "pirate" }], 120);
    now += 2 * 3600_000; // PC en veille pendant la partie : compté au plus 3 minutes
    await s.stop("A");
    await s.start("B", { key: "b", name: "Survie", mc: "1.20.1", group: null });
    now += 10 * 60_000;
    await s.stop("B");
    await s.start("A", { key: "a", name: "Créa", mc: "1.21.1", group: "pack:p1" });
    now += 60_000;
    await s.stop("A");
    const v = await s.view();
    assert.equal(v.launches, 3);
    assert.equal(v.sessions, 3);
    assert.equal(v.instances, 2);
    assert.equal(v.totalSeconds, 30 * 60 + 180 + 180 + 60, "tranches plafonnées à 3 minutes");
    assert.equal(v.top[0]!.name, "Créa");
    assert.equal(v.top[0]!.launches, 2);
    assert.equal(v.longestSeconds, 33 * 60);
    assert.deepEqual(v.friends, [{ id: "123456789", name: "Bob", seconds: 240 }], "identifiant douteux ignoré");
    assert.equal(v.daysPlayed, 1);
    assert.equal(v.last14.length, 14);
    assert.equal(v.last14[13]!.day, localDay(now));
    assert.equal(v.playing, false);
    // relu depuis le disque
    const s2 = new PlayStats({ dataDir: dir, now: () => now, secrets });
    assert.equal((await s2.view()).totalSeconds, v.totalSeconds);
    const file = path.join(dir, "play-stats.dat");
    const raw = await readFile(file);
    assert.ok(!raw.includes(Buffer.from("Créa")), "fichier chiffré, illisible");
    // retouche à la main : détectée, fichier mis de côté, stats remises à zéro
    raw[raw.length - 3] = raw[raw.length - 3]! ^ 0xff;
    await writeFile(file, raw);
    const s3 = new PlayStats({ dataDir: dir, now: () => now, secrets });
    assert.equal((await s3.view()).totalSeconds, 0);
    assert.ok((await readFile(`${file}.modifie`)).length > 0);
    // fichier remplacé par du JSON en clair : refusé aussi
    await writeFile(file, JSON.stringify({ total: 999999999 }));
    assert.equal((await new PlayStats({ dataDir: dir, now: () => now, secrets }).view()).totalSeconds, 0);
    // ancienne version en clair : ignorée et supprimée
    await writeFile(path.join(dir, "play-stats.json"), JSON.stringify({ total: 999999999 }));
    await new PlayStats({ dataDir: dir, now: () => now, secrets }).view();
    await assert.rejects(readFile(path.join(dir, "play-stats.json")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("stats de jeu : fichier abîmé ignoré sans planter", async () => {
  const writes: Buffer[] = [];
  const fs = { readFile: async () => "{pas du json", writeFile: async (_f: string, b: Buffer) => void writes.push(b), rename: async () => undefined, mkdir: async () => undefined, rm: async () => undefined };
  const s = new PlayStats({ dataDir: "/x", fs, secrets });
  assert.equal((await s.view()).launches, 0);
  // chiffrement indisponible : rien n'est jamais écrit en clair
  const off = new PlayStats({ dataDir: "/x", fs, secrets: { ...secrets, isEncryptionAvailable: () => false } });
  await off.start("A", { key: "a", name: "A", mc: "1.21", group: null });
  assert.equal((await off.view()).launches, 1);
  assert.equal(writes.length, 0);
});

function skinPng(): Buffer {
  const b = Buffer.alloc(40);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(64, 16);
  b.writeUInt32BE(64, 20);
  return b;
}
const texProfile = (url: string) => ({ id: "x", properties: [{ name: "textures", value: Buffer.from(JSON.stringify({ textures: { SKIN: { url } } })).toString("base64") }] });

test("tête : texture du profil Mojang vérifiée (serveur officiel uniquement)", () => {
  assert.equal(skinUrlFromProfile(texProfile("http://textures.minecraft.net/texture/abcdef0123456789abcdef01")), "https://textures.minecraft.net/texture/abcdef0123456789abcdef01");
  assert.equal(skinUrlFromProfile(texProfile("https://evil.example/texture/abcdef0123456789abcdef01")), null);
  assert.equal(skinUrlFromProfile(texProfile("https://textures.minecraft.net/../x")), null);
  assert.equal(skinUrlFromProfile({ properties: [] }), null);
  assert.equal(cleanUuid("069A79F4-44E9-4726-A5BE-FCA90E38AAF5"), "069a79f444e94726a5befca90e38aaf5");
  assert.equal(cleanUuid("../x"), null);
});

test("tête : skin du compte récupéré puis gardé en cache ; pas de skin → null", async () => {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(String(url));
    if (String(url).includes("sessionserver")) return new Response(JSON.stringify(texProfile("https://textures.minecraft.net/texture/abcdef0123456789abcdef01")), { status: 200 });
    return new Response(new Uint8Array(skinPng()), { status: 200 });
  }) as typeof fetch;
  const h = new SkinHeads({ fetch: f });
  const img = await h.forUuid("069a79f444e94726a5befca90e38aaf5");
  assert.ok(img?.startsWith("data:image/png;base64,"));
  await h.forUuid("069a79f444e94726a5befca90e38aaf5");
  assert.equal(calls.length, 2, "deuxième appel servi par le cache");
  const none = new SkinHeads({ fetch: (async () => new Response(null, { status: 204 })) as unknown as typeof fetch });
  assert.equal(await none.forUuid("069a79f444e94726a5befca90e38aaf5"), null);
  assert.equal(await h.forUuid("pas-un-uuid"), null);
});

test("série : état déduit quand le Worker ne le donne pas (validée, à valider, gel, perdue)", () => {
  const num = (v: unknown, max = 1e6) => (typeof v === "number" ? Math.min(max, v) : 0);
  const now = Date.UTC(2026, 10, 18, 11, 0, 0); // 18/11, midi à Paris
  const day = (d: number) => parisDay(now - d * 86400000);
  const base = { current: 5, todaySeconds: 300, requiredSeconds: 900, freezes: 1 };
  assert.equal(streakExtra({ ...base, lastValidDate: day(0) }, num, now).status, "validated");
  assert.equal(streakExtra({ ...base, lastValidDate: day(1) }, num, now).status, "pending");
  assert.equal(streakExtra({ ...base, lastValidDate: day(2) }, num, now).status, "frozen");
  assert.equal(streakExtra({ ...base, lastValidDate: day(3) }, num, now).status, "broken");
  assert.equal(streakExtra({ ...base, lastValidDate: null }, num, now).status, "none");
  const x = streakExtra({ ...base, lastValidDate: day(1) }, num, now);
  assert.equal(x.todaySeconds, 300);
  assert.equal(x.freezeMax, 2);
  assert.equal(x.freezeEvery, 7);
  assert.deepEqual(streakExtra({ current: 5 }, num, now), {}, "très ancien Worker : rien de plus");
  assert.equal(streakExtra({ status: "frozen" }, num, now).status, "frozen", "état donné par le Worker : gardé");
});

test("stats d'un ami : nombres bornés, 3 modpacks au plus, entrées vides ignorées", () => {
  const s = decodeFriendStats({ totalSeconds: 3600.9, launches: -4, daysPlayed: "x", top: [{ name: "" }, { name: "ATM10", seconds: 3000 }, 3, { name: "B" }, { name: "C" }, { name: "D" }] });
  assert.equal(s?.totalSeconds, 3600);
  assert.equal(s?.launches, 0);
  assert.equal(s?.daysPlayed, 0);
  assert.deepEqual(s?.top.map((x) => x.name), ["ATM10", "B", "C"]);
  assert.equal(decodeFriendStats(null), null);
  assert.equal(decodeFriendStats({ totalSeconds: 0, launches: 0 }), null, "rien à montrer");
});
