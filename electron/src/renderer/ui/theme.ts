// Thème dégradé automatique : rotation entre plusieurs thèmes de couleurs, avec un fondu des couleurs
// d'accent. Les variables --acc, --acc-2, --acc-deep et --spark sont déclarées comme couleurs (@property dans
// wecraft.css) : le navigateur les fait glisser d'un thème à l'autre sans JavaScript à chaque image.
// La rotation ne change que l'affichage : le thème enregistré (launcher_config.json) reste celui choisi.
import { useEffect } from "react";

export const BASE_THEMES = ["phenix", "relink", "aurore", "glace"] as const;
export type BaseTheme = (typeof BASE_THEMES)[number];
export const THEME_NAMES: Record<BaseTheme, string> = { phenix: "Phénix", relink: "ReLink", aurore: "Aurore", glace: "Glace" };
export const THEME_COLORS: Record<BaseTheme, string> = { phenix: "#ff8a3d", relink: "#3fd08a", aurore: "#8b7bff", glace: "#5cc8ff" };

export interface Rotation {
  on: boolean;
  /** Thèmes de la rotation, dans l'ordre. */
  list: string[];
  /** Temps passé sur chaque thème (secondes). */
  sec: number;
  /** Durée du fondu (secondes). */
  fade: number;
}

export const ROT_INTERVALS = [20, 60, 300, 900] as const;
export const ROT_FADES = [2, 5, 10] as const;
export const DEFAULT_ROTATION: Rotation = { on: false, list: [...BASE_THEMES], sec: 60, fade: 5 };

/** Réglage lu (localStorage) remis dans des bornes sûres. */
export function cleanRotation(v: unknown): Rotation {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  const list = (Array.isArray(o["list"]) ? o["list"] : []).filter((t, i, a): t is string => typeof t === "string" && (BASE_THEMES as readonly string[]).includes(t) && a.indexOf(t) === i);
  const sec = typeof o["sec"] === "number" && (ROT_INTERVALS as readonly number[]).includes(o["sec"]) ? o["sec"] : DEFAULT_ROTATION.sec;
  const fade = typeof o["fade"] === "number" && (ROT_FADES as readonly number[]).includes(o["fade"]) ? o["fade"] : DEFAULT_ROTATION.fade;
  return { on: o["on"] === true, list, sec, fade };
}

/** Thème suivant dans la rotation (le premier si le thème actuel n'en fait pas partie). */
export function nextTheme(list: readonly string[], current: string): string {
  if (!list.length) return current;
  const i = list.indexOf(current);
  return list[(i + 1) % list.length]!;
}

/** Animations réduites : réglage de ReLaunch ou préférence d'accessibilité du système. */
export function reducedMotion(anim: unknown): boolean {
  let sys = false;
  try {
    sys = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    sys = false;
  }
  return anim === false || sys;
}

/** Affiche un thème (sans l'enregistrer). */
export function showSkin(s: string): void {
  const root = document.documentElement;
  if (s === "phenix") root.removeAttribute("data-skin");
  else root.setAttribute("data-skin", s);
}

/** Durée du fondu appliquée aux couleurs d'accent (0 = changement immédiat). */
export function setFade(seconds: number): void {
  document.documentElement.style.setProperty("--theme-fade", `${seconds}s`);
}

/**
 * Rotation active : change de thème toutes les `sec` secondes. Arrêtée (ou moins de deux thèmes) : le thème
 * choisi est réaffiché. Toujours un seul minuteur.
 */
export function useThemeRotation(rot: Rotation, skin: string, anim: unknown): void {
  const key = `${rot.on}|${rot.list.join(",")}|${rot.sec}|${rot.fade}|${skin}|${String(anim)}`;
  useEffect(() => {
    const list = rot.list.filter((t) => (BASE_THEMES as readonly string[]).includes(t));
    if (!rot.on || list.length < 2) {
      setFade(0);
      showSkin(skin);
      return;
    }
    setFade(reducedMotion(anim) ? 0 : rot.fade);
    let cur = list.includes(skin) ? skin : list[0]!;
    showSkin(cur);
    const t = window.setInterval(() => {
      cur = nextTheme(list, cur);
      showSkin(cur);
    }, rot.sec * 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Aperçu : passe une fois par chaque thème de la liste (1,5 s chacun), puis revient au thème affiché avant. */
export function previewRotation(list: readonly string[], fade: number, anim: unknown, done: () => void): () => void {
  const root = document.documentElement;
  const before = root.getAttribute("data-skin") ?? "phenix";
  const prevFade = root.style.getPropertyValue("--theme-fade");
  setFade(reducedMotion(anim) ? 0 : Math.min(fade, 1.2));
  let i = 0;
  showSkin(list[0] ?? before);
  const t = window.setInterval(() => {
    i++;
    if (i >= list.length) {
      window.clearInterval(t);
      showSkin(before);
      root.style.setProperty("--theme-fade", prevFade || "0s");
      done();
      return;
    }
    showSkin(list[i]!);
  }, 1500);
  return () => {
    window.clearInterval(t);
    showSkin(before);
    root.style.setProperty("--theme-fade", prevFade || "0s");
  };
}
