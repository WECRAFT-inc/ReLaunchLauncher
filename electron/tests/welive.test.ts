import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeVideo } from "../src/main/relink/worker";

test("WeLive : vidéos du site vérifiées (YouTube / Twitch seulement, durée, identifiant de miniature)", () => {
  const ok = decodeVideo({ t: "100 jours sur une île", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10", by: "Garo", cat: "Survie", dur: "42:10" });
  assert.equal(ok?.yt, "dQw4w9WgXcQ");
  assert.equal(ok?.dur, "42:10");
  assert.equal(decodeVideo({ t: "Court", url: "https://youtu.be/dQw4w9WgXcQ" })?.yt, "dQw4w9WgXcQ");
  assert.equal(decodeVideo({ t: "Short", url: "https://youtube.com/shorts/dQw4w9WgXcQ" })?.yt, "dQw4w9WgXcQ");
  assert.equal(decodeVideo({ t: "Live", url: "https://www.twitch.tv/videos/123" })?.yt, "");
  assert.equal(decodeVideo({ t: "Piège", url: "https://evil.example/watch?v=dQw4w9WgXcQ" }), null);
  assert.equal(decodeVideo({ t: "Pas https", url: "http://www.youtube.com/watch?v=dQw4w9WgXcQ" }), null);
  assert.equal(decodeVideo({ t: "", url: "https://youtu.be/dQw4w9WgXcQ" }), null);
  assert.equal(decodeVideo({ t: "Durée bizarre", url: "https://youtu.be/dQw4w9WgXcQ", dur: "<b>" })?.dur, "");
});
