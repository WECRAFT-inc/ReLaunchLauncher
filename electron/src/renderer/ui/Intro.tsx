// Intro cinématique au démarrage (scène : ../intro/scene.ts, son : ../intro/sound.ts).
// Un clic ou une touche la passe ; elle se termine par un fondu vers l'appli. Désactivable dans Réglages > Général.
import { useEffect, useRef, useState } from "react";
import { createIntroScene, INTRO_DURATION } from "../intro/scene";
import { scheduleIntroSound } from "../intro/sound";
import { t } from "./i18n";

const FADE_OUT = 0.7;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error(src));
    i.src = src;
  });
}

export function IntroOverlay({ sound, onDone }: { sound: boolean; onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [leaving, setLeaving] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;
  /** Termine l'intro (fondu), appelée par la fin naturelle, un clic ou une touche. */
  const finish = useRef<(() => void) | null>(null);

  useEffect(() => {
    let raf = 0;
    let stopped = false;
    let ac: AudioContext | null = null;
    let out: GainNode | null = null;
    const end = () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      if (ac && out) {
        // le son s'éteint avec le fondu
        out.gain.cancelScheduledValues(ac.currentTime);
        out.gain.setValueAtTime(out.gain.value, ac.currentTime);
        out.gain.linearRampToValueAtTime(0, ac.currentTime + FADE_OUT);
        const a = ac;
        window.setTimeout(() => void a.close().catch(() => undefined), FADE_OUT * 1000 + 100);
      }
      setLeaving(true);
      window.setTimeout(() => done.current(), FADE_OUT * 1000);
    };
    finish.current = end;
    void (async () => {
      try {
        const [phoenix, crest] = await Promise.all([loadImage("assets/intro/phoenix.png"), loadImage("assets/intro/crest.png"), document.fonts.load('900 132px "Unbounded"')]);
        if (stopped) return;
        const scene = createIntroScene({ phoenix, crest, title: "RELAUNCH", font: "Unbounded" });
        const c = canvas.current;
        const g = c?.getContext("2d");
        if (!c || !g) return end();
        if (sound) {
          try {
            ac = new AudioContext();
            out = scheduleIntroSound(ac, ac.currentTime + 0.05);
          } catch {
            ac = null; // pas de son : l'image continue
          }
        }
        const start = performance.now() + 50;
        const loop = () => {
          if (stopped) return;
          // toile à la taille réelle de l'écran (limitée pour rester fluide sur les écrans très denses)
          const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
          const w = Math.round(c.clientWidth * dpr);
          const h = Math.round(c.clientHeight * dpr);
          if (c.width !== w || c.height !== h) {
            c.width = w;
            c.height = h;
          }
          const tt = Math.max(0, (performance.now() - start) / 1000);
          scene.render(g, Math.min(tt, INTRO_DURATION), w, h);
          if (tt >= INTRO_DURATION) return end();
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch {
        end(); // ressource manquante : on passe directement à l'appli
      }
    })();
    const skip = (e: Event) => {
      if (e instanceof KeyboardEvent && ["Shift", "Control", "Alt", "Meta", "F11"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      finish.current?.();
    };
    window.addEventListener("keydown", skip, true);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", skip, true);
      if (ac) void ac.close().catch(() => undefined);
    };
  }, [sound]);

  return (
    <div
      className={`intro${leaving ? " out" : ""}`}
      role="presentation"
      onPointerDown={(e) => {
        e.preventDefault();
        finish.current?.();
      }}
    >
      <canvas ref={canvas} aria-hidden="true" />
      <span className="intro-skip">{t("Cliquer ou appuyer sur une touche pour passer")}</span>
    </div>
  );
}
