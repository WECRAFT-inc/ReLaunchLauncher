// Page Découvrir (lot E7) : mods Modrinth, création et modification d'un WePack.
// Port de l'onglet « Modpacks » de wecraft_launcher.py (recherche, sélection, « Mon modpack », création).
import { useEffect, useRef, useState } from "react";
import type { ModpackHit, ModpackJob, ModpackRoot, PackRowView } from "../../shared/api";
import { useApp, type MpDraft } from "./ctx";
import { Ic } from "./Ic";

const LOADERS = ["Fabric", "Forge", "NeoForge", "Quilt"] as const;
const SORTS: [string, string | null][] = [
  ["Pertinence", null],
  ["Téléchargements", "downloads"],
  ["Favoris", "follows"],
  ["Plus récents", "newest"],
  ["Mis à jour", "updated"],
];
export const CATEGORY_FR: Record<string, string> = {
  optimization: "Optimisation", decoration: "Décoration", library: "Bibliothèque", utility: "Utilitaire", technology: "Technologie",
  adventure: "Aventure", magic: "Magie", storage: "Stockage", equipment: "Équipement", food: "Nourriture", "game-mechanics": "Mécaniques",
  mobs: "Créatures", worldgen: "Génération", transportation: "Transport", social: "Social", economy: "Économie", cursed: "Maudit",
  management: "Gestion", minigame: "Mini-jeu",
};
const START_ERRORS: Record<string, string> = {
  busy: "Une opération est en cours : réessayez dans un instant.",
  invalid: "Informations invalides : vérifiez le nom, la version et le loader.",
  empty: "Ajoutez d'abord au moins un mod (bouton Ajouter dans les résultats).",
  unchanged: "Aucune modification à enregistrer.",
};
const TONES: Record<string, string> = { warn: "var(--bad)", orphan: "var(--warn)", dep: "var(--acc-2)", muted: "var(--ink-faint)" };

function shortCount(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

export function Discover() {
  const { mp, setMp, toast, show, refreshInstances } = useApp();
  const [versions, setVersions] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<string | null>(null);
  const [cat, setCat] = useState("");
  const [hits, setHits] = useState<ModpackHit[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [rows, setRows] = useState<PackRowView[]>([]);
  const [job, setJob] = useState<ModpackJob | null>(null);
  const [confirm, setConfirm] = useState(false);
  const seq = useRef(0);
  const poll = useRef<number | null>(null);
  const editing = !!mp.edit;
  const busy = job?.phase === "en-cours";

  useEffect(() => {
    void window.wecraft.modpacks.versions().then((v) => {
      setVersions(v);
      if (v && v.length && !mp.mc) setMp((d) => ({ ...d, mc: v[0]! }));
    });
    return () => void (poll.current !== null && window.clearInterval(poll.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = (offset: number) => {
    if (!mp.mc) return;
    const my = ++seq.current;
    setSearching(true);
    void window.wecraft.modpacks
      .search({ query, mc: mp.mc, loader: mp.loader, offset, categories: cat ? [cat] : [], sort })
      .then((r) => {
        if (my !== seq.current) return;
        setSearching(false);
        if (!r.ok) {
          setErr(r.message);
          return;
        }
        setErr(null);
        setTotal(r.total);
        setHits((h) => (offset ? [...h, ...r.hits] : r.hits));
      });
  };
  useEffect(() => {
    const t = window.setTimeout(() => search(0), 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sort, cat, mp.mc, mp.loader]);

  useEffect(() => {
    void window.wecraft.modpacks.rows(mp.edit?.id ?? null, mp.selected).then(setRows);
  }, [mp.selected, mp.edit]);

  const selectedIds = new Set(mp.selected.map((m) => m.project_id));
  const toggle = (h: ModpackHit) =>
    setMp((d) => ({ ...d, selected: selectedIds.has(h.id) ? d.selected.filter((m) => m.project_id !== h.id) : [...d.selected, { project_id: h.id, title: h.title }] }));
  const remove = (id: string) => setMp((d) => ({ ...d, selected: d.selected.filter((m) => m.project_id !== id) }));

  const follow = (id: string) => {
    if (poll.current !== null) window.clearInterval(poll.current);
    const tick = () =>
      void window.wecraft.modpacks.status(id).then((s) => {
        if (!s) return;
        setJob(s);
        if (s.phase !== "en-cours" && poll.current !== null) {
          window.clearInterval(poll.current);
          poll.current = null;
          if (s.phase === "termine") {
            refreshInstances();
            setMp((d) => ({ ...(d.edit ? { ...d, edit: null } : d), selected: [], name: d.edit ? "Mon modpack" : d.name }));
          }
        }
      });
    poll.current = window.setInterval(tick, 300);
    tick();
  };
  const go = () => {
    setConfirm(false);
    const p = mp.edit
      ? window.wecraft.modpacks.edit(mp.edit.id, mp.selected)
      : window.wecraft.modpacks.create({ name: mp.name.trim(), mc: mp.mc, loader: mp.loader, roots: mp.selected });
    void p.then((r) => {
      if (!r.ok) {
        toast(r.reason === "exists" ? `Une instance « ${r.name ?? ""} » existe déjà. Choisissez un autre nom.` : START_ERRORS[r.reason]!);
        return;
      }
      follow(r.job);
    });
  };
  const ask = () => {
    if (!mp.edit && (!mp.name.trim() || !mp.mc)) return toast("Indiquez un nom et une version de Minecraft.");
    if (!mp.selected.length) return toast(mp.edit ? "Un modpack doit contenir au moins un mod. Pour le supprimer, utilisez la corbeille dans WeCraft." : START_ERRORS["empty"]!);
    const oldIds = new Set((mp.edit?.old ?? []).map((m) => m.project_id));
    if (mp.edit && !mp.selected.some((m) => !oldIds.has(m.project_id))) return go(); // rien à télécharger : pas d'avertissement
    setConfirm(true);
  };

  return (
    <>
      <div className="vhead">
        <div>
          <h2>Découvrir</h2>
          <div className="sub">Mods Modrinth : crée un WePack ou modifie un des tiens</div>
        </div>
      </div>
      {editing ? (
        <div className="card mp-edit">
          <span>
            <b>{`Modification · ${mp.edit!.name}`}</b>
            <small className="faint">{` (${mp.edit!.mc} · ${mp.edit!.loader}) : version et loader restent ceux du modpack`}</small>
          </span>
          <button className="btn sm" onClick={() => setMp(() => ({ name: "Mon modpack", mc: versions?.[0] ?? mp.mc, loader: "Fabric", selected: [], edit: null }))} disabled={busy}>
            Quitter la modification
          </button>
        </div>
      ) : null}
      <div className="mp-grid">
        <div className="sect">
          <div className="toolbar">
            <input type="search" placeholder="Rechercher des mods sur Modrinth" aria-label="Rechercher des mods" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1 }} />
            <select aria-label="Trier par" value={sort ?? ""} onChange={(e) => setSort(e.target.value || null)}>
              {SORTS.map(([l, v]) => (
                <option key={l} value={v ?? ""}>
                  {l}
                </option>
              ))}
            </select>
            <select aria-label="Catégorie" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">Toutes les catégories</option>
              {Object.entries(CATEGORY_FR)
                .sort((a, b) => a[1].localeCompare(b[1], "fr"))
                .map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
            </select>
          </div>
          {err ? <div className="empty">{err}</div> : null}
          {!err && !hits.length && !searching ? <div className="empty">{mp.mc ? "Aucun mod trouvé pour cette recherche." : "Liste des versions de Minecraft inaccessible : vérifiez votre connexion."}</div> : null}
          <div className="mp-results">
            {hits.map((h) => {
              const on = selectedIds.has(h.id);
              return (
                <div key={h.id} className="card mp-hit" data-a={`mp-${h.id}`}>
                  <span className="mp-ico" aria-hidden="true">
                    {h.title.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="mp-txt">
                    <b>{h.title}</b>
                    <small className="faint">{h.author ? `par ${h.author} · ${shortCount(h.downloads)} téléchargements` : `${shortCount(h.downloads)} téléchargements`}</small>
                    <small className="muted">{h.description}</small>
                    <span className="mp-tags">
                      {h.categories
                        .filter((c) => CATEGORY_FR[c])
                        .map((c) => (
                          <span key={c} className="tag">
                            {CATEGORY_FR[c]}
                          </span>
                        ))}
                    </span>
                  </span>
                  <span className="mp-acts">
                    <button className={`btn sm${on ? "" : " pri"}`} aria-pressed={on ? "true" : "false"} onClick={() => toggle(h)} disabled={busy}>
                      {on ? "✓ Ajouté" : "Ajouter"}
                    </button>
                    {h.slug ? (
                      <button className="ib" aria-label={`Page de ${h.title} sur Modrinth`} title="Page Modrinth" onClick={() => void window.wecraft.modpacks.openPage(h.slug!)}>
                        <Ic n="ext" />
                      </button>
                    ) : null}
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
        </div>
        <div className="card mp-pack">
          <h3>{editing ? "Mon modpack (modification)" : "Mon modpack"}</h3>
          <label className="field">
            Nom
            <input type="text" value={mp.name} readOnly={editing} onChange={(e) => setMp((d) => ({ ...d, name: e.target.value }))} aria-label="Nom du modpack" />
          </label>
          <label className="field">
            Version de Minecraft
            <select value={mp.mc} disabled={editing || !versions} onChange={(e) => setMp((d) => ({ ...d, mc: e.target.value }))} aria-label="Version de Minecraft">
              {(versions ?? (mp.mc ? [mp.mc] : [])).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            Loader
            <div className="chips">
              {LOADERS.map((l) => (
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
                    {r.note ? (
                      <small style={{ color: TONES[r.tone] }}>{` ${r.note}`}</small>
                    ) : null}
                  </span>
                  {r.kind === "root" || r.kind === "missing" ? (
                    <button className="ib" aria-label={`Retirer ${r.title}`} onClick={() => remove(r.id)} disabled={busy}>
                      ✕
                    </button>
                  ) : null}
                </div>
              ))
            ) : (
              <small className="faint">Aucun mod pour l'instant : ajoute-en depuis les résultats.</small>
            )}
          </div>
          {confirm ? (
            <div className="mp-notice">
              <p>{`Chaque mod choisi est téléchargé dans sa dernière version sortie compatible avec Minecraft ${mp.mc} (${mp.loader}), en version stable si possible.`}</p>
              <p className="muted">
                Pour utiliser une autre version d'un mod, il faudra la chercher vous-même (bouton de la page Modrinth), puis la déposer dans le dossier « mods » de l'instance à la place du fichier d'origine.
              </p>
              <span className="row" style={{ justifyContent: "flex-end", gap: "8px" }}>
                <button className="btn sm" onClick={() => setConfirm(false)}>
                  Annuler
                </button>
                <button className="btn sm pri" onClick={go}>
                  {editing ? "Enregistrer" : "Créer l'instance"}
                </button>
              </span>
            </div>
          ) : (
            <button className="btn pri" onClick={ask} disabled={busy}>
              {editing ? "Enregistrer les modifications" : "Créer l'instance"}
            </button>
          )}
          {job ? (
            <div className="mp-job" role="status">
              {job.phase === "en-cours" ? (
                <div className="lbar">
                  <i style={{ width: job.total ? `${Math.round((100 * job.done) / job.total)}%` : "0" }}></i>
                </div>
              ) : null}
              <small style={{ whiteSpace: "pre-line", color: job.phase === "erreur" ? "var(--bad)" : undefined }}>{job.phase === "erreur" ? `L'opération n'a pas abouti :\n${job.message}` : job.message}</small>
              {job.warnings.length ? (
                <small className="muted" style={{ whiteSpace: "pre-line" }}>
                  {`À vérifier :\n- ${job.warnings.join("\n- ")}`}
                </small>
              ) : null}
              {job.phase === "termine" ? (
                <button className="btn sm" onClick={() => show("wecraft")}>
                  Voir dans WeCraft
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

export const emptyDraft = (): MpDraft => ({ name: "Mon modpack", mc: "", loader: "Fabric", selected: [] as ModpackRoot[], edit: null });
