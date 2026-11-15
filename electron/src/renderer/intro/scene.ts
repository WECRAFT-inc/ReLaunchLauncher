// Intro cinématique de ReLaunch : l'aigle-phénix s'éveille, s'embrase, s'élève, explose en lumière, puis le titre.
//
// Rendu DÉTERMINISTE : l'image ne dépend que du temps `t` (secondes). Les particules ne sont pas simulées pas à pas :
// chacune a une naissance, une graine et une trajectoire calculées. La même fonction sert au démarrage du launcher
// (temps réel) et à l'export vidéo image par image (tools/intro/render.mjs), à n'importe quelle cadence.
// Tout est en coordonnées de référence 1920 × 1080, mises à l'échelle de la toile.

export const INTRO_DURATION = 10.5;
/** À partir de cet instant l'image est la composition finale (seules les braises bougent). */
export const INTRO_FINAL_AT = 9.0;
export const REF_W = 1920;
export const REF_H = 1080;

export interface IntroAssets {
  eagle: CanvasImageSource; // aigle de face, masque blanc 1024 × 1024 (alpha)
  back: CanvasImageSource; // grandes plumes arrière (ailes et queue), masque blanc 1024 × 1024
  title: string; // « RELAUNCH »
  font: string; // famille de la police du titre
}

// ------------------------------------------------------------------ outils
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const easeIn = (k: number) => k * k * k;
/** Nombre pseudo-aléatoire reproductible dans [0, 1[ pour (graine, canal). */
function rnd(seed: number, ch = 0): number {
  let x = (seed * 374761393 + ch * 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

type Canvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
function makeCanvas(w: number, h: number): Canvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
const ctx2d = (c: Canvas) => c.getContext("2d") as Ctx;

// ------------------------------------------------------------------ chorégraphie (positions de l'emblème et caméra)
const EMBLEM_PX = 1024;
/** Les deux yeux de l'aigle (repère du masque 1024). */
const EYES: [number, number][] = [
  [468, 337],
  [556, 337],
];
const IGNITE_AT = 3.0;
const ASCEND_AT = 4.6;
const BURST_AT = 6.7;
const TITLE_AT = 7.75;

interface Pose {
  x: number;
  y: number;
  scale: number; // taille de l'emblème (1 = 1024 px de référence)
  spread: number; // largeur des ailes (étirement horizontal)
  rot: number;
}

/** Position de l'emblème dans le monde au temps t. */
function pose(t: number): Pose {
  const finalY = 372;
  const finalS = 0.64;
  // au sol (scènes 1-2), puis ascension (3), apex et retour à la place finale (4)
  const ground = { x: 960, y: 620, s: 0.72 };
  const apex = { x: 960, y: 330, s: 0.76 };
  let x = ground.x;
  let y = ground.y;
  let s = ground.s;
  let rot = 0;
  if (t >= ASCEND_AT) {
    const k = easeInOut(seg(t, ASCEND_AT, BURST_AT));
    // trajectoire en S : part à gauche puis remonte au centre
    x = lerp(ground.x, apex.x, k) - Math.sin(k * Math.PI) * 170;
    y = lerp(ground.y, apex.y, k);
    s = lerp(ground.s, apex.s, k);
    rot = -Math.sin(k * Math.PI) * 0.12;
  }
  if (t >= BURST_AT) {
    const k = easeInOut(seg(t, BURST_AT + 0.2, BURST_AT + 1.4));
    x = apex.x;
    y = lerp(apex.y, finalY, k);
    s = lerp(apex.s, finalS, k);
    rot = 0;
  }
  // ailes : repliées au réveil, déploiement puissant (scène 2), battements pendant l'ascension, pleine envergure à l'apex
  let spread = lerp(0.52, 1.0, easeOut(seg(t, 2.3, 3.4)));
  if (t >= ASCEND_AT && t < BURST_AT) {
    const k = seg(t, ASCEND_AT, BURST_AT);
    spread = 0.9 + 0.12 * Math.cos(k * Math.PI * 4); // deux battements
  }
  if (t >= BURST_AT - 0.25) spread = lerp(spread, 1.14, easeOut(seg(t, BURST_AT - 0.25, BURST_AT)));
  if (t >= BURST_AT) spread = lerp(1.14, 1.0, easeInOut(seg(t, BURST_AT + 0.2, BURST_AT + 1.4)));
  return { x, y, scale: s, spread, rot };
}

/** Caméra : gros plan sur les yeux, recul, suivi de l'ascension, plan large final. */
function camera(t: number): { zoom: number; fx: number; fy: number } {
  const p = pose(t);
  const eye = toWorld(p, (EYES[0]![0] + EYES[1]![0]) / 2, (EYES[0]![1] + EYES[1]![1]) / 2);
  // scène 1 : très près des yeux ; scène 2 : recul lent
  const pull = easeInOut(seg(t, 1.6, 4.4));
  let zoom = lerp(5.2, 1.08, pull);
  let fx = lerp(eye.x, 960, pull);
  let fy = lerp(eye.y, 560, pull);
  if (t >= ASCEND_AT) {
    // suit l'ascension avec un peu de retard, en gardant un léger cadrage serré
    const k = easeInOut(seg(t, ASCEND_AT, BURST_AT));
    fy = lerp(560, 420, k) + (p.y - lerp(640, 330, k)) * 0.35;
    fx = lerp(960, p.x, 0.35);
    zoom = lerp(1.08, 1.0, k);
  }
  if (t >= BURST_AT) {
    const k = easeInOut(seg(t, BURST_AT, BURST_AT + 1.6));
    fx = lerp(fx, 960, k);
    fy = lerp(420, 540, k);
    zoom = 1.0;
  }
  // secousse à l'explosion et à la détonation du titre
  const shake = Math.exp(-(t - BURST_AT) * 6) * (t >= BURST_AT ? 9 : 0) + Math.exp(-(t - TITLE_AT) * 7) * (t >= TITLE_AT ? 5 : 0);
  fx += Math.sin(t * 91) * shake;
  fy += Math.cos(t * 77) * shake;
  return { zoom, fx, fy };
}

function toWorld(p: Pose, ex: number, ey: number): { x: number; y: number } {
  const dx = (ex - EMBLEM_PX / 2) * p.scale * p.spread;
  const dy = (ey - EMBLEM_PX / 2) * p.scale;
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  return { x: p.x + dx * c - dy * s, y: p.y + dx * s + dy * c };
}

// ------------------------------------------------------------------ préparation (une fois)
export interface IntroScene {
  render(ctx: CanvasRenderingContext2D, t: number, w: number, h: number): void;
}

export function createIntroScene(a: IntroAssets): IntroScene {
  // points de l'emblème d'où partent les flammes (échantillonnés dans le masque)
  const sample = makeCanvas(256, 256);
  const sc = ctx2d(sample);
  sc.drawImage(a.eagle, 0, 0, 256, 256);
  const px = sc.getImageData(0, 0, 256, 256).data;
  const pts: [number, number][] = [];
  for (let y = 0; y < 256; y += 2) for (let x = 0; x < 256; x += 2) if (px[(y * 256 + x) * 4 + 3]! > 160) pts.push([x * 4 + 2, y * 4 + 2]);
  // bords (contour) : pour le liseré lumineux du réveil
  const edge: [number, number][] = pts.filter(([x, y]) => {
    const i = (Math.floor(y / 4) * 256 + Math.floor(x / 4)) * 4 + 3;
    return px[i - 8]! < 100 || px[i + 8]! < 100 || px[i - 256 * 8]! < 100 || px[i + 256 * 8]! < 100;
  });

  const wingPts = edge.filter(([x, y]) => Math.abs(x - 512) > 190 && y < 620);

  // versions teintées de l'emblème
  const tint = (src: CanvasImageSource, paint: (c: Ctx) => void): Canvas => {
    const c = makeCanvas(EMBLEM_PX, EMBLEM_PX);
    const g = ctx2d(c);
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = "source-in";
    paint(g);
    return c;
  };
  const vgrad = (g: Ctx, stops: [number, string][]) => {
    const gr = g.createLinearGradient(0, 0, 0, EMBLEM_PX);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    g.fillStyle = gr;
    g.fillRect(0, 0, EMBLEM_PX, EMBLEM_PX);
  };
  const goldEagle = tint(a.eagle, (g) =>
    vgrad(g, [
      [0.12, "#fff6d8"],
      [0.32, "#ffd36b"],
      [0.55, "#f0a23a"],
      [0.78, "#c9641c"],
      [1, "#8a2f10"],
    ]),
  );
  const fireEagle = tint(a.eagle, (g) =>
    vgrad(g, [
      [0.1, "#fff1b0"],
      [0.4, "#ff9a2e"],
      [0.75, "#e2421a"],
      [1, "#7a1206"],
    ]),
  );
  const darkEagle = tint(a.eagle, (g) => {
    g.fillStyle = "#120a08";
    g.fillRect(0, 0, EMBLEM_PX, EMBLEM_PX);
  });
  const darkBack = tint(a.back, (g) => {
    g.fillStyle = "#0c0605";
    g.fillRect(0, 0, EMBLEM_PX, EMBLEM_PX);
  });
  const fireBack = tint(a.back, (g) =>
    vgrad(g, [
      [0, "#ff8a3a"],
      [0.45, "#d8361a"],
      [1, "#5c0e0a"],
    ]),
  );
  const crest = tint(a.back, (g) =>
    vgrad(g, [
      [0, "#e0703a"],
      [0.3, "#9c2418"],
      [1, "#3a0a0c"],
    ]),
  );
  // halo : version très floue de l'emblème, calculée une fois
  const glow = makeCanvas(EMBLEM_PX, EMBLEM_PX);
  {
    const g = ctx2d(glow);
    g.filter = "blur(38px)";
    g.drawImage(goldEagle, 0, 0);
    g.filter = "blur(14px)";
    g.globalAlpha = 0.8;
    g.drawImage(goldEagle, 0, 0);
  }

  // sprites de particules (dégradé radial, additif)
  const sprite = (inner: string, mid: string, size = 64): Canvas => {
    const c = makeCanvas(size, size);
    const g = ctx2d(c);
    const r = size / 2;
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, inner);
    gr.addColorStop(0.35, mid);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return c;
  };
  const sprHot = sprite("rgba(255,250,220,1)", "rgba(255,190,80,0.55)");
  const sprFire = sprite("rgba(255,170,60,1)", "rgba(255,90,20,0.45)");
  const sprEmber = sprite("rgba(255,120,40,1)", "rgba(200,40,10,0.35)");
  const sprSmoke = sprite("rgba(70,58,52,0.55)", "rgba(40,32,30,0.25)", 128);

  // grain de film (rendu une fois, décalé à chaque image)
  const grain = makeCanvas(256, 256);
  {
    const g = ctx2d(grain);
    const im = g.createImageData(256, 256);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = Math.floor(rnd(i, 9) * 255);
      im.data[i] = v;
      im.data[i + 1] = v;
      im.data[i + 2] = v;
      im.data[i + 3] = 22;
    }
    g.putImageData(im, 0, 0);
  }

  // titre : couches pré-rendues (métal, lueur)
  const titleSize = 132;
  const tw = 1500;
  const th = 260;
  const titleMetal = makeCanvas(tw, th);
  const titleGlow = makeCanvas(tw, th);
  const drawTitle = (g: Ctx) => {
    g.font = `900 ${titleSize}px "${a.font}", sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    (g as CanvasRenderingContext2D).letterSpacing = "18px";
    g.fillText(a.title, tw / 2, th / 2);
  };
  {
    const g = ctx2d(titleMetal);
    const gr = g.createLinearGradient(0, th / 2 - titleSize / 2, 0, th / 2 + titleSize / 2);
    gr.addColorStop(0, "#fff8e6");
    gr.addColorStop(0.42, "#f2c66a");
    gr.addColorStop(0.5, "#8c5a1e");
    gr.addColorStop(0.62, "#d89a45");
    gr.addColorStop(1, "#6a3a12");
    g.fillStyle = gr;
    drawTitle(g);
    // biseau : liseré clair en haut des lettres
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(0, th / 2 - titleSize / 2, tw, 6);
    const gg = ctx2d(titleGlow);
    gg.filter = "blur(18px)";
    gg.fillStyle = "#ffb24a";
    drawTitle(gg);
  }

  const shine = makeCanvas(tw, th);
  const shc = ctx2d(shine);

  // ------------------------------------------------------------------ couches
  const drawSprite = (g: CanvasRenderingContext2D, spr: Canvas, x: number, y: number, size: number, alpha: number) => {
    if (alpha <= 0.003 || size <= 0.5) return;
    g.globalAlpha = Math.min(1, alpha);
    g.drawImage(spr, x - size / 2, y - size / 2, size, size);
  };

  /** Braises d'ambiance : montent lentement, toute la durée (plus nombreuses une fois la scène embrasée). */
  function ambientEmbers(g: CanvasRenderingContext2D, t: number, cam: { fy: number; zoom: number }) {
    const n = 170;
    const fadeIn = seg(t, 0.15, 1.4);
    const lit = 0.35 + 0.65 * seg(t, IGNITE_AT, ASCEND_AT + 1);
    for (let i = 0; i < n; i++) {
      const depth = 0.35 + rnd(i, 1) * 0.65; // parallaxe
      const speed = 0.045 + rnd(i, 2) * 0.09;
      const cyc = (t * speed + rnd(i, 3)) % 1;
      const x = rnd(i, 4) * 2200 - 140 + Math.sin(t * (0.6 + rnd(i, 5)) + i) * 26 * depth;
      const y = 1180 - cyc * 1400 - (cam.fy - 540) * depth * 0.5;
      const flick = 0.6 + 0.4 * Math.sin(t * (7 + rnd(i, 6) * 9) + i * 3);
      const env = Math.sin(cyc * Math.PI);
      const size = (3 + rnd(i, 7) * 7) * depth * (1 + (cam.zoom - 1) * 0.08);
      const show = i < n * lit ? 1 : 0;
      drawSprite(g, i % 5 === 0 ? sprHot : sprEmber, x, y, size * 6, fadeIn * env * flick * depth * show * 0.9);
    }
  }

  /** Flammes émises par l'emblème : naissances régulières, front d'embrasement qui part du cœur. */
  function bodyFlames(g: CanvasRenderingContext2D, t: number) {
    const start = IGNITE_AT - 0.1;
    const end = BURST_AT + 0.05;
    if (t < start) return;
    const rate = 560;
    const maxLife = 1.25;
    const k0 = Math.max(0, Math.floor((t - maxLife - start) * rate));
    const k1 = Math.floor((Math.min(t, end) - start) * rate);
    for (let k = k0; k <= k1; k++) {
      const tb = start + k / rate;
      const age = t - tb;
      const life = 0.45 + rnd(k, 1) * 0.8;
      if (age < 0 || age > life) continue;
      const pt = pts[Math.floor(rnd(k, 2) * pts.length)]!;
      // le feu se propage depuis le cœur de l'oiseau vers les ailes et la traîne
      const front = easeOut(seg(tb, IGNITE_AT, IGNITE_AT + 1.4)) * 720 + 40;
      const d = Math.hypot(pt[0] - 512, pt[1] - 500);
      if (d > front) continue;
      const p0 = toWorld(pose(tb), pt[0], pt[1]);
      // vitesse : montée + dispersion + traîne opposée au mouvement de l'oiseau
      const pa = pose(tb);
      const pb = pose(tb + 0.04);
      const vx = (pa.x - pb.x) * 9 + (rnd(k, 3) - 0.5) * 90;
      const vy = (pa.y - pb.y) * 9 - 120 - rnd(k, 4) * 160;
      const turb = Math.sin(age * 9 + k) * 14 * age;
      const x = p0.x + vx * age + turb;
      const y = p0.y + vy * age - 90 * age * age;
      const q = age / life;
      const size = (16 + rnd(k, 5) * 30) * (1 - q * 0.6) * pa.scale * 1.15;
      const spr = q < 0.25 ? sprHot : q < 0.6 ? sprFire : sprEmber;
      drawSprite(g, spr, x, y, size, (1 - q) * (q < 0.08 ? q / 0.08 : 1) * 0.5);
    }
  }

  /** Vagues de flammes à chaque battement d'ailes pendant l'ascension : nappes projetées depuis les ailes. */
  function wingWaves(g: CanvasRenderingContext2D, t: number) {
    for (let b = 0; b < 3; b++) {
      const tb = ASCEND_AT + 0.3 + b * 0.62;
      const age = t - tb;
      if (age < 0 || age > 1.2) continue;
      const p = pose(tb);
      for (let i = 0; i < 160; i++) {
        const sd = b * 1000 + i;
        const pt = wingPts[Math.floor(rnd(sd, 1) * wingPts.length)]!;
        const w0 = toWorld(p, pt[0], pt[1]);
        const side = pt[0] > 512 ? 1 : -1;
        const sp = 110 + rnd(sd, 2) * 230;
        const ang = (rnd(sd, 3) - 0.3) * 0.9;
        const x = w0.x + side * Math.cos(ang) * sp * age;
        const y = w0.y + Math.sin(ang) * sp * age * 0.7 + 160 * age * age;
        const q = age / 1.2;
        drawSprite(g, q < 0.2 ? sprHot : q < 0.6 ? sprFire : sprEmber, x, y, (22 + rnd(sd, 4) * 34) * (1 - q * 0.5), (1 - q) * (1 - q) * 0.55);
      }
    }
  }

  /** Explosion de lumière à l'apex : éclair, onde de choc, gerbe de particules. */
  function burst(g: CanvasRenderingContext2D, t: number) {
    const age = t - BURST_AT;
    if (age < 0 || age > 3) return;
    const c = pose(BURST_AT);
    for (let i = 0; i < 760; i++) {
      const life = 1.0 + rnd(i, 11) * 1.6;
      if (age > life) continue;
      const ang = rnd(i, 12) * Math.PI * 2;
      const v = 380 + rnd(i, 13) * 1500;
      const drag = 2.6;
      const dist = (v * (1 - Math.exp(-drag * age))) / drag;
      const x = c.x + Math.cos(ang) * dist;
      const y = c.y + Math.sin(ang) * dist * 0.82 - 60 * age * age;
      const q = age / life;
      drawSprite(g, q < 0.2 ? sprHot : q < 0.55 ? sprFire : sprEmber, x, y, (14 + rnd(i, 14) * 30) * (1 - q * 0.7), (1 - q) * 0.95);
    }
    // onde de choc
    const r = easeOut(seg(age, 0, 0.9)) * 1300;
    const ringA = 1 - seg(age, 0.05, 0.9);
    if (ringA > 0) {
      g.globalAlpha = ringA * 0.55;
      const gr = g.createRadialGradient(c.x, c.y, Math.max(0, r - 90), c.x, c.y, r);
      gr.addColorStop(0, "rgba(255,190,90,0)");
      gr.addColorStop(0.7, "rgba(255,210,140,0.9)");
      gr.addColorStop(1, "rgba(255,120,40,0)");
      g.fillStyle = gr;
      g.fillRect(c.x - r, c.y - r, r * 2, r * 2);
    }
  }

  /** Fumée d'où surgit le titre. */
  function titleSmoke(g: CanvasRenderingContext2D, t: number) {
    const age = t - (TITLE_AT - 0.25);
    if (age < 0) return;
    for (let i = 0; i < 46; i++) {
      const life = 2.2 + rnd(i, 21) * 1.6;
      const a = age - rnd(i, 22) * 0.3;
      if (a < 0 || a > life) continue;
      const x = 960 + (rnd(i, 23) - 0.5) * 1250 + (rnd(i, 24) - 0.5) * 220 * a;
      const y = 800 + (rnd(i, 25) - 0.5) * 120 - 70 * a;
      const q = a / life;
      const size = (220 + rnd(i, 26) * 260) * (0.6 + q * 0.8);
      g.globalCompositeOperation = "source-over";
      drawSprite(g, sprSmoke, x, y, size, Math.sin(q * Math.PI) * 0.7);
    }
  }

  function drawEmblem(g: CanvasRenderingContext2D, img: Canvas, p: Pose, alpha: number) {
    if (alpha <= 0) return;
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    g.scale(p.scale * p.spread, p.scale);
    g.globalAlpha = alpha;
    g.drawImage(img, -EMBLEM_PX / 2, -EMBLEM_PX / 2);
    g.restore();
  }

  // couche de travail pour l'embrasement progressif (emblème de feu masqué par le front)
  const fireLayer = makeCanvas(EMBLEM_PX, EMBLEM_PX);
  const fl = ctx2d(fireLayer);

  // ------------------------------------------------------------------ rendu d'une image
  function render(g: CanvasRenderingContext2D, t: number, w: number, h: number) {
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);
    // couvre la toile, sans jamais rogner le titre (≈ 1 400 px de référence) dans une fenêtre étroite
    const k = Math.min(Math.max(w / REF_W, h / REF_H), w / 1480);
    g.translate((w - REF_W * k) / 2, (h - REF_H * k) / 2);
    g.scale(k, k);
    // zone visible en coordonnées de référence (déborde du 1920 × 1080 si la fenêtre n'est pas en 16:9)
    const vx = -(w - REF_W * k) / 2 / k;
    const vy = -(h - REF_H * k) / 2 / k;
    const vw = w / k;
    const vh = h / k;

    // fond : nuit chaude, qui s'éclaire avec le feu
    const warm = seg(t, IGNITE_AT, BURST_AT) * 0.6 + (t >= BURST_AT ? 0.4 * (1 - seg(t, BURST_AT, BURST_AT + 2)) + 0.25 : 0);
    const bg = g.createRadialGradient(960, 520, 50, 960, 560, 1250);
    bg.addColorStop(0, `rgba(${Math.round(40 + 60 * warm)},${Math.round(16 + 22 * warm)},${Math.round(10 + 8 * warm)},1)`);
    bg.addColorStop(0.55, `rgba(${Math.round(12 + 14 * warm)},${Math.round(6 + 6 * warm)},6,1)`);
    bg.addColorStop(1, "#020101");
    g.globalAlpha = seg(t, 0.4, 2.5);
    g.fillStyle = bg;
    g.fillRect(vx, vy, vw, vh);
    g.globalAlpha = 1;

    const cam = camera(t);
    g.globalCompositeOperation = "lighter";
    ambientEmbers(g, t, cam);
    g.globalCompositeOperation = "source-over";
    g.save();
    g.translate(960, 540);
    g.scale(cam.zoom, cam.zoom);
    g.translate(-cam.fx, -cam.fy);

    const p = pose(t);

    // rayons de lumière volumétriques derrière l'oiseau (à partir de l'embrasement)
    const rays = seg(t, IGNITE_AT + 0.4, ASCEND_AT + 0.6) * (t > BURST_AT ? 0.6 + 0.4 * (1 - seg(t, BURST_AT, BURST_AT + 1)) : 1);
    if (rays > 0) {
      g.save();
      g.globalCompositeOperation = "lighter";
      g.translate(p.x, p.y - 60 * p.scale);
      for (let i = 0; i < 11; i++) {
        const ang = (i / 11) * Math.PI * 2 + t * 0.04 + rnd(i, 31) * 0.4;
        const len = 900 + rnd(i, 32) * 700;
        const wdt = 50 + rnd(i, 33) * 110;
        g.save();
        g.rotate(ang);
        const gr = g.createLinearGradient(0, 0, len, 0);
        gr.addColorStop(0, `rgba(255,190,90,${0.06 * rays})`);
        gr.addColorStop(1, "rgba(255,120,40,0)");
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(0, -8);
        g.lineTo(len, -wdt);
        g.lineTo(len, wdt);
        g.lineTo(0, 8);
        g.closePath();
        g.fill();
        g.restore();
      }
      g.restore();
    }

    // halo doré autour de l'emblème
    const haloA = t < BURST_AT ? seg(t, IGNITE_AT, ASCEND_AT) * 0.7 : lerp(0.9, 0.42, seg(t, BURST_AT, BURST_AT + 1.8));
    g.globalCompositeOperation = "lighter";
    drawEmblem(g, glow, { ...p, scale: p.scale * 1.08 }, Math.min(0.85, haloA * (0.9 + 0.1 * Math.sin(t * 2.2))));
    g.globalCompositeOperation = "source-over";

    // contre-jour du réveil : la silhouette sombre se découpe sur une lueur chaude
    const back = seg(t, 1.0, 2.6) * (1 - seg(t, IGNITE_AT, ASCEND_AT));
    if (back > 0) {
      g.globalCompositeOperation = "lighter";
      const c0 = toWorld(p, 512, 420);
      const R = 620 * p.scale;
      const gr = g.createRadialGradient(c0.x, c0.y, 0, c0.x, c0.y, R);
      gr.addColorStop(0, `rgba(255,140,50,${0.55 * back})`);
      gr.addColorStop(0.5, `rgba(160,50,15,${0.25 * back})`);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = 1;
      g.fillStyle = gr;
      g.fillRect(c0.x - R, c0.y - R, R * 2, R * 2);
      g.globalCompositeOperation = "source-over";
    }

    // grandes plumes arrière : sombres au réveil, embrasées, puis pourpre et or sur l'emblème final
    drawEmblem(g, darkBack, p, seg(t, 1.2, 2.6) * (1 - seg(t, IGNITE_AT + 0.4, IGNITE_AT + 1.4)));
    drawEmblem(g, fireBack, p, seg(t, IGNITE_AT + 0.4, IGNITE_AT + 1.4) * (1 - seg(t, BURST_AT, BURST_AT + 0.4)));
    drawEmblem(g, crest, p, seg(t, BURST_AT + 0.4, BURST_AT + 1.4) * 0.9);

    // l'oiseau : silhouette sombre au réveil, puis embrasement progressif, puis or après l'explosion
    const revealDark = seg(t, 1.2, 2.6);
    drawEmblem(g, darkEagle, p, revealDark * (t < BURST_AT ? 1 : 1 - seg(t, BURST_AT, BURST_AT + 0.3)));
    // liseré lumineux du réveil (contour éclairé par les braises)
    if (t < IGNITE_AT + 0.6) {
      const rim = seg(t, 1.0, 2.2) * (1 - seg(t, IGNITE_AT, IGNITE_AT + 0.6));
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < edge.length; i += 2) {
        const e = edge[i]!;
        const wpt = toWorld(p, e[0], e[1]);
        const fl2 = 0.5 + 0.5 * Math.sin(t * 5 + i);
        drawSprite(g, sprFire, wpt.x, wpt.y, 9 * p.scale * 2, rim * 0.3 * fl2);
      }
      g.globalCompositeOperation = "source-over";
    }
    if (t >= IGNITE_AT - 0.1 && t < BURST_AT + 0.4) {
      // front d'embrasement (même règle que les flammes)
      const front = easeOut(seg(t, IGNITE_AT, IGNITE_AT + 1.4)) * 720 + 40;
      fl.globalCompositeOperation = "source-over";
      fl.clearRect(0, 0, EMBLEM_PX, EMBLEM_PX);
      fl.drawImage(fireEagle, 0, 0);
      fl.globalCompositeOperation = "destination-in";
      const gr = fl.createRadialGradient(512, 500, Math.max(0, front - 120), 512, 500, front + 30);
      gr.addColorStop(0, "rgba(0,0,0,1)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      fl.fillStyle = gr;
      fl.fillRect(0, 0, EMBLEM_PX, EMBLEM_PX);
      const flick = 0.88 + 0.12 * Math.sin(t * 23) * Math.sin(t * 7.3);
      drawEmblem(g, fireLayer, p, flick * (t < BURST_AT ? 1 : 1 - seg(t, BURST_AT, BURST_AT + 0.4)));
    }
    // emblème doré final
    const goldA = seg(t, BURST_AT + 0.15, BURST_AT + 1.2);
    drawEmblem(g, goldEagle, p, goldA);

    // yeux dorés
    const eyeA = seg(t, 0.7, 1.3) * (1 - seg(t, IGNITE_AT + 0.2, IGNITE_AT + 1.2) * 0.65) * (t >= BURST_AT ? 0 : 1);
    if (eyeA > 0) {
      g.globalCompositeOperation = "lighter";
      EYES.forEach(([ex, ey], i) => {
        const wpt = toWorld(p, ex, ey);
        const a2 = eyeA;
        const pulse = 0.85 + 0.15 * Math.sin(t * 3.1 + i);
        drawSprite(g, sprHot, wpt.x, wpt.y, 11 * p.scale * 2, a2 * pulse);
        drawSprite(g, sprHot, wpt.x, wpt.y, 6 * p.scale * 2, a2 * pulse);
        drawSprite(g, sprFire, wpt.x, wpt.y, 34 * p.scale * 2, a2 * 0.35 * pulse);
      });
      g.globalCompositeOperation = "source-over";
    }

    // feu, vagues, explosion
    g.globalCompositeOperation = "lighter";
    bodyFlames(g, t);
    wingWaves(g, t);
    burst(g, t);
    g.globalCompositeOperation = "source-over";

    g.restore(); // fin caméra

    // titre (écran fixe : pas de caméra)
    titleSmoke(g, t);
    const ta = seg(t, TITLE_AT - 0.05, TITLE_AT + 0.9);
    if (ta > 0) {
      const ty = 790;
      const s = lerp(1.18, 1, easeOut(seg(t, TITLE_AT - 0.05, TITLE_AT + 0.7)));
      g.save();
      g.translate(960, ty);
      g.scale(s, s);
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = ta * (0.55 + 0.25 * (1 - seg(t, TITLE_AT, TITLE_AT + 1.4)));
      g.drawImage(titleGlow, -tw / 2, -th / 2);
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = easeOut(ta);
      g.drawImage(titleMetal, -tw / 2, -th / 2);
      // reflet qui balaie le métal
      const sweep = seg(t, TITLE_AT + 0.5, TITLE_AT + 1.5);
      if (sweep > 0 && sweep < 1) {
        // composé hors écran (lettres seulement), puis ajouté en lumière
        const sx = lerp(0, tw, sweep);
        shc.globalCompositeOperation = "source-over";
        shc.clearRect(0, 0, tw, th);
        shc.drawImage(titleMetal, 0, 0);
        shc.globalCompositeOperation = "source-in";
        const gr = shc.createLinearGradient(sx - 140, 0, sx + 140, 0);
        gr.addColorStop(0, "rgba(255,240,200,0)");
        gr.addColorStop(0.5, "rgba(255,244,214,0.9)");
        gr.addColorStop(1, "rgba(255,240,200,0)");
        shc.fillStyle = gr;
        shc.fillRect(0, 0, tw, th);
        g.globalCompositeOperation = "lighter";
        g.globalAlpha = 0.8;
        g.drawImage(shine, -tw / 2, -th / 2);
        g.globalCompositeOperation = "source-over";
      }
      g.restore();
    }

    // éclair blanc de l'explosion (écran)
    const flash = t >= BURST_AT ? Math.exp(-(t - BURST_AT) * 3.2) * (1 - Math.exp(-(t - BURST_AT) * 40)) : 0;
    if (flash > 0.002) {
      g.globalCompositeOperation = "lighter";
      const gr = g.createRadialGradient(960, 400, 0, 960, 400, 1400);
      gr.addColorStop(0, `rgba(255,248,225,${flash})`);
      gr.addColorStop(0.4, `rgba(255,190,90,${flash * 0.8})`);
      gr.addColorStop(1, `rgba(120,40,10,${flash * 0.3})`);
      g.globalAlpha = 1;
      g.fillStyle = gr;
      g.fillRect(vx, vy, vw, vh);
      g.globalCompositeOperation = "source-over";
    }

    // vignette + grain
    const vig = g.createRadialGradient(960, 540, 420, 960, 540, 1150);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.78)");
    g.globalAlpha = 1;
    g.fillStyle = vig;
    g.fillRect(vx, vy, vw, vh);
    g.globalAlpha = 0.5;
    const ox = Math.floor(rnd(Math.floor(t * 30), 41) * 256);
    const oy = Math.floor(rnd(Math.floor(t * 30), 42) * 256);
    g.fillStyle = g.createPattern(grain as CanvasImageSource, "repeat") ?? "transparent";
    g.translate(-ox, -oy);
    g.fillRect(vx, vy, vw + 256, vh + 256);
    g.restore();
  }

  return { render };
}
