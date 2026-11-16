// ── Série de jours de jeu (ReLaunch) ──────────────────────────────────────────────────────────────────────
// À coller dans le Worker relink-auth JUSTE AVANT la ligne « const ROUTES = [ » suivie de « ...EXTRA_ROUTES, »,
// puis ajouter « ...RL_STREAK_ROUTES, » comme TOUTE PREMIÈRE entrée du tableau ROUTES. Voir docs/SERIE.md.
//
// Un jour est validé quand le joueur a joué au moins RL_STREAK.minSeconds ce jour-là (heure de Paris). Le temps de
// jeu vient des signaux que le launcher envoie chaque minute pendant une partie (POST /launcher/me/playtick, et
// PUT /launcher/me/presence avec « game ») : au plus ~75 s comptées par signal, et rien si deux signaux sont
// trop rapprochés (les deux signaux ne s'additionnent donc pas). Les récompenses sont versées ici, une fois par jour validé (grantEclatsInternal).
//
// Gels : 1 gel gagné tous les RL_STREAK.freezeEvery jours de série (stock limité). Un gel couvre automatiquement
// un jour manqué : au retour, la série continue si les gels couvrent tous les jours manqués.
// Tables : colonnes ajoutées automatiquement à « streaks » (freezes, day, last_tick, share). Rien à lancer à la main.

const RL_STREAK = {
  minSeconds: 15 * 60, // temps de jeu pour valider une journée
  tickMaxSeconds: 75, // au plus compté par signal de présence
  tickMinGapMs: 45 * 1000, // signaux trop rapprochés ignorés
  freezeEvery: 7, // 1 gel tous les 7 jours de série
  freezeMax: 2, // gels en réserve au maximum
  // récompense quotidienne, qui grandit avec la série : [à partir du jour, éclats]
  daily: [
    [1, 5],
    [7, 8],
    [14, 10],
    [30, 12],
    [60, 15],
    [100, 20],
  ],
  // paliers : bonus versé le jour où la série atteint ce nombre de jours
  milestones: [
    [3, 15],
    [7, 40],
    [14, 80],
    [30, 150],
    [50, 250],
    [75, 350],
    [100, 500],
    [150, 750],
    [200, 1000],
    [365, 2000],
  ],
};

let rlStreakReady = null;
function rlStreakSchema(env) {
  if (!rlStreakReady) {
    rlStreakReady = (async () => {
      await env.relinkdb
        .prepare(`CREATE TABLE IF NOT EXISTS streaks (
          discord_id TEXT PRIMARY KEY, current_streak INTEGER NOT NULL DEFAULT 0, longest_streak INTEGER NOT NULL DEFAULT 0,
          last_valid_date TEXT, last_freeze_used_date TEXT, playtime_seconds_today INTEGER NOT NULL DEFAULT 0,
          blocks_today INTEGER NOT NULL DEFAULT 0, updated_at TEXT)`)
        .run();
      for (const col of ["freezes INTEGER NOT NULL DEFAULT 0", "day TEXT", "last_tick INTEGER", "share INTEGER NOT NULL DEFAULT 1"]) {
        try {
          await env.relinkdb.prepare(`ALTER TABLE streaks ADD COLUMN ${col}`).run();
        } catch {
          // colonne déjà là
        }
      }
    })().catch((e) => {
      rlStreakReady = null;
      throw e;
    });
  }
  return rlStreakReady;
}

/** Jour (AAAA-MM-JJ) à l'heure de Paris. */
function rlParisDay(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}
/** Nombre de jours entre deux dates AAAA-MM-JJ (b - a). */
function rlDaysBetween(a, b) {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
}
function rlDailyReward(day) {
  let r = 0;
  for (const [from, v] of RL_STREAK.daily) if (day >= from) r = v;
  return r;
}
function rlMilestoneBonus(day) {
  const m = RL_STREAK.milestones.find(([d]) => d === day);
  return m ? m[1] : 0;
}

/**
 * État affiché (sans rien écrire) : une série dont les jours manqués dépassent les gels est « rompue »
 * (affichée à 0, elle repartira à 1 au prochain jour validé).
 */
function rlStreakState(row, now) {
  const today = rlParisDay(now);
  const lv = row?.last_valid_date || null;
  const freezes = row?.freezes || 0;
  let current = row?.current_streak || 0;
  let status = "none";
  let missed = 0;
  if (lv) {
    const gap = rlDaysBetween(lv, today);
    missed = Math.max(0, gap - 1);
    if (gap <= 0) status = "validated";
    else if (missed === 0) status = "pending";
    else if (missed <= freezes) status = "frozen";
    else {
      status = "broken";
      current = 0;
    }
  }
  const todaySeconds = row && row.day === today ? row.playtime_seconds_today || 0 : 0;
  const next = RL_STREAK.milestones.find(([d]) => d > current) || null;
  return {
    current,
    longest: row?.longest_streak || 0,
    lastValidDate: lv,
    status, // none | validated (jour validé) | pending (à valider aujourd'hui) | frozen (des gels couvriront les jours manqués) | broken
    missedDays: missed,
    validatedToday: status === "validated",
    todaySeconds,
    requiredSeconds: RL_STREAK.minSeconds,
    freezes,
    freezeMax: RL_STREAK.freezeMax,
    freezeEvery: RL_STREAK.freezeEvery,
    dailyReward: rlDailyReward(status === "validated" ? current : current + 1), // aujourd'hui, ou au prochain jour validé
    nextMilestone: next ? { day: next[0], bonus: next[1] } : null,
    milestones: RL_STREAK.milestones.map(([day, bonus]) => ({ day, bonus })),
    share: row ? row.share !== 0 : true,
    // champs gardés pour les anciens launchers
    days: RL_STREAK.milestones[RL_STREAK.milestones.length - 1][0],
  };
}

async function rlStreakRow(env, id) {
  await rlStreakSchema(env);
  return env.relinkdb
    .prepare("SELECT current_streak, longest_streak, last_valid_date, last_freeze_used_date, playtime_seconds_today, freezes, day, last_tick, share FROM streaks WHERE discord_id = ?")
    .bind(id)
    .first();
}

/** Un signal « en jeu » : ajoute le temps, valide la journée au seuil, verse les récompenses. */
async function rlStreakTick(env, id, now = Date.now()) {
  const row = (await rlStreakRow(env, id)) || null;
  if (row && row.last_tick && now - row.last_tick < RL_STREAK.tickMinGapMs) return null;
  const today = rlParisDay(now);
  const add = row && row.last_tick ? Math.min(RL_STREAK.tickMaxSeconds, Math.max(0, Math.round((now - row.last_tick) / 1000))) : 60;
  const seconds = (row && row.day === today ? row.playtime_seconds_today || 0 : 0) + add;
  let current = row?.current_streak || 0;
  let longest = row?.longest_streak || 0;
  let freezes = row?.freezes || 0;
  let lv = row?.last_valid_date || null;
  let usedFreeze = row?.last_freeze_used_date || null;
  let validated = false;
  if (seconds >= RL_STREAK.minSeconds && lv !== today) {
    const missed = lv ? rlDaysBetween(lv, today) - 1 : -1;
    if (missed === 0) current += 1;
    else if (missed > 0 && missed <= freezes) {
      freezes -= missed; // les gels couvrent les jours manqués
      usedFreeze = today;
      current += 1;
    } else current = 1;
    longest = Math.max(longest, current);
    lv = today;
    validated = true;
    if (current % RL_STREAK.freezeEvery === 0) freezes = Math.min(RL_STREAK.freezeMax, freezes + 1);
  }
  await env.relinkdb
    .prepare(
      `INSERT INTO streaks (discord_id, current_streak, longest_streak, last_valid_date, last_freeze_used_date, playtime_seconds_today, freezes, day, last_tick, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(discord_id) DO UPDATE SET current_streak = excluded.current_streak, longest_streak = excluded.longest_streak,
         last_valid_date = excluded.last_valid_date, last_freeze_used_date = excluded.last_freeze_used_date,
         playtime_seconds_today = excluded.playtime_seconds_today, freezes = excluded.freezes, day = excluded.day,
         last_tick = excluded.last_tick, updated_at = excluded.updated_at`,
    )
    .bind(id, current, longest, lv, usedFreeze, seconds, freezes, today, now)
    .run();
  if (validated) {
    const daily = rlDailyReward(current);
    const bonus = rlMilestoneBonus(current);
    if (daily > 0) await grantEclatsInternal(env, id, daily, "streak_daily", { day: current, date: today });
    if (bonus > 0) await grantEclatsInternal(env, id, bonus, "streak_milestone", { day: current, date: today });
  }
  return { validated, current };
}

// ── routes (enveloppent les gestionnaires existants) ──
async function rlStreakPresencePut(request, env, origin) {
  let body = null;
  try {
    body = await request.clone().json();
  } catch {
    body = null;
  }
  const payload = body && body.game ? await requireAuth(request.clone(), env, origin) : null;
  const res = await handleLauncherPresencePut(request, env, origin);
  if (res.ok && payload && !(payload instanceof Response) && body && body.game && typeof body.game === "object") {
    try {
      await rlStreakTick(env, payload.discord_id);
    } catch {
      // la présence reste enregistrée même si la série ne peut pas l'être
    }
  }
  return res;
}

async function rlStreakQuests(request, env, origin) {
  const payload = await requireAuth(request.clone(), env, origin);
  const res = await handleLauncherQuests(request, env, origin);
  if (!res.ok || payload instanceof Response) return res;
  try {
    const data = await res.clone().json();
    data.streak = rlStreakState(await rlStreakRow(env, payload.discord_id), Date.now());
    return json(data, 200, origin);
  } catch {
    return res;
  }
}

async function rlStreakFriends(request, env, origin) {
  const res = await handleLauncherFriendsListWithPresence(request, env, origin);
  if (!res.ok) return res;
  try {
    const data = await res.clone().json();
    const list = Array.isArray(data.friends) ? data.friends : [];
    const ids = list.map((f) => f && f.id).filter((x) => typeof x === "string");
    if (!ids.length) return res;
    await rlStreakSchema(env);
    const now = Date.now();
    const by = new Map();
    for (let i = 0; i < ids.length; i += 90) {
      const chunk = ids.slice(i, i + 90);
      const rows = await env.relinkdb
        .prepare(`SELECT discord_id, current_streak, longest_streak, last_valid_date, freezes, day, playtime_seconds_today, share FROM streaks WHERE discord_id IN (${chunk.map(() => "?").join(",")})`)
        .bind(...chunk)
        .all();
      for (const r of rows.results || []) by.set(r.discord_id, r);
    }
    for (const f of list) {
      const r = by.get(f.id);
      if (!r || r.share === 0) continue;
      const st = rlStreakState(r, now);
      if (st.current > 0) f.streak = { current: st.current, longest: st.longest, validatedToday: st.validatedToday };
    }
    return json(data, 200, origin);
  } catch {
    return res;
  }
}

/** POST /launcher/me/playtick — envoyé chaque minute par le launcher pendant une partie (même si la présence est masquée). */
async function rlStreakPlayTick(request, env, origin) {
  const payload = await requireAuth(request, env, origin);
  if (payload instanceof Response) return payload;
  const r = await rlStreakTick(env, payload.discord_id);
  return json({ ok: true, counted: !!r, validated: !!(r && r.validated), current: r ? r.current : null }, 200, origin);
}

/** PUT /launcher/me/streak  { share: boolean }  — montrer ou non sa série à ses amis. */
async function rlStreakSetShare(request, env, origin) {
  const payload = await requireAuth(request, env, origin);
  if (payload instanceof Response) return payload;
  const body = (await readJson(request)) || {};
  if (typeof body.share !== "boolean") return json({ error: "share doit valoir true ou false" }, 400, origin);
  await rlStreakSchema(env);
  await env.relinkdb
    .prepare("INSERT INTO streaks (discord_id, share, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(discord_id) DO UPDATE SET share = excluded.share, updated_at = excluded.updated_at")
    .bind(payload.discord_id, body.share ? 1 : 0)
    .run();
  return json({ ok: true, share: body.share }, 200, origin);
}

const RL_STREAK_ROUTES = [
  ["PUT", "/launcher/me/presence", rlStreakPresencePut],
  ["GET", "/launcher/quests", rlStreakQuests],
  ["GET", "/launcher/friends", rlStreakFriends],
  ["PUT", "/launcher/me/streak", rlStreakSetShare],
  ["POST", "/launcher/me/playtick", rlStreakPlayTick],
];
