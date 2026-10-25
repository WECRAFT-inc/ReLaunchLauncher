// Réglages d'une instance : icône, nom affiché, version de Minecraft, loader et sa version, mémoire, fond.
// Comme la version Python, rien n'est écrit dans le dossier de l'instance : tout va dans instances_meta.json
// (et .wecraft\icons, .wecraft\backgrounds pour les images). Une combinaison version + loader impossible est
// signalée et ne peut pas être enregistrée.
import { useEffect, useState } from "react";
import type { IconChoice, InstanceIcon, LoaderVersionItem, ScreenshotItem } from "../../shared/api";
import { CREATE_LOADERS } from "./Create";
import { useApp } from "./ctx";
import { IconEditor } from "./IconEditor";
import { useEscapeLayer } from "./keys";
import type { Inst } from "./model";
import { InstIcon } from "./symbols";
import { t } from "./i18n";

type Loader = (typeof CREATE_LOADERS)[number];

export function InstanceEditor({ x, onClose }: { x: Inst | null; onClose: () => void }) {
  const { toast, refreshInstances, defaultRam } = useApp();
  const [name, setName] = useState("");
  const [mc, setMc] = useState("");
  const [loader, setLoader] = useState<Loader>("Vanilla");
  const [lv, setLv] = useState<string | null>(null);
  const [lvList, setLvList] = useState<LoaderVersionItem[] | null>(null);
  const [lvErr, setLvErr] = useState<string | null>(null);
  const [ram, setRam] = useState<number | null>(null);
  const [versions, setVersions] = useState<string[] | null>(null);
  const [icon, setIcon] = useState<{ choice: IconChoice | null; view: InstanceIcon | null; changed: boolean }>({ choice: null, view: null, changed: false });
  const [bg, setBg] = useState<string | null>(null);
  const [shots, setShots] = useState<ScreenshotItem[] | null>(null);
  const [editIcon, setEditIcon] = useState(false);
  const [busy, setBusy] = useState(false);
  useEscapeLayer(!!x && !editIcon, onClose);

  useEffect(() => {
    if (!x) return;
    setName(x.n);
    setMc(x.v);
    setLoader((x.l as Loader) || "Vanilla");
    setLv(x.lv || null);
    setRam(x.r);
    setIcon({ choice: null, view: x.icon, changed: false });
    setBg(x.bg);
    setShots(null);
    setBusy(false);
    void window.wecraft.modpacks.versions().then((v) => setVersions(v));
    // seulement à l'ouverture (ou pour une autre instance) : la liste des instances est relue toutes les
    // quelques secondes et ne doit jamais effacer ce qui est en train d'être modifié
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x?.id]);

  useEffect(() => {
    if (!x || loader === "Vanilla" || !mc) {
      setLvList(null);
      setLvErr(null);
      return;
    }
    let alive = true;
    setLvList(null);
    setLvErr(null);
    void window.wecraft.instances.loaderVersions(loader, mc).then((r) => {
      if (!alive) return;
      if (r.ok) setLvList(r.versions);
      else setLvErr(r.message);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x?.id, loader, mc]);

  if (!x) return null;
  // comme Python : la version du loader est gardée si la version de Minecraft et le loader ne changent pas
  const sameBase = mc === x.v && loader === ((x.l as Loader) || "Vanilla");
  const lvValue = loader === "Vanilla" ? null : sameBase ? lv : lv && lvList?.some((v) => v.version === lv) ? lv : null;
  const versionList = versions ? (mc && !versions.includes(mc) ? [mc, ...versions] : versions) : mc ? [mc] : [];
  const canSave = !busy && (!!x.ev || (!!mc && (loader === "Vanilla" || !lvErr)));

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    const r = await window.wecraft.instances.edit(x.id, { name: name.trim() === x.n ? x.n : name.trim(), mc, loader, loaderVersion: lvValue, ram });
    if (r.ok && icon.changed) await window.wecraft.instances.setIcon(x.id, icon.choice);
    setBusy(false);
    if (!r.ok) return toast("Réglages non enregistrés : le fichier instances_meta.json est illisible ou verrouillé.");
    refreshInstances();
    toast(`Réglages de « ${name.trim() || x.n} » enregistrés.`);
    onClose();
  };
  const setBackground = (how: "shot" | "import" | "clear", token?: string) => {
    void window.wecraft.instances.setBackground(x.id, how, token).then((r) => {
      if (r.ok) {
        setBg(r.url);
        refreshInstances();
      } else if (!r.canceled) toast(r.message ?? "Image refusée.");
    });
  };

  return (
    <>
      <div className="overlay" data-a="m-inst" data-name="Réglages de l'instance" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ieTitle" style={{ width: "min(640px,100%)" }}>
          <header>
            <h3 id="ieTitle">{t("Réglages de l'instance")}</h3>
            <button className="xbtn" aria-label={t("Fermer")} onClick={onClose}>
              ✕
            </button>
          </header>
          <div className="mbody ie-body">
            <div className="iconpick">
              <InstIcon icon={icon.view} fallback={x.c} name={name || x.n} size={88} />
              <span className="col">
                <button className="btn sm" onClick={() => setEditIcon(true)}>
                  {t("Changer l'icône")}
                </button>
                {icon.view ? (
                  <button className="btn sm" onClick={() => setIcon({ choice: null, view: null, changed: true })}>
                    {t("✕ Icône par défaut")}
                  </button>
                ) : null}
              </span>
            </div>
            <label className="field">
              <span className="lbl strong">{t("Nom affiché")}</span>
              <input type="text" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
              <small className="faint">{t("Seul le nom affiché change : le dossier de l'instance n'est pas renommé. Champ vide = nom d'origine.")}</small>
            </label>
            {x.ev ? <div className="pj-warn">{t("Modpack d'événement : la version, le loader, les mods et l'image de fond sont imposés par l'événement. Packs de ressources et shaders : bouton « Modifier ».")}</div> : null}
            <div className="ie-row">
              <label className="field">
                <span className="lbl strong">{t("Version de Minecraft")}</span>
                <select value={mc} disabled={!!x.ev} onChange={(e) => setMc(e.target.value)}>
                  {mc ? null : <option value="">{t("Choisir…")}</option>}
                  {versionList.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="lbl strong">{t("Mémoire")}</span>
                <select value={ram ?? ""} onChange={(e) => setRam(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">{`Par défaut (${defaultRam} Go)`}</option>
                  {Array.from({ length: 16 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {`${n} Go`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {x.ev ? null : (
            <div className="field">
              <span className="lbl strong">{t("Loader")}</span>
              <div className="chips">
                {CREATE_LOADERS.map((l) => (
                  <button key={l} className="chip" aria-pressed={loader === l ? "true" : "false"} onClick={() => setLoader(l)}>
                    {loader === l ? `✓ ${l}` : l}
                  </button>
                ))}
              </div>
              {loader !== "Vanilla" ? (
                lvErr ? (
                  <small className="cr-bad">{lvErr}</small>
                ) : !lvList ? (
                  <small className="faint">{`Vérification des versions de ${loader}…`}</small>
                ) : (
                  <select value={lvValue ?? ""} onChange={(e) => setLv(e.target.value || null)} aria-label={`Version de ${loader}`}>
                    <option value="">{`Stable, choisie au lancement (${lvList.find((v) => v.recommended)?.version ?? lvList[0]?.version ?? "?"})`}</option>
                    {lvList.map((v) => (
                      <option key={v.version} value={v.version}>
                        {`${v.version}${v.recommended ? " (recommandée)" : v.stable ? "" : " (test)"}`}
                      </option>
                    ))}
                  </select>
                )
              ) : null}
            </div>
            )}
            {x.ev ? null : (
            <div className="field">
              <span className="lbl strong">{t("Image de fond")}</span>
              <div className="ie-bg">
                <span className="ie-bgprev" style={bg ? { backgroundImage: `url("${bg}")` } : {}}>
                  {bg ? null : <small className="faint">{t("Aucune")}</small>}
                </span>
                <span className="col">
                  <button className="btn sm" onClick={() => void window.wecraft.instances.screenshots(x.id).then(setShots)}>
                    {t("Choisir une capture")}
                  </button>
                  <button className="btn sm" onClick={() => setBackground("import")}>
                    {t("Importer une image")}
                  </button>
                  {bg ? (
                    <button className="btn sm" onClick={() => setBackground("clear")}>
                      {t("✕ Aucun fond")}
                    </button>
                  ) : null}
                </span>
              </div>
              {shots ? (
                shots.length ? (
                  <div className="ie-shots">
                    {shots.map((s) => (
                      <button key={s.token} className="ie-shot" title={s.name} onClick={() => setBackground("shot", s.token)} style={{ backgroundImage: `url("${s.url}")` }} aria-label={`Utiliser ${s.name}`}></button>
                    ))}
                  </div>
                ) : (
                  <small className="faint">{t("Aucune capture d'écran dans cette instance (touche F2 en jeu).")}</small>
                )
              ) : null}
              <small className="faint">{t("L'image est copiée dans les réglages de ReLaunch : elle reste valable si l'instance ou ReLaunch changent de place.")}</small>
            </div>
            )}
          </div>
          <div className="mfoot">
            <button className="btn" onClick={onClose}>
              {t("Annuler")}
            </button>
            <button className="btn pri" onClick={() => void save()} disabled={!canSave}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
      <IconEditor
        open={editIcon}
        name={name || x.n}
        current={icon.view}
        fallback={x.c}
        onCancel={() => setEditIcon(false)}
        onSave={(choice, view) => {
          setEditIcon(false);
          setIcon({ choice, view, changed: true });
        }}
      />
    </>
  );
}
