// Pages Accueil, WeCraft, Favoris, Instances épinglées et pages « bientôt ».
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useApp } from "./ctx";
import { HomeCarousel } from "./Relink";
import { Ic } from "./Ic";
import { HomeAccount } from "./Quests";
import { Menu, type MenuItem } from "./Menu";
import { Minis } from "./Bars";
import { InstIcon } from "./symbols";
import { ago, bgFmtOf, detail, INACTIVE_ID, isPinned, isRecent, load, orderInstances, pinCount, SC, store, type Inst, type InstGroup } from "./model";
import { cleanClosed, cleanInstView, HIDE_CHOICES, isOld, moveGroup, moveInOrder, rangeBetween, sortByOrder, type InstViewPrefs } from "./instOrder";
import { useEscapeLayer } from "./keys";
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
  live: { title: "WeLive", sub: "Lives des partenaires", text: "Aucun live pour l'instant." },
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
    </div>
  );
  // compte Minecraft (facultatif) et Info & News, côte à côte au-dessus du titre
  const top = (
    <div className="htop">
      <HomeAccount />
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
          {top}
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
        {top}
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
    { label: "Exporter pour un ami (.rlpack)", data: { act: "instExport", id: x.id }, hidden: !!x.ev },
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

/** Valeur d'un `<select>` « Déplacer la sélection vers… » : groupe existant, sans groupe, ou nouveau groupe. */
const NEW_GROUP = "\u0000new";
const NO_GROUP = "\u0000none";

export function Wecraft() {
  const { inst, hidden, ui, setUi, pref, groups, setGroups, nav, toggleFav, toast } = useApp();
  const imgs = bgFmtOf(pref) !== "off";
  const recent = inst
    .filter((x) => x.last)
    .sort((a, b) => b.last! - a.last!)
    .slice(0, 5);
  const q = ui.wcQ.trim().toLowerCase();

  // ordre (auto / rangé à la main) et masquage des instances anciennes, gardés sur ce PC
  const [view, setView0] = useState<InstViewPrefs>(() => cleanInstView(load("rl-iview", null)));
  const setView = (fn: (v: InstViewPrefs) => InstViewPrefs) =>
    setView0((v) => {
      const n = fn(v);
      store("rl-iview", n);
      return n;
    });
  const sorted = (l: Inst[]) => (view.sort === "manual" ? sortByOrder(orderInstances(l), view.order) : orderInstances(l));
  const now = Date.now();
  const matched = inst.filter((i) => (ui.wcSrc === "all" || i.s === ui.wcSrc) && i.n.toLowerCase().includes(q));
  const oldOnes = view.hideOld ? matched.filter((x) => isOld(x, view.hideDays, now)) : [];
  const rows = sorted(view.hideOld ? matched.filter((x) => !isOld(x, view.hideDays, now)) : matched);
  /** Ordre affiché de TOUTES les instances (masquées comprises) : base des déplacements. */
  const allFlat = sorted(inst).map((x) => x.id);

  // groupes repliés : gardés sur ce PC
  const [closed, setClosed0] = useState<Set<string>>(() => cleanClosed(load("rl-igrp-closed", null), [INACTIVE_ID]));
  const setClosed = (fn: (c: Set<string>) => Set<string>) =>
    setClosed0((c) => {
      const n = fn(c);
      store("rl-igrp-closed", [...n]);
      return n;
    });
  // déplacement d'un groupe (poignée ⠿ de son en-tête)
  const [grpDrag, setGrpDrag] = useState<string | null>(null);
  const [grpOver, setGrpOver] = useState<{ gid: string; after: boolean } | null>(null);
  const dropGroup = (target: string, after: boolean) => {
    if (grpDrag && target !== grpDrag) setGroups((gs) => moveGroup(gs, grpDrag, target, after));
    setGrpDrag(null);
    setGrpOver(null);
  };
  const shiftGroup = (gid: string, dir: -1 | 1) => {
    const ug = groups.filter((g) => g.id !== INACTIVE_ID);
    const i = ug.findIndex((g) => g.id === gid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ug.length) return;
    setGroups((gs) => moveGroup(gs, gid, ug[j]!.id, dir > 0));
  };
  const [newGroup, setNewGroup] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  /** Range des instances dans un groupe ("" : sans groupe). */
  const moveMany = (ids: string[], gid: string) =>
    setGroups((gs) => {
      const set = new Set(ids);
      const out = gs.map((g) => ({ ...g, ids: [...g.ids.filter((x) => !set.has(x)), ...(g.id === gid ? ids : [])] }));
      if (gid === INACTIVE_ID && !out.some((g) => g.id === INACTIVE_ID)) out.push({ id: INACTIVE_ID, name: "Inactives", ids });
      return out;
    });
  const moveTo = (id: string, gid: string) => moveMany([id], gid);
  const createGroup = (name: string, ids: string[] = []) => {
    const n = name.trim().slice(0, 40);
    if (!n) return setNewGroup(null);
    const gid = `g${Date.now().toString(36)}`;
    setGroups((gs) => {
      const set = new Set(ids);
      const rest = gs.map((g) => ({ ...g, ids: g.ids.filter((x) => !set.has(x)) }));
      return [...rest.filter((g) => g.id !== INACTIVE_ID), { id: gid, name: n, ids }, ...rest.filter((g) => g.id === INACTIVE_ID)];
    });
    setNewGroup(null);
  };
  const toggleOpen = (gid: string) =>
    setClosed((c) => {
      const n = new Set(c);
      if (n.has(gid)) n.delete(gid);
      else n.add(gid);
      return n;
    });

  // ---------------------------------------------------------------- sections affichées (ordre visuel)
  const inGroup = (id: string) => groups.some((g) => g.ids.includes(id));
  const userGroups = groups.filter((g) => g.id !== INACTIVE_ID);
  const ina = groups.find((g) => g.id === INACTIVE_ID);
  const ungrouped = rows.filter((r) => !inGroup(r.id));
  const sections: { gid: string; name: string; items: Inst[]; fixed?: boolean; hint?: string; bare?: boolean }[] = [];
  for (const g of userGroups) {
    const items = rows.filter((r) => g.ids.includes(r.id));
    if (q && !items.length) continue;
    sections.push({ gid: g.id, name: g.name, items });
  }
  if (userGroups.length || ina) sections.push({ gid: "", name: "Sans groupe", items: ungrouped, fixed: true, hint: "Aucune instance hors des groupes." });
  else if (ungrouped.length) sections.push({ gid: "", name: "", items: ungrouped, bare: true });
  if (ina) sections.push({ gid: INACTIVE_ID, name: "Inactives", items: rows.filter((r) => ina.ids.includes(r.id)), fixed: true, hint: "Aucune instance inactive." });
  /** Cartes visibles, dans l'ordre de l'écran (sélection par plage, Ctrl+A). */
  const visible = sections.flatMap((s) => (s.bare || !closed.has(s.gid) ? s.items.map((x) => x.id) : []));

  // ---------------------------------------------------------------- sélection
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const anchor = useRef<string | null>(null);
  const clearSel = () => setSel(new Set());
  const toggleSel = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selectAll = () => setSel(new Set(visible));
  useEscapeLayer(sel.size > 0, clearSel);
  // une instance supprimée ou masquée sort de la sélection
  const visKey = visible.join("\n");
  useEffect(() => {
    const vis = new Set(visKey.split("\n"));
    setSel((s) => ([...s].every((id) => vis.has(id)) ? s : new Set([...s].filter((id) => vis.has(id)))));
  }, [visKey]);

  // valeurs courantes pour les écouteurs posés sur la fenêtre pendant un geste
  const live = useRef({ sel, visible, allFlat });
  live.current = { sel, visible, allFlat };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA" || tg.tagName === "SELECT" || tg.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSel(new Set(live.current.visible));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------------------------------------------------------------- gestes à la souris
  // - glisser une carte (sans touche) : la ranger ailleurs (toute la sélection si la carte en fait partie) ;
  // - Maj + appui + glisser : sélectionne toutes les cartes survolées ; Maj+clic : plage depuis la dernière cliquée ;
  // - Ctrl+clic : ajoute ou retire une carte ; clic sur une carte pendant une sélection : idem.
  type Gesture =
    | { kind: "pending"; id: string; x0: number; y0: number; ctrl: boolean; el: HTMLElement; onCover: boolean }
    | { kind: "drag"; id: string; moving: string[]; ghost: HTMLElement; dx: number; dy: number }
    | { kind: "paint"; id: string; painted: Set<string>; moved: boolean };
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [dragIds, setDragIds] = useState<string[]>([]);
  const [dropAt, setDropAt] = useState<{ id: string | null; gid: string; after: boolean } | null>(null);
  const dropRef = useRef(dropAt);
  dropRef.current = dropAt;

  const cardAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>(".icard2[data-id]") ?? null;
  const commitDrop = (moving: string[], at: { id: string | null; gid: string; after: boolean }) => {
    const groupOf = (id: string) => groups.find((g) => g.ids.includes(id))?.id ?? "";
    if (moving.some((id) => groupOf(id) !== at.gid)) moveMany(moving, at.gid);
    setView((v) => ({ ...v, sort: "manual", order: moveInOrder(live.current.allFlat, moving, at.id, at.after) }));
  };

  /** Écouteurs posés sur la fenêtre pour le geste en cours (ceux du rendu qui l'a commencé). */
  const handlers = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void; cancel: () => void } | null>(null);
  const endGesture = () => {
    const h = handlers.current;
    handlers.current = null;
    if (h) {
      window.removeEventListener("pointermove", h.move);
      window.removeEventListener("pointerup", h.up);
      window.removeEventListener("pointercancel", h.cancel);
    }
    document.body.classList.remove("wc-dragging");
  };
  function onMove(e: PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "paint") {
      const c = cardAt(e.clientX, e.clientY);
      const id = c?.dataset["id"];
      if (id && !g.painted.has(id)) {
        g.painted.add(id);
        g.moved = true;
        setSel((s) => new Set([...s, id]));
      }
      return;
    }
    if (g.kind === "pending") {
      if (g.ctrl || Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 6) return;
      const { sel: cur, visible: vis } = live.current;
      const moving = cur.has(g.id) && cur.size > 1 ? vis.filter((id) => cur.has(id)) : [g.id];
      const r = g.el.getBoundingClientRect();
      const ghost = g.el.cloneNode(true) as HTMLElement;
      ghost.classList.add("wc-ghost");
      ghost.style.width = `${r.width}px`;
      if (moving.length > 1) ghost.dataset["count"] = String(moving.length);
      document.body.appendChild(ghost);
      gesture.current = { kind: "drag", id: g.id, moving, ghost, dx: g.x0 - r.left, dy: g.y0 - r.top };
      document.body.classList.add("wc-dragging");
      setDragIds(moving);
    }
    const d = gesture.current;
    if (d?.kind !== "drag") return;
    d.ghost.style.transform = `translate(${e.clientX - d.dx}px, ${e.clientY - d.dy}px) rotate(2deg)`;
    const c = cardAt(e.clientX, e.clientY);
    if (c) {
      const r = c.getBoundingClientRect();
      const gid = c.closest<HTMLElement>("[data-gid]")?.dataset["gid"] ?? "";
      setDropAt({ id: c.dataset["id"]!, gid, after: e.clientX > r.left + r.width / 2 });
      return;
    }
    const sec = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-gid]");
    setDropAt(sec ? { id: null, gid: sec.dataset["gid"] ?? "", after: true } : null);
  }
  function onUp(e: PointerEvent) {
    const g = gesture.current;
    gesture.current = null;
    endGesture();
    if (!g) return;
    if (g.kind === "drag") {
      g.ghost.remove();
      setDragIds([]);
      const at = dropRef.current;
      setDropAt(null);
      suppressClick.current = true;
      if (at) commitDrop(g.moving, at);
      return;
    }
    if (g.kind === "paint") {
      suppressClick.current = true;
      if (!g.moved) {
        // Maj+clic sans glisser : plage depuis la dernière carte cliquée
        const from = anchor.current && live.current.visible.includes(anchor.current) ? anchor.current : g.id;
        const range = rangeBetween(live.current.visible, from, g.id);
        setSel((s) => new Set([...s, ...range]));
      }
      anchor.current = g.id;
      return;
    }
    // simple clic (pas de glisser)
    const ctrl = g.ctrl || e.ctrlKey || e.metaKey;
    if (ctrl || (live.current.sel.size > 0 && g.onCover)) {
      suppressClick.current = true;
      toggleSel(g.id);
      anchor.current = g.id;
    }
  }
  function onCancel() {
    const g = gesture.current;
    gesture.current = null;
    endGesture();
    if (g?.kind === "drag") g.ghost.remove();
    setDragIds([]);
    setDropAt(null);
  }
  useEffect(() => () => {
    // page quittée en plein geste
    const g = gesture.current;
    if (g?.kind === "drag") g.ghost.remove();
    gesture.current = null;
    endGesture();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || gesture.current) return;
    const tg = e.target as HTMLElement;
    const card = tg.closest<HTMLElement>(".icard2[data-id]");
    if (!card) return;
    const id = card.dataset["id"]!;
    const onCover = !!tg.closest(".ic2-cover") || !tg.closest("button, input, select, a, .menu");
    // Maj : sélection depuis n'importe quel point de la carte (sauf menu et champs)
    if (e.shiftKey && !tg.closest("input, select, .menu")) {
      e.preventDefault(); // pas de sélection de texte
      gesture.current = { kind: "paint", id, painted: new Set([id]), moved: false };
      setSel((s) => new Set([...s, id]));
    } else {
      // sans Maj, les boutons de la carte (Jouer, favori, épingle, réglages, menu, case) gardent leur rôle
      if (!onCover) return;
      gesture.current = { kind: "pending", id, x0: e.clientX, y0: e.clientY, ctrl: e.ctrlKey || e.metaKey, el: card, onCover };
    }
    handlers.current = { move: onMove, up: onUp, cancel: onCancel };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };
  const onClickCapture = (e: ReactMouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.stopPropagation();
    e.preventDefault();
  };
  useEffect(() => {
    // un clic supprimé qui n'arrive jamais (relâché ailleurs) ne doit pas avaler le suivant
    if (!suppressClick.current) return;
    const t0 = window.setTimeout(() => (suppressClick.current = false), 0);
    return () => window.clearTimeout(t0);
  });

  // ---------------------------------------------------------------- actions sur la sélection
  const selIds = visible.filter((id) => sel.has(id));
  const selInst = selIds.map((id) => inst.find((x) => x.id === id)).filter((x): x is Inst => !!x);
  const allFav = selInst.length > 0 && selInst.every((x) => x.fav);
  const allInactive = selIds.length > 0 && !!ina && selIds.every((id) => ina.ids.includes(id));
  const [bulkNew, setBulkNew] = useState<string | null>(null);

  const card = (x: Inst) => {
    const inactive = groups.some((g) => g.id === INACTIVE_ID && g.ids.includes(x.id));
    const isSel = sel.has(x.id);
    const drop = dropAt && dropAt.id === x.id && !dragIds.includes(x.id) ? (dropAt.after ? " drop-after" : " drop-before") : "";
    return (
      <div key={x.id} className={`icard2${isSel ? " sel" : ""}${dragIds.includes(x.id) ? " dragged" : ""}${drop}`} data-a={`inst-${x.id}`} data-id={x.id}>
        <button className="cover ic2-cover" style={coverOf(x, imgs)} data-act="openInst" data-id={x.id} aria-label={`${t("Ouvrir la page de l'instance")} ${x.n}`}>
          <InstIcon icon={x.icon} fallback={x.c} name={x.n} size={48} className="on-cover" />
          <span className="src ic2-src" style={{ "--sc": SC[x.s] ?? "var(--acc)" } as Css}>
            {x.ev ? t("Événement") : x.s}
          </span>
        </button>
        <button className="star ic2-star" data-act="fav" data-id={x.id} aria-pressed={x.fav ? "true" : "false"} aria-label={t("Favori")} title={t("Favori")}>
          ★
        </button>
        <button className="ic2-check" aria-pressed={isSel ? "true" : "false"} aria-label={`${t("Sélectionner")} ${x.n}`} title={t("Sélectionner (Ctrl+clic, Maj+clic pour une plage)")} onClick={() => ((anchor.current = x.id), toggleSel(x.id))}>
          {isSel ? "✓" : ""}
        </button>
        <div className="ic2-body">
          <b title={x.n}>{x.n}</b>
          <small className="ic2-info">{`${[x.l, x.lv].filter(Boolean).join(" ")} · ${x.v || "?"}${x.r ? ` · ${x.r} Go` : ""}`}</small>
          <small className="faint ic2-info">{x.last ? `${t("Lancée")} ${ago(x.last)}` : t("Jamais lancée")}</small>
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

  const section = (s: (typeof sections)[number]) => {
    const { gid, name, items } = s;
    if (s.bare)
      return (
        <div key="bare" className={`icards${dropAt && dropAt.gid === "" && dropAt.id === null ? " dropon" : ""}`} data-gid="">
          {items.map(card)}
        </div>
      );
    const open = !closed.has(gid);
    const nSel = items.filter((x) => sel.has(x.id)).length;
    const movable = !s.fixed;
    const ug = userGroups.map((g) => g.id);
    const gOver = grpOver && grpOver.gid === gid ? (grpOver.after ? " grp-after" : " grp-before") : "";
    return (
      <div
        key={gid || "none"}
        className={`igrp${dropAt && dropAt.gid === gid && dropAt.id === null ? " dropon" : ""}${grpDrag === gid ? " grp-moving" : ""}${gOver}`}
        data-gid={gid}
        data-a={`igrp-${gid}`}
        onDragOver={(e) => {
          if (!grpDrag || !movable) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          const after = e.clientY > r.top + r.height / 2;
          if (!grpOver || grpOver.gid !== gid || grpOver.after !== after) setGrpOver({ gid, after });
        }}
        onDrop={(e) => {
          if (!grpDrag || !movable) return;
          e.preventDefault();
          dropGroup(gid, grpOver?.gid === gid ? grpOver.after : false);
        }}
      >
        <div className="igrp-head">
          {movable ? (
            <span
              className="igrp-grip"
              draggable
              title={t("Glisser pour déplacer le groupe")}
              aria-hidden="true"
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", gid);
                setGrpDrag(gid);
              }}
              onDragEnd={() => {
                setGrpDrag(null);
                setGrpOver(null);
              }}
            >
              ⠿
            </span>
          ) : null}
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
            <b onDoubleClick={() => !s.fixed && setRenaming(gid)}>{t(name)}</b>
          )}
          <small className="faint">{nSel ? `${nSel}/${items.length}` : `${items.length}`}</small>
          {items.length && open ? (
            <button
              className="btn sm ghost"
              onClick={() => {
                const ids = items.map((x) => x.id);
                const allIn = ids.every((id) => sel.has(id));
                setSel((cur) => {
                  const n = new Set(cur);
                  for (const id of ids) if (allIn) n.delete(id);
                  else n.add(id);
                  return n;
                });
              }}
            >
              {items.every((x) => sel.has(x.id)) ? t("Désélectionner le groupe") : t("Sélectionner le groupe")}
            </button>
          ) : null}
          <span style={{ flex: 1 }}></span>
          {s.fixed ? null : (
            <Menu
              items={[
                { label: "Renommer", onClick: () => setRenaming(gid) },
                { label: "Monter le groupe", onClick: () => shiftGroup(gid, -1), hidden: ug.indexOf(gid) <= 0 },
                { label: "Descendre le groupe", onClick: () => shiftGroup(gid, 1), hidden: ug.indexOf(gid) >= ug.length - 1 },
                { label: "Supprimer le groupe (les instances restent)", onClick: () => setGroups((gs) => gs.filter((x) => x.id !== gid)), danger: true },
              ]}
            />
          )}
        </div>
        {open ? (
          items.length ? (
            <div className="icards">{items.map(card)}</div>
          ) : (
            <div className="igrp-empty faint">{t(s.hint ?? "Groupe vide : glisse une carte ici, ou utilise le menu ⋯ d'une instance.")}</div>
          )
        ) : null}
      </div>
    );
  };

  const nPins = pinCount(nav);
  const hideLabel = HIDE_CHOICES.find(([d]) => d === view.hideDays)?.[1] ?? "1 an";
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
        <div className="toolbar wc-tools">
          <button className="btn sm" onClick={() => (selIds.length === visible.length && visible.length ? clearSel() : selectAll())} disabled={!visible.length} title={t("Ctrl+A")}>
            {selIds.length === visible.length && visible.length ? t("Tout désélectionner") : t("Tout sélectionner")}
          </button>
          <label className="wc-opt">
            <span>{t("Ordre")}</span>
            <select
              value={view.sort}
              aria-label={t("Ordre des instances")}
              onChange={(e) => {
                const v = e.target.value === "manual" ? "manual" : "auto";
                // passer en rangement manuel part de l'ordre affiché : rien ne bouge
                setView((p) => ({ ...p, sort: v, order: v === "manual" && !p.order.length ? orderInstances(inst).map((x) => x.id) : p.order }));
              }}
            >
              <option value="auto">{t("Favoris puis récentes")}</option>
              <option value="manual">{t("Rangé à la main")}</option>
            </select>
          </label>
          {view.sort === "manual" ? (
            <button className="btn sm ghost" onClick={() => setView((p) => ({ ...p, sort: "auto", order: [] }))} title={t("Revenir à l'ordre automatique")}>
              {t("Réinitialiser l'ordre")}
            </button>
          ) : null}
          <span style={{ flex: 1 }}></span>
          <button className="chip" aria-pressed={view.hideOld ? "true" : "false"} onClick={() => setView((p) => ({ ...p, hideOld: !p.hideOld }))}>
            {t("Masquer les instances pas lancées depuis")}
          </button>
          <select aria-label={t("Durée")} value={view.hideDays} onChange={(e) => setView((p) => ({ ...p, hideDays: Number(e.target.value), hideOld: true }))}>
            {HIDE_CHOICES.map(([d, l]) => (
              <option key={d} value={d}>
                {t(l)}
              </option>
            ))}
          </select>
        </div>
        <p className="faint wc-hint">{t("Glisse une carte pour la ranger (dans un groupe ou entre deux cartes). Ctrl+clic ou la case : sélectionner ; Maj+clic : une plage ; Maj + glisser : toutes les cartes survolées.")}</p>
        <div className="wc-all" onPointerDown={onPointerDown} onClickCapture={onClickCapture}>
          {sections.map(section)}
        </div>
        {/* barre d'actions SOUS les cartes (collée en bas à l'écran) : elle ne décale jamais les cartes */}
        {selIds.length ? (
          <div className="wc-bulk" role="toolbar" aria-label={t("Actions sur la sélection")}>
            <b>{`${selIds.length} ${selIds.length > 1 ? t("sélectionnées") : t("sélectionnée")}`}</b>
            {bulkNew !== null ? (
              <input
                autoFocus
                type="text"
                maxLength={40}
                placeholder={t("Nom du nouveau groupe")}
                aria-label={t("Nom du nouveau groupe")}
                value={bulkNew}
                onChange={(e) => setBulkNew(e.target.value)}
                onBlur={() => {
                  if (bulkNew.trim()) createGroup(bulkNew, selIds);
                  setBulkNew(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setBulkNew(null);
                  }
                }}
              />
            ) : (
              <select
                aria-label={t("Ranger la sélection dans")}
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === NEW_GROUP) return setBulkNew("");
                  const gid = v === NO_GROUP ? "" : v;
                  moveMany(selIds, gid);
                  toast(gid ? `${selIds.length} instance(s) rangée(s) dans « ${groups.find((g) => g.id === gid)?.name ?? "Inactives"} »` : `${selIds.length} instance(s) sortie(s) de leur groupe`);
                }}
              >
                <option value="" disabled>
                  {t("Ranger dans…")}
                </option>
                {userGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
                <option value={NO_GROUP}>{t("Sans groupe")}</option>
                <option value={NEW_GROUP}>{t("+ Nouveau groupe…")}</option>
              </select>
            )}
            <button className="btn sm" onClick={() => selInst.filter((x) => x.fav === allFav).forEach((x) => toggleFav(x.id))}>
              {allFav ? t("Retirer des favoris") : t("Ajouter aux favoris")}
            </button>
            <button className="btn sm" onClick={() => moveMany(selIds, allInactive ? "" : INACTIVE_ID)}>
              {allInactive ? t("Sortir des inactives") : t("Ranger comme inactives")}
            </button>
            <span style={{ flex: 1 }}></span>
            <button className="btn sm ghost" onClick={clearSel} title={t("Échap")}>
              {t("Désélectionner")}
            </button>
          </div>
        ) : null}
        {rows.length ? null : <div className="empty">{inst.length ? (oldOnes.length && matched.length === oldOnes.length ? t("Toutes les instances correspondantes sont masquées (jamais lancées ou pas lancées depuis longtemps).") : t("Aucune instance ne correspond.")) : t("Aucune instance trouvée sur ce PC (WeCraft, CurseForge, Modrinth, Prism).")}</div>}
        {oldOnes.length ? (
          <p className="faint" style={{ fontSize: "12.5px" }}>
            {`${oldOnes.length} ${oldOnes.length > 1 ? t("instances masquées : jamais lancées ou pas depuis") : t("instance masquée : jamais lancée ou pas depuis")} ${t(hideLabel)}. `}
            <button className="linkbtn" onClick={() => setView((p) => ({ ...p, hideOld: false }))}>
              {t("Les afficher")}
            </button>
          </p>
        ) : null}
        {hidden ? <p className="faint" style={{ fontSize: "12.5px" }}>{`${hidden} instance${hidden > 1 ? "s masquées" : " masquée"} (réglage de WeCraft).`}</p> : null}
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
