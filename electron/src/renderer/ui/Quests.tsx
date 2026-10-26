// Avantages & Quêtes : quêtes générales, série de jours (streak) et quêtes d'events (classées par event).
// Toutes les données viennent de ReLink (Worker) : rien n'est inventé ni calculé ici. Les récompenses sont
// versées par le serveur ; le launcher se contente d'afficher et de signaler une fois une quête terminée.
// Carte « compte Minecraft » de l'accueil : discrète, une seule ligne.
import { useEffect, useRef, useState } from "react";
import type { MicrosoftState, QuestsState } from "../../shared/api";
import { useApp } from "./ctx";
import { Ic } from "./Ic";
import { t } from "./i18n";

const SEEN_KEY = "relaunch-quests-seen";
const readSeen = (): Set<string> => {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 500) : []);
  } catch {
    return new Set();
  }
};
const writeSeen = (s: Set<string>) => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-500)));
  } catch {
    // stockage indisponible : la récompense sera peut-être signalée une seconde fois, sans conséquence
  }
};

/** Quêtes du joueur ; signale (une fois par PC) les récompenses nouvellement versées. */
export function useQuests(on = true): { q: QuestsState | null; reload: () => void } {
  const { account, toast } = useApp();
  const [q, setQ] = useState<QuestsState | null>(null);
  const [n, setN] = useState(0);
  const uid = account?.user?.id ?? null;
  const verified = !!account?.user?.minecraftVerified;
  useEffect(() => {
    if (!on || !uid) {
      setQ(null);
      return;
    }
    let alive = true;
    void window.wecraft.account.quests().then(
      (r) => {
        if (!alive) return;
        setQ(r);
        const seen = readSeen();
        const fresh = r.quests.filter((x) => x.claimed && x.reward > 0 && !seen.has(`${uid}:${x.id}`));
        if (fresh.length) {
          fresh.forEach((x) => seen.add(`${uid}:${x.id}`));
          writeSeen(seen);
          toast(fresh.map((x) => `+${x.reward} ${t("Éclats")} · ${t("quête terminée")} : ${x.title}`).join(" — "));
        }
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [on, uid, verified, n, toast]);
  return { q, reload: () => setN((x) => x + 1) };
}

/** Accueil : compte Minecraft utilisé (façon « Joue en tant que »), ou invitation discrète à le lier. */
export function HomeAccount() {
  const { account } = useApp();
  const [ms, setMs] = useState<MicrosoftState | null>(null);
  useEffect(() => {
    void window.wecraft.microsoft.state().then(setMs, () => undefined);
  }, [account?.user?.minecraftVerified]);
  const u = account?.user;
  const { q } = useQuests(!!u);
  const quest = q?.quests.find((x) => x.id === "official_account");
  if (!account) return null;
  if (!account.loggedIn || !u) {
    return (
      <button className="hacct" data-go="settings" data-set="compte" data-a="home-account">
        <span className="hav off" aria-hidden="true">
          <Ic n="relink" />
        </span>
        <span className="htxt">
          <b>{t("Connecte-toi à ReLink")}</b>
          <small>{t("Nécessaire pour lancer tes instances")}</small>
        </span>
      </button>
    );
  }
  const name = (ms?.connected ? ms.profile?.name : null) ?? u.minecraftName;
  if (u.minecraftVerified && name) {
    return (
      <button className="hacct" data-go="settings" data-set="compte" data-a="home-account" title={t("Compte Minecraft : réglages")}>
        <span className="hav" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
          <i className="dot"></i>
        </span>
        <span className="htxt">
          <small>{t("Joue en tant que")}</small>
          <b>{name}</b>
        </span>
        <span className="hnote">{ms?.connected ? t("Compte Microsoft connecté") : t("Lancement via le launcher officiel")}</span>
      </button>
    );
  }
  return (
    <button className="hacct invite" data-go="settings" data-set="compte" data-a="home-account">
      <span className="hav off" aria-hidden="true">
        <Ic n="game" />
      </span>
      <span className="htxt">
        <b>{t("Lie ton compte Minecraft officiel")}</b>
        <small>{u.minecraftName ? `${u.minecraftName} · ${t("licence pas encore vérifiée")}` : t("Nécessaire pour lancer les instances WeCraft")}</small>
      </span>
      {quest && !quest.claimed ? (
        <span className="hreward">
          <Ic n="gem" />
          {`+${quest.reward}`}
        </span>
      ) : null}
    </button>
  );
}

/** Page « Avantages & Quêtes ». */
export function QuestsPage() {
  const { account, relink, ui } = useApp();
  const { q, reload } = useQuests(!!account?.user);
  const events = relink?.data?.events ?? [];
  const evRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ui.qEv) evRef.current?.querySelector<HTMLElement>(`[data-ev="${CSS.escape(ui.qEv)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [ui.qEv, q]);
  const general = q?.quests.filter((x) => x.category === "general") ?? [];
  const evQuests = (id: string) => q?.quests.filter((x) => x.category === "event" && x.event === id) ?? [];
  const s = q?.streak ?? null;
  return (
    <>
      <div className="vhead">
        <div>
          <h2>{t("Avantages & Quêtes")}</h2>
          <div className="sub">{t("Quêtes, série de jours et quêtes d'events : les récompenses en Éclats sont versées automatiquement sur ton compte ReLink.")}</div>
        </div>
        {account?.user ? (
          <span className="qbal" aria-label={t("Tes éclats")}>
            <Ic n="gem" />
            {`${account.user.eclats} ${t("éclats")}`}
          </span>
        ) : null}
      </div>
      {!account?.user ? (
        <div className="empty">
          {t("Connecte-toi à ReLink pour voir tes quêtes.")}{" "}
          <button className="btn sm" data-go="settings" data-set="compte">
            {t("Se connecter")}
          </button>
        </div>
      ) : q && !q.ok ? (
        <div className="empty">
          {q.error ?? t("Quêtes indisponibles pour le moment.")}{" "}
          <button className="btn sm" onClick={reload}>
            {t("Réessayer")}
          </button>
        </div>
      ) : null}
      {q?.ok ? (
        <>
          <div className="sect">
            <h3>{t("Quêtes")}</h3>
            <div className="qlist">
              {general.map((x) => (
                <div key={x.id} className={`qcard${x.claimed ? " done" : ""}`} data-a={`quest-${x.id}`}>
                  <span className="qico" aria-hidden="true">
                    <Ic n={x.claimed ? "check" : "quests"} />
                  </span>
                  <span className="qtxt">
                    <b>{x.title}</b>
                    {x.desc ? <small>{x.desc}</small> : null}
                  </span>
                  <span className="qside">
                    <span className="qrew">
                      <Ic n="gem" />
                      {`+${x.reward}`}
                    </span>
                    {x.claimed ? (
                      <small className="ok">{t("Reçu")}</small>
                    ) : x.id === "official_account" ? (
                      <button className="btn sm" data-go="settings" data-set="compte">
                        {t("Lier mon compte")}
                      </button>
                    ) : (
                      <small className="faint">{t("En cours")}</small>
                    )}
                  </span>
                </div>
              ))}
              {general.length ? null : <div className="empty">{t("Aucune quête pour l'instant.")}</div>}
            </div>
          </div>
          <div className="sect">
            <h3>{t("Série de jours")}</h3>
            {s ? (
              <div className="qstreak">
                <span className="qico big" aria-hidden="true">
                  <Ic n="flame" />
                </span>
                <span className="qtxt">
                  <b>{`${s.current} ${s.current > 1 ? t("jours d'affilée") : t("jour d'affilée")}`}</b>
                  <small>{`${t("Record")} : ${s.longest} · ${s.dailyReward ? `+${s.dailyReward} ${t("éclats par jour validé")}` : ""}`}</small>
                  {s.milestones.length ? (
                    <span className="qmiles" aria-label={t("Paliers")}>
                      {s.milestones.map((m) => (
                        <span key={m.day} className={s.current >= m.day ? "on" : ""} title={`${t("Jour")} ${m.day} : +${m.bonus} ${t("éclats")}`}>
                          <b>{m.day}</b>
                          <small>{`+${m.bonus}`}</small>
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
              </div>
            ) : (
              <div className="empty">{t("Série de jours indisponible pour le moment.")}</div>
            )}
          </div>
          <div className="sect" ref={evRef}>
            <h3>{t("Quêtes d'events")}</h3>
            {events.length ? (
              events.map((e) => {
                const list = evQuests(e.id);
                return (
                  <div key={e.id} className={`qev${ui.qEv === e.id ? " focus" : ""}`} data-ev={e.id}>
                    <b>{e.name}</b>
                    {list.length ? (
                      list.map((x) => (
                        <div key={x.id} className={`qcard${x.claimed ? " done" : ""}`}>
                          <span className="qtxt">
                            <b>{x.title}</b>
                            {x.desc ? <small>{x.desc}</small> : null}
                          </span>
                          <span className="qrew">
                            <Ic n="gem" />
                            {`+${x.reward}`}
                          </span>
                        </div>
                      ))
                    ) : (
                      <small className="faint">{t("Aucune quête pour cet event pour l'instant.")}</small>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="empty">{t("Aucun event annoncé.")}</div>
            )}
          </div>
        </>
      ) : null}
    </>
  );
}
