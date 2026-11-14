// Détection des lives Twitch des partenaires par le launcher (sans clé d'API).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { RelinkPartner, RelinkState } from "../src/shared/api";
import { LIVE_TTL_MS, previewUrl, TwitchLiveDetector } from "../src/main/relink/twitchLive";

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

function fakeTwitch(liveChannels: Set<string>, opts: { fail?: Set<string> } = {}) {
  const urls: string[] = [];
  const fetch = async (url: string) => {
    urls.push(url);
    const login = /live_user_([a-z0-9_]+)-/.exec(url)![1]!;
    if (opts.fail?.has(login)) throw new Error("réseau coupé");
    if (liveChannels.has(login)) return { status: 200, headers: { get: () => "image/jpeg" }, arrayBuffer: async () => JPG.buffer.slice(JPG.byteOffset, JPG.byteOffset + JPG.length) };
    return { status: 302, headers: { get: (h: string) => (h === "location" ? "https://static-cdn.jtvnw.net/ttv-static/404_preview-320x180.jpg" : null) }, arrayBuffer: async () => new ArrayBuffer(0) };
  };
  return { fetch, urls };
}

const partner = (id: string, channel: string, extra: Partial<RelinkPartner> = {}): RelinkPartner => ({ id, name: id, channel, category: "", featured: false, live: false, viewers: 0, ...extra });
const state = (partners: RelinkPartner[]): RelinkState => ({ ok: true, stale: false, fetchedAt: 1, error: null, data: { partners } as unknown as RelinkState["data"] });

test("adresse d'aperçu : hôte fixe, pseudo en minuscules", () => {
  assert.equal(previewUrl("Elit722_"), "https://static-cdn.jtvnw.net/previews-ttv/live_user_elit722_-320x180.jpg");
});

test("en direct : 200 + image ; hors ligne : redirection 404_preview ; pseudo invalide jamais interrogé", async () => {
  const t = fakeTwitch(new Set(["rexi_de_la_mort"]));
  const d = new TwitchLiveDetector({ fetch: t.fetch, userAgent: "test" });
  const on = await d.check("Rexi_de_la_mort");
  assert.equal(on?.live, true);
  assert.match(on!.thumb!, /^data:image\/jpeg;base64,/);
  assert.equal((await d.check("elit722_"))?.live, false);
  assert.equal(await d.check("x&calc"), null);
  assert.equal(t.urls.length, 2);
});

test("apply : complète l'état du Worker sans écraser ce qu'il sait", async () => {
  const t = fakeTwitch(new Set(["rexi_de_la_mort"]), { fail: new Set(["panne"]) });
  const d = new TwitchLiveDetector({ fetch: t.fetch, userAgent: "test" });
  const st = state([
    partner("rexi", "rexi_de_la_mort"),
    partner("elit", "Elit722_"),
    partner("yt", "", { live: true, viewers: 12 }), // live saisi à la main (YouTube) : gardé
    partner("worker", "elit722_", { live: true, viewers: 340 }), // le Worker dit en direct : gardé, pas re-vérifié
    partner("panne", "panne"), // erreur réseau : état du Worker gardé
    partner("doublon", "REXI_DE_LA_MORT"),
  ]);
  const out = await d.apply(st);
  const by = Object.fromEntries(out.data!.partners.map((p) => [p.id, p]));
  assert.deepEqual([by.rexi!.live, by.rexi!.liveSource, by.rexi!.thumb], [true, "twitch", true]);
  assert.equal(by.doublon!.live, true);
  assert.equal(by.elit!.live, false);
  assert.deepEqual([by.yt!.live, by.yt!.viewers], [true, 12]);
  assert.deepEqual([by.worker!.live, by.worker!.viewers, by.worker!.liveSource], [true, 340, undefined]);
  assert.equal(by.panne!.live, false);
  // une seule requête par chaîne (doublons et casse confondus)
  assert.equal(t.urls.filter((u) => u.includes("rexi_de_la_mort")).length, 1);
  assert.equal(st.data!.partners[0]!.live, false, "l'état d'origine n'est pas modifié");
});

test("cache : relevé réutilisé pendant le délai, puis renouvelé", async () => {
  let now = 0;
  const live = new Set<string>();
  const t = fakeTwitch(live);
  const d = new TwitchLiveDetector({ fetch: t.fetch, userAgent: "test", now: () => now });
  assert.equal((await d.check("abc"))?.live, false);
  live.add("abc");
  now = LIVE_TTL_MS - 1;
  assert.equal((await d.check("abc"))?.live, false);
  now = LIVE_TTL_MS + 1;
  assert.equal((await d.check("abc"))?.live, true);
  assert.equal(t.urls.length, 2);
  assert.ok(d.thumbOf("ABC"));
});
