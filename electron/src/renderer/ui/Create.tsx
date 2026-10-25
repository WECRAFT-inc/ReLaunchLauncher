// « Créer un WePack » (maquette v5) : recherche directe, ou trois façons de commencer.
// - Sur mesure : instance vide (nom, icône, loader, version de Minecraft, version du loader), créée par le
//   processus principal ; la combinaison est vérifiée en ligne avant de pouvoir créer.
// - Depuis un modpack : page Découvrir, onglet Modpacks.
// - Importer : fichier .mrpack (format Modrinth) ou instances des autres launchers (détectées automatiquement).
import { useEffect, useState } from "react";
import type { IconChoice, InstanceIcon, LoaderVersionItem } from "../../shared/api";
import { useApp } from "./ctx";
import { Ic } from "./Ic";
import { IconEditor } from "./IconEditor";
import { useEscapeLayer } from "./keys";
import { InstIcon, randomIcon } from "./symbols";

export const CREATE_LOADERS = ["Vanilla", "Fabric", "NeoForge", "Forge", "Quilt"] as const;
type Loader = (typeof CREATE_LOADERS)[number];
type LvMode = "Stable" | "Dernière" | "Autre";
const FALLBACK: [string, string] = ["#ff8a3d", "#c2410c"];

export function CreateModal({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: () => void }) {
  const { show, toast, refreshInstances } = useApp();
  const [step, setStep] = useState<"choose" | "custom">("choose");
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [loader, setLoader] = useState<Loader>("Fabric");
  const [versions, setVersions] = useState<string[] | null>(null);
  const [mc, setMc] = useState("");
  const [lvMode, setLvMode] = useState<LvMode>("Stable");
  const [lvList, setLvList] = useState<LoaderVersionItem[] | null>(null);
  const [lvErr, setLvErr] = useState<string | null>(null);
  const [lvOther, setLvOther] = useState("");
  const [icon, setIcon] = useState<{ choice: IconChoice; view: InstanceIcon } | null>(null);
  const [editIcon, setEditIcon] = useState(false);
  const [busy, setBusy] = useState(false);
  useEscapeLayer(open && !editIcon, onClose);

  useEffect(() => {
    if (!open) return;
    setStep("choose");
    setQ("");
    setName("");
    setLoader("Fabric");
    setLvMode("Stable");
    setIcon(null);
    setBusy(false);
    if (!versions)
      void window.wecraft.modpacks.versions().then((v) => {
        setVersions(v);
        if (v?.length) setMc((m) => m || v[0]!);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // combinaison loader + version vérifiée en ligne (liste réelle des versions du loader)
  useEffect(() => {
    if (!open || step !== "custom" || loader === "Vanilla" || !mc) {
      setLvList(null);
      setLvErr(null);
      return;
    }
    let alive = true;
    setLvList(null);
    setLvErr(null);
    void window.wecraft.instances.loaderVersions(loader, mc).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setLvList(r.versions);
        setLvOther(r.versions[0]?.version ?? "");
      } else setLvErr(r.message);
    });
    return () => {
      alive = false;
    };
  }, [open, step, loader, mc]);

  const placeholder = `${loader} ${mc}`.trim();
  const display = name.trim() || placeholder;
  const loaderVersion = (): string | null => {
    if (loader === "Vanilla" || lvMode === "Stable") return null; // choisie au lancement (recommandée ou stable)
    if (lvMode === "Dernière") return lvList?.[0]?.version ?? null;
    return lvOther || null;
  };
  const canCreate = !!mc && !busy && (loader === "Vanilla" || (!!lvList && !lvErr));

  const create = () => {
    if (!canCreate) return;
    setBusy(true);
    void window.wecraft.instances.create({ name: display, mc, loader, loaderVersion: loaderVersion(), icon: icon?.choice ?? null }).then((r) => {
      setBusy(false);
      if (!r.ok) {
        toast(r.reason === "exists" ? `Une instance « ${r.name ?? display} » existe déjà : choisissez un autre nom.` : r.reason === "invalid" ? "Informations invalides : vérifiez le nom et les versions." : "Impossible de créer le dossier de l'instance.");
        return;
      }
      refreshInstances();
      toast(`Instance « ${display} » créée : Minecraft et ${loader === "Vanilla" ? "le jeu" : loader} seront installés au premier lancement.`);
      onClose();
      show("wecraft");
    });
  };

  if (!open) return null;
  return (
    <>
      <div className="overlay" id="createOv" data-a="m-create" data-name="Créer un WePack" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="cTitle" id="createModal">
          <header>
            <h3 id="cTitle">Créer un WePack</h3>
            <button className="xbtn" aria-label="Fermer" onClick={onClose}>
              ✕
            </button>
          </header>
          {step === "choose" ? (
            <div className="mbody">
              <label className="lbl" htmlFor="cSearch">
                Tu sais déjà à quoi tu veux jouer ?
              </label>
              <input
                type="search"
                id="cSearch"
                autoFocus
                placeholder="Rechercher des mods, modpacks…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && q.trim()) {
                    onClose();
                    show("discover", { dq: q.trim(), dtab: "modpack" });
                  }
                }}
              />
              <span className="or">ou</span>
              <label className="lbl">Choisis le type d'instance</label>
              <div className="opts3">
                <button className="opt3" data-a="cr-custom" onClick={() => setStep("custom")}>
                  <span className="oi">
                    <Ic n="tune" />
                  </span>
                  <b>Sur mesure</b>
                  <small>Choisis le loader et la version du jeu</small>
                </button>
                <button
                  className="opt3"
                  data-a="cr-from"
                  onClick={() => {
                    onClose();
                    show("discover", { dtab: "modpack" });
                  }}
                >
                  <span className="oi">
                    <Ic n="spark" />
                  </span>
                  <b>Depuis un modpack</b>
                  <small>Pars d'un mod ou d'un modpack existant</small>
                </button>
                <button className="opt3" data-a="cr-import" onClick={onImport}>
                  <span className="oi">
                    <Ic n="upload" />
                  </span>
                  <b>Importer</b>
                  <small>Depuis Prism, CurseForge ou un autre launcher</small>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mbody">
                <div className="iconpick">
                  <InstIcon icon={icon?.view ?? null} fallback={FALLBACK} name={display} size={88} />
                  <span className="col">
                    <button className="btn sm" onClick={() => setEditIcon(true)}>
                      <Ic n="paint" />
                      Personnaliser
                    </button>
                    <button
                      className="btn sm"
                      onClick={() => {
                        const r = randomIcon();
                        setIcon({ choice: r, view: { kind: "gen", ...r } });
                      }}
                    >
                      ↻ Aléatoire
                    </button>
                    {icon ? (
                      <button className="btn sm" onClick={() => setIcon(null)}>
                        ✕ Par défaut
                      </button>
                    ) : null}
                  </span>
                </div>
                <label className="field">
                  <span className="lbl strong">Nom</span>
                  <input type="text" maxLength={60} placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <div className="field">
                  <span className="lbl strong">Loader</span>
                  <div className="chips">
                    {CREATE_LOADERS.map((l) => (
                      <button key={l} className="chip" aria-pressed={loader === l ? "true" : "false"} onClick={() => setLoader(l)}>
                        {loader === l ? `✓ ${l}` : l}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="field">
                  <span className="lbl strong">Version du jeu</span>
                  <select value={mc} disabled={!versions} onChange={(e) => setMc(e.target.value)}>
                    {(versions ?? []).map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  {!versions ? <small className="faint">Liste des versions de Minecraft inaccessible : vérifiez votre connexion.</small> : null}
                </label>
                {loader !== "Vanilla" ? (
                  <div className="field">
                    <span className="lbl strong">Version du loader</span>
                    <div className="chips">
                      {(["Stable", "Dernière", "Autre"] as const).map((m) => (
                        <button key={m} className="chip" aria-pressed={lvMode === m ? "true" : "false"} disabled={!lvList} onClick={() => setLvMode(m)}>
                          {lvMode === m ? `✓ ${m}` : m}
                        </button>
                      ))}
                    </div>
                    {lvErr ? <small className="cr-bad">{lvErr}</small> : !lvList ? <small className="faint">Vérification des versions de {loader}…</small> : null}
                    {lvList && lvMode === "Autre" ? (
                      <select value={lvOther} onChange={(e) => setLvOther(e.target.value)} aria-label={`Version de ${loader}`}>
                        {lvList.map((v) => (
                          <option key={v.version} value={v.version}>
                            {`${v.version}${v.recommended ? " (recommandée)" : v.stable ? "" : " (test)"}`}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {lvList && lvMode === "Stable" ? <small className="faint">{`Version recommandée au lancement : ${lvList.find((v) => v.recommended)?.version ?? lvList[0]?.version ?? "?"}`}</small> : null}
                    {lvList && lvMode === "Dernière" ? <small className="faint">{`${lvList[0]?.version ?? "?"}${lvList[0] && !lvList[0].stable ? " : version de test, peut être instable" : ""}`}</small> : null}
                  </div>
                ) : null}
              </div>
              <div className="mfoot">
                <button className="btn" onClick={() => setStep("choose")}>
                  ← Retour
                </button>
                <button className="btn pri" onClick={create} disabled={!canCreate}>
                  {busy ? "Création…" : "+ Créer l'instance"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <IconEditor
        open={editIcon}
        name={display}
        current={icon?.view ?? null}
        fallback={FALLBACK}
        onCancel={() => setEditIcon(false)}
        onSave={(choice, view) => {
          setEditIcon(false);
          setIcon(choice && view ? { choice, view } : null);
        }}
      />
    </>
  );
}
