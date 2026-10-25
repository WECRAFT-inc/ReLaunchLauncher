// Page d'un projet Modrinth dans ReLaunch (inspirée des pages de projet de Modrinth) : description, versions,
// galerie, compatibilité, licence, liens, dates, état d'installation et actions possibles selon le type.
// Tout vient de l'API Modrinth via le processus principal ; un champ absent n'est jamais inventé.
import { useEffect, useMemo, useState } from "react";
import type { ProjectType, ProjectVersion, ProjectView } from "../../shared/api";
import { useApp } from "./ctx";
import { Ic } from "./Ic";
import { JobView, useJob } from "./Import";
import { MdView } from "./MdView";
import { CATEGORY_FR } from "./model";
import { useEscapeLayer } from "./keys";

export const TYPE_LABEL: Record<ProjectType, string> = { modpack: "Modpack", mod: "Mod", resourcepack: "Pack de ressources", shader: "Shader" };
const SIDE: Record<string, string> = { required: "requis", optional: "facultatif", unsupported: "non pris en charge" };
export const LOADER_NAME: Record<string, string> = { fabric: "Fabric", forge: "Forge", neoforge: "NeoForge", quilt: "Quilt", iris: "Iris", optifine: "OptiFine", canvas: "Canvas", vanilla: "Vanilla", minecraft: "Minecraft", datapack: "Data pack" };

export function shortCount(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} k`;
  return String(n);
}
export function frDate(iso: string | null): string {
  if (!iso) return "non renseigné";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
export function fromNow(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const d = Math.max(0, now - Date.parse(iso));
  const day = 864e5;
  if (d < 36e5) return "il y a moins d'une heure";
  if (d < day) return `il y a ${Math.round(d / 36e5)} h`;
  const j = Math.round(d / day);
  if (j < 30) return j === 1 ? "hier" : `il y a ${j} jours`;
  const m = Math.round(j / 30);
  if (m < 12) return `il y a ${m} mois`;
  const y = Math.round(j / 365);
  return `il y a ${y} an${y > 1 ? "s" : ""}`;
}

/** Image de projet avec remplacement propre si elle manque ou ne se charge pas. */
export function ProjIcon({ src, title, size = 64 }: { src: string | null; title: string; size?: number }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  return (
    <span className="pj-ico" style={{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.4)}px` }} aria-hidden="true">
      {src && !bad ? <img src={src} alt="" loading="lazy" onError={() => setBad(true)} /> : <b>{title.slice(0, 1).toUpperCase() || "?"}</b>}
    </span>
  );
}

/** Versions de Minecraft condensées : « 1.21.1, 1.21, 1.20.6 … 1.16.5 » (les releases seulement). */
function mcSummary(list: string[]): string {
  const rel = list.filter((v) => /^\d+\.\d+(\.\d+)?$/.test(v));
  if (!rel.length) return list.slice(-3).join(", ") || "non renseigné";
  const sorted = [...rel].reverse();
  return sorted.length <= 6 ? sorted.join(", ") : `${sorted.slice(0, 4).join(", ")} … ${sorted[sorted.length - 1]} (${sorted.length} versions)`;
}

export interface ProjectContext {
  /** Mods : ajout au WePack en préparation (« Mon modpack »). */
  inPack: boolean;
  togglePack: (p: { id: string; title: string }) => void;
  packMc: string;
  packLoader: string;
  /** Packs de ressources et shaders : instance où installer. */
  target: string;
  setTarget: (id: string) => void;
}

export function ProjectPage({ id, onBack, ctx }: { id: string; onBack: () => void; ctx: ProjectContext }) {
  const { inst, toast, refreshInstances, show } = useApp();
  const [p, setP] = useState<ProjectView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"desc" | "versions" | "gallery">("desc");
  const [versions, setVersions] = useState<ProjectVersion[] | null>(null);
  const [vErr, setVErr] = useState<string | null>(null);
  const [onlyCompat, setOnlyCompat] = useState(true);
  const [installed, setInstalled] = useState<string[]>([]);
  const [shot, setShot] = useState<number | null>(null);
  const { job, follow } = useJob((j) => j.phase === "termine" && refreshInstances());
  // Échap : ferme l'image agrandie, sinon revient aux résultats
  useEscapeLayer(true, onBack);
  useEscapeLayer(shot !== null, () => setShot(null));

  useEffect(() => {
    let alive = true;
    setP(null);
    setErr(null);
    setVersions(null);
    setTab("desc");
    void window.wecraft.projects.get(id).then((r) => {
      if (!alive) return;
      if ("error" in r) setErr(r.error);
      else setP(r);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const type = p?.type ?? null;
  const targetInst = inst.find((i) => i.id === ctx.target) ?? null;
  // filtre de compatibilité : WePack en préparation (mods) ou instance choisie (packs, shaders)
  const compatMc = type === "mod" ? ctx.packMc : type === "resourcepack" || type === "shader" ? (targetInst?.v ?? "") : "";
  const compatLoader = type === "mod" ? ctx.packLoader : "";

  useEffect(() => {
    if (!p) return;
    let alive = true;
    setVersions(null);
    setVErr(null);
    void window.wecraft.projects.versions(p.id, onlyCompat && compatMc ? compatMc : undefined, onlyCompat && compatLoader ? compatLoader : undefined).then((r) => {
      if (!alive) return;
      if (Array.isArray(r)) setVersions(r);
      else setVErr(r.error);
    });
    return () => {
      alive = false;
    };
  }, [p, onlyCompat, compatMc, compatLoader]);

  useEffect(() => {
    if (!p || (type !== "resourcepack" && type !== "shader") || !ctx.target) return setInstalled([]);
    void window.wecraft.projects.installed(ctx.target, type).then(setInstalled);
  }, [p, type, ctx.target]);

  const compat = useMemo(() => {
    if (!p) return null;
    if (type === "mod" && ctx.packMc) {
      const mcOk = p.mcVersions.includes(ctx.packMc);
      const key = ctx.packLoader.toLowerCase();
      const lOk = p.loaders.includes(key) || (key === "quilt" && p.loaders.includes("fabric"));
      if (!mcOk || !lOk) return `Incompatible avec ton WePack (Minecraft ${ctx.packMc} · ${ctx.packLoader}) : ${!mcOk ? `aucune version pour Minecraft ${ctx.packMc}` : `pas de version pour ${ctx.packLoader}`}.`;
    }
    if ((type === "resourcepack" || type === "shader") && targetInst?.v && p.mcVersions.length && !p.mcVersions.includes(targetInst.v))
      return `Aucune version indiquée pour Minecraft ${targetInst.v} (instance « ${targetInst.n} ») : elle peut quand même fonctionner, à vérifier.`;
    return null;
  }, [p, type, ctx.packMc, ctx.packLoader, targetInst]);

  const installVersion = (v: ProjectVersion) => {
    if (!p) return;
    if (type === "modpack") {
      void window.wecraft.modpacks.installVersion(v.id, p.title).then((r) => {
        if (r.ok) follow(r.job);
        else toast(r.reason === "busy" ? "Une opération est en cours : réessayez dans un instant." : "Installation impossible.");
      });
    } else if (type === "resourcepack" || type === "shader") {
      if (!ctx.target) return toast("Choisis d'abord l'instance où installer.");
      void window.wecraft.projects.installFile(ctx.target, v.id).then((r) => {
        if (r.ok) {
          toast(`« ${r.file} » installé dans ${r.dir} de « ${targetInst?.n ?? "l'instance"} ».`);
          setInstalled((l) => [...l, r.file]);
        } else toast(r.message);
      });
    }
  };
  const best = versions?.find((v) => v.channel === "release") ?? versions?.[0] ?? null;

  if (err)
    return (
      <div className="pj">
        <button className="btn sm" onClick={onBack}>
          ← Retour aux résultats
        </button>
        <div className="empty">{err}</div>
      </div>
    );
  if (!p)
    return (
      <div className="pj">
        <button className="btn sm" onClick={onBack}>
          ← Retour aux résultats
        </button>
        <div className="empty">Chargement de la page…</div>
      </div>
    );

  const action = () => {
    if (type === "mod")
      return (
        <button className={`btn${ctx.inPack ? "" : " pri"}`} disabled={!!compat && !ctx.inPack} onClick={() => ctx.togglePack({ id: p.id, title: p.title })}>
          {ctx.inPack ? "✓ Dans Mon modpack" : "+ Ajouter à Mon modpack"}
        </button>
      );
    if (type === "modpack")
      return (
        <button className="btn pri" disabled={!best || job?.phase === "en-cours"} onClick={() => best && installVersion(best)}>
          <Ic n="dl" />
          {best ? `Installer (${best.number})` : "Installer"}
        </button>
      );
    if (type === "resourcepack" || type === "shader")
      return (
        <span className="pj-target">
          <select value={ctx.target} onChange={(e) => ctx.setTarget(e.target.value)} aria-label="Instance où installer">
            <option value="">Choisir l'instance…</option>
            {inst.map((i) => (
              <option key={i.id} value={i.id}>
                {`${i.n} (${i.v || "?"})`}
              </option>
            ))}
          </select>
          <button className="btn pri" disabled={!best || !ctx.target} onClick={() => best && installVersion(best)}>
            <Ic n="dl" />
            Installer
          </button>
        </span>
      );
    return null;
  };

  return (
    <div className="pj">
      <button className="btn sm" onClick={onBack}>
        ← Retour aux résultats
      </button>
      <div className="pj-head card">
        <ProjIcon src={p.icon} title={p.title} size={84} />
        <div className="pj-title">
          <h2>{p.title}</h2>
          <small className="muted">{[type ? TYPE_LABEL[type] : null, p.author ? `par ${p.author}` : null].filter(Boolean).join(" · ")}</small>
          <p>{p.description}</p>
          <span className="pj-stats">
            <span>
              <Ic n="dl" />
              {`${shortCount(p.downloads)} téléchargements`}
            </span>
            <span>
              <Ic n="heart" />
              {`${shortCount(p.followers)} abonnés`}
            </span>
            {p.updated ? <span>{`Mis à jour ${fromNow(p.updated)}`}</span> : null}
          </span>
          <span className="mp-tags">
            {[...p.categories, ...p.extraCategories].slice(0, 10).map((c) => (
              <span key={c} className="tag">
                {CATEGORY_FR[c] ?? LOADER_NAME[c] ?? c}
              </span>
            ))}
          </span>
        </div>
        <div className="pj-act">
          {action()}
          {p.page ? (
            <button className="btn sm" onClick={() => void window.wecraft.projects.openLink(p.page!)}>
              <Ic n="ext" />
              Page Modrinth
            </button>
          ) : null}
        </div>
      </div>
      {compat ? <div className="pj-warn">{compat}</div> : null}
      <JobView job={job} />
      {job?.phase === "termine" ? (
        <button className="btn sm" onClick={() => show("wecraft")}>
          Voir dans WeCraft
        </button>
      ) : null}
      <div className="pj-grid">
        <div className="pj-main">
          <div className="chips pj-tabs" role="tablist">
            <button className="chip" role="tab" aria-pressed={tab === "desc" ? "true" : "false"} onClick={() => setTab("desc")}>
              Description
            </button>
            <button className="chip" role="tab" aria-pressed={tab === "versions" ? "true" : "false"} onClick={() => setTab("versions")}>
              {`Versions${versions ? ` (${versions.length}${versions.length === 100 ? "+" : ""})` : ""}`}
            </button>
            {p.gallery.length ? (
              <button className="chip" role="tab" aria-pressed={tab === "gallery" ? "true" : "false"} onClick={() => setTab("gallery")}>
                {`Galerie (${p.gallery.length})`}
              </button>
            ) : null}
          </div>
          {tab === "desc" ? (
            <div className="card">
              <MdView blocks={p.body} />
            </div>
          ) : null}
          {tab === "versions" ? (
            <div className="card pj-versions">
              {compatMc || compatLoader ? (
                <label className="pj-only">
                  <input type="checkbox" checked={onlyCompat} onChange={(e) => setOnlyCompat(e.target.checked)} />
                  {`Seulement les versions pour ${[compatMc && `Minecraft ${compatMc}`, compatLoader].filter(Boolean).join(" · ")}`}
                </label>
              ) : null}
              {vErr ? <div className="empty">{vErr}</div> : null}
              {!versions && !vErr ? <small className="faint">Chargement des versions…</small> : null}
              {versions && !versions.length ? <div className="empty">Aucune version publiée pour ce filtre.</div> : null}
              {versions?.map((v) => {
                const has = !!v.file && installed.includes(v.file.name);
                return (
                  <div key={v.id} className="pj-ver">
                    <span className={`pj-ch ${v.channel}`}>{v.channel === "release" ? "R" : v.channel === "beta" ? "B" : "A"}</span>
                    <span className="pj-vtxt">
                      <b>{v.name || v.number}</b>
                      <small className="muted">{`${v.number} · ${v.loaders.map((l) => LOADER_NAME[l] ?? l).join(", ") || "—"} · Minecraft ${mcSummary(v.mcVersions)}`}</small>
                      <small className="faint">{`${frDate(v.published)} · ${shortCount(v.downloads)} téléchargements${v.dependencies ? ` · ${v.dependencies} dépendance${v.dependencies > 1 ? "s" : ""} requise${v.dependencies > 1 ? "s" : ""}` : ""}${v.file ? ` · ${v.file.name}` : ""}`}</small>
                    </span>
                    {type === "modpack" || type === "resourcepack" || type === "shader" ? (
                      <button className="btn sm" disabled={has || (type !== "modpack" && !ctx.target) || job?.phase === "en-cours"} onClick={() => installVersion(v)}>
                        {has ? "✓ Installé" : "Installer"}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
          {tab === "gallery" ? (
            <div className="pj-gallery">
              {p.gallery.map((g, i) => (
                <button key={i} className="pj-shot card" onClick={() => setShot(i)} title={g.title ?? ""}>
                  <img src={g.url} alt={g.title ?? ""} loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                  {g.title ? <small>{g.title}</small> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <aside className="pj-side">
          <div className="card">
            <h4>Compatibilité</h4>
            <dl>
              <dt>Minecraft</dt>
              <dd>{mcSummary(p.mcVersions)}</dd>
              <dt>{type === "shader" ? "Nécessite" : "Loaders"}</dt>
              <dd>{p.loaders.map((l) => LOADER_NAME[l] ?? l).join(", ") || "non renseigné"}</dd>
              <dt>Client</dt>
              <dd>{p.clientSide ? SIDE[p.clientSide] : "non renseigné"}</dd>
              <dt>Serveur</dt>
              <dd>{p.serverSide ? SIDE[p.serverSide] : "non renseigné"}</dd>
            </dl>
          </div>
          <div className="card">
            <h4>Informations</h4>
            <dl>
              <dt>Licence</dt>
              <dd>
                {p.license ? (
                  p.license.token ? (
                    <a href="#" className="md-a" onClick={(e) => (e.preventDefault(), void window.wecraft.projects.openLink(p.license!.token!))}>
                      {p.license.name || p.license.id}
                    </a>
                  ) : (
                    p.license.name || p.license.id
                  )
                ) : (
                  "non renseignée"
                )}
              </dd>
              <dt>Publié</dt>
              <dd>{frDate(p.published)}</dd>
              <dt>Mis à jour</dt>
              <dd>{frDate(p.updated)}</dd>
            </dl>
          </div>
          {p.links.length ? (
            <div className="card pj-links">
              <h4>Liens</h4>
              {p.links.map((l) => (
                <button key={l.token} className="btn sm" onClick={() => void window.wecraft.projects.openLink(l.token)}>
                  <Ic n="ext" />
                  {l.label}
                </button>
              ))}
            </div>
          ) : null}
        </aside>
      </div>
      {shot !== null && p.gallery[shot] ? (
        <div className="overlay lightbox" onClick={() => setShot(null)}>
          <div className="pj-light" role="dialog" aria-modal="true" aria-label={p.gallery[shot]!.title ?? "Image"}>
            <img src={p.gallery[shot]!.url} alt={p.gallery[shot]!.title ?? ""} />
            {p.gallery[shot]!.title || p.gallery[shot]!.description ? <p>{[p.gallery[shot]!.title, p.gallery[shot]!.description].filter(Boolean).join(" — ")}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
