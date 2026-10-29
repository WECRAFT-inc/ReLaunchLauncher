// Application d'un skin du launcher (.rlskin installé) : couleurs, polices, fond animé, barres, cadres,
// bouton Jouer, transition entre pages, écran de lancement. Le skin.json a déjà été vérifié par le
// processus principal ; ici, seules des propriétés précises reçoivent ses valeurs (variables CSS, styles
// d'éléments, Web Animations), jamais du CSS ou du HTML libre.
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import type { InstalledSkin, SkinAnimation, SkinManifest } from "../../shared/api";
import { useApp } from "./ctx";

const TOKEN_VARS: Record<string, string> = { acc: "--acc", acc2: "--acc-2", accDeep: "--acc-deep", spark: "--spark", night: "--night", ink: "--ink", inkSoft: "--ink-soft", inkFaint: "--ink-faint", line: "--line", card: "--skin-card" };

/** Skin actif (choisi dans Réglages > Apparence), ou null (Classique). */
export function useActiveSkin(): InstalledSkin | null {
  const { pref, skins } = useApp();
  const k = typeof pref["lskin"] === "string" ? (pref["lskin"] as string) : "";
  return k ? (skins.find((s) => s.key === k) ?? null) : null;
}

const reduced = (anim: boolean | undefined) => anim === false || (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
const url = (s: InstalledSkin, rel: string | undefined) => (rel ? `url("${s.base}${rel.split("/").map(encodeURIComponent).join("/")}")` : "");

export function animate(el: Element | null, a: SkinAnimation | undefined, anim: boolean | undefined): Animation | null {
  if (!el || !a || reduced(anim) || typeof (el as HTMLElement).animate !== "function") return null;
  return (el as HTMLElement).animate(a.keyframes as Keyframe[], { duration: a.durationMs, iterations: a.iterations === "infinite" ? Infinity : a.iterations, direction: a.direction, easing: a.easing, delay: a.delayMs });
}

/** Variables CSS du skin, posées sur <html> (couleurs, polices) et sur la racine de l'application (décor). */
export function useSkinVars(skin: InstalledSkin | null, style: string | undefined, rootRef: React.RefObject<HTMLDivElement | null>): void {
  useLayoutEffect(() => {
    const html = document.documentElement;
    const app = rootRef.current;
    if (!skin || !app) return;
    const m = skin.manifest;
    const v = style === "lg" ? m.variants.liquidGlass : m.variants.mat;
    const set: [HTMLElement, string][] = [];
    const put = (el: HTMLElement, k: string, val: string | number | undefined) => {
      if (val === undefined || val === "") return;
      el.style.setProperty(k, String(val));
      set.push([el, k]);
    };
    if (!m.followsTheme) for (const [k, val] of Object.entries({ ...m.tokens, ...(v?.tokens ?? {}) })) if (TOKEN_VARS[k]) put(html, TOKEN_VARS[k]!, val);
    put(app, "--skin-bg-color", m.background.color);
    put(app, "--skin-bg-grad", m.background.gradient);
    put(app, "--skin-bar-bg", v?.barBackground ?? m.bars.background);
    put(app, "--skin-bar-pattern", url(skin, m.bars.pattern));
    put(app, "--skin-bar-pattern-op", m.bars.patternOpacity);
    put(app, "--skin-bar-border", m.bars.border);
    put(app, "--skin-bar-radius", m.bars.radius !== undefined ? `${m.bars.radius}px` : undefined);
    put(app, "--skin-frame-radius", m.frames.radius !== undefined ? `${m.frames.radius}px` : undefined);
    put(app, "--skin-frame-border", m.frames.border);
    put(app, "--skin-frame-glow", m.frames.glow);
    put(app, "--skin-frame-bg", v?.cardBackground ?? m.frames.background);
    put(app, "--skin-play-bg", m.playButton.background);
    put(app, "--skin-play-img", url(skin, m.playButton.image));
    put(app, "--skin-play-text", m.playButton.text);
    put(app, "--skin-play-radius", m.playButton.radius !== undefined ? `${m.playButton.radius}px` : undefined);
    put(app, "--skin-launch-img", url(skin, m.launchScreen.image));
    // polices du skin (fichiers du skin, servis par app://wecraft)
    const faces: FontFace[] = [];
    for (const [slot, f] of [
      ["--f-display", m.fonts.display],
      ["--f-body", m.fonts.body],
    ] as const) {
      if (!f || typeof FontFace !== "function") continue;
      const fam = `rlskin-${skin.key}-${f.family}`;
      const face = new FontFace(fam, url(skin, f.file));
      faces.push(face);
      void face.load().then(
        (ff) => {
          document.fonts.add(ff);
          put(html, slot, `"${fam}", ${slot === "--f-display" ? "var(--f-display-base, sans-serif)" : "var(--f-body-base, sans-serif)"}`);
        },
        () => undefined,
      );
    }
    return () => {
      for (const [el, k] of set) el.style.removeProperty(k);
      for (const f of faces) document.fonts.delete(f);
    };
  }, [skin, style, rootRef]);
}

/** Calques du fond animé (dans le fond de l'application). */
export function SkinLayers({ skin }: { skin: InstalledSkin | null }) {
  const { pref } = useApp();
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    if (!skin) return;
    const anims = skin.manifest.background.layers.map((l, i) => animate(refs.current[i] ?? null, l.animation ? skin.manifest.animations[l.animation] : undefined, pref.anim));
    return () => anims.forEach((a) => a?.cancel());
  }, [skin, pref.anim]);
  if (!skin) return null;
  const m: SkinManifest = skin.manifest;
  return (
    <div className="skin-layers" aria-hidden="true">
      {m.background.layers.map((l, i) => (
        <div
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="skin-layer"
          style={{ backgroundImage: url(skin, l.image), backgroundSize: l.size, backgroundPosition: l.position, backgroundRepeat: l.repeat ? "repeat" : "no-repeat", opacity: l.opacity, mixBlendMode: l.blend as CSSProperties["mixBlendMode"] }}
        ></div>
      ))}
      {m.background.overlay !== "none" ? <div className={`skin-ov ${m.background.overlay}`}></div> : null}
    </div>
  );
}

/** Transition entre pages et animation du bouton Jouer, selon le skin. */
export function useSkinMotion(skin: InstalledSkin | null, view: string, main: React.RefObject<HTMLElement | null>): void {
  const { pref } = useApp();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!skin || !main.current || reduced(pref.anim)) return;
    const tr = skin.manifest.transition;
    const d = tr.durationMs;
    if (tr.type === "none" || !d) return;
    const frames: Record<string, Keyframe[]> = {
      fade: [{ opacity: 0 }, { opacity: 1 }],
      slide: [{ opacity: 0, transform: "translateX(24px)" }, { opacity: 1, transform: "none" }],
      zoom: [{ opacity: 0, transform: "scale(.98)" }, { opacity: 1, transform: "none" }],
      wave: [
        { opacity: 0, transform: "translateY(18px) skewY(1.2deg)", filter: "blur(2px)" },
        { opacity: 1, transform: "none", filter: "none" },
      ],
    };
    main.current.animate(frames[tr.type] ?? frames["fade"]!, { duration: d, easing: "cubic-bezier(.3,.7,.2,1)" });
  }, [view, skin, pref.anim, main]);
  useEffect(() => {
    const a = skin?.manifest.playButton.animation ? skin.manifest.animations[skin.manifest.playButton.animation] : undefined;
    if (!a) return;
    const list = [...document.querySelectorAll(".btn.play")].map((el) => animate(el, a, pref.anim));
    return () => list.forEach((x) => x?.cancel());
  }, [skin, view, pref.anim]);
}
