// Barre de titre de la fenêtre (la barre blanche de Windows est masquée) : couleurs du thème ou du skin,
// logo blanc, nom en majuscules, boutons réduire / agrandir / fermer. Toute la barre sert à déplacer la
// fenêtre (double-clic : agrandir), sauf les boutons. Cachée en plein écran (F11).
import { useEffect, useState } from "react";
import { LOGO } from "./icons";
import { t } from "./i18n";

export function TitleBar() {
  const w = window.wecraft.win;
  const [st, setSt] = useState({ maximized: false, fullscreen: false });
  useEffect(() => {
    if (!w) return;
    const read = () => void w.state().then(setSt, () => undefined);
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, [w]);
  useEffect(() => {
    document.body.classList.toggle("tb-off", st.fullscreen);
  }, [st.fullscreen]);
  if (st.fullscreen) return null;
  return (
    <header className="titlebar" aria-label="ReLaunch">
      <span className="tb-brand">
        <img src={LOGO} alt="" />
        <b>RELAUNCH</b>
      </span>
      <span className="tb-btns">
        <button className="tb-btn" aria-label={t("Réduire")} title={t("Réduire")} onClick={() => void w?.minimize()}>
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 6.5h8" />
          </svg>
        </button>
        <button className="tb-btn" aria-label={st.maximized ? t("Restaurer") : t("Agrandir")} title={st.maximized ? t("Restaurer") : t("Agrandir")} onClick={() => void w?.maximize().then((m) => setSt((s) => ({ ...s, maximized: m })))}>
          {st.maximized ? (
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3.5 3.5V2h6.5v6.5H8.5M2 3.5h6.5V10H2z" />
            </svg>
          ) : (
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <rect x="2" y="2" width="8" height="8" rx="1.2" />
            </svg>
          )}
        </button>
        <button className="tb-btn close" aria-label={t("Fermer")} title={t("Fermer")} onClick={() => void w?.close()}>
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
          </svg>
        </button>
      </span>
    </header>
  );
}
