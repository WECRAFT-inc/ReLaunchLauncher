// Page d'une instance (ouverte depuis WeCraft) : en-tête, puis onglets Contenu, Fichiers, Mondes, Journaux.
// Le contenu est lu localement tout de suite ; icônes, auteurs et versions arrivent ensuite de Modrinth.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ContentItem, ContentKind, ContentList, ContentMeta, FileEntry, WorldView } from "../../shared/api";
import { useApp } from "./ctx";
import { Ic } from "./Ic";
import { Menu } from "./Menu";
import { InstIcon } from "./symbols";
import { ago, initials, INACTIVE_ID } from "./model";
import { instMenu, PinBtn } from "./Views";
import { t } from "./i18n";

const KIND_LABEL: Record<ContentKind, string> = { mod: "Mod", resourcepack: "Pack de ressources", shader: "Shader" };
const KIND_FILTERS: [string, string][] = [
  ["all", "Tout"],
  ["mod", "Mods"],
  ["resourcepack", "Packs de ressources"],
  ["shader", "Shaders"],
];
const SORTS: [string, string][] = [
  ["az", "Nom (A-Z)"],
  ["za", "Nom (Z-A)"],
  ["size", "Taille"],
  ["off", "Désactivés d'abord"],
];
const key = (i: ContentItem) => `${i.kind}/${i.file}`;
const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : n >= 1024 ? `${Math.round(n / 1024)} Ko` : `${n} o`);
const date = (ms: number) => new Date(ms).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

export function InstancePage() {
  const app = useApp();
  const { ui, byId, setUi, groups, setGroups, show } = app;
  const x = ui.page ? byId(ui.page) : undefined;
  if (!x) {
    return (
      <div className="card rl-empty">
        <b>{t("Instance introuvable")}</b>
        <p className="muted">{t("Elle a peut-être été supprimée ou renommée en dehors de ReLaunch.")}</p>
        <button className="btn sm" data-go="wecraft">
          {t("Retour à WeCraft")}
        </button>
      </div>
    );
  }
  const inactive = groups.some((g) => g.id === INACTIVE_ID && g.ids.includes(x.id));
  const moveTo = (gid: string) => setGroups((gs) => gs.map((g) => ({ ...g, ids: g.id === gid ? [...g.ids.filter((y) => y !== x.id), x.id] : g.ids.filter((y) => y !== x.id) })));
  const tabs: [string, string, string][] = [
    ["content", "Contenu", "mods"],
    ["files", "Fichiers", "folder"],
    ["worlds", "Mondes", "globe"],
    ["logs", "Journaux", "news"],
  ];
  return (
    <div className="ipage">
      <div className="ipage-head">
        <button className="ib ipage-back" onClick={() => show("wecraft")} aria-label={t("Retour à WeCraft")} title={t("Retour à WeCraft")}>
          ←
        </button>
        <InstIcon icon={x.icon} fallback={x.c} name={x.n} size={64} />
        <div className="ipage-title">
          <span className="row" style={{ justifyContent: "flex-start", gap: "10px" }}>
            <h2>{x.n}</h2>
            {x.ev ? <span className="ibadge">{t("Événement")}</span> : x.mp ? <span className="ibadge">WePack</span> : <span className="ibadge soft">{x.s}</span>}
            {x.fav ? <span className="ibadge star">★ {t("Favori")}</span> : null}
          </span>
          <span className="ipage-meta">
            <span>
              <Ic n="mods" />
              {`${[x.l, x.lv].filter(Boolean).join(" ")} ${x.v || "?"}`}
            </span>
            {x.r ? <span>{`${x.r} Go`}</span> : null}
            <span>
              <Ic n="clock" />
              {x.last ? `${t("Dernière fois joué")} : ${ago(x.last)}` : t("Jamais lancée")}
            </span>
          </span>
        </div>
        <div className="ipage-acts">
          <button className="btn play" data-play={x.id}>
            <Ic n="play" />
            {t("Jouer")}
          </button>
          <PinBtn id={x.id} />
          <button className="ib big" data-act="instEdit" data-id={x.id} aria-label={t("Réglages")} title={t("Réglages (nom, version, loader, RAM, icône, fond)")}>
            ⚙
          </button>
          <Menu className="ib big" items={instMenu(x, groups, moveTo, inactive).filter((m) => m === "sep" || m.data?.["act"] !== "openInst")} />
        </div>
      </div>
      <div className="itabs" role="tablist">
        {tabs.map(([k, l, ic]) => (
          <button key={k} role="tab" aria-selected={ui.itab === k ? "true" : "false"} onClick={() => setUi({ itab: k })}>
            <Ic n={ic} />
            {t(l)}
          </button>
        ))}
      </div>
      {ui.itab === "files" ? <FilesTab id={x.id} /> : ui.itab === "worlds" ? <WorldsTab id={x.id} /> : ui.itab === "logs" ? <GameLogTab id={x.id} /> : <ContentTab id={x.id} mp={!!x.mp} ev={!!x.ev} />}
    </div>
  );
}

function ContentTab({ id, mp, ev }: { id: string; mp: boolean; ev: boolean }) {
  const { toast } = useApp();
  const [list, setList] = useState<ContentList | null>(null);
  const [meta, setMeta] = useState<Record<string, ContentMeta>>({});
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState("az");
  const [showPack, setShowPack] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    (details: boolean) => {
      void window.wecraft.content.list(id).then((l) => {
        setList(l);
        if (details && l) void window.wecraft.content.details(id).then(setMeta, () => undefined);
      });
    },
    [id],
  );
  useEffect(() => {
    setList(null);
    setMeta({});
    setSel(new Set());
    load(true);
  }, [id, load]);

  const name = (i: ContentItem) => meta[key(i)]?.title || i.name;
  const shown = useMemo(() => {
    if (!list) return [];
    const n = q.trim().toLowerCase();
    const l = list.items.filter((i) => (kind === "all" || i.kind === kind) && (!list.pack || showPack || !i.pack) && (!n || name(i).toLowerCase().includes(n) || i.file.toLowerCase().includes(n)));
    const by = (a: ContentItem, b: ContentItem) => name(a).toLowerCase().localeCompare(name(b).toLowerCase());
    if (sort === "za") l.sort((a, b) => by(b, a));
    else if (sort === "size") l.sort((a, b) => b.size - a.size || by(a, b));
    else if (sort === "off") l.sort((a, b) => Number(b.disabled) - Number(a.disabled) || by(a, b));
    else l.sort(by);
    return l;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, meta, q, kind, sort, showPack]);

  const toggle = async (items: ContentItem[], on: boolean) => {
    setBusy(true);
    let fail = "";
    for (const i of items) {
      if (i.locked || i.dir || !i.disabled === on) continue;
      const r = await window.wecraft.content.toggle(id, i.kind, i.file, on).catch(() => ({ ok: false as const, message: "Opération impossible." }));
      if (!r.ok) fail = r.message;
    }
    setBusy(false);
    if (fail) toast(fail);
    setSel(new Set());
    load(false);
  };
  const remove = async (items: ContentItem[]) => {
    setBusy(true);
    let fail = "";
    let n = 0;
    for (const i of items) {
      if (i.locked) continue;
      const r = await window.wecraft.content.remove(id, i.kind, i.file).catch(() => ({ ok: false as const, message: "Opération impossible." }));
      if (r.ok) n++;
      else fail = r.message;
    }
    setBusy(false);
    setConfirm(null);
    toast(fail || (n > 1 ? `${n} fichiers mis à la corbeille.` : "Mis à la corbeille."));
    setSel(new Set());
    load(false);
  };

  if (!list) return <div className="faint" style={{ padding: "18px 4px" }}>{t("Lecture du contenu…")}</div>;
  const total = list.pack && !showPack ? list.items.filter((i) => !i.pack).length : list.items.length;
  const selItems = shown.filter((i) => sel.has(key(i)));
  const allSel = shown.length > 0 && shown.every((i) => sel.has(key(i)) || i.locked);
  return (
    <>
      {list.pack ? (
        <div className="card ipack">
          <div className="ipack-top">
            <div>
              <h3>{list.event ? t("Contenu de l'événement") : t("Contenu du modpack")}</h3>
              <span className="ipack-counts">
                <span>
                  <Ic n="mods" />
                  {`${list.pack.counts.mod} mods`}
                </span>
                <span>{`${list.pack.counts.resourcepack} ${t("packs de ressources")}`}</span>
                <span>{`${list.pack.counts.shader} shaders`}</span>
              </span>
            </div>
            <span className="row">
              <button className="btn sm" aria-pressed={showPack ? "true" : "false"} onClick={() => setShowPack((s) => !s)}>
                {showPack ? t("Masquer le contenu") : t("Voir le contenu")}
              </button>
              {mp ? (
                <button className="ib" data-act="mpEdit" data-id={id} title={t("Modifier les mods (Découvrir)")} aria-label={t("Modifier les mods (Découvrir)")}>
                  ✎
                </button>
              ) : null}
              {ev ? (
                <button className="ib" data-act="evEdit" data-id={id} title={t("Packs de ressources et shaders de l'événement")} aria-label={t("Packs de ressources et shaders de l'événement")}>
                  ✎
                </button>
              ) : null}
            </span>
          </div>
          <div className="ipack-foot faint">
            🔒 {t("Fourni par")} <b>{`${list.pack.name}${list.pack.version ? ` ${list.pack.version}` : ""}`}</b> · {list.pack.source}
          </div>
        </div>
      ) : null}
      <h3 className="ic-h3">{list.pack ? t("Contenu supplémentaire") : t("Contenu")}</h3>
      <div className="ic-tools">
        <input type="search" className="ic-search" placeholder={t("Rechercher {n} projets…", { n: total })} aria-label={t("Rechercher")} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" data-act="instFolder" data-id={id} data-sub={kind === "resourcepack" ? "resourcepacks" : kind === "shader" ? "shaderpacks" : "mods"}>
          <Ic n="folder" />
          {t("Ouvrir le dossier")}
        </button>
        <button className="btn pri" data-act="addContent" data-id={id}>
          <Ic n="discover" />
          {t("Ajouter du contenu")}
        </button>
      </div>
      <div className="ic-filters">
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t("Trier")}>
          {SORTS.map(([k, l]) => (
            <option key={k} value={k}>
              {t(l)}
            </option>
          ))}
        </select>
        <span className="chips">
          {KIND_FILTERS.map(([k, l]) => (
            <button key={k} className="chip" aria-pressed={kind === k ? "true" : "false"} onClick={() => setKind(k)}>
              {t(l)}
            </button>
          ))}
        </span>
        <span style={{ flex: 1 }}></span>
        <button className="btn sm ghost" onClick={() => load(true)}>
          ↻ {t("Actualiser")}
        </button>
      </div>
      {selItems.length ? (
        <div className="ic-bulk">
          <b>{`${selItems.length} ${t("sélectionné(s)")}`}</b>
          <button className="btn sm" disabled={busy} onClick={() => void toggle(selItems, true)}>
            {t("Activer")}
          </button>
          <button className="btn sm" disabled={busy} onClick={() => void toggle(selItems, false)}>
            {t("Désactiver")}
          </button>
          {confirm === "bulk" ? (
            <button className="btn sm danger" disabled={busy} onClick={() => void remove(selItems)}>
              {t("Confirmer : corbeille")}
            </button>
          ) : (
            <button className="btn sm" disabled={busy} onClick={() => setConfirm("bulk")}>
              {t("Retirer")}
            </button>
          )}
          <button className="btn sm ghost" onClick={() => setSel(new Set())}>
            {t("Annuler")}
          </button>
        </div>
      ) : null}
      <div className="ic-table" role="table">
        <div className="ic-row ic-headrow" role="row">
          <span>
            <input
              type="checkbox"
              aria-label={t("Tout sélectionner")}
              checked={allSel}
              onChange={() => setSel(allSel ? new Set() : new Set(shown.filter((i) => !i.locked).map(key)))}
            />
          </span>
          <span>{t("Projet")}</span>
          <span>{t("Version")}</span>
          <span className="r">{t("Actions")}</span>
        </div>
        {shown.map((i) => {
          const m = meta[key(i)];
          const k = key(i);
          return (
            <div key={k} className={`ic-row${i.disabled ? " off" : ""}`} role="row">
              <span>
                <input type="checkbox" aria-label={`${t("Sélectionner")} ${name(i)}`} disabled={i.locked} checked={sel.has(k)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })} />
              </span>
              <span className="ic-proj">
                <span className="ic-ico">
                  {m?.icon ? <img src={m.icon} alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} /> : null}
                  <b>{initials(name(i)) || "?"}</b>
                </span>
                <span className="ic-txt">
                  <b title={name(i)}>{name(i)}</b>
                  <small className="faint">
                    {m?.author ? `${t("par")} ${m.author}` : t(KIND_LABEL[i.kind])}
                    {i.pack ? ` · ${t("modpack")}` : ""}
                    {i.locked ? " · 🔒" : ""}
                  </small>
                </span>
              </span>
              <span className="ic-ver">
                <b>{m?.version || i.version || (i.dir ? t("Dossier") : "—")}</b>
                <small className="faint" title={i.file}>
                  {i.file}
                  {i.size ? ` · ${size(i.size)}` : ""}
                </small>
              </span>
              <span className="ic-acts">
                {i.locked ? (
                  <span className="faint" title={t("Imposé par l'événement")}>
                    🔒
                  </span>
                ) : (
                  <>
                    {i.dir ? null : (
                      <button
                        className="toggle"
                        role="switch"
                        aria-checked={i.disabled ? "false" : "true"}
                        aria-label={`${i.disabled ? t("Activer") : t("Désactiver")} ${name(i)}`}
                        title={i.disabled ? t("Désactivé : cliquer pour activer") : t("Activé : cliquer pour désactiver")}
                        disabled={busy}
                        onClick={() => void toggle([i], i.disabled)}
                      ></button>
                    )}
                    {confirm === k ? (
                      <button className="btn sm danger" disabled={busy} onClick={() => void remove([i])}>
                        {t("Corbeille ?")}
                      </button>
                    ) : (
                      <button className="ib" aria-label={`${t("Retirer")} ${name(i)}`} title={t("Retirer (corbeille)")} disabled={busy} onClick={() => setConfirm(k)}>
                        🗑
                      </button>
                    )}
                  </>
                )}
                <Menu
                  items={[
                    { label: "Page Modrinth", hidden: !m?.slug, onClick: () => void window.wecraft.modpacks.openPage(m!.slug) },
                    { label: "Ouvrir le dossier", data: { act: "instFolder", id, sub: i.kind === "mod" ? "mods" : i.kind === "shader" ? "shaderpacks" : "resourcepacks" } },
                  ]}
                />
              </span>
            </div>
          );
        })}
        {shown.length ? null : <div className="ic-empty faint">{list.items.length ? t("Rien ne correspond.") : t("Aucun mod, pack de ressources ou shader dans cette instance.")}</div>}
      </div>
      {list.truncated ? <small className="faint">{t("Liste limitée aux 3000 premiers fichiers.")}</small> : null}
    </>
  );
}

function FilesTab({ id }: { id: string }) {
  const [files, setFiles] = useState<FileEntry[] | null>(null);
  useEffect(() => {
    void window.wecraft.instances.files(id).then(setFiles, () => setFiles([]));
  }, [id]);
  return (
    <>
      <div className="ic-tools">
        <span className="muted" style={{ fontSize: "13px", flex: 1 }}>
          {t("Dossier de jeu de l'instance. Les dossiers s'ouvrent dans l'Explorateur ; les fichiers ne sont jamais ouverts ni exécutés depuis ReLaunch.")}
        </span>
        <button className="btn pri" data-act="instFolder" data-id={id}>
          <Ic n="folder" />
          {t("Ouvrir le dossier de l'instance")}
        </button>
      </div>
      <div className="ic-table">
        {files === null ? <div className="ic-empty faint">{t("Lecture…")}</div> : null}
        {files?.map((f) => (
          <div key={f.name} className="ic-row files">
            <span className="ic-proj">
              <span className="fi-ico">{f.dir ? "📁" : "📄"}</span>
              <span className="ic-txt">
                <b>{f.name}</b>
                <small className="faint">{f.dir ? t("Dossier") : size(f.size)}</small>
              </span>
            </span>
            <span className="faint" style={{ fontSize: "12.5px" }}>
              {date(f.mtime)}
            </span>
            <span className="ic-acts">
              {f.dir ? (
                <button className="btn sm" data-act="instFolder" data-id={id} data-sub={f.name}>
                  {t("Ouvrir")}
                </button>
              ) : null}
            </span>
          </div>
        ))}
        {files && !files.length ? <div className="ic-empty faint">{t("Dossier vide ou illisible.")}</div> : null}
      </div>
    </>
  );
}

function WorldsTab({ id }: { id: string }) {
  const [worlds, setWorlds] = useState<WorldView[] | null>(null);
  useEffect(() => {
    void window.wecraft.instances.worlds(id).then(setWorlds, () => setWorlds([]));
  }, [id]);
  return (
    <>
      <div className="ic-tools">
        <span className="muted" style={{ fontSize: "13px", flex: 1 }}>
          {worlds ? `${worlds.length} monde${worlds.length > 1 ? "s" : ""}` : ""}
        </span>
        <button className="btn" data-act="instFolder" data-id={id} data-sub="saves">
          <Ic n="folder" />
          {t("Ouvrir le dossier des mondes")}
        </button>
      </div>
      <div className="worlds">
        {worlds === null ? <div className="faint">{t("Lecture…")}</div> : null}
        {worlds?.map((w) => (
          <div key={w.folder} className="world card">
            <span className="world-ico">{initials(w.name) || "M"}</span>
            <span className="ic-txt">
              <b>{w.name}</b>
              <small className="faint">{`${w.folder !== w.name ? `${w.folder} · ` : ""}${t("joué")} ${ago(w.last)}`}</small>
            </span>
          </div>
        ))}
        {worlds && !worlds.length ? <div className="empty">{t("Aucun monde : lance l'instance et crée un monde solo.")}</div> : null}
      </div>
    </>
  );
}

function GameLogTab({ id }: { id: string }) {
  const { toast } = useApp();
  const [log, setLog] = useState<{ lines: string[]; truncated: boolean; at: number | null } | null>(null);
  const [q, setQ] = useState("");
  const [lvl, setLvl] = useState("all");
  const load = useCallback(() => void window.wecraft.instances.gameLog(id).then(setLog, () => setLog({ lines: [], truncated: false, at: null })), [id]);
  useEffect(load, [load]);
  const lv = (l: string) => (/\/(ERROR|FATAL)\]|\bERROR\b|Exception/.test(l) ? "error" : /\/WARN\]|\bWARN\b/.test(l) ? "warn" : "info");
  const n = q.trim().toLowerCase();
  const lines = (log?.lines ?? []).filter((l) => (lvl === "all" || lv(l) === lvl) && (!n || l.toLowerCase().includes(n)));
  return (
    <>
      <div className="ic-tools">
        <input type="search" className="ic-search" placeholder={t("Filtrer le journal")} aria-label={t("Filtrer le journal")} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="chips">
          {(
            [
              ["all", "Tout"],
              ["warn", "Avertissements"],
              ["error", "Erreurs"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className="chip" aria-pressed={lvl === k ? "true" : "false"} onClick={() => setLvl(k)}>
              {t(l)}
            </button>
          ))}
        </span>
        <button className="btn sm" onClick={load}>
          ↻ {t("Actualiser")}
        </button>
        <button className="btn sm" disabled={!lines.length} onClick={() => void window.wecraft.logs.copy(lines.join("\n")).then((ok) => toast(ok ? t("Copié (données sensibles masquées).") : t("Copie impossible.")))}>
          {t("Copier")}
        </button>
        <button className="btn sm" data-act="instFolder" data-id={id} data-sub="logs">
          {t("Dossier logs")}
        </button>
      </div>
      <p className="faint" style={{ fontSize: "12px", margin: "0 0 8px" }}>
        {log?.at ? `logs/latest.log · ${date(log.at)}${log.truncated ? ` · ${t("fin du fichier seulement")}` : ""}` : t("Pas encore de journal : il apparaît après le premier lancement.")}
      </p>
      <div className="glog" role="log">
        {lines.map((l, i) => (
          <div key={i} className={`gl-${lv(l)}`}>
            {l}
          </div>
        ))}
      </div>
    </>
  );
}
