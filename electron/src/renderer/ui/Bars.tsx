// Barres de navigation (port de renderBars, navBtn, pinsHTML… du prototype). Même balisage, mêmes règles.
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { useApp } from "./ctx";
import { useUnread } from "./Relink";
import { Ic } from "./Ic";
import { LOGO } from "./icons";
import { barSize, dockSide, NAVINFO, pinCount, profPlace, SKINS, type Inst, type NavConfig, type Pin, type Side, type Skin } from "./model";
import { t } from "./i18n";
import { coverVars, IconFace, InstIcon } from "./symbols";

type Css = CSSProperties & Record<`--${string}`, string>;
type Piece = { kind: "sep" | "spacer" | "el"; key: string; node: ReactNode };
/** Entrée ou Espace sur un faux bouton = clic (accessibilité clavier). */
const keyClick = (e: KeyboardEvent<HTMLElement>) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    e.currentTarget.click();
  }
};

export function Head({ skin, size }: { skin: Skin; size: number }) {
  const st: Css = { "--s": `${size}px`, "--sk": skin.sk, "--hair": skin.hair, "--eye": skin.eye };
  return (
    <span className="head3d" style={st}>
      <i className="b"></i>
      <i className="u"></i>
      <i className="l"></i>
      <i className="t"></i>
      <i className="r"></i>
      <i className="f"></i>
    </span>
  );
}

export function Minis({ g, byId }: { g: Extract<Pin, { t: "g" }>; byId: (id: string) => Inst | undefined }) {
  const xs = g.items.map(byId).filter((x): x is Inst => !!x).slice(0, 3);
  return (
    <span className="gstack">
      {xs
        .slice()
        .reverse()
        .map((x, k) => {
          const pos = xs.length - 1 - k;
          const st: Css = coverVars(x);
          // mêmes icônes que les instances (image, symbole ou initiales)
          return (
            <i key={pos} className={`l${pos}`} style={st}>
              <IconFace x={x} size={22} />
            </i>
          );
        })}
      <em>{g.items.length}</em>
    </span>
  );
}

/** Retire les séparateurs en double, en tête, en fin, et juste avant un espace flexible (cleanSeps). */
function cleanSeps(list: Piece[]): Piece[] {
  const out: Piece[] = [];
  let prevSep = true;
  let lastKept: Piece | null = null;
  for (const k of list) {
    if (k.kind === "sep") {
      if (!prevSep) {
        out.push(k);
        lastKept = k;
      }
      prevSep = true;
      continue;
    }
    if (k.kind === "spacer") {
      if (lastKept && lastKept.kind === "sep") out.splice(out.indexOf(lastKept), 1);
      out.push(k);
      lastKept = k;
      prevSep = true;
      continue;
    }
    out.push(k);
    lastKept = k;
    prevSep = false;
  }
  while (out.length && out[out.length - 1]!.kind === "sep") out.pop();
  return out;
}

export function useBarsModel(): { node: ReactNode; grid: [string, string, string]; pf: boolean; dock: Side | "" } {
  const app = useApp();
  const { nav, ui, pref, byId } = app;
  const unread = useUnread();
  const BS = barSize(nav);
  const BV = `${BS.v}px`;
  const BH = `${BS.h}px`;
  const lgOn = pref.style === "lg";
  const R = lgOn ? 24 : 16;
  const m = lgOn ? 12 : 10;
  const pp = profPlace(nav);
  const zone = nav.pinMode === "inline";
  let seq = 0;
  const k = (p: string) => `${p}-${seq++}`;

  const current = (go: string, rl?: string) =>
    rl ? ui.view === "relink" && ui.rlTab === rl : go === "relink" ? ui.view === "relink" && ui.rlTab !== "shop" : go === ui.view;
  const goBtn = (cls: string, go: string, a: string, tip: string, body: ReactNode, rl?: string) => (
    <button
      key={k(a)}
      className={cls}
      data-go={go}
      {...(rl ? { "data-rl": rl } : {})}
      data-a={a}
      data-tip={tip}
      aria-label={tip}
      {...(current(go, rl) ? { "aria-current": "page" as const } : {})}
    >
      {body}
    </button>
  );
  const drawerBtn = (id: string, tip: string, icon: string) => (
    <button key={k(id)} className="nb" data-act="drawer" data-drawer={id} data-a={`nav-${id}`} data-tip={tip} aria-label={tip} aria-pressed={ui.drawer === id ? "true" : "false"}>
      <Ic n={icon} />
      {id === "news" && unread ? <span className="cnt">{unread > 9 ? "9+" : unread}</span> : null}
    </button>
  );
  const utils = (): ReactNode[] => [
    drawerBtn("news", t("Nouveautés et notifications"), "bell"),
    <button key={k("live")} className="nb" data-go="live" data-a="nav-live" data-tip={t("Diffusion Partenaires · 0 lives")} aria-label={t("Diffusion Partenaires")} {...(current("live") ? { "aria-current": "page" as const } : {})}>
      <Ic n="live" />
    </button>,
    drawerBtn("downloads", "Download Manager", "downloads"),
    drawerBtn("friends", t("Amis"), "friends"),
  ];
  const logo = () =>
    goBtn(
      "nb logo",
      "home",
      "nav-logo",
      t("Accueil"),
      <img src={LOGO} alt="" />,
    );
  const prof = () => goBtn("nb prof", "relink", "nav-profile", t("Compte ReLink"), <Head skin={SKINS[ui.skin] ?? SKINS[0]!} size={Math.round(BS.b * 0.48)} />);
  const sepEl = (o: "v" | "h") => <span key={k("s")} className={o === "v" ? "sepv" : "seph"}></span>;

  const pinItem = (id: string): ReactNode => {
    const x = byId(id);
    if (!x) return null;
    // exactement la même icône que dans les listes d'instances (InstIcon), à la taille du bouton
    return (
      // <div role="button"> : Chromium ne commence jamais un glisser-déposer depuis un <button>
      <div key={k(`pin-${id}`)} role="button" tabIndex={0} onKeyDown={keyClick} className="nb rec pinico" draggable="true" data-pin-drag={`i:${id}`} data-pin-drop={`i:${id}`} data-play={id} data-a={`pin-${id}`} data-tip={`${t("Lancer")} ${x.n} · ${t("glisser sur une autre pour grouper")}`} aria-label={`${t("Lancer")} ${x.n}`}>
        <InstIcon icon={x.icon} fallback={x.c} name={x.n} size={BS.b} />
      </div>
    );
  };
  const grpBtn = (g: Extract<Pin, { t: "g" }>) => (
    <div key={k(`pgrp-${g.id}`)} role="button" tabIndex={0} onKeyDown={keyClick} className="nb grp" draggable="true" data-pin-drag={`g:${g.id}`} data-pin-drop={`g:${g.id}`} data-act="openGroup" data-gid={g.id} data-popbtn="1" data-a={`pgrp-${g.id}`} data-tip={`${g.name} · ${g.items.length}`} aria-label={`Groupe ${g.name}`}>
      <Minis g={g} byId={byId} />
    </div>
  );
  const pins = (): Piece[] => nav.pins.map((p) => ({ kind: "el" as const, key: k("p"), node: p.t === "i" ? pinItem(p.id) : grpBtn(p) })).filter((p) => p.node !== null);

  const navBtn = (id: string, o: "v" | "h"): Piece[] => {
    const it = NAVINFO[id]!;
    if (it.sep) return [{ kind: "sep", key: k("sep"), node: <span key={k("sep")} className={o === "v" ? "sepv" : "seph"} data-sep="1"></span> }];
    if (id === "spacer") return [{ kind: "spacer", key: k("sp"), node: <span key={k("sp")} className="grow" data-spacer="1"></span> }];
    if (id === "pins") {
      if (nav.pinMode === "inline") return pins();
      if (nav.pinMode === "section") {
        const n = pinCount(nav);
        return [
          {
            kind: "el",
            key: k("ps"),
            node: (
              <button key={k("ps")} className="nb" data-act="openSection" data-popbtn="1" data-a="nav-pins" data-tip={t("Instances épinglées")} aria-label={t("Instances épinglées")}>
                <Ic n="pins" />
                {n ? <span className="cnt">{n}</span> : null}
              </button>
            ),
          },
        ];
      }
      return [];
    }
    if (it.view) return [{ kind: "el", key: k(id), node: goBtn("nb", it.view, `nav-${id}`, t(it.l), <Ic n={id} />, it.rl) }];
    return [
      {
        kind: "el",
        key: k(id),
        node: (
          <button key={k(id)} className="nb" data-act={it.act} data-a={`nav-${id}`} data-tip={t(it.l)} aria-label={t(it.l)}>
            <Ic n={id} />
          </button>
        ),
      },
    ];
  };
  const setIt = nav.items.find((x) => x.id === "settings");
  const list = (bar: "h" | "v" | null, o: "v" | "h") =>
    cleanSeps(nav.items.filter((x) => x.on && !NAVINFO[x.id]!.pin && (bar == null || x.bar === bar)).flatMap((x) => navBtn(x.id, o))).map((p) => p.node);
  const setB = (bar: "h" | "v" | null, o: "v" | "h") => (setIt && setIt.on && (bar == null || setIt.bar === bar) ? navBtn("settings", o).map((p) => p.node) : []);
  const GR = (bar: "h" | "v" | null) => (nav.items.some((x) => x.id === "spacer" && x.on && (bar == null || x.bar === bar)) ? [] : [<span key={k("g")} className="grow"></span>]);

  const piece = (cls: string, area: string, inner: ReactNode[], touch: { t?: boolean; r?: boolean; b?: boolean; l?: boolean }, key: string) => {
    const mg = [touch.t ? 0 : m, touch.r ? 0 : m, touch.b ? 0 : m, touch.l ? 0 : m];
    const bw = [touch.t ? 0 : 1, touch.r ? 0 : 1, touch.b ? 0 : 1, touch.l ? 0 : 1];
    const rad = [!touch.t && !touch.l ? R : 0, !touch.t && !touch.r ? R : 0, !touch.b && !touch.r ? R : 0, !touch.b && !touch.l ? R : 0];
    return (
      <nav
        key={key}
        className={`bar ${cls}`}
        data-a={key}
        data-name="Navigation"
        {...(zone && key !== "bar-corner" ? { "data-pin-zone": "1" } : {})}
        style={{ gridArea: area, margin: mg.join("px ") + "px", borderWidth: bw.join("px ") + "px", borderRadius: rad.join("px ") + "px" }}
        aria-label={t("Navigation")}
      >
        {inner}
      </nav>
    );
  };

  const html: ReactNode[] = [];
  let g: [string, string, string];
  if (nav.mode === "single") {
    const o = nav.single === "left" || nav.single === "right" ? "v" : "h";
    const inner = [
      ...(pp === "start" ? [prof(), ...utils(), sepEl(o)] : []),
      logo(),
      sepEl(o),
      ...list(null, o),
      ...GR(null),
      ...setB(null, o),
      ...(pp === "end" ? [sepEl(o), ...utils(), prof()] : []),
    ];
    html.push(piece(o, "bar", inner, {}, "bar-main"));
    g = (
      {
        left: [`${BV} minmax(0,1fr)`, "minmax(0,1fr)", '"bar main"'],
        right: [`minmax(0,1fr) ${BV}`, "minmax(0,1fr)", '"main bar"'],
        top: ["minmax(0,1fr)", `${BH} minmax(0,1fr)`, '"bar" "main"'],
        bottom: ["minmax(0,1fr)", `minmax(0,1fr) ${BH}`, '"main" "bar"'],
      } as Record<Side, [string, string, string]>
    )[nav.single];
  } else if (nav.joined === false) {
    const sides = [nav.h, nav.v];
    const has = (x: Side) => sides.includes(x);
    const ori = (x: Side) => (x === "top" || x === "bottom" ? "h" : "v");
    const cols = (has("left") ? `${BV} ` : "") + "minmax(0,1fr)" + (has("right") ? ` ${BV}` : "");
    const rws = (has("top") ? `${BH} ` : "") + "minmax(0,1fr)" + (has("bottom") ? ` ${BH}` : "");
    const rr = [...(has("top") ? ["top"] : []), "mid", ...(has("bottom") ? ["bottom"] : [])];
    const cc = [...(has("left") ? ["left"] : []), "mid", ...(has("right") ? ["right"] : [])];
    const ar = rr
      .map((r) => '"' + cc.map((c) => (r === "mid" && c === "mid" ? "main" : r !== "mid" && c === "mid" ? `b${r}` : r === "mid" && c !== "mid" ? `b${c}` : ".")).join(" ") + '"')
      .join(" ");
    for (const [bar, sd] of [
      ["h", nav.h],
      ["v", nav.v],
    ] as ["h" | "v", Side][]) {
      const o = ori(sd);
      const A = bar === "h";
      const inner = [
        ...(pp === "dright" && sd === "right" ? [prof(), ...utils(), sepEl(o)] : []),
        ...(A ? [logo(), sepEl(o)] : []),
        ...list(bar, o),
        ...GR(bar),
        ...setB(bar, o),
        ...(pp === "dtop" && sd === "top" ? [sepEl(o), ...utils(), prof()] : []),
      ];
      html.push(piece(o, `b${sd}`, inner, {}, `bar-${bar}`));
    }
    g = [cols, rws, ar];
  } else {
    const top = nav.h === "top";
    const left = nav.v === "left";
    const cols = left ? `${BV} minmax(0,1fr)` : `minmax(0,1fr) ${BV}`;
    const rows = top ? `${BH} minmax(0,1fr)` : `minmax(0,1fr) ${BH}`;
    const rowH = left ? '"corner hbar"' : '"hbar corner"';
    const rowV = left ? '"vbar main"' : '"main vbar"';
    const areas = top ? `${rowH} ${rowV}` : `${rowV} ${rowH}`;
    const corner = pp === "corner" ? prof() : logo();
    const hInner = [
      ...(pp === "corner" ? [logo(), sepEl("h")] : []),
      ...list("h", "h"),
      ...GR("h"),
      ...setB("h", "h"),
      ...(pp === "hend" || pp === "corner" ? [sepEl("h"), ...utils(), ...(pp === "hend" ? [prof()] : [])] : []),
    ];
    const vInner = [...(pp === "vstart" ? [prof(), ...utils(), sepEl("v")] : []), ...list("v", "v"), ...GR("v"), ...setB("v", "v")];
    html.push(piece("corner v", "corner", [corner], { t: !top, b: top, l: !left, r: left }, "bar-corner"));
    html.push(piece("h", "hbar", hInner, { l: left, r: !left }, "bar-h"));
    html.push(piece("v", "vbar", vInner, { t: top, b: !top }, "bar-v"));
    g = [cols, rows, areas];
  }
  if (pp === "float")
    html.push(
      <div key="pfloat" className="pfloat" data-a="profile-float" data-name="Navigation">
        {utils()}
        {prof()}
      </div>,
    );
  let ds: Side | "" = "";
  if (nav.pinMode === "dock") {
    ds = dockSide(nav as NavConfig);
    const dh = ds === "top" || ds === "bottom" ? "h" : "v";
    html.push(
      <div key="dock" className={`dock ${dh} s-${ds} a-${nav.dock.align}`} data-a="pin-dock" data-name="Épingles" data-pin-zone="1" title={t("Double-clic : gérer les instances épinglées")} onDoubleClick={(e) => !(e.target as HTMLElement).closest("[data-play],[data-act]") && app.show("pins")}>
        {pinCount(nav) ? pins().map((p) => p.node) : <span className="dockhint">{t("Épingle une instance pour la voir ici")}</span>}
      </div>,
    );
  }
  return { node: html, grid: g, pf: pp === "float", dock: ds };
}
