// Écran de chargement au démarrage : logo ReLaunch, anneau qui tourne, lueur qui respire.
// Affiché tant que la première lecture des instances n'est pas terminée (succès ou échec), au moins un court
// instant pour éviter un clignement, puis fondu vers l'appli.
import { useEffect, useState } from "react";
import { t } from "./i18n";

const MIN_MS = 700;
const FADE_MS = 400;

export function LoadingScreen({ done }: { done: boolean }) {
  const [shown, setShown] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [since] = useState(() => performance.now());
  useEffect(() => {
    if (!done) return;
    const wait = Math.max(0, MIN_MS - (performance.now() - since));
    const a = window.setTimeout(() => setLeaving(true), wait);
    const b = window.setTimeout(() => setShown(false), wait + FADE_MS);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [done, since]);
  if (!shown) return null;
  return (
    <div className={`boot${leaving ? " out" : ""}`} role="status" aria-live="polite" aria-label={t("Chargement…")}>
      <div className="boot-mark">
        <span className="boot-ring" aria-hidden="true"></span>
        <span className="boot-glow" aria-hidden="true"></span>
        <img src="assets/relaunch_logo.png" alt="" />
      </div>
      <div className="boot-label">
        {t("Chargement")}
        <span className="boot-dots" aria-hidden="true">
          <i>.</i>
          <i>.</i>
          <i>.</i>
        </span>
      </div>
    </div>
  );
}
