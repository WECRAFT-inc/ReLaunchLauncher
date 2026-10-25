// « Créer un WePack » > « Importer » : fichier .mrpack (format Modrinth) ou instances des autres launchers.
// Les instances de Prism, CurseForge et Modrinth ne sont pas copiées : ReLaunch les détecte là où elles sont
// (lecture seule) ; « Rechercher à nouveau » relit leurs dossiers tout de suite.
import { useEffect, useRef, useState } from "react";
import type { ModpackJob } from "../../shared/api";
import { useApp } from "./ctx";
import { Ic } from "./Ic";
import { useEscapeLayer } from "./keys";

/** Suit une opération de modpack (téléchargements réels) jusqu'à sa fin. */
export function useJob(onDone: (j: ModpackJob) => void) {
  const [job, setJob] = useState<ModpackJob | null>(null);
  const poll = useRef<number | null>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => () => void (poll.current !== null && window.clearInterval(poll.current)), []);
  const follow = (id: string) => {
    if (poll.current !== null) window.clearInterval(poll.current);
    const tick = () =>
      void window.wecraft.modpacks.status(id).then((s) => {
        if (!s) return;
        setJob(s);
        if (s.phase !== "en-cours" && poll.current !== null) {
          window.clearInterval(poll.current);
          poll.current = null;
          done.current(s);
        }
      });
    poll.current = window.setInterval(tick, 300);
    tick();
  };
  return { job, follow, reset: () => setJob(null) };
}

export function JobView({ job }: { job: ModpackJob | null }) {
  if (!job) return null;
  return (
    <div className="mp-job" role="status">
      {job.phase === "en-cours" ? (
        <div className="lbar">
          <i style={{ width: job.total ? `${Math.round((100 * job.done) / job.total)}%` : "0" }}></i>
        </div>
      ) : null}
      <small style={{ whiteSpace: "pre-line", color: job.phase === "erreur" ? "var(--bad)" : undefined }}>{job.phase === "erreur" ? `L'opération n'a pas abouti :\n${job.message}` : job.message}</small>
      {job.warnings.length ? <small className="muted" style={{ whiteSpace: "pre-line" }}>{`À vérifier :\n- ${job.warnings.slice(0, 30).join("\n- ")}${job.warnings.length > 30 ? `\n(+ ${job.warnings.length - 30} autres)` : ""}`}</small> : null}
    </div>
  );
}

export function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { inst, refreshInstances, toast, show } = useApp();
  const { job, follow, reset } = useJob((j) => {
    if (j.phase === "termine") refreshInstances();
  });
  useEscapeLayer(open, onClose);
  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const busy = job?.phase === "en-cours";
  const count = (s: string) => inst.filter((i) => i.s === s).length;

  const pick = () => {
    void window.wecraft.modpacks.importFile().then((r) => {
      if (r.ok) follow(r.job);
      else if (r.reason === "busy") toast("Une opération est en cours : réessayez dans un instant.");
      else if (r.reason !== "canceled") toast("Import impossible.");
    });
  };

  if (!open) return null;
  return (
    <div className="overlay" data-a="m-import" data-name="Importer" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="impTitle" style={{ width: "min(560px,100%)" }}>
        <header>
          <h3 id="impTitle">Importer</h3>
          <button className="xbtn" aria-label="Fermer" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="mbody">
          <div className="card imp-row">
            <span className="oi">
              <Ic n="upload" />
            </span>
            <span className="imp-txt">
              <b>Fichier .mrpack (Modrinth)</b>
              <small className="muted">Modpack exporté depuis Modrinth, Prism ou un autre launcher. Chaque fichier est téléchargé et vérifié (SHA-512) dans une nouvelle instance.</small>
            </span>
            <button className="btn sm pri" onClick={pick} disabled={busy}>
              Choisir un fichier
            </button>
          </div>
          <JobView job={job} />
          {job?.phase === "termine" ? (
            <button
              className="btn sm"
              onClick={() => {
                onClose();
                show("wecraft");
              }}
            >
              Voir dans WeCraft
            </button>
          ) : null}
          <div className="card imp-row">
            <span className="oi">
              <Ic n="import" />
            </span>
            <span className="imp-txt">
              <b>Prism, CurseForge et Modrinth</b>
              <small className="muted">{`Rien à copier : leurs instances sont détectées là où elles sont (lecture seule). Détectées : ${count("Prism")} Prism, ${count("CurseForge")} CurseForge, ${count("Modrinth")} Modrinth.`}</small>
            </span>
            <button
              className="btn sm"
              onClick={() => {
                refreshInstances();
                toast("Dossiers des autres launchers relus.");
              }}
            >
              Rechercher à nouveau
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
