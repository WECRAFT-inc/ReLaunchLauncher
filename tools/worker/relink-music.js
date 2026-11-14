// ── Musique partagée dans la présence des amis (ReLaunch) ─────────────────────────────────────────────
// À coller À LA FIN du Worker relink-auth (tableau de bord Cloudflare → Workers → relink-auth → Modifier le code).
// Voir docs/MUSIQUE.md pour les 3 lignes à ajouter dans les fonctions existantes.
//
// Contrat : PUT /launcher/me/presence peut contenir  music: { title, artist, app } | null
//   - le launcher n'envoie un morceau QUE si le joueur a activé « Partager ma musique avec mes amis » ;
//   - music absent ou null → le morceau enregistré est effacé ;
//   - GET /launcher/friends ajoute  music: { title, artist, app } | null  à chaque ami en ligne ou absent.
// Table créée automatiquement (aucune requête SQL à lancer) : relinked_presence_music.

let rlMusicReady = null;

function rlMusicSchema(env) {
  if (!rlMusicReady) {
    rlMusicReady = env.relinkdb
      .prepare(`CREATE TABLE IF NOT EXISTS relinked_presence_music (
        discord_id TEXT PRIMARY KEY, music TEXT NOT NULL, updated_at INTEGER NOT NULL
      )`)
      .run()
      .then(() => undefined)
      .catch((e) => {
        rlMusicReady = null;
        throw e;
      });
  }
  return rlMusicReady;
}

/** Morceau vérifié (textes courts, sans caractères de contrôle) ; null si rien d'exploitable. */
function rlMusicClean(v) {
  if (!v || typeof v !== 'object') return null;
  const s = (x, n) => (typeof x === 'string' ? x.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '');
  const title = s(v.title, 100);
  if (!title) return null;
  return { title, artist: s(v.artist, 100), app: s(v.app, 40) };
}

/** Appelé par PUT /launcher/me/presence : enregistre ou efface le morceau partagé. */
async function rlMusicPut(env, discordId, raw) {
  await rlMusicSchema(env);
  const m = rlMusicClean(raw);
  if (!m) {
    await env.relinkdb.prepare('DELETE FROM relinked_presence_music WHERE discord_id = ?').bind(discordId).run();
    return;
  }
  await env.relinkdb
    .prepare(`INSERT INTO relinked_presence_music (discord_id, music, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(discord_id) DO UPDATE SET music = excluded.music, updated_at = excluded.updated_at`)
    .bind(discordId, JSON.stringify(m), Date.now())
    .run();
}

/** Appelé par relinkedPresenceOf : ajoute « music » aux amis en ligne ou absents (signal de moins de 3 minutes). */
async function rlMusicAttach(env, presence) {
  const ids = [...presence.entries()].filter(([, p]) => p && p.status !== 'offline').map(([id]) => id);
  if (!ids.length) return;
  try {
    await rlMusicSchema(env);
    const since = Date.now() - RELINKED_PRESENCE_OFFLINE_MS;
    for (let i = 0; i < ids.length; i += 90) {
      const chunk = ids.slice(i, i + 90);
      const rows = await env.relinkdb
        .prepare(`SELECT discord_id, music FROM relinked_presence_music WHERE updated_at > ? AND discord_id IN (${chunk.map(() => '?').join(',')})`)
        .bind(since, ...chunk)
        .all();
      for (const r of rows.results || []) {
        const p = presence.get(r.discord_id);
        if (!p) continue;
        try {
          p.music = rlMusicClean(JSON.parse(r.music));
        } catch {
          p.music = null;
        }
      }
    }
  } catch {
    // musique indisponible : la présence reste servie sans elle
  }
}
