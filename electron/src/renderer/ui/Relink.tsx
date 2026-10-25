// Données du service ReLink (Worker, lecture seule) dans l'interface : actualités et encarts, serveurs,
// events, partenaires, notifications, maintenance et politique de version. Rien n'est inventé : sans
// réponse du service, la page le dit (et garde le dernier état connu, signalé comme ancien).
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { OfficialInstalled, RelinkModpack, RelinkNews, RelinkState } from "../../shared/api";
import { JobView, useJob } from "./Import";
import { useApp } from "./ctx";
import { Ic } from "./Ic";
import { t } from "./i18n";

type Css = CSSProperties & Record<`--${string}`, string>;
const fmtDate = (iso: string) => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "");
const ago = (ms: number | null) => {
  if (!ms) return "";
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`;
};
/** Couleur d'accent d'un élément sans image (déterministe d'après son identifiant). */
const hue = (id: string) => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const coverOf = (id: string): Css => ({ "--c1": `hsl(${hue(id)} 70% 55%)`, "--c2": `hsl(${(hue(id) + 40) % 360} 65% 22%)` });

/** Bandeau d'état du service (hors ligne, données anciennes). */
export function RelinkStatus({ st, what }: { st: RelinkState | null; what: string }) {
  const { refreshRelink } = useApp();
  if (st && st.ok && !st.stale) return null;
  return (
    <div className="card rl-status">
      <span>
        <b>{!st ? t("Connexion au service ReLink…") : st.ok ? t("Données ReLink peut-être anciennes") : t("Service ReLink injoignable")}</b>
        <small className="muted">
          {st?.error ? `${st.error} ` : ""}
          {st?.ok && st.fetchedAt ? `${t("Dernière mise à jour")} ${ago(st.fetchedAt)}. ` : ""}
          {!st?.ok ? `${what} ${t("s'afficheront dès que le service répondra.")}` : ""}
        </small>
      </span>
      <button className="btn sm" onClick={() => refreshRelink(true)}>
        ↻ {t("Réessayer")}
      </button>
    </div>
  );
}

/** Maintenance annoncée par l'administration (et lancement bloqué si demandé). */
export function MaintenanceBanner() {
  const { relink } = useApp();
  const m = relink?.data?.maintenance;
  if (!m?.enabled) return null;
  return (
    <div className={`rl-maint lv-${m.level}`} role="status">
      <b>{m.blockLaunch ? t("Maintenance : lancements suspendus") : t("Maintenance en cours")}</b>
      {m.text ? <span>{m.text}</span> : null}
    </div>
  );
}

const cmpVer = (a: string, b: string) => {
  const p = (v: string) => v.replace(/^v/i, "").split(/[.+-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : 0));
  const x = p(a);
  const y = p(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};
/** Version minimale imposée depuis le panneau (politique « blockOld »). */
export function VersionBanner() {
  const { relink, appVer } = useApp();
  const u = relink?.data?.updates;
  if (!u?.minVersion || !appVer || cmpVer(appVer, u.minVersion) >= 0) return null;
  return (
    <div className="rl-maint lv-warn" role="status">
      <b>{u.blockOld ? t("Version de ReLaunch plus prise en charge") : t("Mise à jour recommandée")}</b>
      <span>{`${t("Version minimale")} : ${u.minVersion} · ${t("installée")} : ${appVer}.`}</span>
      <button className="btn sm" data-go="settings" data-set="maj">
        {t("Rechercher une mise à jour")}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- Info & News
export function NewsPage() {
  const { relink, seen, markSeen, show } = useApp();
  const news = relink?.data?.news ?? [];
  const [sel, setSel] = useState<string | null>(null);
  const [cat, setCat] = useState("Tout");
  const cats = ["Tout", ...[...new Set(news.flatMap((n) => n.tags.map((x) => x.label)))].slice(0, 8)];
  const list = news.filter((n) => cat === "Tout" || n.tags.some((x) => x.label === cat));
  const cur = list.find((n) => n.id === sel) ?? list[0];
  useEffect(() => {
    if (cur) markSeen([cur.id]);
  }, [cur, markSeen]);
  return (
    <>
      <div className="vhead">
        <div>
          <h2>Info &amp; News</h2>
          <div className="sub">{t("Actualités, events, mises à jour et annonces de l'équipe")}</div>
        </div>
        {news.length ? (
          <button className="btn sm" onClick={() => markSeen(news.map((n) => n.id))}>
            {t("Tout marquer comme lu")}
          </button>
        ) : null}
      </div>
      <RelinkStatus st={relink} what={t("Les actualités")} />
      {cur ? (
        <>
          <article className="nhero" data-a="news-hero">
            <span className="sc" style={coverOf(cur.id)}></span>
            <div className="nhbody">
              <NTags n={cur} />
              <h3>{cur.title}</h3>
              {cur.date ? <small className="faint">{cur.date}</small> : null}
              <p className="nbody">{cur.body}</p>
              {cur.cta && cur.open ? (
                <button className="btn pri" onClick={() => show(cur.open)}>
                  {cur.cta}
                </button>
              ) : null}
            </div>
          </article>
          <div className="tabs">
            {cats.map((c) => (
              <button key={c} className="chip" aria-pressed={cat === c ? "true" : "false"} onClick={() => setCat(c)}>
                {t(c)}
              </button>
            ))}
          </div>
          <div className="ngrid">
            {list.map((n) => (
              <button key={n.id} className="ncard" aria-current={n.id === cur.id ? "true" : "false"} onClick={() => setSel(n.id)}>
                <span className="sc" style={coverOf(n.id)}></span>
                {!seen.has(n.id) ? <span className="unread" aria-label={t("Non lu")}></span> : null}
                <NTags n={n} />
                <b>{n.title}</b>
                <small>{n.date}</small>
              </button>
            ))}
          </div>
        </>
      ) : relink?.ok ? (
        <div className="empty">{t("Aucune actualité publiée pour l'instant.")}</div>
      ) : null}
    </>
  );
}
function NTags({ n }: { n: RelinkNews }) {
  return n.tags.length ? (
    <span className="ntags">
      {n.tags.map((x) => (
        <span key={x.label} className="ntag" style={{ "--tc": x.color || "var(--acc-deep)" } as Css}>
          {x.label}
        </span>
      ))}
    </span>
  ) : null;
}

// ---------------------------------------------------------------- encarts de l'accueil (carrousel)
export function HomeCarousel() {
  const { relink, car, show } = useApp();
  const cards = relink?.data?.cards ?? [];
  const news = relink?.data?.news ?? [];
  // encarts du panneau d'abord ; à défaut, les actualités
  const items = cards.length
    ? cards.map((c) => ({ id: c.id, title: c.title, sub: c.text, tag: c.tag, open: c.open }))
    : news.map((n) => ({ id: n.id, title: n.title, sub: n.date, tag: n.tags[0]?.label ?? "", open: "news" }));
  const n = Math.max(1, Math.min(car.n, 5));
  const max = Math.max(0, items.length - n);
  const [pos, setPos] = useState(0);
  const paused = useRef(false);
  useEffect(() => {
    if (!car.auto || max < 1) return;
    const id = window.setInterval(() => !paused.current && setPos((p) => (p >= max ? 0 : p + 1)), car.speed * 1000);
    return () => window.clearInterval(id);
  }, [car.auto, car.speed, max]);
  if (!items.length) return null;
  const p = Math.min(pos, max);
  return (
    <div className="carousel rl-car" style={{ "--n": String(n) } as Css} aria-roledescription="carrousel" aria-label={t("Actualités")} onMouseEnter={() => (paused.current = true)} onMouseLeave={() => (paused.current = false)}>
      <div className="ctrack">
        <div className="cinner" style={{ transform: `translateX(calc(-${p} * (100% + 12px) / ${n}))` }}>
          {items.map((x) => (
            <button key={x.id} className="ncard" onClick={() => show(x.open || "news")}>
              <span className="sc" style={coverOf(x.id)}></span>
              {x.tag ? (
                <span className="ntags">
                  <span className="ntag">{x.tag}</span>
                </span>
              ) : null}
              <b>{x.title}</b>
              <small>{x.sub}</small>
            </button>
          ))}
        </div>
        {max ? (
          <>
            <button className="carr prev" onClick={() => setPos(p <= 0 ? max : p - 1)} aria-label={t("Précédent")}>
              ‹
            </button>
            <button className="carr next" onClick={() => setPos(p >= max ? 0 : p + 1)} aria-label={t("Suivant")}>
              ›
            </button>
          </>
        ) : null}
      </div>
      <div className="cfoot">
        <div className="cdots">
          {max
            ? Array.from({ length: max + 1 }, (_, i) => (
                <button key={i} aria-current={i === p ? "true" : "false"} aria-label={`${t("Position")} ${i + 1}`} onClick={() => setPos(i)}></button>
              ))
            : null}
        </div>
        <span className="ccount">{`${p + 1}${n > 1 ? `–${Math.min(items.length, p + n)}` : ""} ${t("sur")} ${items.length}`}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- ReLaunch : serveurs et events
export function RelinkServersEvents() {
  const { relink } = useApp();
  const d = relink?.data;
  const servers = d?.servers ?? [];
  const events = d?.events ?? [];
  const packs = d?.modpacks ?? [];
  const online = servers.reduce((a, s) => a + (s.state === "online" ? s.players : 0), 0);
  const next = events.filter((e) => e.start && Date.parse(e.start) > Date.now()).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0] ?? events[0];
  return (
    <>
      <RelinkStatus st={relink} what={t("Les serveurs et les events")} />
      {servers.length ? <p className="faint" style={{ margin: "0 0 10px", fontSize: "13px" }}>{`${online} ${t("joueur(s) en ligne sur les serveurs ReLaunch")}`}</p> : null}
      {next ? <EventHero ev={next} /> : null}
      <div className="two">
        <div className="sect">
          <h3>{t("Serveurs")}</h3>
          {servers.length ? (
            servers.map((s) => (
              <div key={s.id} className="srv" data-a={`srv-${s.id}`}>
                <div className="cover" style={coverOf(s.id)}></div>
                <div style={{ minWidth: 0 }}>
                  <b>{s.name}</b>
                  <small>
                    {[s.desc, s.version].filter(Boolean).join(" · ")}
                    {s.desc || s.version ? " · " : ""}
                    {s.state === "online" ? <span className="ok">{`● ${s.players} / ${s.max}`}</span> : s.state === "maintenance" ? t("En maintenance") : s.state === "offline" ? t("Hors ligne") : t("État inconnu")}
                  </small>
                  {s.host ? <small className="faint">{s.host}</small> : null}
                </div>
                <span className="row">
                  <button className="btn sm" disabled title={t("Rejoindre un serveur depuis ReLaunch : pas encore disponible (le modpack du serveur doit d'abord pouvoir s'installer).")}>
                    {t("Rejoindre")}
                  </button>
                </span>
              </div>
            ))
          ) : relink?.ok ? (
            <div className="empty">{t("Aucun serveur publié.")}</div>
          ) : null}
        </div>
        <div className="sect">
          <h3>{t("Prochains events")}</h3>
          {events.length ? (
            events.map((e) => {
              const dt = e.start ? new Date(e.start) : null;
              return (
                <div key={e.id} className="cal" data-a={`cal-${e.id}`}>
                  <div className="d">
                    <b>{dt ? String(dt.getDate()).padStart(2, "0") : "?"}</b>
                    <span>{dt ? dt.toLocaleString("fr-FR", { month: "short" }) : ""}</span>
                  </div>
                  <div>
                    <b>{e.name}</b>
                    <small>{[dt ? fmtDate(e.start) : "", e.status].filter(Boolean).join(" · ")}</small>
                  </div>
                </div>
              );
            })
          ) : relink?.ok ? (
            <div className="empty">{t("Aucun event annoncé.")}</div>
          ) : null}
        </div>
      </div>
      {packs.length ? <OfficialPacks packs={packs} /> : null}
    </>
  );
}
/** Modpacks officiels : installation et mise à jour (fichiers signés, vérifiés dans le processus principal). */
function OfficialPacks({ packs }: { packs: RelinkModpack[] }) {
  const { refreshInstances, toast } = useApp();
  const [installed, setInstalled] = useState<OfficialInstalled[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const load = () => void window.wecraft.modpacks.officialInstalled().then(setInstalled, () => undefined);
  useEffect(load, []);
  const job = useJob((s) => {
    setRunning(null);
    load();
    if (s.phase === "termine") refreshInstances();
  });
  const start = (m: RelinkModpack) => {
    setRunning(m.id);
    void window.wecraft.modpacks.installOfficial(m.id).then(
      (r) => {
        if (r.ok) job.follow(r.job);
        else {
          setRunning(null);
          toast(r.reason === "busy" ? t("Une installation ou un lancement est déjà en cours.") : t("Installation impossible."));
        }
      },
      () => setRunning(null),
    );
  };
  const busy = job.job?.phase === "en-cours";
  return (
    <div className="sect">
      <h3>{t("Modpacks ReLaunch")}</h3>
      <div className="mp-results">
        {packs.map((m) => {
          const inst = installed.find((x) => x.packId === m.id);
          const v = m.latest;
          const upToDate = !!inst && !!v && inst.version === v.version;
          return (
            <div key={m.id} className="card imp-row">
              <span className="imp-txt">
                <b>
                  {m.name}
                  {v?.locked ? <span className="tag" style={{ marginLeft: "8px" }}>{t("Event · shaders seulement")}</span> : null}
                </b>
                <small className="muted">{[m.mc, m.loader, v ? `v${v.version}` : m.version].filter(Boolean).join(" · ") || m.desc}</small>
                {inst ? <small className="faint">{upToDate ? `${t("Installé")} (${inst.folderName})` : `${t("Installé en")} v${inst.version} · ${t("mise à jour disponible")}`}</small> : null}
              </span>
              <button className={`btn sm${inst && !upToDate ? " pri" : ""}`} disabled={!v || upToDate || busy || running === m.id} onClick={() => start(m)} title={!v ? t("Pas encore de version publiée.") : ""}>
                {running === m.id ? t("Installation…") : !v ? t("Bientôt") : upToDate ? t("À jour") : inst ? t("Mettre à jour") : t("Installer")}
              </button>
            </div>
          );
        })}
      </div>
      <JobView job={job.job} />
    </div>
  );
}

function EventHero({ ev }: { ev: { id: string; name: string; desc: string; status: string; start: string } }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);
  const d = ev.start ? Math.max(0, Date.parse(ev.start) - now) : 0;
  return (
    <div className="evhero" data-a="rl-hero" style={coverOf(ev.id)}>
      <div>
        <span className="eyebrow">{ev.status || t("Event ReLaunch")}</span>
        <h3>{ev.name}</h3>
        {ev.desc ? <p className="muted" style={{ maxWidth: "52ch", fontSize: "14px" }}>{ev.desc}</p> : null}
      </div>
      {d ? (
        <div className="count" aria-label={t("Compte à rebours")}>
          <div>
            <b>{Math.floor(d / 864e5)}</b>
            <span>{t("jours")}</span>
          </div>
          <div>
            <b>{Math.floor(d / 36e5) % 24}</b>
            <span>{t("heures")}</span>
          </div>
          <div>
            <b>{Math.floor(d / 6e4) % 60}</b>
            <span>{t("min")}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Diffusion Partenaires
export function LivePage() {
  const { relink } = useApp();
  const ps = [...(relink?.data?.partners ?? [])].sort((a, b) => Number(b.live) - Number(a.live) || Number(b.featured) - Number(a.featured) || b.viewers - a.viewers);
  const lives = ps.filter((p) => p.live);
  return (
    <>
      <div className="vhead">
        <div>
          <h2>{t("Diffusion Partenaires")}</h2>
          <div className="sub">{t("Les partenaires en direct sur nos events et ailleurs")}</div>
        </div>
        <span className="online">{`${lives.length} ${t("live(s) en cours")}`}</span>
      </div>
      <RelinkStatus st={relink} what={t("Les partenaires")} />
      {ps.length ? (
        <div className="favgrid">
          {ps.map((p) => (
            <div key={p.id} className="favc" data-a={`partner-${p.id}`}>
              <div className="cover" style={coverOf(p.id)}>
                {p.live ? <span className="livebadge rl-live">● LIVE</span> : null}
              </div>
              <span className="row">
                <b>{p.name}</b>
                {p.featured ? <span className="tag">{t("À la une")}</span> : null}
              </span>
              <small>{[p.category, p.channel ? `@${p.channel}` : "", p.live ? `${p.viewers.toLocaleString("fr-FR")} ${t("spectateurs")}` : t("Hors ligne")].filter(Boolean).join(" · ")}</small>
            </div>
          ))}
        </div>
      ) : relink?.ok ? (
        <div className="empty">{t("Aucun partenaire publié.")}</div>
      ) : null}
      <p className="faint" style={{ fontSize: "12.5px" }}>{t("Le lecteur intégré et l'état « en direct » réel (Twitch, YouTube) ne sont pas encore branchés : l'état affiché est celui saisi dans le panneau ReLink.")}</p>
    </>
  );
}

// ---------------------------------------------------------------- notifications (cloche)
export function NotifList() {
  const { notifs, seen, markSeen, show, relink } = useApp();
  const news = relink?.data?.news ?? [];
  useEffect(() => {
    if (notifs.length) markSeen(notifs.map((n) => n.id)); // vues à l'ouverture du panneau
  }, [notifs, markSeen]);
  return (
    <div className="rl-notifs">
      {notifs.length ? (
        notifs.map((n) => (
          <button key={n.id} className="nitem rl-nitem" onClick={() => n.open && show(n.open)} disabled={!n.open}>
            <span className="rl-nic">
              <Ic n="bell" />
            </span>
            <span style={{ minWidth: 0 }}>
              <b>{n.title}</b>
              {n.body ? <small>{n.body}</small> : null}
              <small className="faint">{n.at ? fmtDate(n.at) : ""}</small>
            </span>
            {!seen.has(n.id) ? <span className="unread"></span> : null}
          </button>
        ))
      ) : (
        <div className="empty">{t("Aucune notification pour l'instant.")}</div>
      )}
      {news.length ? (
        <>
          <div className="row" style={{ justifyContent: "space-between", marginTop: "10px" }}>
            <h4 className="rl-h4">{t("Actualités")}</h4>
            <button className="btn sm" data-go="news" data-act="closeDrawer">
              {t("Info & News →")}
            </button>
          </div>
          {news.slice(0, 6).map((n) => (
            <button key={n.id} className="nitem" onClick={() => show("news")}>
              <span className="th">
                <span className="sc" style={coverOf(n.id)}></span>
              </span>
              <span style={{ minWidth: 0 }}>
                <b>{n.title}</b>
                <small>{[...n.tags.map((x) => x.label), n.date].filter(Boolean).join(" · ")}</small>
              </span>
              {!seen.has(n.id) ? <span className="unread"></span> : null}
            </button>
          ))}
        </>
      ) : null}
    </div>
  );
}

/** Nombre d'éléments non vus (pastille de la cloche). */
export function useUnread(): number {
  const { notifs, relink, seen } = useApp();
  return notifs.filter((n) => !seen.has(n.id)).length + (relink?.data?.news ?? []).filter((n) => !seen.has(n.id)).length;
}
