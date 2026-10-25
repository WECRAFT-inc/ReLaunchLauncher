// « Modifier » un modpack d'événement : le joueur choisit SES packs de ressources et SON shader.
// Les mods, le loader et la configuration officielle ne sont jamais proposés ici, et le processus principal
// refuse de toute façon toute opération hors de resourcepacks/ et shaderpacks/ (events/eventLock.ts).
import { useEffect, useState } from "react";
import type { EventInfo } from "../../shared/api";
import { useApp } from "./ctx";
import { RelinkServersEvents } from "./Relink";
import { t } from "./i18n";
import { useEscapeLayer } from "./keys";

export function EventEditor({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { toast, show, setUi } = useApp();
  const [info, setInfo] = useState<EventInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEscapeLayer(!!id, onClose);
  const load = () => {
    if (!id) return;
    void window.wecraft.events.info(id).then((r) => {
      if (r) setInfo(r);
      else setErr(t("Ce n'est pas un modpack d'événement."));
    });
  };
  useEffect(() => {
    setInfo(null);
    setErr(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (!id) return null;
  const done = (r: { ok: boolean; message?: string }) => {
    if (!r.ok) toast(r.message ?? t("Opération impossible."));
    load();
  };
  return (
    <div className="overlay" data-a="m-event" data-name="Modifier l'événement" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="evTitle" style={{ width: "min(640px,100%)" }}>
        <header>
          <h3 id="evTitle">{info ? t("Modifier « {n} »", { n: info.name }) : t("Modifier")}</h3>
          <button className="xbtn" aria-label={t("Fermer")} onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="mbody ie-body">
          <div className="pj-warn">{t("Seuls les packs de ressources et les shaders se modifient. Les mods, le loader et la configuration de l'événement sont verrouillés.")}</div>
          {err ? <div className="empty">{err}</div> : null}
          {!info && !err ? <small className="faint">{t("Chargement…")}</small> : null}
          {info ? (
            <>
              <h4>{t("Shader")}</h4>
              <div className="ev-list">
                <label className="ev-row">
                  <input type="radio" name="ev-shader" checked={!info.shader} onChange={() => void window.wecraft.events.setShader(id, null).then(done)} />
                  <span>{t("Aucun shader")}</span>
                </label>
                {info.shaders.map((p) => (
                  <label key={p.name} className="ev-row">
                    <input type="radio" name="ev-shader" checked={info.shader === p.name} onChange={() => void window.wecraft.events.setShader(id, p.name).then(done)} />
                    <span>{p.name}</span>
                    {p.official ? <span className="tag">{t("officiel")}</span> : <span className="tag ldr">{t("ajouté")}</span>}
                    {info.defaultShader === p.name ? <span className="tag">{t("choix de l'événement")}</span> : null}
                    {!p.official ? (
                      <button className="ib" aria-label={t("Retirer {n}", { n: p.name })} title={t("Retirer (corbeille)")} onClick={(e) => (e.preventDefault(), void window.wecraft.events.remove(id, "shader", p.name).then(done))}>
                        🗑
                      </button>
                    ) : null}
                  </label>
                ))}
                {!info.shaders.length ? <small className="faint">{t("Aucun shader dans ce modpack.")}</small> : null}
              </div>
              {info.resourcepacksEditable ? (
                <>
              <h4>{t("Packs de ressources")}</h4>
              <div className="ev-list">
                {info.resourcepacks.map((p) => (
                  <label key={p.name} className="ev-row">
                    <input type="checkbox" checked={p.enabled} onChange={(e) => void window.wecraft.events.setPack(id, p.name, e.target.checked).then(done)} />
                    <span>{p.name}</span>
                    {p.official ? <span className="tag">{t("officiel")}</span> : <span className="tag ldr">{t("ajouté")}</span>}
                    {!p.official ? (
                      <button className="ib" aria-label={t("Retirer {n}", { n: p.name })} title={t("Retirer (corbeille)")} onClick={(e) => (e.preventDefault(), void window.wecraft.events.remove(id, "resourcepack", p.name).then(done))}>
                        🗑
                      </button>
                    ) : null}
                  </label>
                ))}
                {!info.resourcepacks.length ? <small className="faint">{t("Aucun pack de ressources dans ce modpack.")}</small> : null}
              </div>
                </>
              ) : (
                <p className="faint" style={{ fontSize: "12.5px" }}>{t("Pack d'event : les packs de ressources sont imposés, seuls les shaders peuvent être changés.")}</p>
              )}
              <span className="row" style={{ gap: "8px", justifyContent: "flex-start" }}>
                <button
                  className="btn sm"
                  onClick={() => {
                    onClose();
                    setUi({ dtab: "resourcepack" });
                    show("discover", { dtab: "resourcepack" });
                  }}
                >
                  {t("Ajouter un pack de ressources")}
                </button>
                <button
                  className="btn sm"
                  onClick={() => {
                    onClose();
                    show("discover", { dtab: "shader" });
                  }}
                >
                  {t("Ajouter un shader")}
                </button>
              </span>
            </>
          ) : null}
        </div>
        <div className="mfoot">
          <button className="btn pri" onClick={onClose}>
            {t("Terminé")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Section ReLaunch : modpacks d'événements installés (avec « Jouer » et « Modifier »). */
export function RelaunchEvents() {
  const { inst } = useApp();
  const ev = inst.filter((i) => i.ev);
  return (
    <>
      <div className="vhead">
        <div>
          <h2>ReLaunch</h2>
          <div className="sub">{t("Events et serveurs")}</div>
        </div>
      </div>
      <RelinkServersEvents />
      <div className="sect">
        <h3>{t("Modpacks d'événements installés")}</h3>
        {ev.length ? (
          <div className="mp-results">
            {ev.map((x) => (
              <div key={x.id} className="card imp-row">
                <span className="imp-txt">
                  <b>{x.ev!.name}</b>
                  <small className="muted">{`${x.l} · ${x.v || "?"}`}</small>
                </span>
                <button className="btn sm" data-act="evEdit" data-id={x.id}>
                  {t("Modifier")}
                </button>
                <button className="btn sm pri" data-play={x.id}>
                  {t("Jouer")}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="faint" style={{ fontSize: "13px" }}>{t("Aucun modpack d'événement installé sur ce PC. Leurs modpacks apparaîtront ici, avec « Modifier » pour choisir tes shaders.")}</p>
        )}
      </div>
    </>
  );
}
