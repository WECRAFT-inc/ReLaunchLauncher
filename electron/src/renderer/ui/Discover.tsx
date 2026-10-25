// Page Découvrir : modpacks, mods, packs de ressources et shaders de Modrinth (inspirée de Modrinth).
// - Modpacks : installés dans une nouvelle instance (format .mrpack, fichiers vérifiés par SHA-512).
// - Mods : ajoutés à « Mon modpack » pour créer ou modifier un WePack (lot E7, port de la version Python).
// - Packs de ressources et shaders : installés dans l'instance choisie (resourcepacks / shaderpacks).
// Chaque résultat ouvre sa page (description, versions, galerie, compatibilité). Images servies par ReLaunch,
// avec une image de remplacement si elles manquent.
import { useEffect, useRef, useState } from "react";
import type { ModpackJob, ModpackRoot, PackRowView, ProjectHit, ProjectType } from "../../shared/api";
import { useApp, type MpDraft } from "./ctx";
import { Ic } from "./Ic";
import { JobView, useJob } from "./Import";
import { CATEGORY_FR } from "./model";
import { fromNow, LOADER_NAME, ProjectPage, ProjIcon, shortCount, TYPE_LABEL } from "./ProjectPage";
import { t } from "./i18n";

export { CATEGORY_FR };

const TABS: [ProjectType, string][] = [
  ["modpack", "Modpacks"],
  ["mod", "Mods"],
  ["resourcepack", "Packs de ressources"],
  ["shader", "Shaders"],
];
const MOD_LOADERS = ["Fabric", "Forge", "NeoForge", "Quilt"] as const;
const TAB_LOADERS: Record<ProjectType, string[]> = { modpack: [...MOD_LOADERS], mod: [...MOD_LOADERS], resourcepack: [], shader: ["Iris", "OptiFine"] };
const TAB_CATS: Record<ProjectType, string[]> = {
  modpack: ["adventure", "challenging", "combat", "kitchen-sink", "lightweight", "magic", "multiplayer", "optimization", "quests", "technology"],
  mod: ["adventure", "decoration", "economy", "equipment", "food", "game-mechanics", "library", "magic", "management", "minigame", "mobs", "optimization", "social", "storage", "technology", "transportation", "utility", "worldgen"],
  resourcepack: ["16x", "32x", "64x", "128x", "realistic", "simplistic", "vanilla-like", "themed", "cartoon", "fantasy", "gui", "fonts", "audio"],
  shader: ["realistic", "semi-realistic", "cartoon", "fantasy", "vanilla-like", "atmosphere", "shadows", "reflections", "path-tracing", "colored-lighting", "potato", "low", "medium", "high"],
};
const SORTS: [string, string | null][] = [
  ["Pertinence", null],
  ["Téléchargements", "downloads"],
  ["Favoris", "follows"],
  ["Plus récents", "newest"],
  ["Mis à jour", "updated"],
];
const START_ERRORS: Record<string, string> = {
  busy: "Une opération est en cours : réessayez dans un instant.",
  invalid: "Informations invalides : vérifiez le nom, la version et le loader.",
  empty: "Ajoutez d'abord au moins un mod (bouton Ajouter dans les résultats).",
  unchanged: "Aucune modification à enregistrer.",
};
const TONES: Record<string, string> = { warn: "var(--bad)", orphan: "var(--warn)", dep: "var(--acc-2)", muted: "var(--ink-faint)" };

export function Discover() {
  const { mp, setMp, toast, show, refreshInstances, ui, setUi, inst } = useApp();
  const [tab, setTab] = useState<ProjectType>((TABS.find((t) => t[0] === ui.dtab)?.[0] ?? "modpack") as ProjectType);
  const [versions, setVersions] = useState<string[] | null>(null);
  const [query, setQuery] = useState(ui.dq || "");
  const [sort, setSort] = useState<string | null>(null);
  const [cat, setCat] = useState("");
  const [mcF, setMcF] = useState("");
  const [loaderF, setLoaderF] = useState("");
  const [hits, setHits] = useState<ProjectHit[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [rows, setRows] = useState<PackRowView[]>([]);
  const [confirm, setConfirm] = useState(false);
  const seq = useRef(0);
  const packJob = useJob((s) => {
    if (s.phase === "termine") {
      refreshInstances();
      setMp((d) => ({ ...(d.edit ? { ...d, edit: null } : d), selected: [], name: d.edit ? "Mon modpack" : d.name }));
    }
  });
  const quick = useJob((s) => s.phase === "termine" && refreshInstances());
  const editing = !!mp.edit;
  const busy = packJob.job?.phase === "en-cours" || quick.job?.phase === "en-cours";

  // demande venue de « Créer un WePack » (recherche, onglet) : prise une fois puis oubliée
  useEffect(() => {
    if (ui.dq || ui.dtab) setUi({ dq: "", dtab: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (mp.edit) setTab("mod");
  }, [mp.edit]);
  useEffect(() => {
    void window.wecraft.modpacks.versions().then((v) => {
      setVersions(v);
      if (v && v.length && !mp.mc) setMp((d) => ({ ...d, mc: v[0]! }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!target && inst.length) setTarget(inst[0]!.id);
  }, [inst, target]);

  // Mods : la version et le loader sont ceux de « Mon modpack » (tout ajout doit être compatible)
  const mc = tab === "mod" ? mp.mc : mcF;
  const loader = tab === "mod" ? mp.loader : loaderF;
  const search = (offset: number) => {
    if (tab === "mod" && !mp.mc) return;
    const my = ++seq.current;
    setSearching(true);
    void window.wecraft.projects.search({ type: tab, query, mc, loader, sort, offset, categories: cat ? [cat] : [] }).then((r) => {
      if (my !== seq.current) return;
      setSearching(false);
      if (!r.ok) return setErr(r.message);
      setErr(null);
      setTotal(r.total);
      setHits((h) => (offset ? [...h, ...r.hits] : r.hits));
    });
  };
  useEffect(() => {
    const t = window.setTimeout(() => search(0), 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, query, sort, cat, mc, loader]);
  useEffect(() => {
    void window.wecraft.modpacks.rows(mp.edit?.id ?? null, mp.selected).then(setRows);
  }, [mp.selected, mp.edit]);

  const selectedIds = new Set(mp.selected.map((m) => m.project_id));
  const togglePack = (h: { id: string; title: string }) =>
    setMp((d) => ({ ...d, selected: selectedIds.has(h.id) ? d.selected.filter((m) => m.project_id !== h.id) : [...d.selected, { project_id: h.id, title: h.title }] }));
  const removeMod = (id: string) => setMp((d) => ({ ...d, selected: d.selected.filter((m) => m.project_id !== id) }));
  const targetInst = inst.find((i) => i.id === target);

  /** Installation rapide depuis la liste : dernière version stable compatible avec les filtres. */
  const quickInstall = (h: ProjectHit) => {
    const forInst = tab === "resourcepack" || tab === "shader";
    if (forInst && !target) return toast("Choisis d'abord l'instance où installer.");
    const vMc = forInst ? (targetInst?.v ?? "") : mcF;
    void window.wecraft.projects.versions(h.id, vMc || undefined, tab === "modpack" ? loaderF || undefined : undefined).then((r) => {
      if (!Array.isArray(r)) return toast(r.error);
      const best = r.find((v) => v.channel === "release") ?? r[0];
      if (!best) return toast(vMc ? `Aucune version de « ${h.title} » pour Minecraft ${vMc} : ouvre sa page pour en choisir une autre.` : `Aucune version publiée pour « ${h.title} ».`);
      if (tab === "modpack")
        void window.wecraft.modpacks.installVersion(best.id, h.title).then((x) => (x.ok ? quick.follow(x.job) : toast(START_ERRORS[x.reason] ?? "Installation impossible.")));
      else
        void window.wecraft.projects.installFile(target, best.id).then((x) => toast(x.ok ? `« ${x.file} » installé dans ${x.dir} de « ${targetInst?.n ?? ""} ».` : x.message));
    });
  };

  const go = () => {
    setConfirm(false);
    const p = mp.edit ? window.wecraft.modpacks.edit(mp.edit.id, mp.selected) : window.wecraft.modpacks.create({ name: mp.name.trim(), mc: mp.mc, loader: mp.loader, roots: mp.selected });
    void p.then((r) => {
      if (!r.ok) return toast(r.reason === "exists" ? `Une instance « ${r.name ?? ""} » existe déjà. Choisissez un autre nom.` : START_ERRORS[r.reason]!);
      packJob.follow(r.job);
    });
  };
  const ask = () => {
    if (!mp.edit && (!mp.name.trim() || !mp.mc)) return toast("Indiquez un nom et une version de Minecraft.");
    if (!mp.selected.length) return toast(mp.edit ? "Un modpack doit contenir au moins un mod. Pour le supprimer, utilisez la corbeille dans WeCraft." : START_ERRORS["empty"]!);
    const oldIds = new Set((mp.edit?.old ?? []).map((m) => m.project_id));
    if (mp.edit && !mp.selected.some((m) => !oldIds.has(m.project_id))) return go();
    setConfirm(true);
  };

  const panel = tab === "mod" || editing || mp.selected.length > 0;
  return (
    <>
      <div className="vhead">
        <div>
          <h2>{t("Découvrir")}</h2>
          <div className="sub">{t("Modpacks, mods, packs de ressources et shaders de Modrinth")}</div>
        </div>
      </div>
      {editing ? (
        <div className="card mp-edit">
          <span>
            <b>{`Modification · ${mp.edit!.name}`}</b>
            <small className="faint">{` (${mp.edit!.mc} · ${mp.edit!.loader}) : version et loader restent ceux du modpack`}</small>
          </span>
          <button className="btn sm" onClick={() => setMp(() => ({ name: "Mon modpack", mc: versions?.[0] ?? mp.mc, loader: "Fabric", selected: [], edit: null }))} disabled={busy}>
            {t("Quitter la modification")}
          </button>
        </div>
      ) : null}
      <div className="tabs" id="dTabs">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            className="chip"
            aria-pressed={tab === k ? "true" : "false"}
            disabled={editing && k !== "mod"}
            onClick={() => {
              setTab(k);
              setCat("");
              setLoaderF("");
              setOpen(null);
            }}
          >
            {t(l)}
          </button>
        ))}
      </div>
      <JobView job={quick.job} />
      {quick.job?.phase === "termine" ? (
        <button className="btn sm" onClick={() => show("wecraft")}>
          {t("Voir dans WeCraft")}
        </button>
      ) : null}
      <div className={panel ? "mp-grid" : ""}>
        <div className="sect">
          {open ? (
            <ProjectPage
              id={open}
              onBack={() => setOpen(null)}
              ctx={{ inPack: selectedIds.has(open), togglePack, packMc: mp.mc, packLoader: mp.loader, target, setTarget }}
            />
          ) : (
            <>
              <div className="toolbar dtools">
                <input type="search" placeholder={`Rechercher des ${TABS.find((t) => t[0] === tab)![1].toLowerCase()}…`} aria-label={t("Rechercher")} value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, minWidth: "200px" }} />
                <select aria-label={t("Trier par")} value={sort ?? ""} onChange={(e) => setSort(e.target.value || null)}>
                  {SORTS.map(([l, v]) => (
                    <option key={l} value={v ?? ""}>
                      {`Trier : ${l}`}
                    </option>
                  ))}
                </select>
                {tab !== "mod" ? (
                  <select aria-label={t("Version de Minecraft")} value={mcF} onChange={(e) => setMcF(e.target.value)}>
                    <option value="">{t("Toutes les versions")}</option>
                    {(versions ?? []).map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : null}
                {tab !== "mod" && TAB_LOADERS[tab].length ? (
                  <select aria-label={t("Loader")} value={loaderF} onChange={(e) => setLoaderF(e.target.value)}>
                    <option value="">{tab === "shader" ? "Iris et OptiFine" : "Tous les loaders"}</option>
                    {TAB_LOADERS[tab].map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                ) : null}
                <select aria-label={t("Catégorie")} value={cat} onChange={(e) => setCat(e.target.value)}>
                  <option value="">{t("Toutes les catégories")}</option>
                  {TAB_CATS[tab]
                    .map((k) => [k, CATEGORY_FR[k] ?? k] as const)
                    .sort((a, b) => a[1].localeCompare(b[1], "fr"))
                    .map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                </select>
                {tab === "resourcepack" || tab === "shader" ? (
                  <select aria-label={t("Instance où installer")} value={target} onChange={(e) => setTarget(e.target.value)}>
                    {inst.length ? null : <option value="">{t("Aucune instance")}</option>}
                    {inst.map((i) => (
                      <option key={i.id} value={i.id}>
                        {`Installer dans : ${i.n}`}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
              {tab === "mod" ? <small className="faint">{`Résultats compatibles avec Mon modpack : Minecraft ${mp.mc || "?"} · ${mp.loader}.`}</small> : null}
              {tab === "shader" ? <small className="faint">{t("Les shaders demandent Iris (Fabric, Quilt, NeoForge) ou OptiFine dans l'instance.")}</small> : null}
              {err ? <div className="empty">{err}</div> : null}
              {!err && !hits.length && !searching ? <div className="empty">{tab === "mod" && !mp.mc ? "Liste des versions de Minecraft inaccessible : vérifiez votre connexion." : "Aucun résultat pour cette recherche."}</div> : null}
              {!err && total ? <small className="faint">{`${total.toLocaleString("fr-FR")} résultats`}</small> : null}
              <div className="mp-results">
                {hits.map((h) => {
                  const on = selectedIds.has(h.id);
                  return (
                    <div key={h.id} className="card proj2" data-a={`proj-${h.id}`}>
                      <button className="proj2-ico" onClick={() => setOpen(h.id)} aria-label={`Page de ${h.title}`}>
                        <ProjIcon src={h.icon} title={h.title} size={72} />
                      </button>
                      <span className="mp-txt">
                        <span className="proj2-title">
                          <button className="lnk" onClick={() => setOpen(h.id)}>
                            {h.title}
                          </button>
                          {h.author ? <small className="faint">{`par ${h.author}`}</small> : null}
                        </span>
                        <small className="muted">{h.description}</small>
                        <span className="mp-tags">
                          {h.clientSide && h.serverSide ? (
                            <span className="tag">{h.clientSide !== "unsupported" && h.serverSide !== "unsupported" ? "Client et serveur" : h.serverSide === "unsupported" ? "Client" : "Serveur"}</span>
                          ) : null}
                          {h.categories.slice(0, 6).map((c) => (
                            <span key={c} className={`tag${LOADER_NAME[c] ? " ldr" : ""}`}>
                              {CATEGORY_FR[c] ?? LOADER_NAME[c] ?? c}
                            </span>
                          ))}
                        </span>
                      </span>
                      <span className="proj2-side">
                        {tab === "mod" ? (
                          <button className={`btn sm${on ? "" : " pri"}`} aria-pressed={on ? "true" : "false"} onClick={() => togglePack(h)} disabled={busy}>
                            {on ? "✓ Ajouté" : "+ Ajouter"}
                          </button>
                        ) : (
                          <button className="btn sm pri" onClick={() => quickInstall(h)} disabled={busy}>
                            {t("+ Installer")}
                          </button>
                        )}
                        <small>
                          <Ic n="dl" />
                          <b>{shortCount(h.downloads)}</b> · ♡ {shortCount(h.follows)}
                        </small>
                        {h.updated ? <small className="faint">{`Mis à jour ${fromNow(h.updated)}`}</small> : null}
                      </span>
                    </div>
                  );
                })}
              </div>
              {hits.length && hits.length < total ? (
                <button className="btn" onClick={() => search(hits.length)} disabled={searching}>
                  {searching ? "Recherche…" : "Charger plus"}
                </button>
              ) : null}
            </>
          )}
        </div>
        {panel ? (
          <PackPanel
            mp={mp}
            setMp={setMp}
            versions={versions}
            rows={rows}
            busy={busy}
            editing={editing}
            confirm={confirm}
            setConfirm={setConfirm}
            ask={ask}
            go={go}
            job={packJob.job}
            onRemove={removeMod}
            onSeeAll={() => show("wecraft")}
          />
        ) : null}
      </div>
    </>
  );
}

function PackPanel(p: {
  mp: MpDraft;
  setMp: (fn: (d: MpDraft) => MpDraft) => void;
  versions: string[] | null;
  rows: PackRowView[];
  busy: boolean;
  editing: boolean;
  confirm: boolean;
  setConfirm: (b: boolean) => void;
  ask: () => void;
  go: () => void;
  job: ModpackJob | null;
  onRemove: (id: string) => void;
  onSeeAll: () => void;
}) {
  const { mp, setMp, versions, rows, busy, editing } = p;
  return (
    <div className="card mp-pack">
      <h3>{editing ? "Mon modpack (modification)" : "Mon modpack"}</h3>
      <label className="field">
        {t("Nom")}
        <input type="text" value={mp.name} readOnly={editing} onChange={(e) => setMp((d) => ({ ...d, name: e.target.value }))} aria-label={t("Nom du modpack")} />
      </label>
      <label className="field">
        {t("Version de Minecraft")}
        <select value={mp.mc} disabled={editing || !versions} onChange={(e) => setMp((d) => ({ ...d, mc: e.target.value }))} aria-label={t("Version de Minecraft")}>
          {(versions ?? (mp.mc ? [mp.mc] : [])).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        {t("Loader")}
        <div className="chips">
          {MOD_LOADERS.map((l) => (
            <button key={l} className="chip" aria-pressed={mp.loader === l ? "true" : "false"} disabled={editing} onClick={() => setMp((d) => ({ ...d, loader: l }))}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="mp-rows">
        {rows.length ? (
          rows.map((r) => (
            <div key={r.id} className="mp-row">
              <span>
                {r.title}
                {r.note ? <small style={{ color: TONES[r.tone] }}>{` ${r.note}`}</small> : null}
              </span>
              {r.kind === "root" || r.kind === "missing" ? (
                <button className="ib" aria-label={`Retirer ${r.title}`} onClick={() => p.onRemove(r.id)} disabled={busy}>
                  ✕
                </button>
              ) : null}
            </div>
          ))
        ) : (
          <small className="faint">{t("Aucun mod pour l'instant : ajoute-en depuis l'onglet Mods.")}</small>
        )}
      </div>
      {p.confirm ? (
        <div className="mp-notice">
          <p>{`Chaque mod choisi est téléchargé dans sa dernière version sortie compatible avec Minecraft ${mp.mc} (${mp.loader}), en version stable si possible.`}</p>
          <p className="muted">{t("Pour utiliser une autre version d'un mod, il faudra la chercher vous-même (bouton de la page Modrinth), puis la déposer dans le dossier « mods » de l'instance à la place du fichier d'origine.")}</p>
          <span className="row" style={{ justifyContent: "flex-end", gap: "8px" }}>
            <button className="btn sm" onClick={() => p.setConfirm(false)}>
              {t("Annuler")}
            </button>
            <button className="btn sm pri" onClick={p.go}>
              {editing ? "Enregistrer" : "Créer l'instance"}
            </button>
          </span>
        </div>
      ) : (
        <button className="btn pri" onClick={p.ask} disabled={busy}>
          {editing ? "Enregistrer les modifications" : "Créer l'instance"}
        </button>
      )}
      <JobView job={p.job} />
      {p.job?.phase === "termine" ? (
        <button className="btn sm" onClick={p.onSeeAll}>
          {t("Voir dans WeCraft")}
        </button>
      ) : null}
    </div>
  );
}

export const emptyDraft = (): MpDraft => ({ name: "Mon modpack", mc: "", loader: "Fabric", selected: [] as ModpackRoot[], edit: null });
export { TYPE_LABEL };
