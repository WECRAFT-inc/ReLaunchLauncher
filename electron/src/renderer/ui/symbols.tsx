// Bibliothèque d'icônes d'instance : dégradés + symboles dessinés pour ReLaunch (aucune image du jeu ni
// d'un autre launcher). Une icône est enregistrée sous la forme { c: [couleur1, couleur2], sym } ou d'une
// image importée et recadrée ; sans icône, l'instance garde son dégradé de source et ses initiales.
import type { CSSProperties } from "react";
import type { InstanceIcon } from "../../shared/api";
import { initials } from "./model";

/** Tracés 24×24 (trait), même style que les icônes de l'interface. */
export const SYMBOLS: Record<string, { l: string; d: string }> = {
  pioche: { l: "Pioche", d: "M4 7c5-4 11-4 16 0M12 5v15M10 20h4" },
  epee: { l: "Épée", d: "M14.5 3.5L20 3l-.5 5.5L9 19l-4-4L14.5 3.5zM5 15l-2 2 4 4 2-2M7 17l-3 3" },
  hache: { l: "Hache", d: "M14 4l6 6M12 6c-3 0-5 2-5 5l6-6M9 9L3 21" },
  arc: { l: "Arc", d: "M5 3c9 2 14 7 16 16M5 3l16 16M3 8l2-5 5-2" },
  bouclier: { l: "Bouclier", d: "M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6l8-3z" },
  couronne: { l: "Couronne", d: "M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z" },
  gemme: { l: "Gemme", d: "M6 3h12l4 6-10 12L2 9l4-6zM2 9h20M9 3l3 18M15 3l-3 18" },
  cube: { l: "Bloc", d: "M12 2l9 5v10l-9 5-9-5V7l9-5zM3 7l9 5 9-5M12 12v10" },
  arbre: { l: "Arbre", d: "M12 21v-6M12 3l6 8h-3l4 5H5l4-5H6l6-8z" },
  montagne: { l: "Montagne", d: "M2 20l7-12 4 6 3-4 6 10H2zM8 10l1.5 2" },
  flamme: { l: "Flamme", d: "M12 22c4 0 7-3 7-7 0-5-5-7-5-13-3 2-4 5-4 8-2-1-3-3-3-4-2 2-3 5-3 9 0 4 3 7 8 7z" },
  goutte: { l: "Goutte", d: "M12 3s7 7.5 7 12a7 7 0 01-14 0c0-4.5 7-12 7-12z" },
  feuille: { l: "Feuille", d: "M5 19C5 9 11 4 20 4c0 9-5 15-15 15zM5 19l9-9" },
  lune: { l: "Lune", d: "M20 14.5A8.5 8.5 0 119.5 4a7 7 0 0010.5 10.5z" },
  soleil: { l: "Soleil", d: "M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" },
  etoile: { l: "Étoile", d: "M12 2l3 7 7 .6-5.3 4.7L18.3 22 12 18l-6.3 4 1.6-7.7L2 9.6 9 9l3-7z" },
  eclair: { l: "Éclair", d: "M13 2L4 14h7l-1 8 9-12h-7l1-8z" },
  coeur: { l: "Cœur", d: "M12 21s-8-5-8-11a4.5 4.5 0 018-3 4.5 4.5 0 018 3c0 6-8 11-8 11z" },
  fiole: { l: "Fiole", d: "M9 3h6M10 3v6L4 19a2 2 0 002 3h12a2 2 0 002-3l-6-10V3M7 14h10" },
  livre: { l: "Livre", d: "M4 4h6a2 2 0 012 2v14a2 2 0 00-2-2H4V4zM20 4h-6a2 2 0 00-2 2v14a2 2 0 012-2h6V4z" },
  engrenage: { l: "Engrenage", d: "M12 9a3 3 0 100 6 3 3 0 000-6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" },
  boussole: { l: "Boussole", d: "M12 2a10 10 0 100 20 10 10 0 000-20zM16 8l-2.5 5.5L8 16l2.5-5.5L16 8z" },
  chateau: { l: "Château", d: "M3 21V8h3v3h3V8h2V4h2v4h2v3h3V8h3v13H3zM10 21v-5h4v5" },
  fusee: { l: "Fusée", d: "M12 2c4 3 5 7 5 11l-2 4H9l-2-4c0-4 1-8 5-11zM9 17l-3 4M15 17l3 4M12 9a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" },
  vague: { l: "Vague", d: "M2 12c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5-1M2 18c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5-1M2 6c2.5-3 5-3 7.5 0s5 3 7.5 0" },
  crane: { l: "Crâne", d: "M12 3a8 8 0 00-8 8c0 3 1.5 5 3 6v3h10v-3c1.5-1 3-3 3-6a8 8 0 00-8-8zM9 11h.01M15 11h.01M10 17v3M14 17v3" },
  champignon: { l: "Champignon", d: "M3 12a9 9 0 0118 0H3zM9 12v6a3 3 0 006 0v-6M8 8h.01M14 7h.01" },
  manette: { l: "Manette", d: "M6 8h12a4 4 0 014 4v3a3 3 0 01-5.5 1.7L15 15H9l-1.5 1.7A3 3 0 012 15v-3a4 4 0 014-4zM8 11v3M6.5 12.5h3M15 12h.01M17 13.5h.01" },
};

/** Dégradés proposés (couleur claire en premier). */
export const PALETTES: [string, string][] = [
  ["#fb7185", "#be185d"],
  ["#fb923c", "#c2410c"],
  ["#fde047", "#ca8a04"],
  ["#a3e635", "#4d7c0f"],
  ["#4ade80", "#15803d"],
  ["#5eead4", "#0f766e"],
  ["#38bdf8", "#0369a1"],
  ["#818cf8", "#4338ca"],
  ["#c4b5fd", "#6d28d9"],
  ["#f0abfc", "#a21caf"],
  ["#e7e5e4", "#57534e"],
  ["#475569", "#0f172a"],
];

export function randomIcon(rand: () => number = Math.random): { c: [string, string]; sym: string } {
  const keys = Object.keys(SYMBOLS);
  return { c: PALETTES[Math.floor(rand() * PALETTES.length)]!, sym: keys[Math.floor(rand() * keys.length)]! };
}

export function SymbolSvg({ sym, size = 24 }: { sym: string; size?: number }) {
  const s = SYMBOLS[sym];
  if (!s) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={s.d} />
    </svg>
  );
}

type Css = CSSProperties & Record<`--${string}`, string>;

/**
 * Icône d'instance : image importée, dégradé + symbole, ou dégradé de la source + initiales.
 * Une image qui ne se charge pas laisse place aux initiales (jamais d'image cassée).
 */
export function InstIcon({ icon, fallback, name, size = 40, className = "" }: { icon: InstanceIcon | null | undefined; fallback: [string, string]; name: string; size?: number; className?: string }) {
  const c = icon && icon.kind === "gen" ? icon.c : fallback;
  const style: Css = { "--c1": c[0], "--c2": c[1], width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.36)}px` };
  if (icon && icon.kind === "file") {
    return (
      <span className={`inst-ico ${className}`} style={style} aria-hidden="true">
        <img src={icon.url} alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
        <b>{initials(name) || "W"}</b>
      </span>
    );
  }
  return (
    <span className={`inst-ico ${className}`} style={style} aria-hidden="true">
      {icon && icon.kind === "gen" && icon.sym && SYMBOLS[icon.sym] ? <SymbolSvg sym={icon.sym} size={Math.round(size * 0.58)} /> : <b>{initials(name) || "W"}</b>}
    </span>
  );
}
