// Page Réglages (port de RENDER.settings, mini, pinMgr… du prototype), même balisage.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ShaderPrefsView } from "../../shared/api";
import { useApp } from "./ctx";
import { BASE_THEMES, cleanRotation, ROT_FADES, ROT_INTERVALS, THEME_COLORS, THEME_NAMES, type BaseTheme } from "./theme";
import { Ic } from "./Ic";
import { LogsTab } from "./Logs";
import { BARSIZES, BG_FORMATS, bgFmtOf, dockSide, gapsOf, GAP_DEF, NAVINFO, occupied, pinCount, PRESETS, profPlace, type NavConfig, type Side } from "./model";
import { LANGS, t } from "./i18n";

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

function PinMgr() {
  const { nav, ui } = useApp();
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
        <p>{t("Choisis où elles s'affichent dans les barres.")}</p>
        <div className="layouts" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
          {modes.map((m) => (
            <button key={m[0]} className="lay" data-act="pinMode" data-m={m[0]} aria-pressed={tf(nav.pinMode === m[0])}>
              <PinMini m={m[0]} />
              {t(m[1])}
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
                <b>{t("Bord")}</b>
                <small>{t("Les bords occupés par la barre d'action sont bloqués")}</small>
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
                <b>{t("Position sur le bord")}</b>
                <small>{t("La barre ne prend pas tout le côté")}</small>
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
        <div className="setrow pins-link">
          <span>
            <b>{`${n} instance${n > 1 ? "s" : ""} épinglée${n > 1 ? "s" : ""}`}</b>
            <small>{t("La liste, les groupes et l'ajout se gèrent dans la section « Instances épinglées » (aussi en double-cliquant sur la barre séparée, ou depuis WeCraft et Favoris).")}</small>
          </span>
          <button className="btn sm pri" data-go="pins">
            {t("Gérer les instances épinglées")}
          </button>
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
        <h3>{t("Configurations prêtes")}</h3>
        <p>{t("Un point de départ en un clic. Tu peux tout modifier ensuite.")}</p>
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
        <h3>{t("Taille des barres")}</h3>
        <p>{t("Épaisseur des barres de navigation et taille de leurs boutons.")}</p>
        <div className="chips" role="radiogroup" aria-label={t("Taille des barres")}>
          {Object.keys(BARSIZES).map((k) => (
            <button key={k} className="chip" role="radio" data-act="barSize" data-v={k} aria-checked={tf((nav.size || "m") === k)} aria-pressed={tf((nav.size || "m") === k)}>
              {BARSIZES[k]!.l}
            </button>
          ))}
        </div>
      </div>
      <GapsGroup />
      <FoldHead k="orga" t="Organisation des barres" sub={`${orgSum} · ${sections} sections`} />
      {ui.fold["orga"] ? null : (
        <div className="grp fbody" data-a="orga-body">
          <div className="setrow">
            <span>
              <b>{t("Nombre de barres")}</b>
              <small>{t("Une seule barre, ou deux barres pour répartir les boutons")}</small>
            </span>
            <span className="chips">
              <button className="chip" data-act="navCount" data-n="1" aria-pressed={tf(nav.mode === "single")}>
                {t("1 barre")}
              </button>
              <button className="chip" data-act="navCount" data-n="2" aria-pressed={tf(nav.mode === "double")}>
                {t("2 barres")}
              </button>
            </span>
          </div>
          {nav.mode === "single" ? (
            <>
              <p>{t("Le logo (blanc) ouvre l'accueil. Ton profil (orange) reste en haut à droite.")}</p>
              <div className="layouts">{singles.map((x) => layBtn({ mode: "single", single: x[0], h: "top", v: "left", junction: "logo" }, x[1]))}</div>
            </>
          ) : (
            <>
              <div className="setrow">
                <span>
                  <b>{t("Barres reliées en angle")}</b>
                  <small>{J ? "Les deux barres se rejoignent dans un coin, par le logo ou ton profil" : "Chaque barre reste sur son bord, sans toucher l'autre"}</small>
                </span>
                <button className="toggle" role="switch" aria-checked={tf(J)} data-act="navJoin" aria-label={t("Barres reliées en angle")}></button>
              </div>
              {J ? (
                <div className="layouts">{joinedL.map((c) => layBtn(c, `${FR[c.h]} + ${FR[c.v].toLowerCase()}`, `jonction : ${c.junction === "logo" ? "logo" : "profil"}`))}</div>
              ) : (
                <>
                  <p>{t("En haut et en bas, à gauche et à droite, ou sur deux bords voisins sans se toucher. Le logo est sur la première barre.")}</p>
                  <div className="layouts">{freeL.map((c) => layBtn(c, `${FR[c.h]} + ${FR[c.v].toLowerCase()}`))}</div>
                </>
              )}
            </>
          )}
          <h3 style={{ marginTop: "8px" }}>{t("Sections")}</h3>
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
                    {t(it.l)}
                    {it.d ? <small>{t(it.d)}</small> : null}
                  </span>
                  {nav.mode === "double" ? (
                    <span className="hv" role="group" aria-label={t("Barre")}>
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
                      <button data-act="navUp" data-i={i} aria-label={t("Monter")} disabled={i === 0}>
                        ↑
                      </button>
                      <button data-act="navDown" data-i={i} aria-label={t("Descendre")} disabled={i >= nav.items.length - 2}>
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
              {t("Réinitialiser")}
            </button>
          </div>
        </div>
      )}
      <PinMgr />
    </>
  );
}

/** Espacement entre les boutons des barres (principale, barre séparée des épingles, barre d'utilitaires). */
function GapsGroup() {
  const { pref, editPref } = useApp();
  const g = gapsOf(pref);
  const rows: [keyof typeof GAP_DEF, string, string][] = [
    ["main", "Barre principale (latérale)", "Entre les sections et les épingles de la barre"],
    ["dock", "Barre séparée (épingles)", "Entre les instances de la barre des épingles"],
    ["util", "Barre d'utilitaires", "Notifications, lives, téléchargements, amis, profil"],
  ];
  return (
    <div className="grp" data-a="bar-gaps">
      <h3>{t("Espacement des boutons")}</h3>
      {rows.map(([k, l, d]) => (
        <div key={k} className="setrow">
          <span>
            <b>{t(l)}</b>
            <small>{t(d)}</small>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "220px" }}>
            <input type="range" min="0" max="24" step="1" value={g[k]} aria-label={t(l)} onChange={(e) => editPref((p) => (p.gaps = { ...gapsOf(p), [k]: Number(e.target.value) }))} />
            <b style={{ fontFamily: "var(--f-mono)", minWidth: "44px", textAlign: "right" }}>{`${g[k]} px`}</b>
          </span>
        </div>
      ))}
      <div className="row" style={{ justifyContent: "flex-start" }}>
        <button className="btn sm" onClick={() => editPref((p) => (p.gaps = { ...GAP_DEF }))}>
          {t("Espacement par défaut")}
        </button>
      </div>
    </div>
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
    ["maj", "Mises à jour", "downloads"],
    ["apparence", "Apparence", "paint"],
    ["nav", "Navigation", "nav"],
    ["accueil", "Accueil", "home"],
    ["jeu", "Jeu", "game"],
    ["comportement", "Comportement", "behave"],
    ["logs", "Logs", "news"],
    ["compte", "Compte ReLink", "relink"],
  ];
  const mb = (m: [string, string, string]) => (
    <button key={m[0]} data-settab={m[0]} aria-current={tf(ui.setTab === m[0])}>
      <Ic n={m[2]} />
      {t(m[1])}
    </button>
  );
  const ramRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (ramRef.current) ramRef.current.value = String(defaultRam);
  }, [defaultRam]);
  let body: ReactNode;
  if (ui.setTab === "maj") {
    body = (
      <div className="grp">
        <h3>{t("Mises à jour de ReLaunch")}</h3>
        <div className="card updcard">
          <span className="updcard-ic">
            <Ic n="downloads" />
          </span>
          <span className="updcard-txt">
            <b>{`${t("Version installée")} : ${appVer || "?"}`}</b>
            <small>{t("ReLaunch vérifie les mises à jour à chaque démarrage. Une mise à jour n'est installée que si sa signature (clé de l'auteur) et son empreinte SHA-256 sont valides ; sinon elle est refusée et rien n'est remplacé.")}</small>
          </span>
          <button className="btn pri updcard-btn" data-act="updCheck">
            {t("Rechercher une mise à jour")}
          </button>
        </div>
        <BetaRow />
        <p className="faint" style={{ fontSize: "12.5px" }}>{t("Le détail des vérifications est dans Réglages > Logs (origine « Mises à jour »).")}</p>
      </div>
    );
  } else if (ui.setTab === "apparence") {
    body = (
      <>
        <div className="grp">
          <h3>{t("Style de l'interface")}</h3>
          <p>{t("Les quatre thèmes de couleur existent dans les deux styles.")}</p>
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
          <h3>{t("Thème de couleurs")}</h3>
          <p>{t("La couleur d'accent de toute l'appli.")}</p>
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
          <h3>{t("Fond")}</h3>
          <p>{t("Le fond derrière les pages du launcher.")}</p>
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
        <div className="grp">
          <h3>{t("Images et animations")}</h3>
          <div className="setcol">
            <span>
              <b>{t("Format de l'image de fond")}</b>
              <small>{t("Image de fond de l'instance choisie sur l'accueil. Un modpack d'événement garde toujours la sienne. Réglage propre à ce PC.")}</small>
            </span>
            <div className="bgfmts" role="radiogroup" aria-label={t("Format de l'image de fond")}>
              {BG_FORMATS.map(([k, l, d]) => (
                <button key={k} className="bgfmt" role="radio" data-act="bgFmt" data-v={k} aria-checked={tf(bgFmtOf(pref) === k)} aria-pressed={tf(bgFmtOf(pref) === k)}>
                  <span className={`bfp ${k}`}>
                    <i className="t"></i>
                    <i className="im"></i>
                  </span>
                  <b>{t(l)}</b>
                  <small>{t(d)}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="setrow">
            <span>
              <b>{t("Animations")}</b>
              <small>{t("Transitions et fondus de l'interface. Toujours réduites si Windows demande de réduire les animations.")}</small>
            </span>
            <button className="toggle" role="switch" aria-checked={tf(pref.anim !== false)} data-act="animTgl" aria-label={t("Animations")}></button>
          </div>
        </div>
        <SkinsGroup />
        <RotationGroup />
      </>
    );
  } else if (ui.setTab === "nav") {
    body = <NavTab />;
  } else if (ui.setTab === "logs") {
    body = <LogsTab />;
  } else if (ui.setTab === "accueil") {
    body = (
      <>
        <div className="grp">
          <h3>{t("Encarts d'actualité")}</h3>
          <p>Les encarts s'affichent en bas à droite de l'accueil. Toutes les actualités restent aussi dans Info &amp; News et le menu cloche.</p>
        </div>
        <div className="setrow">
          <span>
            <b>{t("Encarts affichés en même temps")}</b>
            <small>{t("1 grand ou jusqu'à 5 plus petits")}</small>
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
            <b>{t("Défilement automatique")}</b>
            <small>Encarts de l'accueil et actualité à la une d'Info &amp; News · pause au survol</small>
          </span>
          <button className="toggle" role="switch" aria-checked={tf(car.auto)} data-act="carAuto" aria-label={t("Défilement automatique")}></button>
        </div>
        {car.auto ? (
          <div className="setrow">
            <span>
              <b>{t("Vitesse")}</b>
              <small>{t("Temps passé sur chaque position")}</small>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "220px" }}>
              <input type="range" min="3" max="15" step="1" defaultValue={car.speed} id="carSpd" aria-label={t("Vitesse du défilement")} onInput={(e) => app.editCar((c) => (c.speed = Number((e.target as HTMLInputElement).value)))} />
              <b id="carSpdV" style={{ fontFamily: "var(--f-mono)", minWidth: "44px", textAlign: "right" }}>
                {`${car.speed} s`}
              </b>
            </span>
          </div>
        ) : null}
        <div className="grp" style={{ marginTop: "6px" }}>
          <h3>{t("Démarrage")}</h3>
        </div>
        <div className="setrow">
          <span>
            <b>{t("Bouton « Reprendre »")}</b>
            <small>{t("Relance la dernière instance ou le dernier serveur")}</small>
          </span>
          <button className="toggle" role="switch" aria-checked={tf(home.resume)} data-act="resumeTgl" aria-label={t("Bouton Reprendre")}></button>
        </div>
        <label className="setrow">
          <span>
            <b>{t("Ouvrir l'appli sur")}</b>
            <small>{t("Page affichée au démarrage")}</small>
          </span>
          <select id="startSel" aria-label={t("Page de démarrage")} value={pref.start} onChange={(e) => app.editPref((p) => (p.start = e.target.value))}>
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
          <h3>{t("Mémoire par défaut")}</h3>
          <div className="setrow">
            <input type="range" min="1" max="16" step="1" ref={ramRef} defaultValue={defaultRam} id="ramR" aria-label={t("Mémoire allouée")} onInput={(e) => app.setDefaultRam(Number((e.target as HTMLInputElement).value))} />
            <b id="ramV" style={{ minWidth: "52px", textAlign: "right", fontFamily: "var(--f-mono)" }}>
              {`${defaultRam} Go`}
            </b>
          </div>
        </div>
        <ShadersGroup />
        <div className="setrow">
          <span>
            <b>{t("Java")}</b>
            <small>{t("Rien à installer : le launcher officiel fournit Java pour jouer, et ReLaunch télécharge le Java de Mojang (vérifié) quand Forge ou NeoForge en a besoin pour s'installer.")}</small>
          </span>
        </div>
        <div className="setrow">
          <span>
            <b>{t("Dossier de données")}</b>
            <small>%APPDATA%\.wecraft</small>
          </span>
          <button className="btn sm" data-act="folder">
            {t("Ouvrir")}
          </button>
        </div>
      </>
    );
  } else if (ui.setTab === "comportement") {
    body = (
      <>
        <div className="setrow">
          <span>
            <b>{t("Langue")}</b>
            <small>{t("Langue de l'interface. Les textes pas encore traduits restent en français.")}</small>
          </span>
          <span className="chips">
            {LANGS.map(([k, l]) => (
              <button key={k} className="chip" data-act="lang" data-v={k} aria-pressed={tf((pref.lang ?? "fr") === k)} lang={k}>
                {l}
              </button>
            ))}
          </span>
        </div>
        <div className="setrow">
          <span>
            <b>{t("Recliquer sur la section ouverte")}</b>
            <small>{t("Par exemple, recliquer sur Favoris quand Favoris est déjà affiché")}</small>
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
            <b>{t("Statut Discord")}</b>
            <small>{t("Affiche le jeu en cours sur ton profil Discord (désactivé par défaut ; l'appli Discord doit être ouverte)")}</small>
          </span>
          <button className="toggle" role="switch" aria-checked={tf(app.discordOn)} data-act="discord" aria-label={t("Statut Discord")}></button>
        </div>
        <div className="setrow">
          <span>
            <b>{t("Mises à jour")}</b>
            <small>{t("Vérifiées au démarrage ; installées seulement si elles sont signées par l'auteur")}</small>
          </span>
          <button className="btn sm" data-settab="maj">
            {t("Ouvrir")}
          </button>
        </div>
      </>
    );
  } else {
    body = <AccountGroup />;
  }
  return (
    <div className="setwin">
      <div className="setnav">
        <button className="setmaj" data-settab="maj" aria-current={tf(ui.setTab === "maj")}>
          <Ic n="downloads" />
          <span>
            <b>{t("Rechercher une mise à jour")}</b>
            <small>{`${t("Version installée")} : ${appVer || "?"}`}</small>
          </span>
        </button>
        <h4>{t("Affichage")}</h4>
        {menu.slice(1, 4).map(mb)}
        <h4>{t("Jeu")}</h4>
        {menu.slice(4, 6).map(mb)}
        <h4>{t("Diagnostic")}</h4>
        {mb(menu[6]!)}
        <h4>{t("Compte")}</h4>
        {mb(menu[7]!)}
        <span className="ver">{`ReLaunch ${appVer}`}</span>
      </div>
      <div className="setbody">{body}</div>
    </div>
  );
}

/** Compte ReLink : connexion Discord (navigateur), compte, skin Minecraft. Le jeton reste dans le processus principal. */
function AccountGroup() {
  const { account, setAccount, toast } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [model, setModel] = useState<"classic" | "slim">("classic");
  const sha = account?.minecraftSkin?.sha256 ?? "";
  useEffect(() => {
    if (account?.minecraftSkin) setModel(account.minecraftSkin.model);
  }, [account?.minecraftSkin]);
  useEffect(() => {
    setImg(null);
    if (sha) void window.wecraft.account.minecraftSkinImage().then(setImg, () => setImg(null));
  }, [sha]);
  const act = (key: string, p: Promise<import("../../shared/api").AccountState>) => {
    setBusy(key);
    void p.then(
      (a) => {
        setAccount(a);
        if (a.error && key !== "refresh") toast(a.error);
      },
      () => toast(t("Action impossible pour le moment.")),
    ).finally(() => setBusy(null));
  };
  const skinAct = (key: string, p: Promise<import("../../shared/api").AccountResult>, ok: string) => {
    setBusy(key);
    void p.then(
      (r) => {
        if (r.ok) {
          setAccount(r.state);
          toast(ok);
        } else if (!r.canceled) toast(r.message);
      },
      () => toast(t("Action impossible pour le moment.")),
    ).finally(() => setBusy(null));
  };
  if (!account) return <div className="grp"><h3>{t("Compte ReLink")}</h3><p className="faint">{t("Chargement…")}</p></div>;
  if (!account.loggedIn) {
    return (
      <div className="grp">
        <h3>{t("Compte ReLink")}</h3>
        <p>{t("Un compte ReLink est nécessaire pour jouer, obtenir des skins, utiliser la boutique et envoyer ton skin Minecraft.")}</p>
        <div className="card updcard">
          <span className="updcard-ic"><Ic n="relink" /></span>
          <span className="updcard-txt">
            <b>{account.loginPending || busy === "login" ? t("Accepte la connexion dans ton navigateur…") : t("Se connecter avec Discord")}</b>
            <small>{t("Ton navigateur s'ouvre sur Discord. ReLaunch ne voit jamais ton mot de passe : il reçoit seulement ta session ReLink, chiffrée sur ce PC.")}</small>
          </span>
          <button className="btn pri updcard-btn" disabled={busy === "login" || account.loginPending} onClick={() => act("login", window.wecraft.account.login())}>
            {busy === "login" || account.loginPending ? t("En attente…") : t("Se connecter")}
          </button>
        </div>
        {account.error ? <p className="faint" style={{ fontSize: "12.5px" }}>{account.error}</p> : null}
        <p className="faint" style={{ fontSize: "12.5px" }}>{t("Sans connexion internet, le jeu se lance quand même, mais les serveurs d'event refusent l'accès tant que ta session ReLink n'est pas vérifiée.")}</p>
      </div>
    );
  }
  const u = account.user!;
  const exp = account.expiresAt ? new Date(account.expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : "";
  return (
    <>
      <div className="grp">
        <h3>{t("Compte ReLink")}</h3>
        <div className="setrow">
          <span>
            <b>{u.pseudo}</b>
            <small>{[u.minecraftName ? `${t("Minecraft")} : ${u.minecraftName}` : t("Compte Minecraft pas encore lié (commande /link en jeu)"), `${u.eclats} ${t("éclats")}`, exp ? `${t("session valable jusqu'au")} ${exp}` : ""].filter(Boolean).join(" · ")}</small>
          </span>
          <span className="row" style={{ gap: "8px" }}>
            <button className="btn sm" disabled={!!busy} onClick={() => act("refresh", window.wecraft.account.refresh())}>{t("Actualiser")}</button>
            <button className="btn sm" disabled={!!busy} onClick={() => act("logout", window.wecraft.account.logout())}>{t("Se déconnecter")}</button>
          </span>
        </div>
        {account.offline ? <p className="faint" style={{ fontSize: "12.5px" }}>{t("Service ReLink injoignable : informations du dernier contrôle.")}</p> : null}
        {!account.persisted ? <p className="faint" style={{ fontSize: "12.5px" }}>{t("Chiffrement système indisponible : ta session ne sera pas gardée après la fermeture de ReLaunch.")}</p> : null}
      </div>
      <div className="grp">
        <h3>{t("Skin Minecraft")}</h3>
        <p>{t("Le skin de ton personnage, envoyé à ReLink. Image PNG de 64 × 64 pixels.")}</p>
        <div className="setrow">
          <span style={{ display: "flex", gap: "14px", alignItems: "center" }}>
            {img ? <img src={img} alt={t("Ton skin Minecraft")} width={64} height={64} style={{ imageRendering: "pixelated", borderRadius: "6px", background: "rgba(255,255,255,.06)" }} /> : <span className="faint">{account.minecraftSkin ? t("Aperçu indisponible") : t("Aucun skin envoyé")}</span>}
            <span>
              <b>{t("Modèle")}</b>
              <span className="chips" style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                {(
                  [
                    ["classic", t("Classique (bras larges)")],
                    ["slim", t("Fin (bras de 3 pixels)")],
                  ] as const
                ).map((m) => (
                  <button key={m[0]} className="chip" aria-pressed={tf(model === m[0])} onClick={() => setModel(m[0])}>{m[1]}</button>
                ))}
              </span>
            </span>
          </span>
          <span className="row" style={{ gap: "8px" }}>
            <button className="btn sm pri" disabled={!!busy} onClick={() => skinAct("skin", window.wecraft.account.uploadMinecraftSkin(model), t("Skin Minecraft envoyé."))}>{busy === "skin" ? t("Envoi…") : t("Choisir une image…")}</button>
            {account.minecraftSkin ? <button className="btn sm" disabled={!!busy} onClick={() => skinAct("rmskin", window.wecraft.account.removeMinecraftSkin(), t("Skin Minecraft retiré."))}>{t("Retirer")}</button> : null}
          </span>
        </div>
        <p className="faint" style={{ fontSize: "12.5px" }}>{t("Visible en jeu sur les serveurs et avec les mods qui lisent les skins ReLink.")}</p>
      </div>
    </>
  );
}

/** « Participer à la bêta » : enregistré par le processus principal (launcher_config.json). */
function BetaRow() {
  const { toast } = useApp();
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    void window.wecraft.update.beta().then(setOn, () => setOn(false));
  }, []);
  const flip = () => {
    if (on === null) return;
    const next = !on;
    void window.wecraft.update.setBeta(next).then(
      (ok) => {
        if (!ok) return toast(t("Réglage non enregistré."));
        setOn(next);
        toast(next ? t("Bêta activée : les préversions te seront proposées.") : t("Bêta désactivée : seules les versions stables te seront proposées."));
      },
      () => toast(t("Réglage non enregistré.")),
    );
  };
  return (
    <div className="setrow">
      <span>
        <b>{t("Participer à la bêta")}</b>
        <small>{t("Reçois les nouvelles versions avant tout le monde. Elles sont signées comme les autres, mais peuvent contenir des bugs.")}</small>
      </span>
      <button className="toggle" role="switch" aria-checked={tf(on === true)} disabled={on === null} onClick={flip} aria-label={t("Participer à la bêta")}></button>
    </div>
  );
}

/**
 * Skins du launcher : Classique, skins installés (ReLink signés ou aperçus locaux) et catalogue ReLink.
 * L'obtention d'un skin à débloquer (event, shop, succès, premium) demandera un compte ReLink : en attendant,
 * seuls les skins gratuits publiés avec un fichier peuvent être installés.
 */
function SkinsGroup() {
  const { pref, editPref, skins, reloadSkins, relink, toast, account } = useApp();
  const owned = new Set(account?.launcherSkins ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const cur = typeof pref["lskin"] === "string" ? (pref["lskin"] as string) : "";
  const use = (k: string) => editPref((p) => (p["lskin"] = k || null));
  const catalog = relink?.data?.skins ?? [];
  const lock = (u: { event: boolean; shop: number; achievement: boolean; premium: boolean }) =>
    [u.event ? t("event ReLaunch") : "", u.shop ? `${u.shop} ${t("crédits")}` : "", u.achievement ? t("succès") : "", u.premium ? t("premium") : ""].filter(Boolean);
  const run = (key: string, p: Promise<{ ok: boolean; message?: string; canceled?: boolean; skin?: { key: string; manifest: { name: string } } }>) => {
    setBusy(key);
    void p
      .then((r) => {
        if (r.ok && r.skin) {
          reloadSkins();
          use(r.skin.key);
          toast(`${t("Skin appliqué")} : ${r.skin.manifest.name}`);
        } else if (!r.canceled) toast(r.message || t("Skin refusé."));
      })
      .finally(() => setBusy(null));
  };
  return (
    <div className="grp">
      <h3>{t("Skins du launcher")}</h3>
      <p>{t("Un skin change tout le launcher : fond animé, typographie, barres, cadres, bouton Jouer, transitions, écran de lancement. Les skins publiés par l'équipe arrivent sans mettre à jour ReLaunch.")}</p>
      <div className="skins">
        <div className="skinc" aria-pressed={cur ? "false" : "true"}>
          <span className="pv"></span>
          <b>{t("Classique")}</b>
          <small>{t("Le launcher de base, avec ton style et ton thème de couleurs.")}</small>
          <span className="row">
            <button className="btn sm" disabled={!cur} onClick={() => use("")}>
              {cur ? t("Utiliser") : t("Utilisé")}
            </button>
          </span>
        </div>
        {skins.map((k) => (
          <div key={k.key} className="skinc" aria-pressed={cur === k.key ? "true" : "false"}>
            <span className="pv" style={{ backgroundImage: k.manifest.background.layers[0] ? `url("${k.base}${k.manifest.background.layers[0].image}")` : undefined, ["--c1" as string]: k.manifest.tokens["acc"] ?? "#333", ["--c2" as string]: k.manifest.tokens["night"] ?? "#111" }}></span>
            <b>{k.manifest.name}</b>
            <small>{[k.manifest.author, k.manifest.skinVersion ? `v${k.manifest.skinVersion}` : "", k.source === "local" ? t("aperçu local, non signé") : t("ReLink, signé")].filter(Boolean).join(" · ")}</small>
            {k.manifest.description ? <small>{k.manifest.description}</small> : null}
            <span className="row">
              <button className="btn sm pri" disabled={cur === k.key} onClick={() => use(k.key)}>
                {cur === k.key ? t("Utilisé") : t("Utiliser")}
              </button>
              <button
                className="btn sm"
                onClick={() =>
                  void window.wecraft.skins.remove(k.key).then(() => {
                    if (cur === k.key) use("");
                    reloadSkins();
                  })
                }
              >
                {t("Retirer")}
              </button>
            </span>
          </div>
        ))}
        {catalog
          .filter((c) => !skins.some((k) => k.relinkId === c.id))
          .map((c) => {
            const l = owned.has(c.id) ? [] : lock(c.unlock);
            return (
              <div key={c.id} className="skinc">
                <span className="pv"></span>
                <b>{c.name}</b>
                <small>{[c.desc, c.versions.liquidGlass || c.versions.mat ? [c.versions.liquidGlass ? "Liquid Glass" : "", c.versions.mat ? "Mat" : ""].filter(Boolean).join(" + ") : ""].filter(Boolean).join(" · ")}</small>
                <small className="faint">{l.length ? `${t("À débloquer")} : ${l.join(", ")}${account?.loggedIn ? "" : ` — ${t("connecte-toi à ReLink")}`}` : !c.file ? t("Fichier du skin pas encore publié") : t("Gratuit")}</small>
                <span className="row">
                  <button className="btn sm" disabled={!!l.length || !c.file || busy === c.id} onClick={() => run(c.id, window.wecraft.skins.install(c.id))}>
                    {busy === c.id ? t("Téléchargement…") : t("Obtenir")}
                  </button>
                </span>
              </div>
            );
          })}
      </div>
      <div className="row" style={{ justifyContent: "flex-start", gap: "8px" }}>
        <button className="btn sm" disabled={busy === "local"} onClick={() => run("local", window.wecraft.skins.importLocal())}>
          {t("Aperçu d'un fichier skin (.rlskin)…")}
        </button>
        <small className="faint">{t("Pour créer et tester un skin avant de l'envoyer dans le panneau d'administration.")}</small>
      </div>
    </div>
  );
}

/** Thème dégradé automatique : thèmes de la rotation, ordre, durées, aperçu. */
function RotationGroup() {
  const { pref } = useApp();
  const rot = cleanRotation(pref["rot"]);
  const others = BASE_THEMES.filter((t) => !rot.list.includes(t));
  const row = (t: BaseTheme, on: boolean, i: number) => (
    <div key={t} className={`rot-item${on ? "" : " off"}`}>
      <input type="checkbox" checked={on} data-act="rotTheme" data-v={t} aria-label={`${THEME_NAMES[t]} dans la rotation`} readOnly />
      <span className="dot" style={{ background: THEME_COLORS[t] }}></span>
      <b>{THEME_NAMES[t]}</b>
      <button className="ib" data-act="rotUp" data-v={t} disabled={!on || i === 0} aria-label={`Monter ${THEME_NAMES[t]}`}>
        ↑
      </button>
      <button className="ib" data-act="rotDown" data-v={t} disabled={!on || i === rot.list.length - 1} aria-label={`Descendre ${THEME_NAMES[t]}`}>
        ↓
      </button>
    </div>
  );
  return (
    <div className="grp">
      <h3>{t("Thème dégradé automatique")}</h3>
      <div className="setrow">
        <span>
          <b>{t("Rotation des thèmes")}</b>
          <small>{t("Passe d'un thème à l'autre avec un fondu des couleurs. Le thème enregistré reste celui choisi plus haut.")}</small>
        </span>
        <button className="toggle" role="switch" aria-checked={tf(rot.on)} data-act="rotTgl" aria-label={t("Rotation des thèmes")}></button>
      </div>
      <div className="rot-list">
        {rot.list.map((t, i) => row(t as BaseTheme, true, i))}
        {others.map((t) => row(t, false, -1))}
      </div>
      {rot.list.length < 2 ? <small className="cr-bad">{t("Choisis au moins deux thèmes pour la rotation.")}</small> : null}
      <div className="rot-opts">
        <span className="chips">
          {ROT_INTERVALS.map((n) => (
            <button key={n} className="chip" data-act="rotSec" data-v={n} aria-pressed={tf(rot.sec === n)}>
              {n < 60 ? `${n} s` : `${n / 60} min`}
            </button>
          ))}
        </span>
        <span className="chips">
          {ROT_FADES.map((n) => (
            <button key={n} className="chip" data-act="rotFade" data-v={n} aria-pressed={tf(rot.fade === n)}>
              {`Fondu ${n} s`}
            </button>
          ))}
        </span>
        <button className="btn sm" data-act="rotPreview">
          {t("Aperçu")}
        </button>
      </div>
    </div>
  );
}

/** Shaders préférés : appliqués au lancement aux instances qui ont un mod de shaders (Iris, Oculus, OptiFine). */
function ShadersGroup() {
  const { toast } = useApp();
  const [p, setP] = useState<ShaderPrefsView | null>(null);
  const [known, setKnown] = useState<string[]>([]);
  useEffect(() => {
    void window.wecraft.settings.shaders().then((r) => {
      setP(r.prefs);
      setKnown(r.known);
    });
  }, []);
  const save = (next: ShaderPrefsView) => {
    setP(next);
    void window.wecraft.settings.setShaders(next).then((ok) => !ok && toast(t("Réglage non enregistré.")));
  };
  if (!p) return null;
  return (
    <div className="grp">
      <h3>{t("Shaders préférés")}</h3>
      <div className="setrow">
        <span>
          <b>{t("Choisir le shader au lancement")}</b>
          <small>{t("Parmi les shaders présents dans l'instance : le préféré, sinon le secondaire, sinon le choix déjà enregistré est gardé. Rien n'est téléchargé ni supprimé.")}</small>
        </span>
        <button className="toggle" role="switch" aria-checked={tf(p.on)} aria-label={t("Choisir le shader au lancement")} onClick={() => save({ ...p, on: !p.on })}></button>
      </div>
      <div className="ie-row">
        <label className="field">
          <span className="lbl strong">{t("Shader préféré")}</span>
          <ComboInput value={p.primary ?? ""} options={known} placeholder="Complementary Reimagined" disabled={!p.on} onCommit={(v) => save({ ...p, primary: v || null })} />
        </label>
        <label className="field">
          <span className="lbl strong">{t("Shader secondaire")}</span>
          <ComboInput value={p.secondary ?? ""} options={known} placeholder="BSL" disabled={!p.on} onCommit={(v) => save({ ...p, secondary: v || null })} />
        </label>
      </div>
      <small className="faint">{known.length ? t("Shaders trouvés dans tes instances : {n}.", { n: known.length }) : t("Aucun shader trouvé dans tes instances pour l'instant (Découvrir > Shaders).")}</small>
    </div>
  );
}

/** Champ avec suggestions : 8 lignes visibles au plus, barre de défilement pour le reste, filtrées par le texte. */
function ComboInput({ value, options, placeholder, disabled, onCommit }: { value: string; options: string[]; placeholder: string; disabled: boolean; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false); // filtre seulement quand on tape (le bouton ▾ montre tout)
  const inRef = useRef<HTMLInputElement>(null);
  useEffect(() => setText(value), [value]);
  const needle = typed ? text.trim().toLowerCase() : "";
  const list = options.filter((o) => !needle || o.toLowerCase().includes(needle));
  const commit = (v: string) => {
    setText(v);
    setOpen(false);
    setTyped(false);
    if (v.trim() !== value) onCommit(v.trim());
  };
  return (
    <span className="combo">
      <input
        ref={inRef}
        type="text"
        maxLength={120}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => (setText(e.target.value), setTyped(true), setOpen(true))}
        onBlur={() => window.setTimeout(() => commit(text), 120)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(text);
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      <button
        type="button"
        className="combo-btn"
        aria-label={t("Afficher la liste")}
        aria-expanded={open ? "true" : "false"}
        disabled={disabled || !options.length}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault();
          setTyped(false);
          setOpen((o) => !o);
          inRef.current?.focus(); // un clic ailleurs referme la liste
        }}
      >
        ▾
      </button>
      {open && !disabled && list.length ? (
        <span className="combo-list" role="listbox">
          {list.map((o) => (
            <button key={o} type="button" role="option" aria-selected={o === text ? "true" : "false"} onMouseDown={(e) => e.preventDefault()} onClick={() => commit(o)}>
              {o}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}
