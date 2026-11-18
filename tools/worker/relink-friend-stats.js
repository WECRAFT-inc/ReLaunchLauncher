// ── Stats de jeu visibles par les amis (ReLaunch) ────────────────────────────────────────────────────────
// À coller dans le Worker relink-auth JUSTE AVANT la ligne « const ROUTES = [ » suivie de « ...EXTRA_ROUTES, »,
// puis ajouter « ...RL_FRIEND_STATS_ROUTES, » comme TOUTE PREMIÈRE entrée du tableau ROUTES. Voir docs/STATS-AMIS.md.
//
// Le launcher envoie un résumé de ses statistiques (comptées sur le PC du joueur) seulement si le joueur a coché
// « Visible par mes amis » (même réglage que la série : kv_store « streak:share:<id> »). Le Worker ne le montre
// aux amis que si ce réglage est actif au moment de la lecture. Rien à créer dans D1 (kv_store existe déjà).

const RL_FRIEND_STATS_MAX = 4096;

function rlCleanFriendStats(b) {
  const o = b && typeof b === "object" && !Array.isArray(b) ? b : {};
  const n = (x, max = 1e10) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.min(max, Math.floor(x)) : 0);
  const top = (Array.isArray(o.top) ? o.top : [])
    .slice(0, 10)
    .flatMap((t) => {
      const name = t && typeof t.name === "string" ? t.name.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 80) : "";
      return name ? [{ name, seconds: n(t.seconds) }] : [];
    })
    .slice(0, 3);
  return {
    totalSeconds: n(o.totalSeconds),
    daysPlayed: n(o.daysPlayed, 100000),
    launches: n(o.launches, 1e7),
    sessions: n(o.sessions, 1e7),
    longestSeconds: n(o.longestSeconds, 86400 * 30),
    instances: n(o.instances, 10000),
    top,
    updatedAt: new Date().toISOString(),
  };
}

/** PUT /launcher/me/stats — enregistre le résumé (refusé si « Visible par mes amis » n'est pas coché). */
async function rlFriendStatsPut(request, env, origin) {
  const payload = await requireAuth(request, env, origin);
  if (payload instanceof Response) return payload;
  try {
    const rl = await checkPublicRateLimit(env, "friend-stats", payload.discord_id, 30, 60 * 60 * 1000);
    if (!rl.allowed) return json({ error: "Trop d'envois." }, 429, origin);
    const text = await request.text();
    if (text.length > RL_FRIEND_STATS_MAX) return json({ error: "Résumé trop volumineux." }, 413, origin);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "JSON invalide" }, 400, origin);
    }
    const share = await env.relinkdb.prepare("SELECT value FROM kv_store WHERE key = ?").bind(`streak:share:${payload.discord_id}`).first();
    if (!share || share.value !== "true") return json({ ok: false, reason: "not_shared" }, 200, origin);
    await env.relinkdb
      .prepare(`INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .bind(`stats:${payload.discord_id}`, JSON.stringify(rlCleanFriendStats(body)))
      .run();
    return json({ ok: true }, 200, origin);
  } catch (e) {
    return internalError(e, origin, "launcher_friend_stats");
  }
}

/** GET /launcher/friends — réponse d'origine + « stats » de chaque ami qui les partage. */
async function rlFriendStatsList(request, env, origin) {
  const res = await handleLauncherFriendsListWithPresence(request, env, origin);
  if (!res.ok) return res;
  try {
    const data = await res.clone().json();
    const list = Array.isArray(data.friends) ? data.friends : [];
    const ids = list.map((f) => f && f.id).filter((x) => typeof x === "string" && /^\d{5,25}$/.test(x));
    if (!ids.length) return res;
    const keys = [];
    for (const id of ids) keys.push(`streak:share:${id}`, `stats:${id}`);
    const rows = new Map();
    for (let i = 0; i < keys.length; i += 90) {
      const chunk = keys.slice(i, i + 90);
      const r = await env.relinkdb.prepare(`SELECT key, value FROM kv_store WHERE key IN (${chunk.map(() => "?").join(",")})`).bind(...chunk).all();
      for (const row of r.results || []) rows.set(row.key, row.value);
    }
    for (const f of list) {
      if (!f || rows.get(`streak:share:${f.id}`) !== "true") continue;
      const raw = rows.get(`stats:${f.id}`);
      if (!raw) continue;
      try {
        f.stats = JSON.parse(raw);
      } catch {
        // entrée abîmée : ignorée
      }
    }
    return json(data, 200, origin);
  } catch {
    return res;
  }
}

const RL_FRIEND_STATS_ROUTES = [
  ["PUT", "/launcher/me/stats", rlFriendStatsPut],
  ["GET", "/launcher/friends", rlFriendStatsList],
];
