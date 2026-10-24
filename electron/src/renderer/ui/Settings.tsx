// Page Réglages (port de RENDER.settings, mini, pinMgr… du prototype), même balisage.
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Minis } from "./Bars";
import { useApp } from "./ctx";
import { Ic } from "./Ic";
import { BARSIZES, dockSide, NAVINFO, occupied, pinCount, PRESETS, profPlace, type NavConfig, type Side } from "./model";

type Css = CSSProperties & Record<`--${string}`, string>;

/** Texte CSS du prototype (« top:0;left:2px ») vers un objet de style React. */
export function css(text: string): Css {
  const out: Record<string, string> = {};
  for (const decl of text.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    const val = decl.slice(i + 1).trim();
    if (!prop) continue;
    out[prop.startsWith("--") ? prop : prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = val;
  }
  return out as Css;
}

type MiniCfg = Pick<NavConfig, "mode" | "single" | "h" | "v" | "junction"> & { joined?: boolean };

export function Mini({ c }: { c: MiniCfg }) {
  const pp = profPlace(c);
  let bars: ReactNode;
  let L = "";
  if (c.mode === "single") {
    const p = c.single;
    const o = p === "left" || p === "right";
    bars = <i style={css(o ? `top:0;bottom:0;width:12px;${p}:0` : `left:0;right:0;height:11px;${p}:0`)}></i>;
    L = { left: "top:3px;left:1.5px", right: "top:15px;right:1.5px", top: "top:1px;left:3px", bottom: "bottom:1px;left:3px" }[p];
  } else if (c.joined === false) {
    const bs = (x: Side) => (x === "top" || x === "bottom" ? `left:16px;right:16px;height:9px;${x}:0` : `top:14px;bottom:14px;width:10px;${x}:0`);
    bars = (
      <>
        <i style={css(`${bs(c.h)};border-radius:3px`)}></i>
        <i style={css(`${bs(c.v)};border-radius:3px`)}></i>
      </>
    );
    L = c.h === "top" || c.h === "bottom" ? `${c.h}:0;left:18px` : `top:16px;${c.h}:0.5px`;
  } else {
    bars = (
      <>
        <i style={css(`left:0;right:0;height:11px;${c.h}:0`)}></i>
        <i style={css(`top:0;bottom:0;width:12px;${c.v}:0`)}></i>
      </>
    );
    L = pp === "corner" ? "top:1px;left:3px" : `${c.h}:1px;${c.v}:1.5px`;
  }
  const P = {
    dtop: "top:0;right:18px",
    dright: "top:16px;right:0.5px",
    float: "top:5px;right:5px",
    end: "top:1px;right:3px",
    start: "top:3px;right:1.5px",
    corner: "top:1px;right:1.5px",
    hend: `top:1px;right:${c.v === "right" ? "15px" : "3px"}`,
    vstart: "top:3px;right:1.5px",
  }[pp];
  return (
    <span className="mini">
      {bars}
      <b style={css(L)}></b>
      <b className="p" style={css(P)}></b>
    </span>
  );
}

function PinMini({ m }: { m: string }) {
  return (
    <span className="mini">
      <i style={css("top:0;bottom:0;width:12px;left:0")}></i>
      {m === "inline" ? (
        <>
          <b className="q" style={css("left:2px;top:22px")}></b>
          <b className="q" style={css("left:2px;top:33px")}></b>
        </>
      ) : m === "section" ? (
        <b className="q" style={css("left:2px;top:27px;outline:1.5px solid #fff")}></b>
      ) : (
        <span
          style={css(
            "position:absolute;left:50%;bottom:4px;transform:translateX(-50%);width:34px;height:10px;border-radius:4px;background:color-mix(in srgb,var(--acc) 55%,transparent);display:block",
          )}
        ></span>
      )}
    </span>
  );
}

function FoldHead({ k, t, sub }: { k: string; t: string; sub: string }) {
  const { ui } = useApp();
  return (
    <button className="fold" data-act="fold" data-k={k} aria-expanded={!ui.fold[k] ? "true" : "false"} data-a={`fold-${k}`}>
      <span>
        <b>{t}</b>
        <small>{sub}</small>
      </span>
      <span className="chev" aria-hidden="true">
        ▾
      </span>
    </button>
  );
}

const FR: Record<Side, string> = { top: "Haut", bottom: "Bas", left: "Gauche", right: "Droite" };
const tf = (b: boolean) => (b ? "true" : "false");

function PinChip({ id }: { id: string }) {
  const { byId } = useApp();
  const x = byId(id);
  if (!x) return null;
  return (
    <span className="pinchip" draggable="true" data-pin-drag={`i:${id}`} data-pin-drop={`i:${id}`} data-a={`pc-${id}`}>
      <i style={{ "--c1": x.c[0], "--c2": x.c[1] } as Css}></i>
      {x.n}
      <button data-act="pin" data-id={id} aria-label={`Retirer ${x.n}`}>
        ✕
      </button>
    </span>
  );
}

function PinMgr() {
  const { nav, ui, inst, editNav, byId } = useApp();
  const occ = occupied(nav);
  const sides: [Side, string][] = [
    ["top", "Haut"],
    ["right", "Droite"],
    ["bottom", "Bas"],
    ["left", "Gauche"],
  ];
  if (nav.pinMode === "dock") dockSide(nav);
  const modes: [string, string, string][] = [
    ["inline", "Dans la barre", "Parmi les boutons"],
    ["section", "Dans une section", "Un bouton qui les regroupe"],
    ["dock", "Barre séparée", "Sur un autre bord"],
  ];
  const n = pinCount(nav);
  const head = <FoldHead k="pins" t="Instances épinglées" sub={`${n} épinglée${n > 1 ? "s" : ""} · ${{ inline: "dans la barre", section: "dans une section", dock: "barre séparée" }[nav.pinMode]}`} />;
  if (ui.fold["pins"]) return head;
  const horiz = nav.dock.side === "top" || nav.dock.side === "bottom";
  return (
    <>
      {head}
      <div className="grp fbody" data-a="pin-settings">
        <p>Choisis où elles s'affichent. Glisse une instance sur une autre pour créer un groupe, puis donne-lui un nom.</p>
        <div className="layouts" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
          {modes.map((m) => (
            <button key={m[0]} className="lay" data-act="pinMode" data-m={m[0]} aria-pressed={tf(nav.pinMode === m[0])}>
              <PinMini m={m[0]} />
              {m[1]}
              <span className="faint" style={{ fontWeight: 500, fontSize: "11px" }}>
                {m[2]}
              </span>
            </button>
          ))}
        </div>
        {nav.pinMode === "dock" ? (
          <>
            <div className="setrow">
              <span>
                <b>Bord</b>
                <small>Les bords occupés par la barre d'action sont bloqués</small>
              </span>
              <span className="chips">
                {sides.map((sd) => {
                  const dis = occ.includes(sd[0]);
                  return (
                    <button
                      key={sd[0]}
                      className="chip"
                      data-act="dockSide"
                      data-s={sd[0]}
                      aria-pressed={tf(nav.dock.side === sd[0])}
                      {...(dis ? { disabled: true, "aria-disabled": "true" as const, title: "Occupé par la barre d'action", style: { opacity: 0.35, cursor: "not-allowed", textDecoration: "line-through" } } : {})}
                    >
                      {sd[1]}
                    </button>
                  );
                })}
              </span>
            </div>
            <div className="setrow">
              <span>
                <b>Position sur le bord</b>
                <small>La barre ne prend pas tout le côté</small>
              </span>
              <span className="chips">
                {(
                  [
                    ["start", horiz ? "Gauche" : "Haut"],
                    ["center", "Centre"],
                    ["end", horiz ? "Droite" : "Bas"],
                  ] as const
                ).map((a) => (
                  <button key={a[0]} className="chip" data-act="dockAlign" data-al={a[0]} aria-pressed={tf(nav.dock.align === a[0])}>
                    {a[1]}
                  </button>
                ))}
              </span>
            </div>
          </>
        ) : null}
        <div className="pinmgr" data-pin-zone="1">
          {nav.pins.map((p) =>
            p.t === "i" ? (
              <PinChip key={p.id} id={p.id} />
            ) : (
              <div key={p.id} className="pgroup" draggable="true" data-pin-drag={`g:${p.id}`} data-pin-drop={`g:${p.id}`} data-a={`pmg-${p.id}`}>
                <span className="gmini">
                  <Minis g={p} byId={byId} />
                </span>
                <input
                  type="text"
                  data-gname={p.id}
                  value={p.name}
                  aria-label="Nom du groupe"
                  draggable="false"
                  onChange={(e) => {
                    const v = e.target.value;
                    editNav((nv) => {
                      const g = nv.pins.find((q) => q.t === "g" && q.id === p.id);
                      if (g && g.t === "g") g.name = v.trim() || "Groupe";
                    });
                  }}
                />
                <span className="chips">
                  {p.items.map((id) => (
                    <PinChip key={id} id={id} />
                  ))}
                </span>
                <button className="btn sm" data-act="dissolve" data-gid={p.id}>
                  Dissoudre
                </button>
              </div>
            ),
          )}
          <select
            id="pinAdd"
            aria-label="Épingler une instance"
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v) editNav((nv) => void nv.pins.push({ t: "i", id: v }), { pins: true });
            }}
          >
            <option value="">+ Épingler…</option>
            <optgroup label="WeCraft">
              {inst
                .filter((p) => !nav.pins.some((q) => (q.t === "i" ? q.id === p.id : q.items.includes(p.id))))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.n}
                  </option>
                ))}
            </optgroup>
            <optgroup label="ReLaunch"></optgroup>
          </select>
        </div>
      </div>
    </>
  );
}

function NavTab() {
  const { nav, ui, editNav } = useApp();
  const J = nav.joined !== false;
  const singles: [Side, string][] = [
    ["left", "Gauche"],
    ["top", "Haut"],
    ["right", "Droite"],
    ["bottom", "Bas"],
  ];
  const joinedL: MiniCfg[] = (
    [
      { h: "top", v: "left", junction: "logo" },
      { h: "top", v: "right", junction: "logo" },
      { h: "top", v: "right", junction: "profil" },
      { h: "bottom", v: "left", junction: "logo" },
      { h: "bottom", v: "right", junction: "logo" },
    ] as const
  ).map((d) => ({ ...d, mode: "double", joined: true, single: "left" }) as MiniCfg);
  const freeL: MiniCfg[] = (
    [
      ["top", "bottom"],
      ["left", "right"],
      ["top", "left"],
      ["top", "right"],
      ["bottom", "left"],
      ["bottom", "right"],
    ] as [Side, Side][]
  ).map((p) => ({ mode: "double", joined: false, h: p[0], v: p[1], junction: "logo", single: "left" }));
  const isCur = (c: MiniCfg) => {
    if (c.mode === "single") return nav.mode === "single" && nav.single === c.single;
    if (nav.mode !== "double" || J !== c.joined) return false;
    return nav.h === c.h && nav.v === c.v && (!c.joined || nav.junction === c.junction);
  };
  /** data-lay : même JSON que le prototype (seules les clés de la disposition). */
  const layJson = (c: MiniCfg) =>
    JSON.stringify(
      c.mode === "single"
        ? { mode: "single", single: c.single }
        : c.joined
          ? { h: c.h, v: c.v, junction: c.junction, mode: "double", joined: true }
          : { mode: "double", joined: false, h: c.h, v: c.v, junction: c.junction },
    );
  const layBtn = (c: MiniCfg, label: string, sub?: string) => (
    <button key={layJson(c)} className="lay" data-lay={layJson(c)} aria-pressed={tf(isCur(c))}>
      <Mini c={c} />
      {label}
      {sub ? (
        <span className="faint" style={{ fontWeight: 500, fontSize: "11px" }}>
          {sub}
        </span>
      ) : null}
    </button>
  );
  const sections = nav.items.filter((x) => x.on && !NAVINFO[x.id]!.sep && x.id !== "spacer").length;
  const orgSum = nav.mode === "single" ? `1 barre · ${FR[nav.single].toLowerCase()}` : `2 barres ${J ? "reliées" : "séparées"} · ${FR[nav.h].toLowerCase()} + ${FR[nav.v].toLowerCase()}`;

  // Glisser une ligne de la liste des sections
  const from = useRef<number | null>(null);
  return (
    <>
      <div className="grp">
        <h3>Configurations prêtes</h3>
        <p>Un point de départ en un clic. Tu peux tout modifier ensuite.</p>
        <div className="presets">
          {(
            [
              ["minimal", "Minimaliste", "WeCraft, ReLaunch, WeLive, Créer un WePack, Shop et Réglages."],
              ["condensed", "Condensé", "Les mêmes boutons, serrés, sans séparateurs."],
              ["all", "Toutes les features", "Toutes les sections à gauche, épingles dans une barre à droite."],
              ["split", "Réparti", "Espaces en haut, outils à gauche, barres séparées, épingles à droite."],
            ] as const
          ).map((p) => {
            const P = PRESETS[p[0]]!();
            const c = { single: "left", h: "top", v: "left", junction: "logo", ...P.cfg } as MiniCfg;
            return (
              <button key={p[0]} className="preset" data-act="preset" data-p={p[0]} data-a={`preset-${p[0]}`}>
                <Mini c={c} />
                <b>{p[1]}</b>
                <small>{p[2]}</small>
              </button>
            );
          })}
        </div>
      </div>
      <div className="grp" data-a="bar-size">
        <h3>Taille des barres</h3>
        <p>Épaisseur des barres de navigation et taille de leurs boutons.</p>
        <div className="chips" role="radiogroup" aria-label="Taille des barres">
          {Object.keys(BARSIZES).map((k) => (
            <button key={k} className="chip" role="radio" data-act="barSize" data-v={k} aria-checked={tf((nav.size || "m") === k)} aria-pressed={tf((nav.size || "m") === k)}>
              {BARSIZES[k]!.l}
            </button>
          ))}
        </div>
      </div>
      <FoldHead k="orga" t="Organisation des barres" sub={`${orgSum} · ${sections} sections`} />
      {ui.fold["orga"] ? null : (
        <div className="grp fbody" data-a="orga-body">
          <div className="setrow">
            <span>
              <b>Nombre de barres</b>
              <small>Une seule barre, ou deux barres pour répartir les boutons</small>
            </span>
            <span className="chips">
              <button className="chip" data-act="navCount" data-n="1" aria-pressed={tf(nav.mode === "single")}>
                1 barre
              </button>
              <button className="chip" data-act="navCount" data-n="2" aria-pressed={tf(nav.mode === "double")}>
                2 barres
              </button>
            </span>
          </div>
          {nav.mode === "single" ? (
            <>
              <p>Le logo (blanc) ouvre l'accueil. Ton profil (orange) reste en haut à droite.</p>
              <div className="layouts">{singles.map((x) => layBtn({ mode: "single", single: x[0], h: "top", v: "left", junction: "logo" }, x[1]))}</div>
            </>
          ) : (
            <>
              <div className="setrow">
                <span>
                  <b>Barres reliées en angle</b>
                  <small>{J ? "Les deux barres se rejoignent dans un coin, par le logo ou ton profil" : "Chaque barre reste sur son bord, sans toucher l'autre"}</small>
                </span>
                <button className="toggle" role="switch" aria-checked={tf(J)} data-act="navJoin" aria-label="Barres reliées en angle"></button>
              </div>
              {J ? (
                <div className="layouts">{joinedL.map((c) => layBtn(c, `${FR[c.h]} + ${FR[c.v].toLowerCase()}`, `jonction : ${c.junction === "logo" ? "logo" : "profil"}`))}</div>
              ) : (
                <>
                  <p>En haut et en bas, à gauche et à droite, ou sur deux bords voisins sans se toucher. Le logo est sur la première barre.</p>
                  <div className="layouts">{freeL.map((c) => layBtn(c, `${FR[c.h]} + ${FR[c.v].toLowerCase()}`))}</div>
                </>
              )}
            </>
          )}
          <h3 style={{ marginTop: "8px" }}>Sections</h3>
          <p>
            {"Choisis ce qui s'affiche et dans quel ordre. Glisse une ligne ou utilise les flèches. Tout ce qui suit « Espace flexible » va au bout de la barre ; Réglages reste toujours en dernier." +
              (nav.mode === "double" ? " Indique sur quelle barre placer chaque section." : "")}
          </p>
          <div
            className="navlist"
            id="navlist"
            onDragStart={(e) => {
              const r = (e.target as HTMLElement).closest<HTMLElement>(".navrow");
              if (!r || !r.draggable) return;
              from.current = Number(r.dataset["i"]);
              r.classList.add("drag");
              try {
                e.dataTransfer.setData("text/plain", String(from.current));
                e.dataTransfer.effectAllowed = "move";
              } catch {
                // glisser indisponible
              }
            }}
            onDragOver={(e) => {
              if (from.current !== null) e.preventDefault();
            }}
            onDrop={(e) => {
              const r = (e.target as HTMLElement).closest<HTMLElement>(".navrow");
              if (from.current === null || !r) return;
              e.preventDefault();
              const to = Math.min(Number(r.dataset["i"]), nav.items.length - 2);
              const f0 = from.current;
              from.current = null;
              moveNav(editNav, nav, f0, to);
            }}
            onDragEnd={(e) => {
              from.current = null;
              (e.currentTarget as HTMLElement).querySelectorAll(".drag").forEach((x) => x.classList.remove("drag"));
            }}
          >
            {nav.items.map((x, i) => {
              const it = NAVINFO[x.id]!;
              const pin = !!it.pin;
              return (
                <div key={x.id} className={`navrow${x.on ? "" : " off"}${it.sep ? " sep" : ""}`} {...(pin ? {} : { draggable: "true" as const })} data-i={i} data-a={`navrow-${x.id}`}>
                  <span className="grip" aria-hidden="true">
                    {pin ? "" : "⋮⋮"}
                  </span>
                  <span className="ic">
                    <Ic n={it.sep ? "sep" : x.id} />
                  </span>
                  <span className="lb">
                    {it.l}
                    {it.d ? <small>{it.d}</small> : null}
                  </span>
                  {nav.mode === "double" ? (
                    <span className="hv" role="group" aria-label="Barre">
                      <button data-act="navBar" data-i={i} data-b="h" aria-pressed={tf(x.bar === "h")}>
                        {FR[nav.h]}
                      </button>
                      <button data-act="navBar" data-i={i} data-b="v" aria-pressed={tf(x.bar === "v")}>
                        {FR[nav.v]}
                      </button>
                    </span>
                  ) : (
                    <span></span>
                  )}
                  <button className="toggle" role="switch" aria-checked={tf(x.on)} data-act="navOn" data-i={i} aria-label={`Afficher ${it.l}`}></button>
                  {pin ? (
                    <span className="mv"></span>
                  ) : (
                    <span className="mv">
                      <button data-act="navUp" data-i={i} aria-label="Monter" disabled={i === 0}>
                        ↑
                      </button>
                      <button data-act="navDown" data-i={i} aria-label="Descendre" disabled={i >= nav.items.length - 2}>
                        ↓
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="row" style={{ justifyContent: "flex-start" }}>
            <button className="btn sm" data-act="navReset">
              Réinitialiser
            </button>
          </div>
        </div>
      )}
      <PinMgr />
    </>
  );
}

/** moveNav : déplace une section (Réglages reste en dernier), avec l'animation de glissement. */
export function moveNav(editNav: ReturnType<typeof useApp>["editNav"], nav: NavConfig, from: number, to: number): void {
  if (to < 0 || to > nav.items.length - 2 || from === to) return;
  const id = nav.items[from]!.id;
  editNav(
    (n) => {
      const it = n.items.splice(from, 1)[0]!;
      n.items.splice(to, 0, it);
    },
    { flip: id },
  );
}

/** Animation « FLIP » du prototype : les lignes et boutons glissent de leur ancienne place à la nouvelle. */
export function snapPos(): Record<string, DOMRect> {
  const m: Record<string, DOMRect> = {};
  document.querySelectorAll<HTMLElement>(".navrow[data-a],#bars .nb[data-a]").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width) m[el.dataset["a"]!] = r;
  });
  return m;
}
export function playFlip(before: Record<string, DOMRect>, movedKey?: string): void {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.querySelectorAll<HTMLElement>(".navrow[data-a],#bars .nb[data-a]").forEach((el) => {
    const a = before[el.dataset["a"]!];
    if (!a) return;
    const b = el.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    if (!dx && !dy) return;
    el.style.transition = "none";
    el.style.transform = `translate(${dx}px,${dy}px)`;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.style.transition = "transform .32s cubic-bezier(.3,.7,.2,1)";
        el.style.transform = "";
        setTimeout(() => (el.style.transition = ""), 360);
      }),
    );
  });
  if (movedKey)
    document.querySelectorAll<HTMLElement>(`[data-a="navrow-${movedKey}"],#bars [data-a="nav-${movedKey}"]`).forEach((el) => {
      el.classList.add("moved");
      setTimeout(() => el.classList.remove("moved"), 700);
    });
}

export function Settings() {
  const app = useApp();
  const { ui, pref, car, home, appVer, defaultRam } = app;
  const menu: [string, string, string][] = [
    ["apparence", "Apparence", "paint"],
    ["nav", "Navigation", "nav"],
    ["accueil", "Accueil", "home"],
    ["jeu", "Jeu", "game"],
    ["comportement", "Comportement", "behave"],
    ["compte", "Compte ReLink", "relink"],
  ];
  const mb = (m: [string, string, string]) => (
    <button key={m[0]} data-settab={m[0]} aria-current={tf(ui.setTab === m[0])}>
      <Ic n={m[2]} />
      {m[1]}
    </button>
  );
  const ramRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (ramRef.current) ramRef.current.value = String(defaultRam);
  }, [defaultRam]);
  let body: ReactNode;
  if (ui.setTab === "apparence") {
    body = (
      <>
        <div className="grp">
          <h3>Style de l'interface</h3>
          <p>Les quatre thèmes de couleur existent dans les deux styles.</p>
          <div className="styles">
            {(
              [
                ["standard", "std", "Standard", "Surfaces sombres et nettes"],
                ["lg", "lgv", "Liquid Glass", "Verre translucide, reflets, fond coloré"],
              ] as const
            ).map((x) => (
              <button key={x[0]} className="stylec" data-act="style" data-v={x[0]} aria-pressed={tf((pref.style || "standard") === x[0])}>
                <span className={`spv ${x[1]}`}>
                  <span className="sb"></span>
                  <span className="sp">
                    <i></i>
                  </span>
                </span>
                <span className="snm">
                  <b>{x[2]}</b>
                  <small>{x[3]}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="grp">
          <h3>Thème de couleurs</h3>
          <p>La couleur d'accent de toute l'appli.</p>
          <div className="themes">
            {(
              [
                ["phenix", "Phénix", "#ff8a3d"],
                ["relink", "ReLink", "#3fd08a"],
                ["aurore", "Aurore", "#8b7bff"],
                ["glace", "Glace", "#5cc8ff"],
              ] as const
            ).map((t) => (
              <button key={t[0]} className="theme" data-theme={t[0]} aria-pressed={tf(pref.skin === t[0])} style={{ "--tc": t[2] } as Css}>
                <span className="pv" style={{ display: "flex" }}>
                  <i></i>
                  <span></span>
                </span>
                <span className="nm">{t[1]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grp">
          <h3>Fond</h3>
          <p>Le fond derrière les pages du launcher.</p>
          <div className="bgopts">
            {(
              [
                ["pattern", "pat", "Avec motifs"],
                ["plain", "grad", "Sans motifs"],
                ["flat", "flat", "Uni"],
              ] as const
            ).map((x) => (
              <button key={x[0]} className="bgopt" data-act="bgMode" data-v={x[0]} aria-pressed={tf((pref.bg || "pattern") === x[0])}>
                <span className={`bpv ${x[1]}`}></span>
                <span className="n">{x[2]}</span>
              </button>
            ))}
          </div>
        </div>
      </>
    );
  } else if (ui.setTab === "nav") {
    body = <NavTab />;
  } else if (ui.setTab === "accueil") {
    body = (
      <>
        <div className="grp">
          <h3>Encarts d'actualité</h3>
          <p>Les encarts s'affichent en bas à droite de l'accueil. Toutes les actualités restent aussi dans Info &amp; News et le menu cloche.</p>
        </div>
        <div className="setrow">
          <span>
            <b>Encarts affichés en même temps</b>
            <small>1 grand ou jusqu'à 5 plus petits</small>
          </span>
          <span className="chips">
            {[1, 2, 3, 4, 5].map((k) => (
              <button key={k} className="chip" data-act="carN" data-n={k} aria-pressed={tf(car.n === k)}>
                {k}
              </button>
            ))}
          </span>
        </div>
        <div className="setrow">
          <span>
            <b>Défilement automatique</b>
            <small>Encarts de l'accueil et actualité à la une d'Info &amp; News · pause au survol</small>
          </span>
          <button className="toggle" role="switch" aria-checked={tf(car.auto)} data-act="carAuto" aria-label="Défilement automatique"></button>
        </div>
        {car.auto ? (
          <div className="setrow">
            <span>
              <b>Vitesse</b>
              <small>Temps passé sur chaque position</small>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "220px" }}>
              <input type="range" min="3" max="15" step="1" defaultValue={car.speed} id="carSpd" aria-label="Vitesse du défilement" onInput={(e) => app.editCar((c) => (c.speed = Number((e.target as HTMLInputElement).value)))} />
              <b id="carSpdV" style={{ fontFamily: "var(--f-mono)", minWidth: "44px", textAlign: "right" }}>
                {`${car.speed} s`}
              </b>
            </span>
          </div>
        ) : null}
        <div className="grp" style={{ marginTop: "6px" }}>
          <h3>Démarrage</h3>
        </div>
        <div className="setrow">
          <span>
            <b>Bouton « Reprendre »</b>
            <small>Relance la dernière instance ou le dernier serveur</small>
          </span>
          <button className="toggle" role="switch" aria-checked={tf(home.resume)} data-act="resumeTgl" aria-label="Bouton Reprendre"></button>
        </div>
        <label className="setrow">
          <span>
            <b>Ouvrir l'appli sur</b>
            <small>Page affichée au démarrage</small>
          </span>
          <select id="startSel" aria-label="Page de démarrage" value={pref.start} onChange={(e) => app.editPref((p) => (p.start = e.target.value))}>
            {(
              [
                ["home", "Accueil"],
                ["wecraft", "WeCraft"],
                ["relaunch", "ReLaunch"],
                ["welive", "WeLive"],
              ] as const
            ).map((x) => (
              <option key={x[0]} value={x[0]}>
                {x[1]}
              </option>
            ))}
          </select>
        </label>
      </>
    );
  } else if (ui.setTab === "jeu") {
    body = (
      <>
        <div className="grp">
          <h3>Mémoire par défaut</h3>
          <div className="setrow">
            <input type="range" min="1" max="16" step="1" ref={ramRef} defaultValue={defaultRam} id="ramR" aria-label="Mémoire allouée" onInput={(e) => app.setDefaultRam(Number((e.target as HTMLInputElement).value))} />
            <b id="ramV" style={{ minWidth: "52px", textAlign: "right", fontFamily: "var(--f-mono)" }}>
              {`${defaultRam} Go`}
            </b>
          </div>
        </div>
        <div className="setrow">
          <span>
            <b>Java</b>
            <small>Rien à installer : le launcher officiel fournit Java pour jouer, et ReLaunch télécharge le Java de Mojang (vérifié) quand Forge ou NeoForge en a besoin pour s'installer.</small>
          </span>
        </div>
        <div className="setrow">
          <span>
            <b>Dossier de données</b>
            <small>%APPDATA%\.wecraft</small>
          </span>
          <button className="btn sm" data-act="folder">
            Ouvrir
          </button>
        </div>
      </>
    );
  } else if (ui.setTab === "comportement") {
    body = (
      <>
        <div className="setrow">
          <span>
            <b>Recliquer sur la section ouverte</b>
            <small>Par exemple, recliquer sur Favoris quand Favoris est déjà affiché</small>
          </span>
          <span className="chips">
            {(
              [
                ["back", "Page précédente"],
                ["home", "Accueil"],
                ["none", "Ne rien faire"],
              ] as const
            ).map((x) => (
              <button key={x[0]} className="chip" data-act="reclickPref" data-v={x[0]} aria-pressed={tf((pref.reclick || "back") === x[0])}>
                {x[1]}
              </button>
            ))}
          </span>
        </div>
        <div className="setrow">
          <span>
            <b>Statut Discord</b>
            <small>Affiche le jeu en cours sur ton profil Discord (désactivé par défaut ; l'appli Discord doit être ouverte)</small>
          </span>
          <button className="toggle" role="switch" aria-checked={tf(app.discordOn)} data-act="discord" aria-label="Statut Discord"></button>
        </div>
        <div className="setrow">
          <span>
            <b>Mises à jour</b>
            <small>Vérifiées au démarrage ; installées seulement si elles sont signées par l'auteur</small>
          </span>
          <button className="btn sm" data-act="updCheck">
            Rechercher
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <div className="grp">
        <h3>Compte ReLink</h3>
        <p>Les comptes ReLink ne sont pas encore disponibles.</p>
      </div>
    );
  }
  return (
    <div className="setwin">
      <div className="setnav">
        <h4>Affichage</h4>
        {menu.slice(0, 3).map(mb)}
        <h4>Jeu</h4>
        {menu.slice(3, 5).map(mb)}
        <h4>Compte</h4>
        {mb(menu[5]!)}
        <span className="ver">{`ReLaunch ${appVer}`}</span>
      </div>
      <div className="setbody">{body}</div>
    </div>
  );
}
