// Pages Accueil, WeCraft, Favoris, Instances épinglées et pages « bientôt ».
import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { useApp } from "./ctx";
import { HomeCarousel } from "./Relink";
import { Ic } from "./Ic";
import { Menu, type MenuItem } from "./Menu";
import { Minis } from "./Bars";
import { InstIcon } from "./symbols";
import { ago, bgFmtOf, detail, INACTIVE_ID, isPinned, isRecent, orderInstances, pinCount, SC, type Inst, type InstGroup } from "./model";
import { t } from "./i18n";

type Css = CSSProperties & Record<`--${string}`, string>;
/** Couverture : fond choisi pour l'instance (si les images de fond sont activées), sinon dégradé. */
export const coverOf = (x: Inst, imgs: boolean): Css => {
  const c = x.icon?.kind === "gen" ? x.icon.c : x.c;
  return imgs && x.bg ? { "--c1": c[0], "--c2": c[1], backgroundImage: `url("${x.bg}")`, backgroundSize: "cover", backgroundPosition: "center" } : { "--c1": c[0], "--c2": c[1] };
};

export function PinBtn({ id }: { id: string }) {
  const { nav } = useApp();
  const on = isPinned(nav, id);
  const l = on ? "Retirer de la barre" : "Épingler dans la barre";
  return (
    <button className="pinbtn" data-act="pin" data-id={id} aria-pressed={on ? "true" : "false"} aria-label={t(l)} title={t(l)}>
      <Ic n="pins" />
    </button>
  );
}

export function Soon({ title, sub, text }: { title: string; sub: string; text: string }) {
  return (
    <>
      <div className="vhead">
        <div>
          <h2>{t(title)}</h2>
          <div className="sub">{t(sub)}</div>
        </div>
      </div>
      <div className="card rl-empty">
        <b>{t("Pas encore disponible")}</b>
        <p className="muted">{text}</p>
      </div>
    </>
  );
}

export const SOON: Record<string, { title: string; sub: string; text: string }> = {
  relaunch: { title: "ReLaunch", sub: "Events et serveurs", text: "Les events et serveurs ReLaunch arriveront avec les comptes ReLink." },
  welive: { title: "WeLive", sub: "Contenus Minecraft francophones", text: "Les séries, lives, serveurs et créateurs recommandés arriveront dans une prochaine version." },
  relink: { title: "Compte ReLink", sub: "Profil, captures d'écran, skins et shop", text: "Les comptes ReLink ne sont pas encore disponibles." },
  live: { title: "Diffusion Partenaires", sub: "Lives des partenaires", text: "Aucun live pour l'instant." },
  news: { title: "Info & News", sub: "Actualités et annonces", text: "Aucune actualité pour l'instant." },
  discover: { title: "Découvrir", sub: "Modpacks, mods, shaders et serveurs", text: "Le catalogue (Modrinth) arrivera dans une prochaine version." },
};

/** Image de fond de l'accueil selon le format choisi ; un événement garde toujours la sienne. */
export function homeBg(sel: Inst | undefined, fmt: ReturnType<typeof bgFmtOf>): { fmt: ReturnType<typeof bgFmtOf>; url: string | null } {
  if (!sel?.bg) return { fmt, url: null };
  if (fmt === "off") return sel.ev ? { fmt: "large", url: sel.bg } : { fmt, url: null };
  return { fmt, url: sel.bg };
}

/** Menu de l'accueil : seulement les favoris, les instances lancées depuis moins de 30 jours et les events. */
export const homeList = (l: Inst[]) => orderInstances(l).filter((x) => x.fav || isRecent(x) || x.ev);

export function Home() {
  const { inst: inst0, ui, setUi, pref, relink, car } = useApp();
  const inst = homeList(inst0);
  const hasCar = car.on && !!((relink?.data?.cards.length ?? 0) + (relink?.data?.news.length ?? 0));
  const sel = inst.find((x) => x.id === ui.sel) ?? inst[0];
  const bg = homeBg(sel, bgFmtOf(pref));
  const large = bg.url && bg.fmt === "large";
  const bgStyle: CSSProperties | undefined = large ? { backgroundImage: `linear-gradient(90deg, rgba(8,9,14,.82), rgba(8,9,14,.35)), url("${bg.url}")` } : undefined;
  const title = (
    <div className="htitle">
      <h2 className="huge" aria-label="ReLaunch">
        RELAUNCH
      </h2>
      <button className="newsbtn" data-go="news" data-a="home-news">
        <Ic n="news" />
        {t("Info & News")}
      </button>
    </div>
  );
  if (!sel) {
    return (
      <div className="home nocar">
        <div className="hmain">
          {title}
          <div className="playrow">
            <select id="homeSel" aria-label={t("Instance ou serveur")} disabled>
              <option>{inst0.length ? t("Aucun favori ni instance lancée récemment") : t("Aucune instance pour l'instant")}</option>
            </select>
            {inst0.length ? (
              <button className="btn play" data-go="wecraft">
                {t("Voir les instances")}
              </button>
            ) : (
              <button className="btn play" id="homePlay" data-act="noInst">
                {t("Jouer")}
              </button>
            )}
          </div>
          <span className="seldet" id="homeDet">
            {inst0.length
              ? t("L'accueil montre tes favoris, les instances lancées ces 30 derniers jours et les events. Ajoute une étoile à une instance dans WeCraft pour la retrouver ici.")
              : t("Aucune instance trouvée sur ce PC (WeCraft, CurseForge, Modrinth, Prism).")}
          </span>
        </div>
      </div>
    );
  }
  const events = inst.filter((x) => x.ev);
  const favs = inst.filter((x) => x.fav && !x.ev);
  const recents = inst.filter((x) => !x.fav && !x.ev && isRecent(x));
  const opts = (l: Inst[]) =>
    l.map((x) => (
      <option key={x.id} value={x.id}>
        {x.fav ? `★ ${x.n}` : x.n}
      </option>
    ));
  return (
    <div className={`home${hasCar ? "" : " nocar"}${large ? " has-bg" : ""} bgf-${bg.url ? bg.fmt : "none"}`} style={bgStyle}>
      <div className="hmain">
        {bg.url && (bg.fmt === "mini" || bg.fmt === "reduced") ? <div className={`hbg ${bg.fmt}`} style={{ backgroundImage: `url("${bg.url}")` }} aria-hidden="true"></div> : null}
        {title}
        <div className="playrow">
          <select id="homeSel" aria-label={t("Instance ou serveur")} value={sel.id} onChange={(e) => setUi({ sel: e.target.value })}>
            {events.length ? <optgroup label={t("Events")}>{opts(events)}</optgroup> : null}
            {favs.length ? <optgroup label={t("Favoris")}>{opts(favs)}</optgroup> : null}
            {recents.length ? <optgroup label={t("Lancées ces 30 derniers jours")}>{opts(recents)}</optgroup> : null}
          </select>
          <InstIcon icon={sel.icon} fallback={sel.c} name={sel.n} size={46} />
          <button className="btn play" data-play={sel.id} id="homePlay">
            {t("Jouer")}
          </button>
        </div>
        <span className="seldet" id="homeDet">
          {detail(sel)}
        </span>
      </div>
      {hasCar ? <HomeCarousel /> : null}
    </div>
  );
}

const SRC_CHIPS = ["all", "WeCraft", "CurseForge", "Prism", "Modrinth"];

/** Actions d'une instance (menu ⋯ des cartes et de sa page). */
export function instMenu(x: Inst, groups: InstGroup[], moveTo: (gid: string) => void, inactive: boolean): (MenuItem | "sep")[] {
  return [
    { label: "Ouvrir la page de l'instance", data: { act: "openInst", id: x.id } },
    { label: "Réglages (nom, version, icône, fond)", data: { act: "instEdit", id: x.id } },
    { label: "Ajouter du contenu (mods, packs, shaders)", data: { act: "addContent", id: x.id } },
    { label: "Packs de ressources et shaders de l'événement", data: { act: "evEdit", id: x.id }, hidden: !x.ev },
    { label: "Ouvrir le dossier", data: { act: "instFolder", id: x.id } },
    "sep",
    { label: x.fav ? "Retirer des favoris" : "Ajouter aux favoris", data: { act: "fav", id: x.id } },
    { label: "Épingler / retirer de la barre", data: { act: "pin", id: x.id } },
    { label: inactive ? "Sortir des inactives" : "Ranger comme inactive", data: { act: "inactive", id: x.id } },
    ...groups
      .filter((g) => g.id !== INACTIVE_ID && !g.ids.includes(x.id))
      .map((g): MenuItem => ({ label: `Déplacer dans « ${g.name} »`, onClick: () => moveTo(g.id) })),
    { label: "Retirer de son groupe", onClick: () => moveTo(""), hidden: !groups.some((g) => g.id !== INACTIVE_ID && g.ids.includes(x.id)) },
    "sep",
    { label: "Supprimer (corbeille)", data: { act: "del", id: x.id }, danger: true },
  ];
}

export function Wecraft() {
  const { inst, hidden, ui, setUi, byId, pref, groups, setGroups, nav } = useApp();
  const imgs = bgFmtOf(pref) !== "off";
  const recent = inst
    .filter((x) => x.last)
    .sort((a, b) => b.last! - a.last!)
    .slice(0, 5);
  const q = ui.wcQ.trim().toLowerCase();
  const rows = orderInstances(inst.filter((i) => (ui.wcSrc === "all" || i.s === ui.wcSrc) && i.n.toLowerCase().includes(q)));
  const [closed, setClosed] = useState<Set<string>>(() => new Set([INACTIVE_ID]));
  const [newGroup, setNewGroup] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const moveTo = (id: string, gid: string) =>
    setGroups((gs) => {
      const out = gs.map((g) => ({ ...g, ids: g.id === gid ? [...g.ids.filter((x) => x !== id), id] : g.ids.filter((x) => x !== id) }));
      if (gid === INACTIVE_ID && !out.some((g) => g.id === INACTIVE_ID)) out.push({ id: INACTIVE_ID, name: "Inactives", ids: [id] });
      return out;
    });
  const createGroup = (name: string) => {
    const n = name.trim().slice(0, 40);
    if (!n) return setNewGroup(null);
    setGroups((gs) => [...gs.filter((g) => g.id !== INACTIVE_ID), { id: `g${Date.now().toString(36)}`, name: n, ids: [] }, ...gs.filter((g) => g.id === INACTIVE_ID)]);
    setNewGroup(null);
  };
  const toggleOpen = (gid: string) =>
    setClosed((c) => {
      const n = new Set(c);
      if (n.has(gid)) n.delete(gid);
      else n.add(gid);
      return n;
    });

  // glisser une carte sur un groupe pour l'y ranger
  const drag = useRef<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const dropProps = (gid: string) => ({
    onDragOver: (e: DragEvent) => {
      if (!drag.current) return;
      e.preventDefault();
      if (over !== gid) setOver(gid);
    },
    onDragLeave: () => setOver((o) => (o === gid ? null : o)),
    onDrop: (e: DragEvent) => {
      if (!drag.current) return;
      e.preventDefault();
      e.stopPropagation();
      moveTo(drag.current, gid);
      drag.current = null;
      setOver(null);
    },
  });

  const card = (x: Inst) => {
    const inactive = groups.some((g) => g.id === INACTIVE_ID && g.ids.includes(x.id));
    return (
      <div
        key={x.id}
        className="icard2"
        data-a={`inst-${x.id}`}
        draggable="true"
        onDragStart={(e) => {
          drag.current = x.id;
          try {
            e.dataTransfer.setData("text/plain", x.n);
            e.dataTransfer.effectAllowed = "move";
          } catch {
            // glisser indisponible
          }
        }}
        onDragEnd={() => {
          drag.current = null;
          setOver(null);
        }}
      >
        <button className="cover ic2-cover" style={coverOf(x, imgs)} data-act="openInst" data-id={x.id} aria-label={`${t("Ouvrir la page de l'instance")} ${x.n}`}>
          <InstIcon icon={x.icon} fallback={x.c} name={x.n} size={48} className="on-cover" />
          <span className="src ic2-src" style={{ "--sc": SC[x.s] ?? "var(--acc)" } as Css}>
            {x.ev ? t("Événement") : x.s}
          </span>
        </button>
        <button className="star ic2-star" data-act="fav" data-id={x.id} aria-pressed={x.fav ? "true" : "false"} aria-label={t("Favori")} title={t("Favori")}>
          ★
        </button>
        <div className="ic2-body">
          <b title={x.n}>{x.n}</b>
          <small>{`${[x.l, x.lv].filter(Boolean).join(" ")} · ${x.v || "?"}${x.r ? ` · ${x.r} Go` : ""}`}</small>
          <small className="faint">{x.last ? `${t("Lancée")} ${ago(x.last)}` : t("Jamais lancée")}</small>
        </div>
        <div className="ic2-acts">
          <button className="btn sm pri" data-play={x.id}>
            <Ic n="play" />
            {t("Jouer")}
          </button>
          <PinBtn id={x.id} />
          <button className="ib" data-act="inactive" data-id={x.id} aria-pressed={inactive ? "true" : "false"} title={inactive ? t("Sortir des inactives") : t("Ranger comme inactive")} aria-label={inactive ? t("Sortir des inactives") : t("Ranger comme inactive")}>
            {inactive ? "↺" : "⏾"}
          </button>
          <button className="ib" data-act="instEdit" data-id={x.id} aria-label={`${t("Réglages")} ${x.n}`} title={t("Réglages (nom, version, loader, RAM, icône, fond)")}>
            ⚙
          </button>
          <Menu items={instMenu(x, groups, (gid) => moveTo(x.id, gid), inactive)} />
        </div>
      </div>
    );
  };

  const section = (gid: string, name: string, items: Inst[], opts: { fixed?: boolean; hint?: string } = {}) => {
    const open = !closed.has(gid);
    return (
      <div key={gid} className={`igrp${over === gid ? " dropon" : ""}`} {...dropProps(gid)} data-a={`igrp-${gid}`}>
        <div className="igrp-head">
          <button className="ib" aria-expanded={open ? "true" : "false"} aria-label={open ? t("Replier") : t("Déplier")} onClick={() => toggleOpen(gid)}>
            {open ? "▾" : "▸"}
          </button>
          {renaming === gid ? (
            <input
              autoFocus
              type="text"
              maxLength={40}
              defaultValue={name}
              aria-label={t("Nom du groupe")}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v) setGroups((gs) => gs.map((x) => (x.id === gid ? { ...x, name: v.slice(0, 40) } : x)));
                setRenaming(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setRenaming(null);
                }
              }}
            />
          ) : (
            <b onDoubleClick={() => !opts.fixed && setRenaming(gid)}>{t(name)}</b>
          )}
          <small className="faint">{`${items.length}`}</small>
          <span style={{ flex: 1 }}></span>
          {opts.fixed ? null : (
            <Menu
              items={[
                { label: "Renommer", onClick: () => setRenaming(gid) },
                { label: "Supprimer le groupe (les instances restent)", onClick: () => setGroups((gs) => gs.filter((x) => x.id !== gid)), danger: true },
              ]}
            />
          )}
        </div>
        {open ? (
          items.length ? (
            <div className="icards">{items.map(card)}</div>
          ) : (
            <div className="igrp-empty faint">{t(opts.hint ?? "Groupe vide : glisse une carte ici, ou utilise le menu ⋯ d'une instance.")}</div>
          )
        ) : null}
      </div>
    );
  };

  const inGroup = (id: string) => groups.some((g) => g.ids.includes(id));
  const ungrouped = rows.filter((r) => !inGroup(r.id));
  const userGroups = groups.filter((g) => g.id !== INACTIVE_ID);
  const ina = groups.find((g) => g.id === INACTIVE_ID);
  const del = ui.delId ? byId(ui.delId) : undefined;
  const noRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ui.delId) noRef.current?.focus();
  }, [ui.delId]);
  const nPins = pinCount(nav);
  return (
    <>
      <div className="vhead">
        <div>
          <h2>WeCraft</h2>
          <div className="sub">{t("Ton launcher Minecraft : instances, modpacks et outils")}</div>
        </div>
      </div>
      <div className="qa">
        <button className="btn" data-act="create">
          <Ic n="create" />
          {t("Créer un WePack")}
          <small>{t("Nouvelle instance personnalisée")}</small>
        </button>
        <button className="btn" data-act="import">
          <Ic n="import" />
          {t("Importer une instance")}
          <small>Prism, CurseForge, Modrinth</small>
        </button>
        <button className="btn" data-go="discover">
          <Ic n="discover" />
          {t("Parcourir les modpacks")}
          <small>{t("Catalogue de contenus")}</small>
        </button>
        <button className="btn" data-go="pins">
          <Ic n="pins" />
          {t("Instances épinglées")}
          <small>{nPins ? `${nPins} ${t("épinglée(s) · groupes")}` : t("Aucune pour l'instant")}</small>
        </button>
      </div>
      <div className="sect">
        <h3>{t("Dernières instances lancées")}</h3>
        <div className="hscroll">
          {recent.length ? null : (
            <span className="faint" style={{ fontSize: "13px" }}>
              {t("Aucune instance lancée pour l'instant.")}
            </span>
          )}
          {recent.map((x) => (
            <div key={x.id} className="wcard" data-a={`wrec-${x.id}`}>
              <button className="cover" style={coverOf(x, imgs)} data-act="openInst" data-id={x.id} aria-label={`${t("Ouvrir la page de l'instance")} ${x.n}`}>
                <InstIcon icon={x.icon} fallback={x.c} name={x.n} size={44} className="on-cover" />
              </button>
              <b>{x.n}</b>
              <small>{`${x.l} · ${x.v} · ${ago(x.last)}`}</small>
              <span className="row">
                <button className="btn sm pri" data-play={x.id}>
                  <Ic n="play" />
                  {t("Jouer")}
                </button>
                <PinBtn id={x.id} />
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="sect">
        <h3>{t("Toutes les instances")}</h3>
        <div className="toolbar">
          <div className="chips" id="wcSrc">
            {SRC_CHIPS.map((s) => (
              <button key={s} className="chip" data-src={s} aria-pressed={ui.wcSrc === s ? "true" : "false"} onClick={() => setUi({ wcSrc: s })}>
                {s === "all" ? t("Toutes") : s}
              </button>
            ))}
          </div>
          {newGroup !== null ? (
            <input
              autoFocus
              type="text"
              maxLength={40}
              placeholder={t("Nom du groupe")}
              aria-label={t("Nom du groupe")}
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              onBlur={() => createGroup(newGroup)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createGroup(newGroup);
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setNewGroup(null);
                }
              }}
            />
          ) : (
            <button className="btn sm" onClick={() => setNewGroup("")}>
              {t("+ Nouveau groupe")}
            </button>
          )}
          <input type="search" id="wcQ" placeholder={t("Rechercher une instance")} aria-label={t("Rechercher une instance")} value={ui.wcQ} onChange={(e) => setUi({ wcQ: e.target.value })} />
        </div>
        {userGroups.map((g) => {
          const items = rows.filter((r) => g.ids.includes(r.id));
          if (q && !items.length) return null;
          return section(g.id, g.name, items);
        })}
        {userGroups.length || ina ? section("", "Sans groupe", ungrouped, { fixed: true, hint: "Aucune instance hors des groupes." }) : ungrouped.length ? <div className="icards">{ungrouped.map(card)}</div> : null}
        {ina ? section(INACTIVE_ID, "Inactives", rows.filter((r) => ina.ids.includes(r.id)), { fixed: true, hint: "Aucune instance inactive." }) : null}
        {rows.length ? null : <div className="empty">{inst.length ? t("Aucune instance ne correspond.") : t("Aucune instance trouvée sur ce PC (WeCraft, CurseForge, Modrinth, Prism).")}</div>}
        {hidden ? <p className="faint" style={{ fontSize: "12.5px" }}>{`${hidden} instance${hidden > 1 ? "s masquées" : " masquée"} (réglage de WeCraft).`}</p> : null}
        <div className="confirm gl" id="delBox" hidden={!del}>
          <span style={{ fontSize: "13.5px" }}>
            {t("Supprimer")} <b id="delName">{del?.n ?? ""}</b> ? Le dossier et tout son contenu (mods, mondes, captures) partent à la corbeille de Windows.
            <span id="delSrc">{del && del.s !== "WeCraft" ? ` Cette instance vient de ${del.s} : elle disparaîtra aussi de ${del.s}.` : ""}</span>
          </span>
          <span className="row">
            <button className="btn sm" data-act="delNo" ref={noRef}>
              {t("Annuler")}
            </button>
            <button className="btn sm danger" data-act="delYes">
              {t("Supprimer")}
            </button>
          </span>
        </div>
      </div>
    </>
  );
}

export function Favorites() {
  const { inst, pref, nav } = useApp();
  const imgs = bgFmtOf(pref) !== "off";
  const f = inst.filter((x) => x.fav);
  const nPins = pinCount(nav);
  return (
    <>
      <div className="vhead">
        <div>
          <h2>{t("Favoris")}</h2>
          <div className="sub">{`${f.length} instance${f.length > 1 ? "s" : ""} en favori`}</div>
          <button className="btn sm vhead-link" data-go="pins">
            <Ic n="pins" />
            {t("Instances épinglées")}
            {nPins ? <span className="cntb">{nPins}</span> : null}
          </button>
        </div>
      </div>
      {f.length ? (
        <div className="favgrid">
          {f.map((x) => (
            <div key={x.id} className="favc" data-a={`favc-${x.id}`}>
              <button className="cover" style={coverOf(x, imgs)} data-act="openInst" data-id={x.id} aria-label={`${t("Ouvrir la page de l'instance")} ${x.n}`}>
                <InstIcon icon={x.icon} fallback={x.c} name={x.n} size={44} className="on-cover" />
              </button>
              <span className="row">
                <b>{x.n}</b>
                <button className="star" data-act="fav" data-id={x.id} aria-pressed="true" aria-label={t("Retirer des favoris")}>
                  ★
                </button>
              </span>
              <small>{detail(x)}</small>
              <span className="row">
                <button className="btn sm pri" data-play={x.id}>
                  <Ic n="play" />
                  {t("Jouer")}
                </button>
                <PinBtn id={x.id} />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">{t("Aucun favori. Clique sur l'étoile d'une instance dans WeCraft pour l'ajouter.")}</div>
      )}
    </>
  );
}

/**
 * Instances épinglées : liste complète, groupes (glisser une instance sur une autre), ajout et retrait.
 * Ouverte depuis WeCraft, Favoris, ou en double-cliquant sur la barre séparée des épingles.
 */
export function PinsPage() {
  const { nav, inst, byId, editNav } = useApp();
  const n = pinCount(nav);
  const where = { inline: "dans la barre principale", section: "dans une section de la barre", dock: "dans une barre séparée" }[nav.pinMode];
  const tile = (id: string) => {
    const x = byId(id);
    if (!x) return null;
    return (
      <div key={id} className="ptile2" draggable="true" data-pin-drag={`i:${id}`} data-pin-drop={`i:${id}`} data-a={`pt-${id}`}>
        <InstIcon icon={x.icon} fallback={x.c} name={x.n} size={44} />
        <span className="ptile2-txt">
          <b>{x.n}</b>
          <small className="faint">{`${x.l} · ${x.v || "?"}`}</small>
        </span>
        <button className="btn sm pri" data-play={id}>
          {t("Jouer")}
        </button>
        <button className="ib" data-act="pin" data-id={id} aria-label={`${t("Retirer")} ${x.n}`} title={t("Retirer des épingles")}>
          ✕
        </button>
      </div>
    );
  };
  return (
    <>
      <div className="vhead">
        <div>
          <h2>{t("Instances épinglées")}</h2>
          <div className="sub">{`${n} épinglée${n > 1 ? "s" : ""} · ${t("affichées")} ${t(where)}`}</div>
          <button className="btn sm vhead-link" data-go="settings" data-set="nav">
            <Ic n="settings" />
            {t("Emplacement dans les barres")}
          </button>
        </div>
      </div>
      <p className="muted" style={{ fontSize: "13px", margin: "0 0 12px" }}>
        {t("Glisse une instance sur une autre pour créer un groupe (ici, dans la barre principale ou dans la barre séparée). Glisse-la dans la zone vide pour la sortir d'un groupe ou la mettre à la fin.")}
      </p>
      <div className="pins2" data-pin-zone="1">
        {nav.pins.map((p) =>
          p.t === "i" ? (
            tile(p.id)
          ) : (
            <div key={p.id} className="pgrp2" draggable="true" data-pin-drag={`g:${p.id}`} data-pin-drop={`g:${p.id}`} data-a={`pg-${p.id}`}>
              <div className="pgrp2-head">
                <span className="gmini">
                  <Minis g={p} byId={byId} />
                </span>
                <input
                  type="text"
                  value={p.name}
                  maxLength={40}
                  aria-label={t("Nom du groupe")}
                  draggable="false"
                  onChange={(e) => {
                    const v = e.target.value;
                    editNav((nv) => {
                      const g = nv.pins.find((q) => q.t === "g" && q.id === p.id);
                      if (g && g.t === "g") g.name = v.trim() || "Groupe";
                    });
                  }}
                />
                <small className="faint">{`${p.items.length}`}</small>
                <button className="btn sm" data-act="dissolve" data-gid={p.id}>
                  {t("Dissoudre")}
                </button>
              </div>
              <div className="pgrp2-items">{p.items.map(tile)}</div>
            </div>
          ),
        )}
        {n ? null : <div className="empty">{t("Aucune instance épinglée. Utilise le bouton épingle d'une instance, ou la liste ci-dessous.")}</div>}
      </div>
      <div className="row" style={{ justifyContent: "flex-start", marginTop: "12px" }}>
        <select
          aria-label={t("Épingler une instance")}
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v) editNav((nv) => void nv.pins.push({ t: "i", id: v }), { pins: true });
          }}
        >
          <option value="">{t("+ Épingler une instance…")}</option>
          {orderInstances(inst.filter((p) => !isPinned(nav, p.id))).map((p) => (
            <option key={p.id} value={p.id}>
              {p.n}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
