/**
 * Joueur Minecraft en 3D (CSS), texturé avec son skin : tête, corps, bras, jambes, plus les calques extérieurs
 * (chapeau, veste, manches, pantalon). Chaque membre est un pavé dont les 6 faces sont découpées dans le skin.
 * Bras fins (« slim ») reconnus d'après le skin. Fixe, de trois quarts ; glisser pour le faire tourner.
 */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

type FaceKey = "front" | "back" | "left" | "right" | "top" | "bottom";
type Faces = Record<FaceKey, string>;
interface Box {
  /** Coin de la zone dans le skin (u, v) et taille du pavé (largeur, hauteur, profondeur) en pixels. */
  u: number;
  v: number;
  w: number;
  h: number;
  d: number;
}
interface PartDef {
  key: string;
  base: Box;
  over: Box | null;
  /** Position (vue de face) dans un joueur de 16 × 32 pixels. */
  x: number;
  y: number;
  /** Agrandissement du calque extérieur, en pixels de chaque côté. */
  inflate: number;
  /** Ancien skin 64 × 32 : membre gauche = membre droit retourné. */
  mirrorOf?: { base: Box };
}
export interface PlayerParts {
  slim: boolean;
  parts: { key: string; x: number; y: number; w: number; h: number; d: number; inflate: number; base: Faces; over: Faces | null }[];
}

const box = (u: number, v: number, w: number, h: number, d: number): Box => ({ u, v, w, h, d });

function defs(slim: boolean, legacy: boolean): PartDef[] {
  const aw = slim ? 3 : 4;
  const rightArm = box(40, 16, aw, 12, 4);
  const rightLeg = box(0, 16, 4, 12, 4);
  return [
    { key: "head", base: box(0, 0, 8, 8, 8), over: box(32, 0, 8, 8, 8), x: 4, y: 0, inflate: 0.5 },
    { key: "body", base: box(16, 16, 8, 12, 4), over: legacy ? null : box(16, 32, 8, 12, 4), x: 4, y: 8, inflate: 0.25 },
    { key: "rarm", base: rightArm, over: legacy ? null : box(40, 32, aw, 12, 4), x: 4 - aw, y: 8, inflate: 0.25 },
    legacy
      ? { key: "larm", base: rightArm, over: null, x: 12, y: 8, inflate: 0.25, mirrorOf: { base: rightArm } }
      : { key: "larm", base: box(32, 48, aw, 12, 4), over: box(48, 48, aw, 12, 4), x: 12, y: 8, inflate: 0.25 },
    { key: "rleg", base: rightLeg, over: legacy ? null : box(0, 32, 4, 12, 4), x: 4, y: 20, inflate: 0.25 },
    legacy
      ? { key: "lleg", base: rightLeg, over: null, x: 8, y: 20, inflate: 0.25, mirrorOf: { base: rightLeg } }
      : { key: "lleg", base: box(16, 48, 4, 12, 4), over: box(0, 48, 4, 12, 4), x: 8, y: 20, inflate: 0.25 },
  ];
}

/** Zones des 6 faces d'un pavé dans le skin (disposition standard de Minecraft). */
function regions(b: Box): Record<FaceKey, [number, number, number, number]> {
  const { u, v, w, h, d } = b;
  return {
    top: [u + d, v, w, d],
    bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h],
    front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h],
    back: [u + d + w + d, v + d, w, h],
  };
}

function crop(src: HTMLCanvasElement, r: [number, number, number, number], flip: boolean): string {
  const [x, y, w, h] = r;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  if (flip) {
    g.translate(w, 0);
    g.scale(-1, 1);
  }
  g.drawImage(src, x, y, w, h, 0, 0, w, h);
  return c.toDataURL("image/png");
}

function facesOf(src: HTMLCanvasElement, b: Box, mirror: boolean): Faces {
  const r = regions(b);
  if (!mirror) return { front: crop(src, r.front, false), back: crop(src, r.back, false), left: crop(src, r.left, false), right: crop(src, r.right, false), top: crop(src, r.top, false), bottom: crop(src, r.bottom, false) };
  // membre retourné : faces inversées horizontalement, côtés gauche et droit échangés
  return { front: crop(src, r.front, true), back: crop(src, r.back, true), left: crop(src, r.right, true), right: crop(src, r.left, true), top: crop(src, r.top, true), bottom: crop(src, r.bottom, true) };
}

/** Bras fins : la 4e colonne de la face avant du bras droit (et ce qui suit) est vide dans un skin « slim ». */
function looksSlim(g: CanvasRenderingContext2D): boolean {
  const d = g.getImageData(54, 20, 2, 12).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return false;
  return true;
}

const cache = new Map<string, Promise<PlayerParts | null>>();

/** Découpe un skin (data:image/png, 64 × 64 ou ancien 64 × 32) en pavés texturés. */
export function playerParts(skin: string, model?: "classic" | "slim"): Promise<PlayerParts | null> {
  const k = `${model ?? "auto"}|${skin}`;
  const c = cache.get(k);
  if (c) return c;
  const p = new Promise<PlayerParts | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        if (img.width !== 64 || (img.height !== 64 && img.height !== 32)) return resolve(null);
        const src = document.createElement("canvas");
        src.width = 64;
        src.height = img.height;
        const g = src.getContext("2d", { willReadFrequently: true })!;
        g.drawImage(img, 0, 0);
        const legacy = img.height === 32;
        const slim = model ? model === "slim" : !legacy && looksSlim(g);
        const parts = defs(slim, legacy).map((d) => ({
          key: d.key,
          x: d.x,
          y: d.y,
          w: d.base.w,
          h: d.base.h,
          d: d.base.d,
          inflate: d.inflate,
          base: facesOf(src, d.base, !!d.mirrorOf),
          over: d.over ? facesOf(src, d.over, false) : null,
        }));
        resolve({ slim, parts });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = skin;
  });
  cache.set(k, p);
  return p;
}

/** Un pavé : 6 faces placées en 3D (s = taille d'un pixel du skin, en px). */
function Cuboid({ w, h, d, s, faces, inflate = 0 }: { w: number; h: number; d: number; s: number; faces: Faces; inflate?: number }) {
  const W = (w + inflate * 2) * s;
  const H = (h + inflate * 2) * s;
  const D = (d + inflate * 2) * s;
  const f = (k: FaceKey, fw: number, fh: number, transform: string): CSSProperties => ({
    width: fw,
    height: fh,
    left: (W - fw) / 2,
    top: (H - fh) / 2,
    transform,
    backgroundImage: `url("${faces[k]}")`,
  });
  return (
    <span className="pm-cub" style={{ width: W, height: H, left: -inflate * s, top: -inflate * s }}>
      <i style={f("front", W, H, `translateZ(${D / 2}px)`)}></i>
      <i style={f("back", W, H, `rotateY(180deg) translateZ(${D / 2}px)`)}></i>
      <i style={f("left", D, H, `rotateY(90deg) translateZ(${W / 2}px)`)}></i>
      <i style={f("right", D, H, `rotateY(-90deg) translateZ(${W / 2}px)`)}></i>
      <i style={f("top", W, D, `rotateX(90deg) translateZ(${H / 2}px)`)}></i>
      <i style={f("bottom", W, D, `rotateX(-90deg) translateZ(${H / 2}px)`)}></i>
    </span>
  );
}

/** Joueur en 3D, fixe de trois quarts ; glisser pour le faire pivoter. */
export function PlayerModel({ skin, model, height }: { skin: string; model?: "classic" | "slim"; height: number }) {
  const [parts, setParts] = useState<PlayerParts | null>(null);
  const [yaw, setYaw] = useState(-28);
  const drag = useRef<{ x: number; yaw: number } | null>(null);
  useEffect(() => {
    let alive = true;
    void playerParts(skin, model).then((p) => alive && setParts(p));
    return () => {
      alive = false;
    };
  }, [skin, model]);
  if (!parts) return null;
  const s = height / 32;
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { x: e.clientX, yaw };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current) setYaw(drag.current.yaw + (e.clientX - drag.current.x) * 0.6);
  };
  const up = () => {
    drag.current = null;
  };
  return (
    <div className="pm-stage" style={{ width: 16 * s * 1.6, height: height * 1.08 }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} title="Glisser pour tourner" aria-hidden="true">
      <div className="pm-turn" style={{ transform: `rotateX(-6deg) rotateY(${yaw}deg)` }}>
        <div className="pm-model" style={{ width: 16 * s, height: 32 * s }}>
          {parts.parts.map((p) => (
            <span key={p.key} className={`pm-part pm-${p.key}`} style={{ left: p.x * s, top: p.y * s, width: p.w * s, height: p.h * s }}>
              <Cuboid w={p.w} h={p.h} d={p.d} s={s} faces={p.base} />
              {p.over ? <Cuboid w={p.w} h={p.h} d={p.d} s={s} faces={p.over} inflate={p.inflate} /> : null}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
