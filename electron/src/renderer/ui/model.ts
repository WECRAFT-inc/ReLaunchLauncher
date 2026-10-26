// Données et règles de l'interface (lot E6), reprises du prototype « ReLaunch × WeCraft » (prototype.js) :
// mêmes clés de stockage local (préférences d'affichage seulement), mêmes valeurs par défaut, mêmes règles.
import type { InstanceIcon, InstanceView } from "../../shared/api";

export type Source = InstanceView["source"];

/** Instance telle que l'interface l'affiche (format du prototype). */
export interface Inst {
  id: string;
  k: "wc";
  n: string;
  s: Source;
  v: string;
  l: string;
  lv: string;
  r: number | null;
  m: string;
  fav: boolean;
  c: [string, string];
  last?: number;
  /** WePack créé par WeCraft : modifiable dans Découvrir (lot E7). */
  mp?: boolean;
  /** Icône choisie (sinon dégradé de la source et initiales). */
  icon: InstanceIcon | null;
  /** Fond choisi (adresse app://). */
  bg: string | null;
  /** Modpack d'événement : seuls ses packs de ressources et shaders se modifient. */
  ev: { id: string; name: string } | null;
}

export const SC: Record<string, string> = { WeCraft: "var(--acc)", CurseForge: "#f16436", Prism: "#5eead4", Modrinth: "#1bd96a" };
export const SRCCOL: Record<string, [string, string]> = {
  WeCraft: ["#ff8a3d", "#c2410c"],
  CurseForge: ["#f16436", "#7c2d12"],
  Modrinth: ["#1bd96a", "#065f46"],
  Prism: ["#5eead4", "#155e75"],
};

export function toInst(i: InstanceView): Inst {
  return {
    id: i.id,
    k: "wc",
    n: i.name,
    s: i.source,
    v: i.version || "",
    l: i.loader || "Vanilla",
    lv: i.loaderVersion || "",
    r: i.ram,
    m: "",
    fav: !!i.fav,
    c: SRCCOL[i.source] ?? SRCCOL["WeCraft"]!,
    ...(i.modpack ? { mp: true } : {}),
    icon: i.icon ?? null,
    bg: i.background ?? null,
    ev: i.event ?? null,
    ...(i.lastPlayed ? { last: i.lastPlayed } : {}),
  };
}

const DAY = 864e5;
export function ago(t: number | undefined, now = Date.now()): string {
  if (!t) return "jamais";
  const d = now - t;
  if (d < 36e5) return "il y a quelques minutes";
  if (d < DAY) return `il y a ${Math.round(d / 36e5)} h`;
  const j = Math.round(d / DAY);
  return j === 1 ? "hier" : `il y a ${j} jours`;
}

export function initials(n: string): string {
  return n
    .split(/\s+/)
    .filter((w) => /^[A-Za-zÀ-ÿ0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function detail(x: Inst): string {
  return [x.l, x.lv].filter(Boolean).join(" ") + " · " + (x.v || "version inconnue") + (x.r ? ` · ${x.r} Go` : "") + " · " + x.s;
}

// ---------------------------------------------------------------- stockage local (préférences d'affichage)
export function store(k: string, v: unknown): void {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // stockage indisponible : la préférence vaut pour cette session
  }
}
export function load<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
}
export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

// ---------------------------------------------------------------- préférences
export interface Pref {
  skin: string;
  ram: number;
  discord: boolean;
  reopen: boolean;
  start: string;
  java: boolean;
  custom: { h: number; s: number; l: number };
  bg: string;
  style?: string;
  reclick?: string;
  /** Images de fond des instances (et, plus tard, des événements) affichées ; false = fond du thème. */
  imgs?: boolean;
  /** Animations et transitions ; false = réduites (respecte aussi le réglage d'accessibilité du système). */
  anim?: boolean;
  /** Langue de l'interface (français par défaut, langue de secours). */
  lang?: "fr" | "en";
  /** Format de l'image de fond de l'accueil. */
  bgFmt?: BgFmt;
  /** Espacement entre les boutons (px) : barre principale, barre séparée des épingles, barre d'utilitaires. */
  gaps?: { main: number; dock: number; util: number };
  [k: string]: unknown;
}
export type BgFmt = "off" | "mini" | "reduced" | "large" | "fill";
export const BG_FORMATS: [BgFmt, string, string][] = [
  ["off", "Désactivé", "Aucune image (sauf événements)"],
  ["mini", "Minimaliste", "Un petit encart au-dessus du titre"],
  ["reduced", "Réduite", "Au-dessus du titre, la majorité de l'écran"],
  ["large", "Large", "Derrière l'accueil (actuel)"],
  ["fill", "Remplissage", "Tout l'écran, derrière les barres"],
];
/** Format choisi ; l'ancien interrupteur « Images de fond » désactivé vaut « Désactivé ». */
export const bgFmtOf = (p: Pref): BgFmt => (p.bgFmt && BG_FORMATS.some((f) => f[0] === p.bgFmt) ? p.bgFmt : p.imgs === false ? "off" : "large");
export const GAP_DEF = { main: 5, dock: 5, util: 5 };
export const gapsOf = (p: Pref) => {
  const g = (p.gaps ?? {}) as Partial<typeof GAP_DEF>;
  const n = (v: unknown, d: number) => (typeof v === "number" && v >= 0 && v <= 24 ? Math.round(v) : d);
  return { main: n(g.main, GAP_DEF.main), dock: n(g.dock, GAP_DEF.dock), util: n(g.util, GAP_DEF.util) };
};

export function loadPref(): Pref {
  const p = load<Pref | null>("proto-pref2", null) ?? ({ skin: "phenix", ram: 6, discord: false, reopen: true, start: "home", java: true } as Pref);
  if (!p.custom) p.custom = { h: 330, s: 80, l: 60 };
  if (!p.bg) p.bg = "pattern";
  return p;
}
export interface Car {
  on: boolean;
  n: number;
  auto: boolean;
  speed: number;
}
export function loadCar(): Car {
  const c = load<Car | null>("proto-car", null) ?? { on: true, n: 3, auto: true, speed: 6 };
  c.on = true;
  return c;
}
export interface HomePref {
  resume: boolean;
}
export const loadHome = (): HomePref => load<HomePref | null>("proto-home3", null) ?? { resume: true };

// ---------------------------------------------------------------- navigation
export type Side = "top" | "bottom" | "left" | "right";
export interface NavItem {
  id: string;
  on: boolean;
  bar: "h" | "v";
}
export type Pin = { t: "i"; id: string } | { t: "g"; id: string; name: string; items: string[] };
export interface NavConfig {
  mode: "single" | "double";
  single: Side;
  h: Side;
  v: Side;
  junction: "logo" | "profil";
  joined?: boolean;
  pinMode: "inline" | "section" | "dock";
  dock: { side: Side; align: "start" | "center" | "end" };
  pins: Pin[];
  items: NavItem[];
  size?: string;
}
export const NAVDEF: NavConfig = {
  mode: "single",
  single: "left",
  h: "top",
  v: "left",
  junction: "logo",
  pinMode: "inline",
  dock: { side: "bottom", align: "center" },
  pins: [],
  items: [
    { id: "wecraft", on: true, bar: "h" },
    { id: "relaunch", on: true, bar: "h" },
    { id: "welive", on: true, bar: "h" },
    { id: "sep1", on: true, bar: "v" },
    { id: "discover", on: true, bar: "v" },
    { id: "create", on: true, bar: "v" },
    { id: "favorites", on: true, bar: "v" },
    { id: "shop", on: true, bar: "v" },
    { id: "quests", on: true, bar: "v" },
    { id: "sep2", on: true, bar: "v" },
    { id: "pins", on: true, bar: "v" },
    { id: "spacer", on: true, bar: "v" },
    { id: "settings", on: true, bar: "v" },
  ],
};
export interface NavInfo {
  l: string;
  d?: string;
  view?: string;
  act?: string;
  rl?: string;
  pin?: boolean;
  sep?: boolean;
}
export const NAVINFO: Record<string, NavInfo> = {
  wecraft: { l: "WeCraft", d: "Launcher et instances", view: "wecraft" },
  relaunch: { l: "ReLaunch", d: "Events et serveurs", view: "relaunch" },
  welive: { l: "WeLive", d: "Contenus MC francophones", view: "welive" },
  discover: { l: "Découvrir du contenu MC", d: "Modpacks, mods, shaders…", view: "discover" },
  create: { l: "Créer un WePack", d: "Nouvelle instance", act: "create" },
  favorites: { l: "Favoris", d: "Instances favorites", view: "favorites" },
  shop: { l: "Shop", d: "Capes, cosmétiques, grades", view: "relink", rl: "shop" },
  quests: { l: "Avantages & Quêtes", d: "Quêtes, série de jours, quêtes d'events", view: "quests" },
  pins: { l: "Instances épinglées", d: "Affichage choisi plus bas" },
  spacer: { l: "Espace flexible", d: "Ce qui suit va au bout de la barre" },
  settings: { l: "Réglages", d: "Toujours en bas de sa barre", view: "settings", pin: true },
  sep1: { l: "Séparateur", sep: true },
  sep2: { l: "Séparateur", sep: true },
};
export const BARSIZES: Record<string, { v: number; h: number; b: number; l: string }> = {
  xs: { v: 60, h: 54, b: 30, l: "Très fine" },
  s: { v: 72, h: 64, b: 35, l: "Fine" },
  m: { v: 84, h: 74, b: 40, l: "Normale" },
  l: { v: 100, h: 88, b: 48, l: "Grande" },
  xl: { v: 116, h: 102, b: 56, l: "Très grande" },
};
export const barSize = (n: NavConfig) => BARSIZES[n.size ?? ""] ?? BARSIZES["m"]!;

export type ProfPlace = "end" | "start" | "float" | "dtop" | "dright" | "corner" | "hend" | "vstart";
/** Le profil reste en haut à droite : dans une barre si elle passe par là, sinon posé sur la fenêtre. */
export function profPlace(c: Pick<NavConfig, "mode" | "single" | "joined" | "h" | "v" | "junction">): ProfPlace {
  if (c.mode === "single") return c.single === "top" ? "end" : c.single === "right" ? "start" : "float";
  if (c.joined === false) return c.h === "top" || c.v === "top" ? "dtop" : c.h === "right" || c.v === "right" ? "dright" : "float";
  if (c.junction === "profil") return "corner";
  if (c.h === "top") return "hend";
  if (c.v === "right") return "vstart";
  return "float";
}
export const occupied = (c: NavConfig): Side[] => (c.mode === "single" ? [c.single] : [c.h, c.v]);
/** Bord de la barre des épingles, jamais un bord déjà pris (corrige la config comme le prototype). */
export function dockSide(n: NavConfig): Side {
  const occ = occupied(n);
  if (occ.includes(n.dock.side)) n.dock.side = (["bottom", "right", "top", "left"] as Side[]).filter((s) => !occ.includes(s))[0]!;
  return n.dock.side;
}

// ---------------------------------------------------------------- épingles
export const pinCount = (n: NavConfig) => n.pins.reduce((a, p) => a + (p.t === "i" ? 1 : p.items.length), 0);
export const gById = (n: NavConfig, id: string) => n.pins.find((p): p is Extract<Pin, { t: "g" }> => p.t === "g" && p.id === id);
export const groupOf = (n: NavConfig, id: string) => n.pins.find((p): p is Extract<Pin, { t: "g" }> => p.t === "g" && p.items.includes(id));
export const topIndexOf = (n: NavConfig, id: string) => n.pins.findIndex((p) => p.t === "i" && p.id === id);
export const isPinned = (n: NavConfig, id: string) => topIndexOf(n, id) > -1 || !!groupOf(n, id);
export function pullRaw(n: NavConfig, id: string): void {
  for (const p of n.pins) {
    if (p.t === "g") {
      const k = p.items.indexOf(id);
      if (k > -1) p.items.splice(k, 1);
    }
  }
  const i = topIndexOf(n, id);
  if (i > -1) n.pins.splice(i, 1);
}
export function tidy(n: NavConfig): void {
  n.pins = n.pins.reduce<Pin[]>((acc, p) => {
    if (p.t === "g") {
      if (!p.items.length) return acc;
      if (p.items.length === 1) {
        acc.push({ t: "i", id: p.items[0]! });
        return acc;
      }
    }
    acc.push(p);
    return acc;
  }, []);
}
/** normPins : épingles d'anciennes versions converties ; instances disparues retirées (si la liste est connue). */
export function normPins(n: NavConfig, known: (id: string) => boolean): void {
  n.pins = (n.pins || [])
    .map((p) => (typeof p === "string" ? ({ t: "i", id: p } as Pin) : p))
    .map((p) => {
      if (p.t === "g") p.items = (p.items || []).filter(known);
      return p;
    })
    .filter((p) => (p.t === "g" ? p.items.length > 0 : known(p.id)));
  n.pinMode = n.pinMode || "inline";
  n.dock = n.dock || { side: "bottom", align: "center" };
}

export interface PinDropResult {
  toast?: string;
  pop?: { kind: "group"; gid: string; rename: true; anchor: string };
}
/** Glisser-déposer des épingles (port exact de pinDrop). Modifie `n`. */
export function pinDrop(n: NavConfig, drag: string, target: string): PinDropResult | null {
  if (drag === target) return null;
  const d = drag.split(":");
  const t = target.split(":");
  const out: PinDropResult = {};
  if (target === "zone") {
    if (d[0] === "i") {
      pullRaw(n, d[1]!);
      n.pins.push({ t: "i", id: d[1]! });
    } else {
      const gi = n.pins.findIndex((p) => p.t === "g" && p.id === d[1]);
      n.pins.push(n.pins.splice(gi, 1)[0]!);
    }
  } else if (t[0] === "g") {
    const G = gById(n, t[1]!);
    if (!G) return null;
    if (d[0] === "i") {
      if (G.items.includes(d[1]!)) return null;
      pullRaw(n, d[1]!);
      G.items.push(d[1]!);
    } else {
      const H = gById(n, d[1]!)!;
      G.items = G.items.concat(H.items);
      n.pins = n.pins.filter((p) => p !== H);
    }
    out.toast = `Ajouté au groupe « ${G.name} »`;
  } else {
    const X = t[1]!;
    if (d[0] === "g") {
      const H2 = gById(n, d[1]!)!;
      if (H2.items.includes(X)) return null;
      pullRaw(n, X);
      H2.items.push(X);
      out.toast = `Ajouté au groupe « ${H2.name} »`;
    } else {
      const Y = d[1]!;
      const Gx = groupOf(n, X);
      if (Gx) {
        if (!Gx.items.includes(Y)) {
          pullRaw(n, Y);
          Gx.items.push(Y);
        }
      } else {
        pullRaw(n, Y);
        const idx = topIndexOf(n, X);
        const ng: Pin = { t: "g", id: "g" + Date.now().toString(36), name: "Nouveau groupe", items: [X, Y] };
        n.pins.splice(idx, 1, ng);
        out.pop = { kind: "group", gid: ng.id, rename: true, anchor: `pgrp-${ng.id}` };
        out.toast = "Groupe créé : donne-lui un nom";
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- configurations prêtes
export interface Preset {
  cfg: Partial<NavConfig> & Pick<NavConfig, "mode">;
  pinMode: NavConfig["pinMode"];
  dock?: NavConfig["dock"];
  items: NavItem[];
}
const onlyOn = (on: Record<string, 1>) => NAVDEF.items.map((x) => ({ id: x.id, on: !!on[x.id], bar: x.bar }));
export const PRESETS: Record<string, () => Preset> = {
  minimal: () => ({
    cfg: { mode: "single", single: "left" },
    pinMode: "section",
    items: onlyOn({ wecraft: 1, relaunch: 1, welive: 1, sep1: 1, create: 1, shop: 1, quests: 1, sep2: 1, spacer: 1, settings: 1 }),
  }),
  condensed: () => ({
    cfg: { mode: "single", single: "left" },
    pinMode: "section",
    items: onlyOn({ wecraft: 1, relaunch: 1, welive: 1, create: 1, shop: 1, quests: 1, spacer: 1, settings: 1 }),
  }),
  all: () => ({ cfg: { mode: "single", single: "left" }, pinMode: "dock", dock: { side: "right", align: "end" }, items: NAVDEF.items.map((x) => ({ id: x.id, on: true, bar: x.bar })) }),
  split: () => ({
    cfg: { mode: "double", joined: false, h: "top", v: "left", junction: "logo" },
    pinMode: "dock",
    dock: { side: "right", align: "end" },
    items: NAVDEF.items.map((x) => ({ id: x.id, on: true, bar: ["wecraft", "relaunch", "welive"].includes(x.id) ? "h" : "v" })),
  }),
};
export const PRESET_NAMES: Record<string, string> = { minimal: "Minimaliste", condensed: "Condensé", all: "Toutes les features", split: "Réparti" };

export interface Skin {
  n: string;
  sk: string;
  hair: string;
  eye: string;
  shirt: string;
  pants: string;
  shoe: string;
  saved?: boolean;
}
export const SKINS: Skin[] = [
  { n: "Steve", sk: "#b58a6b", hair: "#3b2416", eye: "#4c3a9c", shirt: "#14a3a3", pants: "#3b3299", shoe: "#4a4a4a" },
  { n: "Alex", sk: "#f2c9a0", hair: "#e0782a", eye: "#2f7a3a", shirt: "#6fb36a", pants: "#6b4a2b", shoe: "#3a2a1a" },
  { n: "Zuri", sk: "#e8a67a", hair: "#a3401f", eye: "#3a2a1a", shirt: "#f0a24a", pants: "#1e5f6b", shoe: "#3a2a1a" },
  { n: "Sunny", sk: "#8d5a3b", hair: "#8b5fbf", eye: "#1a1a1a", shirt: "#b8dce0", pants: "#2a1a2a", shoe: "#1a1a1a" },
  { n: "Noor", sk: "#f0c08a", hair: "#f2e08a", eye: "#3a7ac0", shirt: "#5a2a4a", pants: "#2a2030", shoe: "#1a1a1a" },
  { n: "Makena", sk: "#5a3a22", hair: "#2a1a10", eye: "#1a1a1a", shirt: "#d0a020", pants: "#7a3a20", shoe: "#2a1a10" },
  { n: "Kai", sk: "#c88a64", hair: "#6a2a10", eye: "#2a2a2a", shirt: "#c02a2a", pants: "#202020", shoe: "#3a3a3a" },
  { n: "Efe", sk: "#a8704a", hair: "#202020", eye: "#1a1a1a", shirt: "#5aa83a", pants: "#3a6ac0", shoe: "#5a5a5a" },
  { n: "Phénix", sk: "#e8b48a", hair: "#c2410c", eye: "#ff8a3d", shirt: "#ff8a3d", pants: "#2a1a12", shoe: "#c2410c", saved: true },
  { n: "Event S3", sk: "#d49a72", hair: "#1a1a1a", eye: "#fbbf24", shirt: "#7c2d12", pants: "#3a3a3a", shoe: "#fb923c", saved: true },
];

export const VIEWS = ["news", "home", "wecraft", "relaunch", "welive", "live", "relink", "settings", "favorites", "discover", "instance", "pins", "addcontent", "quests"] as const;
export type View = (typeof VIEWS)[number];
export const THEMES = ["phenix", "relink", "aurore", "glace"] as const;

/** Catégories Modrinth traduites (affichage et filtre). */
export const CATEGORY_FR: Record<string, string> = {
  optimization: "Optimisation", decoration: "Décoration", library: "Bibliothèque", utility: "Utilitaire", technology: "Technologie",
  adventure: "Aventure", magic: "Magie", storage: "Stockage", equipment: "Équipement", food: "Nourriture", "game-mechanics": "Mécaniques",
  mobs: "Créatures", worldgen: "Génération", transportation: "Transport", social: "Social", economy: "Économie", cursed: "Maudit",
  management: "Gestion", minigame: "Mini-jeu", challenging: "Difficile", combat: "Combat", "kitchen-sink": "Tout-en-un", lightweight: "Léger",
  multiplayer: "Multijoueur", quests: "Quêtes", realistic: "Réaliste", simplistic: "Simple", "vanilla-like": "Comme l'original", themed: "Thématique",
  cartoon: "Cartoon", fantasy: "Fantastique", "semi-realistic": "Semi-réaliste", atmosphere: "Atmosphère", bloom: "Bloom", shadows: "Ombres",
  reflections: "Reflets", "path-tracing": "Path tracing", "colored-lighting": "Éclairage coloré", potato: "PC modeste", low: "Léger", medium: "Moyen",
  high: "Exigeant", screenshot: "Captures", "audio": "Audio", blocks: "Blocs", "core-shaders": "Core shaders", entities: "Entités", environment: "Environnement",
  fonts: "Polices", gui: "Interface", items: "Objets", locale: "Langue", models: "Modèles", "16x": "16x", "32x": "32x", "64x": "64x", "128x": "128x", "256x": "256x", "512x+": "512x+",
};

export const RECENT_DAYS = 30;
export const isRecent = (x: Inst, now = Date.now()) => !!x.last && now - x.last < RECENT_DAYS * DAY;
/**
 * Ordre des listes d'instances : favoris d'abord, puis celles lancées depuis moins de 30 jours (la plus récente
 * en premier), puis le reste (ordre d'origine gardé).
 */
export function orderInstances(list: Inst[], now = Date.now()): Inst[] {
  const rank = (x: Inst) => (x.fav ? 0 : isRecent(x, now) ? 1 : 2);
  return list
    .map((x, i) => ({ x, i }))
    .sort((a, b) => rank(a.x) - rank(b.x) || (rank(a.x) === 1 ? b.x.last! - a.x.last! : 0) || a.i - b.i)
    .map(({ x }) => x);
}

/** Groupes d'instances de la page WeCraft (affichage seulement, gardés sur ce PC). */
export interface InstGroup {
  id: string;
  name: string;
  ids: string[];
}
export function loadGroups(): InstGroup[] {
  const v = load<unknown>("rl-igroups", []);
  return (Array.isArray(v) ? v : [])
    .filter((g): g is InstGroup => !!g && typeof (g as InstGroup).id === "string" && typeof (g as InstGroup).name === "string" && Array.isArray((g as InstGroup).ids))
    .map((g) => ({ id: g.id, name: g.name.slice(0, 40), ids: g.ids.filter((x) => typeof x === "string") }));
}
export function saveGroups(g: InstGroup[]): void {
  store("rl-igroups", g);
}
/** Groupe « Inactives » (créé au premier « Ranger comme inactive »). */
export const INACTIVE_ID = "inactive";
