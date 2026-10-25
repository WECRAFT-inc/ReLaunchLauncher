// Fenêtres et encarts : épingles (pop), panneau latéral, lancement, RAM, mise à jour, bandeau d'avertissement.
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { LaunchStatus, UpdateCheck } from "../../shared/api";
import { Minis } from "./Bars";
import { useApp } from "./ctx";
import { useEscapeLayer } from "./keys";
import { Ic } from "./Ic";
import { detail, gById, initials, type Inst } from "./model";
import { t } from "./i18n";

type Css = CSSProperties & Record<`--${string}`, string>;
const cover = (x: Inst): Css => ({ "--c1": x.c[0], "--c2": x.c[1] });

export function Pop() {
  const { ui, nav, byId, editNav, setUi } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const pop = ui.pop;
  const g = pop?.kind === "group" ? gById(nav, pop.gid ?? "") : undefined;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !pop) return;
    const appRoot = el.closest(".app")!;
    const ar = appRoot.getBoundingClientRect();
    const pr = el.getBoundingClientRect();
    const an = ui.popAnchor ? document.querySelector(`[data-a="${ui.popAnchor}"]`) : null;
    let x: number;
    let y: number;
    if (!an || !an.getClientRects().length) {
      x = (ar.width - pr.width) / 2;
      y = 80;
    } else {
      const r = an.getBoundingClientRect();
      const box = an.closest(".bar,.dock");
      const vert = box && box.classList.contains("v");
      if (vert) {
        const right = r.left - ar.left > ar.width / 2;
        x = right ? r.left - ar.left - pr.width - 10 : r.right - ar.left + 10;
        y = r.top - ar.top - 10;
      } else {
        const bottom = r.top - ar.top > ar.height / 2;
        x = r.left - ar.left + r.width / 2 - pr.width / 2;
        y = bottom ? r.top - ar.top - pr.height - 10 : r.bottom - ar.top + 10;
      }
    }
    x = Math.max(8, Math.min(x, ar.width - pr.width - 8));
    y = Math.max(8, Math.min(y, ar.height - pr.height - 8));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  });
  useEffect(() => {
    if (pop?.rename && nameRef.current) {
      nameRef.current.focus();
      nameRef.current.select();
      setUi({ pop: { ...pop, rename: false } });
    }
  }, [pop, setUi]);
  if (pop?.kind === "group" && !g) {
    queueMicrotask(() => setUi({ pop: null }));
  }
  return (
    <div className="pop" id="pop" hidden={!pop || (pop.kind === "group" && !g)} data-a="pin-pop" data-name="Épingles" role="dialog" aria-label={t("Instances épinglées")} ref={ref}>
      {pop && pop.kind === "group" && g ? (
        <>
          <div className="phead">
            {pop.back ? (
              <button className="ib" data-act="popBack" aria-label={t("Retour")}>
                ←
              </button>
            ) : null}
            <input
              type="text"
              id="popName"
              ref={nameRef}
              defaultValue={g.name}
              aria-label={t("Nom du groupe")}
              onInput={(e) => {
                const v = (e.target as HTMLInputElement).value;
                editNav((n) => {
                  const gg = gById(n, g.id);
                  if (gg) gg.name = v.trim() || "Groupe";
                });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
            <button className="ib" data-act="closePop" aria-label={t("Fermer")}>
              ✕
            </button>
          </div>
          <div className="plist" data-pin-drop={`g:${g.id}`}>
            {g.items
              .map(byId)
              .filter((x): x is Inst => !!x)
              .map((x) => (
                <div key={x.id} className="pitem" draggable="true" data-pin-drag={`i:${x.id}`} data-pin-drop={`i:${x.id}`} data-a={`pgi-${x.id}`}>
                  <span className="cover" style={cover(x)}></span>
                  <span style={{ minWidth: 0 }}>
                    <b>{x.n}</b>
                    <small>{detail(x)}</small>
                  </span>
                  <span className="acts">
                    <button className="btn sm pri" data-play={x.id}>
                      {t("Jouer")}
                    </button>
                    <button className="ib" data-act="ungroup" data-id={x.id} aria-label={t("Sortir du groupe")} title={t("Sortir du groupe")}>
                      ↗
                    </button>
                  </span>
                </div>
              ))}
          </div>
          <div className="pfoot">
            <small>{t("Glisse une instance hors du groupe pour l'en sortir.")}</small>
            <button className="btn sm" data-act="dissolve" data-gid={g.id}>
              {t("Dissoudre")}
            </button>
          </div>
        </>
      ) : pop ? (
        <>
          <div className="phead">
            <b>{t("Instances épinglées")}</b>
            <button className="ib" data-act="closePop" aria-label={t("Fermer")}>
              ✕
            </button>
          </div>
          <div className="pgrid" data-pin-zone="1">
            {nav.pins.length ? (
              nav.pins.map((p) => {
                if (p.t === "i") {
                  const x = byId(p.id);
                  if (!x) return null;
                  return (
                    <button key={p.id} className="ptile" draggable="true" data-pin-drag={`i:${x.id}`} data-pin-drop={`i:${x.id}`} data-play={x.id} data-a={`pt-${x.id}`}>
                      <span className="cover" style={cover(x)}>
                        <span>{initials(x.n)}</span>
                      </span>
                      <small>{x.n}</small>
                    </button>
                  );
                }
                return (
                  <button key={p.id} className="ptile" draggable="true" data-pin-drag={`g:${p.id}`} data-pin-drop={`g:${p.id}`} data-act="openGroupIn" data-gid={p.id} data-a={`ptg-${p.id}`}>
                    <span className="gmini">
                      <Minis g={p} byId={byId} />
                    </span>
                    <small>{`${p.name} · ${p.items.length}`}</small>
                  </button>
                );
              })
            ) : (
              <span className="faint" style={{ fontSize: "12.5px", gridColumn: "1/-1" }}>
                {t("Aucune épingle pour l'instant.")}
              </span>
            )}
          </div>
          <small className="faint">{t("Glisse une instance sur une autre pour créer un groupe.")}</small>
        </>
      ) : null}
    </div>
  );
}

const DRAWERS: Record<string, [string, string, string]> = {
  downloads: ["downloads", "Téléchargements", "Aucun téléchargement en cours."],
  friends: ["friends", "Amis", "Les amis arriveront avec les comptes ReLink."],
  news: ["bell", "Nouveautés", "Aucune notification pour l'instant."],
  staff: ["staff", "Menu staff", "Pas encore disponible."],
};

export function Drawer() {
  const { ui } = useApp();
  const T = ui.drawer ? DRAWERS[ui.drawer] : undefined;
  return (
    <aside className={`drawer${ui.drawer === "staff" ? " staff" : ""}`} id="drawer" hidden={!T} aria-label={t("Panneau latéral")} data-name={T ? T[1] : "Panneau"} {...(T ? { "data-a": `drawer-${ui.drawer}` } : {})}>
      {T ? (
        <>
          <header>
            <h3>
              <Ic n={T[0]} />
              {T[1]}
            </h3>
            <button className="xbtn" data-act="closeDrawer" aria-label={t("Fermer")}>
              ✕
            </button>
          </header>
          <div className="dbody">
            <div className="empty">{T[2]}</div>
          </div>
        </>
      ) : null}
    </aside>
  );
}

// ---------------------------------------------------------------- lancement (lot E4)
export interface LaunchUi {
  box: boolean;
  name: string;
  status: LaunchStatus | null;
  error: string | null;
}

export function LaunchBox({ st, onClose, onAnswer }: { st: LaunchUi; onClose: () => void; onAnswer: (force: boolean) => void }) {
  const s = st.status;
  let width = "0";
  if (s?.phase === "termine") width = "100%";
  else if (s?.progress && s.progress.total > 0) width = `${Math.round((100 * s.progress.done) / s.progress.total)}%`;
  let msg = st.error ?? "Préparation…";
  if (s) {
    msg = [s.progress && s.phase === "installation" ? `${s.message} (${s.progress.done}/${s.progress.total})` : s.message, ...s.notes].join("\n");
    if (s.phase === "accord")
      msg = `${s.message}\nLe forcer à se fermer ? Une partie en cours n'est pas concernée ; s'il était en train d'enregistrer, cet enregistrement pourrait être perdu.`;
  }
  return (
    <div className="launch" id="launchBox" hidden={!st.box} data-a="launch">
      <div className="row">
        <b id="lName">{st.name || "Lancement"}</b>
        <button className="xbtn" id="lClose" aria-label={t("Fermer")} style={{ width: "28px", height: "28px", fontSize: "13px" }} onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="lbar">
        <i id="lBar" {...(s || st.error ? { style: { width } } : {})}></i>
      </div>
      <small id="lMsg" style={{ whiteSpace: "pre-line" }}>
        {msg}
      </small>
      <div className="row" id="lAsk" hidden={s?.phase !== "accord"} style={{ justifyContent: "flex-end", gap: "8px" }}>
        <button className="btn sm" id="lNo" onClick={() => onAnswer(false)}>
          {t("Annuler le lancement")}
        </button>
        <button className="btn sm danger" id="lForce" onClick={() => onAnswer(true)}>
          {t("Forcer la fermeture")}
        </button>
      </div>
    </div>
  );
}

export function RamDialog({ open, name, ram, onCancel, onGo }: { open: boolean; name: string; ram: number; onCancel: () => void; onGo: (ram: number, repair: boolean) => void }) {
  const [value, setValue] = useState(ram);
  const [repair, setRepair] = useState(false);
  const goRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) {
      setValue(ram);
      setRepair(false);
      goRef.current?.focus();
    }
  }, [open, ram]);
  useEscapeLayer(open, onCancel);
  return (
    <div className="overlay" id="ramOv" hidden={!open} data-a="m-ram" data-name="Lancer" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ramTitle" style={{ width: "min(420px,100%)" }}>
        <header>
          <h3 id="ramTitle">{t("Mémoire (RAM)")}</h3>
          <button className="xbtn" id="ramClose" aria-label={t("Fermer")} style={{ width: "28px", height: "28px", fontSize: "13px" }} onClick={onCancel}>
            ✕
          </button>
        </header>
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <small className="muted" id="ramName">
            {name}
          </small>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <input type="range" id="ramRange" min="1" max="16" step="1" value={value} aria-label={t("Mémoire en Go")} style={{ flex: 1 }} onChange={(e) => setValue(Number(e.target.value))} />
            <b id="ramVal" style={{ minWidth: "52px", textAlign: "right" }}>
              {`${value} Go`}
            </b>
          </div>
          <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13px" }}>
            <input type="checkbox" id="ramRepair" checked={repair} onChange={(e) => setRepair(e.target.checked)} />
            <span>{t("Réparer : tout réinstaller avant de lancer")}</span>
          </label>
        </div>
        <div className="mfoot">
          <button className="btn" id="ramCancel" onClick={onCancel}>
            {t("Annuler")}
          </button>
          <button className="btn pri" id="ramGo" ref={goRef} onClick={() => onGo(value, repair)}>
            {t("Lancer")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- mise à jour (lot E5)
export function UpdateDialog({ check, onClose }: { check: Extract<UpdateCheck, { state: "available" }> | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [bar, setBar] = useState<number | null>(null);
  const poll = useRef<number | null>(null);
  useEffect(() => {
    setBusy(false);
    setBar(null);
    setMsg(check && !check.auto ? "Installation automatique indisponible ici : la page de la mise à jour va s'ouvrir." : "");
  }, [check]);
  useEffect(() => () => void (poll.current !== null && window.clearInterval(poll.current)), []);
  const close = () => {
    if (poll.current === null) onClose();
  };
  const go = () => {
    if (!check) return;
    if (!check.auto) {
      void window.wecraft.update.openPage();
      onClose();
      return;
    }
    setBusy(true);
    void window.wecraft.update.install().then((started) => {
      if (!started) {
        setMsg("La mise à jour n'a pas pu démarrer.");
        setBusy(false);
        return;
      }
      setBar(0);
      poll.current = window.setInterval(() => {
        void window.wecraft.update.status().then((s) => {
          setBar(s.total > 0 ? Math.min(100, Math.round((100 * s.done) / s.total)) : 0);
          setMsg(s.phase === "download" && s.total > 0 ? `Téléchargement... ${Math.floor((100 * s.done) / s.total)} %` : s.message);
          if (s.phase === "error" && poll.current !== null) {
            window.clearInterval(poll.current);
            poll.current = null;
            setBusy(false);
          }
        });
      }, 300);
    });
  };
  return (
    <div className="overlay" id="updOv" hidden={!check} data-a="m-update" data-name="Mise à jour">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="updTitle" style={{ width: "min(460px,100%)" }}>
        <header>
          <h3 id="updTitle">{t("Mise à jour disponible")}</h3>
          <button className="xbtn" id="updClose" aria-label={t("Fermer")} style={{ width: "28px", height: "28px", fontSize: "13px" }} onClick={close}>
            ✕
          </button>
        </header>
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <b id="updVer" style={{ fontFamily: "var(--f-mono)" }}>
            {check ? `v${check.current}  →  v${check.latest}` : ""}
          </b>
          <p className="muted" id="updNotes" style={{ whiteSpace: "pre-line", fontSize: "13px", maxHeight: "180px", overflow: "auto" }}>
            {check ? check.notes || "Nouvelle version du launcher." : ""}
          </p>
          <div className="lbar" id="updBarBox" hidden={bar === null} style={{ height: "6px", borderRadius: "999px", background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
            <i id="updBar" style={{ display: "block", height: "100%", width: bar ? `${bar}%` : "0", background: "linear-gradient(90deg,var(--acc),var(--acc-2))" }}></i>
          </div>
          <small className="muted" id="updMsg" style={{ whiteSpace: "pre-line" }}>
            {msg}
          </small>
        </div>
        <div className="mfoot">
          <button className="btn" id="updLater" disabled={busy} onClick={close}>
            {t("Plus tard")}
          </button>
          <button className="btn pri" id="updGo" disabled={busy} onClick={go}>
            {check && !check.auto ? "Voir la mise à jour" : "Mettre à jour"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Notice({ lines, onClose }: { lines: string[]; onClose: () => void }) {
  return (
    <div className="wc-notice" id="wc-notice" role="alert" hidden={lines.length === 0}>
      <p id="wc-notice-text">
        {lines.map((l, i) => (
          <Fragment key={i}>
            {i > 0 ? <br /> : null}
            {l}
          </Fragment>
        ))}
      </p>
      <button className="btn sm" type="button" id="wc-notice-close" onClick={onClose}>
        {t("Compris")}
      </button>
    </div>
  );
}

/** Question du premier démarrage de chaque version (comme la version Python) ; « Non » est le choix par défaut. */
export function DiscordAsk({ open, onAnswer }: { open: boolean; onAnswer: (on: boolean) => void }) {
  const noRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) noRef.current?.focus();
  }, [open]);
  return (
    <div className="overlay" id="discordOv" hidden={!open} data-a="m-discord" data-name="Statut Discord">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="dcTitle" style={{ width: "min(460px,100%)" }}>
        <header>
          <h3 id="dcTitle">{t("Statut Discord")}</h3>
        </header>
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <p style={{ fontSize: "13.5px" }}>{t("Afficher sur votre profil Discord ce que vous faites dans ReLaunch ?")}</p>
          <p className="muted" style={{ fontSize: "13px" }}>
            {t("Vos amis Discord verraient le nom de l'instance lancée, sa version de Minecraft, son loader et la durée de jeu. Ce réglage se change à tout moment dans Paramètres, Comportement. La question sera reposée après chaque mise à jour.")}
          </p>
        </div>
        <div className="mfoot">
          <button className="btn" ref={noRef} onClick={() => onAnswer(false)}>
            {t("Non")}
          </button>
          <button className="btn pri" onClick={() => onAnswer(true)}>
            {t("Oui, afficher")}
          </button>
        </div>
      </div>
    </div>
  );
}
