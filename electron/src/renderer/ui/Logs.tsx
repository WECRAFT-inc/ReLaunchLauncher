// Réglages > Logs : journaux de ReLaunch (application, lancements, mises à jour) pour comprendre un problème.
// Lecture limitée côté processus principal (fin des fichiers) ; affichage limité ici (500 lignes, filtrables).
// Les textes reçus sont déjà masqués (jetons, nom d'utilisateur Windows) ; la copie est masquée une 2e fois.
import { useEffect, useMemo, useState } from "react";
import type { LogEntry } from "../../shared/api";
import { useApp } from "./ctx";
import { Ic } from "./Ic";

const SHOWN = 500;
const LEVEL: Record<LogEntry["level"], string> = { error: "Erreur", warn: "Avertissement", info: "Info" };

function fmt(t: string): string {
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? t : d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
const asText = (e: LogEntry) => `${fmt(e.time)} [${LEVEL[e.level]}${e.guessed ? "*" : ""}] [${e.origin}] ${e.text}`;

export function LogsTab() {
  const { toast } = useApp();
  const [data, setData] = useState<{ entries: LogEntry[]; truncated: boolean } | null>(null);
  const [level, setLevel] = useState<"all" | LogEntry["level"]>("all");
  const [origin, setOrigin] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    void window.wecraft.logs.read().then(
      (r) => {
        setData(r);
        setSel(new Set());
        setLoading(false);
      },
      () => {
        setLoading(false);
        toast("Journaux illisibles.");
      },
    );
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const origins = useMemo(() => [...new Set((data?.entries ?? []).map((e) => e.origin))].sort(), [data]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.entries ?? []).map((e, i) => ({ e, i })).filter(({ e }) => (level === "all" || e.level === level) && (!origin || e.origin === origin) && (!needle || e.text.toLowerCase().includes(needle) || e.origin.toLowerCase().includes(needle)));
  }, [data, level, origin, q]);
  const counts = useMemo(() => {
    const c = { error: 0, warn: 0, info: 0 };
    for (const e of data?.entries ?? []) c[e.level]++;
    return c;
  }, [data]);

  const copy = (rows: LogEntry[]) => {
    if (!rows.length) return toast("Rien à copier.");
    void window.wecraft.logs.copy(rows.map(asText).join("\n")).then((ok) => toast(ok ? `${rows.length} ligne${rows.length > 1 ? "s" : ""} copiée${rows.length > 1 ? "s" : ""} (données sensibles masquées).` : "Copie impossible."));
  };
  const toggle = (i: number) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  return (
    <div className="logs">
      <div className="toolbar logs-bar">
        <span className="chips">
          {(
            [
              ["all", `Tout (${data?.entries.length ?? 0})`],
              ["error", `Erreurs (${counts.error})`],
              ["warn", `Avertissements (${counts.warn})`],
              ["info", `Infos (${counts.info})`],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className="chip" aria-pressed={level === k ? "true" : "false"} onClick={() => setLevel(k)}>
              {l}
            </button>
          ))}
        </span>
        <select value={origin} onChange={(e) => setOrigin(e.target.value)} aria-label="Origine">
          <option value="">Toutes les origines</option>
          {origins.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <input type="search" placeholder="Rechercher dans les journaux" aria-label="Rechercher dans les journaux" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="row logs-acts">
        <button className="btn sm" onClick={load} disabled={loading}>
          ↻ {loading ? "Lecture…" : "Actualiser"}
        </button>
        <button className="btn sm" onClick={() => copy(filtered.filter(({ i }) => sel.has(i)).map(({ e }) => e))} disabled={!sel.size}>
          {`Copier la sélection${sel.size ? ` (${sel.size})` : ""}`}
        </button>
        <button className="btn sm" onClick={() => copy(filtered.map(({ e }) => e))} disabled={!filtered.length}>
          Copier ce qui est affiché
        </button>
        <button className="btn sm" onClick={() => void window.wecraft.logs.openDir()}>
          <Ic n="folder" />
          Ouvrir le dossier des logs
        </button>
      </div>
      {data?.truncated ? <small className="faint">Seule la fin des journaux est lue (les plus anciennes lignes sont dans les fichiers).</small> : null}
      <small className="faint">* niveau déduit du message (journaux de lancement et de mises à jour, écrits sans niveau).</small>
      {!data ? (
        <div className="empty">Lecture des journaux…</div>
      ) : !filtered.length ? (
        <div className="empty">{data.entries.length ? "Aucune ligne ne correspond." : "Aucun journal pour l'instant."}</div>
      ) : (
        <div className="logs-list" role="list">
          {filtered.slice(0, SHOWN).map(({ e, i }) => (
            <label key={i} className={`log-row ${e.level}`} role="listitem">
              <input type="checkbox" checked={sel.has(i)} onChange={() => toggle(i)} aria-label="Sélectionner la ligne" />
              <time>{fmt(e.time)}</time>
              <span className={`log-lv ${e.level}`}>{`${LEVEL[e.level]}${e.guessed ? "*" : ""}`}</span>
              <span className="log-or">{e.origin}</span>
              <span className="log-tx">{e.text}</span>
            </label>
          ))}
          {filtered.length > SHOWN ? <small className="faint">{`${filtered.length - SHOWN} lignes de plus : affinez la recherche ou les filtres.`}</small> : null}
        </div>
      )}
    </div>
  );
}
