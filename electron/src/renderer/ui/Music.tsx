// Musique : mini-lecteur de la barre (visible quand une appli joue), panneau latéral et section des paramètres.
// Tout passe par le processus principal (commandes multimédias de Windows) : l'interface n'a ni réseau ni disque.
import { useEffect, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { MusicApp, MusicSettings, MusicShortcuts, MusicState } from "../../shared/api";
import { useApp } from "./ctx";
import { Ic } from "./Ic";
import { t } from "./i18n";

// ---------------------------------------------------------------- état partagé (un seul relevé pour toute l'interface)
const EMPTY: MusicState = { available: false, sessions: [], selected: null, chosen: null, track: null };
let snap: MusicState = EMPTY;
let enabled: boolean | null = null;
const subs = new Set<() => void>();
let timer: number | null = null;
let busy = false;

const emit = () => subs.forEach((f) => f());

async function pull(): Promise<void> {
  if (busy || document.visibilityState !== "visible") return;
  busy = true;
  try {
    if (enabled === null) enabled = (await window.wecraft.music.settings()).enabled;
    snap = enabled ? await window.wecraft.music.state() : EMPTY;
  } catch {
    snap = EMPTY;
  } finally {
    busy = false;
  }
  emit();
}

/** Relevé immédiat (après une commande ou un changement de réglage). */
export function refreshMusic(settings?: MusicSettings): void {
  if (settings) enabled = settings.enabled;
  window.setTimeout(() => void pull(), 250);
}

function subscribe(cb: () => void): () => void {
  subs.add(cb);
  if (timer === null) {
    void pull();
    timer = window.setInterval(() => void pull(), 2500);
  }
  return () => {
    subs.delete(cb);
    if (!subs.size && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

export function useMusic(): MusicState {
  return useSyncExternalStore(subscribe, () => snap);
}

const control = (action: "toggle" | "next" | "prev") => {
  void window.wecraft.music.control(action).finally(() => refreshMusic());
};

// ---------------------------------------------------------------- bouton de la barre
/** Bouton de la barre : n'apparaît que si une appli a un morceau en cours. Ouvre le panneau « Musique ». */
export function MusicBarButton({ pressed, size }: { pressed: boolean; size: number }) {
  const m = useMusic();
  const tr = m.track;
  if (!m.available || !tr || !tr.title) return null;
  const tip = `${tr.playing ? t("En lecture") : t("En pause")} · ${tr.title}${tr.artist ? ` · ${tr.artist}` : ""} (${tr.app})`;
  return (
    <button className={`nb mus-nb${tr.playing ? " on" : ""}`} data-act="drawer" data-drawer="music" data-a="nav-music" data-tip={tip} aria-label={tip} aria-pressed={pressed ? "true" : "false"}>
      {tr.thumb ? <img src={tr.thumb} alt="" style={{ width: Math.round(size * 0.55), height: Math.round(size * 0.55) }} /> : <Ic n="music" />}
      {tr.playing ? <span className="mus-eq" aria-hidden="true"><i></i><i></i><i></i></span> : null}
    </button>
  );
}

// ---------------------------------------------------------------- panneau latéral
export function MusicPanel() {
  const m = useMusic();
  const { setUi } = useApp();
  const tr = m.track;
  const choose = (id: string | null) => void window.wecraft.music.choose(id).finally(() => refreshMusic());
  return (
    <div className="mus-panel">
      {!m.available ? (
        <div className="empty">{m.reason ?? t("Aucune musique détectée.")}</div>
      ) : !tr ? (
        <div className="empty">{t("Aucune appli ne joue de musique pour l'instant. Lance Spotify, Deezer, YouTube… : le morceau apparaîtra ici.")}</div>
      ) : (
        <div className="mus-now">
          <div className="mus-cover">{tr.thumb ? <img src={tr.thumb} alt="" /> : <Ic n="music" />}</div>
          <b className="mus-title">{tr.title || t("Titre inconnu")}</b>
          <small className="faint">{[tr.artist, tr.album].filter(Boolean).join(" · ")}</small>
          <small className="faint">{tr.app}</small>
          <div className="mus-ctl">
            <button className="btn" disabled={!tr.canPrev} onClick={() => control("prev")} aria-label={t("Précédent")} title={t("Précédent")}>⏮</button>
            <button className="btn pri" disabled={!(tr.playing ? tr.canPause : tr.canPlay)} onClick={() => control("toggle")} aria-label={tr.playing ? t("Pause") : t("Lecture")} title={tr.playing ? t("Pause") : t("Lecture")}>
              {tr.playing ? "⏸" : "▶"}
            </button>
            <button className="btn" disabled={!tr.canNext} onClick={() => control("next")} aria-label={t("Suivant")} title={t("Suivant")}>⏭</button>
          </div>
        </div>
      )}
      {m.available && m.sessions.length > 1 ? (
        <div className="dsec">
          <h4>{t("Appli pilotée")}</h4>
          <button className={`mus-src${m.chosen === null ? " on" : ""}`} onClick={() => choose(null)}>
            <b>{t("Suivre Windows")}</b>
            <small className="faint">{t("L'appli que Windows affiche (la dernière active)")}</small>
          </button>
          {m.sessions.map((s) => (
            <button key={s.id} className={`mus-src${m.chosen === s.id ? " on" : ""}`} onClick={() => choose(s.id)}>
              <b>{`${s.playing ? "▶ " : ""}${s.app}`}</b>
              <small className="faint">{s.title ? `${s.title}${s.artist ? ` · ${s.artist}` : ""}` : t("Rien en cours")}</small>
            </button>
          ))}
        </div>
      ) : null}
      <OpenApps />
      <button className="btn sm" style={{ marginTop: "auto" }} onClick={() => setUi({ view: "settings", setTab: "musique", drawer: null })}>
        {t("Réglages de la musique")}
      </button>
    </div>
  );
}

function OpenApps() {
  const [apps, setApps] = useState<MusicApp[]>([]);
  useEffect(() => {
    void window.wecraft.music.apps().then(setApps, () => setApps([]));
  }, []);
  if (!apps.length) return null;
  return (
    <div className="dsec">
      <h4>{t("Ouvrir une appli")}</h4>
      <div className="mus-apps">
        {apps.map((a) => (
          <button key={a.id} className="btn sm" onClick={() => void window.wecraft.music.openApp(a.id)} title={a.installed ? t("Ouvrir l'appli installée") : t("Ouvrir la version web")}>
            {a.name}
            {a.installed ? null : <small className="faint"> {t("(web)")}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- paramètres
const tf = (b: boolean) => (b ? "true" : "false");

/** Raccourci au format Electron depuis une touche pressée ; null si la combinaison n'est pas acceptée. */
export function acceleratorOf(e: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; code: string }): string | null {
  const c = e.code;
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(c)) key = c.slice(3);
  else if (/^Digit[0-9]$/.test(c)) key = c.slice(5);
  else if (/^Numpad[0-9]$/.test(c)) key = `num${c.slice(6)}`;
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(c)) key = c;
  else key = ({ Space: "Space", ArrowLeft: "Left", ArrowRight: "Right", ArrowUp: "Up", ArrowDown: "Down", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown", Insert: "Insert", Delete: "Delete", Equal: "Plus", Minus: "Minus" } as Record<string, string>)[c] ?? null;
  if (!key || !(e.ctrlKey || e.altKey)) return null;
  return [e.ctrlKey ? "Ctrl" : "", e.altKey ? "Alt" : "", e.shiftKey ? "Shift" : "", e.metaKey ? "Super" : "", key].filter(Boolean).join("+");
}

function ShortcutInput({ label, value, onSet }: { label: string; value: string | null; onSet: (v: string | null) => void }) {
  const [rec, setRec] = useState(false);
  const onKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!rec) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === "Escape") return setRec(false);
    if (e.code === "Backspace") {
      setRec(false);
      return onSet(null);
    }
    if (["ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"].includes(e.code)) return;
    const acc = acceleratorOf(e);
    if (acc) {
      setRec(false);
      onSet(acc);
    }
  };
  return (
    <div className="setrow">
      <span>
        <b>{label}</b>
      </span>
      <span className="mus-keys">
        <button className={`btn sm mus-key${rec ? " rec" : ""}`} onClick={() => setRec(true)} onKeyDown={onKey} onBlur={() => setRec(false)}>
          {rec ? t("Appuie sur la combinaison…") : value ? value.replace(/\+/g, " + ") : t("Aucun")}
        </button>
        {value && !rec ? (
          <button className="xbtn" aria-label={`${t("Retirer")} ${label}`} title={t("Retirer le raccourci")} onClick={() => onSet(null)}>
            ✕
          </button>
        ) : null}
      </span>
    </div>
  );
}

/** Ligne d'état : ce que le pont voit, ou pourquoi il ne marche pas (pour diagnostiquer sans ouvrir les journaux). */
function MusicStatus({ on }: { on: boolean }) {
  const m = useMusic();
  const text = !on
    ? t("Musique désactivée dans les paramètres.")
    : m.available
      ? m.sessions.length
        ? `${m.sessions.length} ${t("appli(s) détectée(s)")} : ${m.sessions.map((x) => x.app).join(", ")}`
        : t("Prêt : aucune appli ne joue pour l'instant.")
      : m.reason ?? t("Recherche des applis de musique…");
  return (
    <div className="setrow">
      <span>
        <b>{t("État")}</b>
        <small className={on && !m.available && m.reason ? "mus-err" : undefined}>{text}</small>
      </span>
    </div>
  );
}

export function MusicSettingsGroup() {
  const { toast } = useApp();
  const [s, setS] = useState<MusicSettings | null>(null);
  useEffect(() => {
    void window.wecraft.music.settings().then(setS, () => setS(null));
  }, []);
  const save = (patch: Partial<MusicSettings>, done?: (n: MusicSettings) => void) => {
    void window.wecraft.music.setSettings(patch).then(
      (r) => {
        if (!r.ok) return toast(t(r.message));
        setS(r.settings);
        refreshMusic(r.settings);
        if (r.refused.length) toast(t("Ce raccourci est déjà pris par une autre appli : choisis-en un autre."));
        else done?.(r.settings);
      },
      () => toast(t("Réglage non enregistré.")),
    );
  };
  const setKey = (k: keyof MusicShortcuts) => (v: string | null) => save({ shortcuts: { ...(s?.shortcuts ?? { toggle: null, next: null, prev: null }), [k]: v } });
  return (
    <>
      <div className="grp">
        <h3>{t("Musique")}</h3>
        <p className="faint" style={{ fontSize: "12.5px", margin: "0 0 8px" }}>
          {t("ReLaunch pilote l'appli qui joue sur ton PC (Spotify, Deezer, YouTube dans le navigateur, Apple Music…) grâce aux commandes multimédias de Windows. Aucune connexion à un service n'est demandée.")}
        </p>
        <div className="setrow">
          <span>
            <b>{t("Mini-lecteur")}</b>
            <small>{t("Affiche le morceau en cours dans la barre quand une appli joue, avec lecture, pause, suivant et précédent.")}</small>
          </span>
          <button className="toggle" role="switch" aria-checked={tf(s?.enabled !== false)} disabled={!s} onClick={() => s && save({ enabled: !s.enabled })} aria-label={t("Mini-lecteur")}></button>
        </div>
        <MusicStatus on={s?.enabled !== false} />
        <div className="setrow">
          <span>
            <b>{t("Partager ma musique avec mes amis")}</b>
            <small>{t("Tes amis ReLink voient « Écoute … » sous ton pseudo. Rien n'est envoyé si ce réglage est coupé.")}</small>
          </span>
          <button className="toggle" role="switch" aria-checked={tf(s?.share === true)} disabled={!s || !s.enabled} onClick={() => s && save({ share: !s.share }, (n) => toast(n.share ? t("Tes amis voient maintenant ce que tu écoutes.") : t("Ta musique n'est plus partagée.")))} aria-label={t("Partager ma musique avec mes amis")}></button>
        </div>
      </div>
      <div className="grp">
        <h3>{t("Raccourcis clavier")}</h3>
        <p className="faint" style={{ fontSize: "12.5px", margin: "0 0 8px" }}>
          {t("Ils marchent partout, même en jeu. Utilise Ctrl ou Alt avec une touche. Échap annule, Retour arrière efface.")}
        </p>
        <ShortcutInput label={t("Lecture / pause")} value={s?.shortcuts.toggle ?? null} onSet={setKey("toggle")} />
        <ShortcutInput label={t("Morceau suivant")} value={s?.shortcuts.next ?? null} onSet={setKey("next")} />
        <ShortcutInput label={t("Morceau précédent")} value={s?.shortcuts.prev ?? null} onSet={setKey("prev")} />
      </div>
      <div className="grp">
        <OpenApps />
      </div>
    </>
  );
}
