// Profil (bouton du compte dans la barre) : vraie tête du joueur, série de jours de jeu (ReLink) et
// statistiques de jeu (gardées sur ce PC). La série vient du serveur ; les stats sont comptées localement.
import { useEffect, useState, type ReactNode } from "react";
import type { PlayStatsView, Streak } from "../../shared/api";
import { useApp } from "./ctx";
import { Ic } from "./Ic";
import { t } from "./i18n";
import { headFaces, RealHead, usePlayerHead, usePlayerSkin } from "./SkinHead";
import { PlayerModel } from "./PlayerModel";
import { Head } from "./Bars";
import { SKINS } from "./model";
import { useQuests } from "./Quests";

/** Durée lisible : « 2 h 05 », « 45 min », « 30 s ». */
export function fmtDur(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 100) return `${h} h ${String(m % 60).padStart(2, "0")}`;
  return `${h} h`;
}

const STATUS: Record<NonNullable<Streak["status"]>, string> = {
  none: "Joue 15 minutes aujourd'hui pour lancer ta série.",
  validated: "Journée validée : reviens demain pour continuer.",
  pending: "Joue aujourd'hui pour garder ta série.",
  frozen: "Jour manqué couvert par un gel : joue aujourd'hui pour continuer.",
  broken: "Série perdue : rejoue aujourd'hui pour en lancer une nouvelle.",
};

/** Image de partage (PNG) de la série, dessinée ici : rien n'est chargé depuis Internet. */
async function streakImage(s: Streak, name: string, skin: string | null, st: PlayStatsView | null): Promise<string> {
  const W = 960;
  const H = 480;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d")!;
  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#1a0f0a");
  bg.addColorStop(0.55, "#2b1208");
  bg.addColorStop(1, "#0b0d13");
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  const glow = c.createRadialGradient(250, 250, 10, 250, 250, 260);
  glow.addColorStop(0, "rgba(255,140,40,.45)");
  glow.addColorStop(1, "rgba(255,140,40,0)");
  c.fillStyle = glow;
  c.fillRect(0, 0, W, H);
  // flamme
  c.save();
  c.translate(130, 95);
  c.scale(10, 10);
  const fl = c.createLinearGradient(0, 3, 0, 18);
  fl.addColorStop(0, "#ffd35a");
  fl.addColorStop(1, "#ff5a1f");
  c.fillStyle = fl;
  c.fill(new Path2D("M12 3c1 3.5 5 5.5 5 10a5 5 0 01-10 0c0-2.2 1.2-3.6 2.5-4.6.2 1.6 1 2.6 2 3.1C11 8.6 11.6 5.6 12 3z"));
  c.restore();
  c.textAlign = "center";
  c.fillStyle = "#fff";
  c.font = "800 120px 'Segoe UI', system-ui, sans-serif";
  c.fillText(String(s.current), 250, 395);
  c.font = "600 26px 'Segoe UI', system-ui, sans-serif";
  c.fillStyle = "rgba(255,255,255,.75)";
  c.fillText(s.current > 1 ? t("jours d'affilée") : t("jour d'affilée"), 250, 440);
  // tête + pseudo + record
  c.textAlign = "left";
  const x = 470;
  let nx = x;
  if (skin) {
    const f = await headFaces(skin);
    if (f) {
      const img = new Image();
      await new Promise<void>((r) => {
        img.onload = () => r();
        img.onerror = () => r();
        img.src = f.f;
      });
      c.imageSmoothingEnabled = false;
      c.drawImage(img, x, 46, 76, 76);
      nx = x + 94;
    }
  }
  c.fillStyle = "#fff";
  c.font = "800 38px 'Segoe UI', system-ui, sans-serif";
  c.fillText(name.slice(0, 18), nx, 88);
  c.font = "500 21px 'Segoe UI', system-ui, sans-serif";
  c.fillStyle = "rgba(255,255,255,.75)";
  const sub = [`${t("Record")} : ${s.longest} ${s.longest > 1 ? t("jours") : t("jour")}`];
  if (s.freezes !== undefined) sub.push(`❄ ${s.freezes}/${s.freezeMax ?? s.freezes}`);
  c.fillText(sub.join("   ·   "), nx, 118);
  // statistiques de jeu (comptées sur ce PC)
  if (st) {
    const tiles: [string, string][] = [
      [fmtDur(st.totalSeconds), t("Temps de jeu cumulé")],
      [String(st.daysPlayed), t("Jours joués")],
      [st.sessions ? fmtDur(st.totalSeconds / st.sessions) : "—", t("Session moyenne")],
      [fmtDur(st.longestSeconds), t("Plus longue session")],
    ];
    const W2 = 214;
    const H2 = 84;
    tiles.forEach(([v, l], i) => {
      const tx = x + (i % 2) * (W2 + 16);
      const ty = 158 + Math.floor(i / 2) * (H2 + 14);
      c.beginPath();
      c.roundRect(tx, ty, W2, H2, 16);
      c.fillStyle = "rgba(255,255,255,.07)";
      c.fill();
      c.strokeStyle = "rgba(255,255,255,.13)";
      c.lineWidth = 1.5;
      c.stroke();
      c.fillStyle = "#fff";
      c.font = "800 30px 'Segoe UI', system-ui, sans-serif";
      c.fillText(v, tx + 18, ty + 42);
      c.fillStyle = "rgba(255,255,255,.7)";
      c.font = "500 17px 'Segoe UI', system-ui, sans-serif";
      c.fillText(l, tx + 18, ty + 68);
    });
  }
  c.font = "800 30px 'Segoe UI', system-ui, sans-serif";
  c.fillStyle = "#ff8a2a";
  c.fillText("ReLaunch", x, 440);
  return cv.toDataURL("image/png");
}

/** Copie l'image « mes stats » (série + statistiques de jeu) dans le presse-papiers. */
async function shareStats(s: Streak, name: string, skin: string | null, toast: (m: string) => void): Promise<void> {
  try {
    const st = await window.wecraft.account.playStats().catch(() => null);
    const png = await streakImage(s, name, skin, st);
    const ok = await window.wecraft.account.shareImage(png, `🔥 ${s.current} ${s.current > 1 ? t("jours d'affilée") : t("jour d'affilée")} ${t("sur ReLaunch")} (${t("record")} : ${s.longest})`);
    toast(ok ? t("Image de tes stats copiée : colle-la sur Discord ou ailleurs.") : t("Copie impossible."));
  } catch {
    toast(t("Copie impossible."));
  }
}

/** Série de jours de jeu : progression du jour, gels, paliers, partage. */
export function StreakCard({ s, name, onChanged }: { s: Streak; name: string; onChanged?: () => void }) {
  const { toast } = useApp();
  const skin = usePlayerSkin();
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState(s.share !== false);
  useEffect(() => setShare(s.share !== false), [s.share]);
  const rich = s.status !== undefined; // module « série » présent sur le serveur
  const req = s.requiredSeconds || 900;
  const today = Math.min(req, s.todaySeconds ?? 0);
  const pct = s.validatedToday ? 100 : Math.round((today / req) * 100);
  const next = s.nextMilestone ?? s.milestones.find((m) => m.day > s.current) ?? null;
  const copy = async () => {
    setBusy(true);
    try {
      await shareStats(s, name, skin, toast);
    } finally {
      setBusy(false);
    }
  };
  const toggleShare = (v: boolean) => {
    setShare(v);
    void window.wecraft.account.streakShare(v).then((r) => {
      if (!r.ok) {
        setShare(!v);
        toast(r.message ?? t("Réglage non enregistré."));
      } else onChanged?.();
    });
  };
  return (
    <div className={`qstreak st-${s.status ?? "none"}`}>
      <span className={`qico big${s.validatedToday ? " lit" : ""}`} aria-hidden="true">
        <Ic n="flame" />
      </span>
      <span className="qtxt">
        <b>{`${s.current} ${s.current > 1 ? t("jours d'affilée") : t("jour d'affilée")}`}</b>
        <small>
          {[`${t("Record")} : ${s.longest}`, s.dailyReward ? `+${s.dailyReward} ${t("éclats par jour validé")}` : "", next ? `${t("Prochain palier")} : ${next.day} ${t("jours")} (+${next.bonus})` : ""].filter(Boolean).join(" · ")}
        </small>
        {rich ? (
          <>
            <small className="st-msg">{t(STATUS[s.status ?? "none"])}</small>
            <span className="st-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t("Temps de jeu aujourd'hui")}>
              <i style={{ width: `${pct}%` }}></i>
            </span>
            <small className="faint">{s.validatedToday ? t("Aujourd'hui : validé") : `${t("Aujourd'hui")} : ${fmtDur(today)} / ${fmtDur(req)}`}</small>
            <span className="st-freeze" title={t("Un gel protège ta série un jour où tu ne joues pas. Tu en gagnes un tous les 7 jours de série.")}>
              {Array.from({ length: Math.max(s.freezeMax ?? 0, s.freezes ?? 0) }, (_, i) => (
                <span key={i} className={i < (s.freezes ?? 0) ? "on" : ""}>
                  <Ic n="snow" />
                </span>
              ))}
              <small>{`${t("Gels de série")} : ${s.freezes ?? 0}/${s.freezeMax ?? 0}${s.freezeEvery ? ` · ${t("1 gel tous les")} ${s.freezeEvery} ${t("jours")}` : ""}`}</small>
            </span>
          </>
        ) : null}
        {s.milestones.length ? (
          <span className="qmiles" aria-label={t("Paliers")}>
            {s.milestones.map((m) => (
              <span key={m.day} className={s.current >= m.day ? "on" : next?.day === m.day ? "next" : ""} title={`${t("Jour")} ${m.day} : +${m.bonus} ${t("éclats")}`}>
                <b>{m.day}</b>
                <small>{`+${m.bonus}`}</small>
              </span>
            ))}
          </span>
        ) : null}
        <span className="st-act">
          <button className="btn sm" disabled={busy} onClick={() => void copy()}>
            <Ic n="share" />
            {busy ? t("Copie…") : t("Partager mes stats")}
          </button>
          {rich ? (
            <label className="st-share">
              <input type="checkbox" checked={share} onChange={(e) => toggleShare(e.target.checked)} />
              {t("Visible par mes amis")}
            </label>
          ) : null}
        </span>
      </span>
    </div>
  );
}

function StatsCard({ st }: { st: PlayStatsView }) {
  const max = Math.max(1, ...st.last14.map((d) => d.seconds));
  const topMax = Math.max(1, ...st.top.map((x) => x.seconds));
  const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
  if (!st.launches) return <div className="empty">{t("Lance une instance : ton temps de jeu, tes modpacks préférés et tes amis de jeu apparaîtront ici.")}</div>;
  return (
    <div className="pstats">
      <div className="ps-tiles">
        <span>
          <b>{fmtDur(st.totalSeconds)}</b>
          <small>{t("Temps de jeu cumulé")}</small>
        </span>
        <span>
          <b>{st.launches}</b>
          <small>{t("Lancements")}</small>
        </span>
        <span>
          <b>{st.instances}</b>
          <small>{t("Modpacks lancés")}</small>
        </span>
        <span>
          <b>{st.daysPlayed}</b>
          <small>{t("Jours joués")}</small>
        </span>
        <span>
          <b>{fmtDur(st.longestSeconds)}</b>
          <small>{t("Plus longue session")}</small>
        </span>
        <span>
          <b>{st.sessions ? fmtDur(st.totalSeconds / st.sessions) : "—"}</b>
          <small>{t("Session moyenne")}</small>
        </span>
      </div>
      <div className="ps-days" aria-label={t("14 derniers jours")}>
        {st.last14.map((d) => (
          <span key={d.day} title={`${dayLabel(d.day)} : ${fmtDur(d.seconds)}`}>
            <i style={{ height: `${Math.max(d.seconds ? 4 : 0, Math.round((d.seconds / max) * 100))}%` }}></i>
            <small>{dayLabel(d.day).replace(/\.$/, "")}</small>
          </span>
        ))}
      </div>
      <div className="ps-cols">
        <div>
          <h4>{t("Modpacks les plus joués")}</h4>
          {st.top.map((x, i) => (
            <div key={`${x.name}-${i}`} className="ps-row">
              <span className="ps-rk">{i + 1}</span>
              <span className="ps-nm">
                <b>{x.name}</b>
                <small className="faint">{`${x.mc ? `${x.mc} · ` : ""}${x.launches} ${x.launches > 1 ? t("lancements") : t("lancement")}`}</small>
                <span className="ps-bar">
                  <i style={{ width: `${Math.round((x.seconds / topMax) * 100)}%` }}></i>
                </span>
              </span>
              <span className="ps-v">{fmtDur(x.seconds)}</span>
            </div>
          ))}
        </div>
        <div>
          <h4>{t("Amis avec qui tu as le plus joué")}</h4>
          {st.friends.length ? (
            st.friends.map((f, i) => (
              <div key={f.id} className="ps-row">
                <span className="ps-rk">{i + 1}</span>
                <span className="ps-nm">
                  <b>{f.name}</b>
                </span>
                <span className="ps-v">{fmtDur(f.seconds)}</span>
              </div>
            ))
          ) : (
            <small className="faint">{t("Joue sur le même event ou modpack ReLink qu'un ami, en même temps, pour le voir apparaître ici.")}</small>
          )}
        </div>
      </div>
      {st.since ? <small className="faint">{`${t("Compté sur ce PC depuis le")} ${new Date(st.since).toLocaleDateString()}`}</small> : null}
    </div>
  );
}

/** Petite carte du bas : série du jour, modpack préféré, meilleur ami de jeu (défile toute seule). */
function HeroCard({ s, st, name, loggedIn }: { s: Streak | null; st: PlayStatsView | null; name: string; loggedIn: boolean }) {
  const { toast } = useApp();
  const skin = usePlayerSkin();
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const slides: { k: string; title: string; body: string; extra?: ReactNode; action?: ReactNode }[] = [];
  if (s) {
    const req = s.requiredSeconds || 900;
    const today = Math.min(req, s.todaySeconds ?? 0);
    const pct = s.validatedToday ? 100 : Math.round((today / req) * 100);
    slides.push({
      k: "streak",
      title: `🔥 ${s.current} ${s.current > 1 ? t("jours d'affilée") : t("jour d'affilée")}`,
      body: s.validatedToday ? t("Journée validée : reviens demain pour continuer.") : `${t("Aujourd'hui")} : ${fmtDur(today)} / ${fmtDur(req)}`,
      extra: (
        <span className="st-bar">
          <i style={{ width: `${pct}%` }}></i>
        </span>
      ),
      action: (
        <button
          className="btn sm"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void shareStats(s, name, skin, toast).finally(() => setBusy(false));
          }}
        >
          {busy ? t("Copie…") : t("Partager mes stats")}
        </button>
      ),
    });
  } else if (!loggedIn)
    slides.push({
      k: "login",
      title: t("Série de jours"),
      body: t("Connecte-toi à ReLink pour ta série de jours de jeu et tes récompenses."),
      action: (
        <button className="btn sm" data-go="settings" data-set="compte">
          {t("Se connecter")}
        </button>
      ),
    });
  const top = st?.top[0];
  if (top) slides.push({ k: "pack", title: top.name, body: `${t("Modpack le plus joué")} · ${fmtDur(top.seconds)} · ${top.launches} ${top.launches > 1 ? t("lancements") : t("lancement")}` });
  const fr = st?.friends[0];
  if (fr) slides.push({ k: "friend", title: fr.name, body: `${t("Ami avec qui tu as le plus joué")} · ${fmtDur(fr.seconds)}` });
  useEffect(() => {
    if (slides.length < 2) return;
    const iv = window.setInterval(() => setI((x) => x + 1), 7000);
    return () => window.clearInterval(iv);
  }, [slides.length]);
  if (!slides.length) return null;
  const cur = slides[i % slides.length]!;
  return (
    <div className="pf-card" key={cur.k}>
      <b>{cur.title}</b>
      <small>{cur.body}</small>
      {cur.extra}
      <span className="pf-card-foot">
        {cur.action ?? <span></span>}
        {slides.length > 1 ? (
          <span className="pf-dots" role="tablist">
            {slides.map((x, j) => (
              <button key={x.k} role="tab" aria-selected={j === i % slides.length ? "true" : "false"} aria-label={x.title} onClick={() => setI(j)}></button>
            ))}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function ProfilePage() {
  const { account, ui } = useApp();
  const faces = usePlayerHead();
  const [st, setSt] = useState<PlayStatsView | null>(null);
  const u = account?.loggedIn ? account.user : null;
  const { q } = useQuests(!!u);
  useEffect(() => {
    let alive = true;
    const load = () => void window.wecraft.account.playStats().then((s) => alive && setSt(s), () => undefined);
    load();
    const iv = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, []);
  const name = u?.pseudo ?? u?.minecraftName ?? t("Joueur");
  const skin = usePlayerSkin();
  const model = account?.minecraftSkin?.model;
  const streak = q?.ok ? q.streak : null;
  // menu façon écran d'accueil de jeu ; les stats ont leur propre page
  const menu: { l: string; go: string; rl?: string; set?: string }[] = [
    { l: t("Jouer"), go: "wecraft" },
    { l: t("Statistiques"), go: "relink", rl: "stats" },
    { l: t("Quêtes"), go: "quests" },
    { l: t("Mon skin"), go: "settings", set: "compte" },
  ];
  return (
    <>
      <section className="pf-hero">
        <div className="pf-id">
          <h2>{name}</h2>
          <div className="sub">
            {u
              ? [u.minecraftName && u.minecraftVerified ? `${t("Minecraft")} : ${u.minecraftName}` : "", `${u.eclats} ${t("éclats")}`].filter(Boolean).join(" · ")
              : t("Compte ReLink non connecté")}
          </div>
        </div>
        <ul className="pf-menu" aria-label={t("Menu du compte")}>
          {menu.map((m) => (
            <li key={m.l}>
              <button data-go={m.go} {...(m.rl ? { "data-rl": m.rl } : {})} {...(m.set ? { "data-set": m.set } : {})} data-a={`pf-${m.go}${m.rl ? `-${m.rl}` : ""}`}>
                {m.l}
              </button>
            </li>
          ))}
        </ul>
        <div className="pf-figure">
          {skin ? <PlayerModel skin={skin} {...(model ? { model } : {})} height={380} /> : faces ? <RealHead faces={faces} size={150} /> : <Head skin={SKINS[ui.skin] ?? SKINS[0]!} size={150} />}
        </div>
        <HeroCard s={streak ?? null} st={st} name={u?.minecraftName ?? u?.pseudo ?? name} loggedIn={!!u} />
      </section>
    </>
  );
}

/** Page des statistiques (bouton « Statistiques » du profil) : série de jours et statistiques de jeu. */
export function StatsPage() {
  const { account } = useApp();
  const [st, setSt] = useState<PlayStatsView | null>(null);
  const u = account?.loggedIn ? account.user : null;
  const { q, reload } = useQuests(!!u);
  useEffect(() => {
    let alive = true;
    const load = () => void window.wecraft.account.playStats().then((s) => alive && setSt(s), () => undefined);
    load();
    const iv = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, []);
  return (
    <>
      <div className="vhead">
        <div>
          <button className="btn sm ghost pf-back" data-go="relink" data-rl="profil" data-a="stats-back">
            ← {t("Profil")}
          </button>
          <h2>{t("Statistiques")}</h2>
          <div className="sub">{t("Ta série de jours et ton temps de jeu (compté sur ce PC)")}</div>
        </div>
      </div>
      {u ? (
        <div className="sect">
          <h3>{t("Série de jours")}</h3>
          {q?.ok && q.streak ? <StreakCard s={q.streak} name={u.minecraftName ?? u.pseudo} onChanged={reload} /> : <div className="empty">{q && !q.ok ? (q.error ?? t("Série de jours indisponible pour le moment.")) : t("Chargement…")}</div>}
        </div>
      ) : null}
      <div className="sect">
        <h3>
          <Ic n="chart" /> {t("Statistiques de jeu")}
        </h3>
        {st ? <StatsCard st={st} /> : <div className="empty">{t("Chargement…")}</div>}
      </div>
    </>
  );
}
