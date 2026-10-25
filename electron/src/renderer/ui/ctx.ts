// État partagé de l'interface (lot E6).
import { createContext, useContext } from "react";
import type { ModpackEditInfo, ModpackRoot } from "../../shared/api";
import type { Car, HomePref, Inst, InstGroup, NavConfig, Pref, View } from "./model";

/** Modpack en préparation dans Découvrir (lot E7) : création, ou modification d'un WePack existant. */
export interface MpDraft {
  name: string;
  mc: string;
  loader: string;
  selected: ModpackRoot[];
  edit: ModpackEditInfo | null;
}

export interface PopState {
  kind: "group" | "section";
  gid?: string;
  back?: boolean;
  rename?: boolean;
}

export interface Ui {
  view: View;
  sel: string;
  wcSrc: string;
  wcQ: string;
  delId: string | null;
  setTab: string;
  fold: Record<string, boolean>;
  pop: PopState | null;
  popAnchor: string | null;
  drawer: string | null;
  skin: number;
  rlTab: string;
  /** Découvrir : recherche et onglet demandés en ouvrant la page (fenêtre « Créer un WePack »). */
  dq: string;
  dtab: string;
  /** Page d'une instance : identifiant et onglet. */
  page: string | null;
  itab: string;
}

export interface AppCtx {
  inst: Inst[];
  hidden: number;
  loaded: boolean;
  byId: (id: string) => Inst | undefined;
  ui: Ui;
  nav: NavConfig;
  pref: Pref;
  car: Car;
  home: HomePref;
  appVer: string;
  defaultRam: number;
  setUi: (patch: Partial<Ui>) => void;
  show: (v: string, opts?: Partial<Ui>) => void;
  reclick: () => void;
  launch: (id: string) => void;
  toggleFav: (id: string) => void;
  togglePin: (id: string) => void;
  /** Modifie la navigation (copie), l'enregistre ; `flip` : clé de la ligne déplacée (animation). */
  editNav: (fn: (n: NavConfig) => void, opts?: { pins?: boolean; flip?: string }) => void;
  applyPreset: (k: string) => void;
  editPref: (fn: (p: Pref) => void) => void;
  editCar: (fn: (c: Car) => void) => void;
  editHome: (fn: (h: HomePref) => void) => void;
  setSkin: (s: string) => void;
  toast: (m: string) => void;
  toggleDrawer: (k: string) => void;
  askDelete: (id: string) => void;
  confirmDelete: () => void;
  checkUpdates: (manual: boolean) => void;
  setDefaultRam: (r: number) => void;
  openDataDir: () => void;
  mp: MpDraft;
  setMp: (fn: (d: MpDraft) => MpDraft) => void;
  editModpack: (id: string) => void;
  refreshInstances: () => void;
  /** Statut Discord activé (réglage partagé avec la version Python). */
  discordOn: boolean;
  /** Groupes d'instances de la page WeCraft (affichage seulement). */
  groups: InstGroup[];
  setGroups: (fn: (g: InstGroup[]) => InstGroup[]) => void;
  /** Range l'instance dans « Inactives » (groupe créé s'il n'existe pas) ou l'en sort. */
  toggleInactive: (id: string) => void;
  openInstance: (id: string, tab?: string) => void;
}

export const Ctx = createContext<AppCtx | null>(null);
export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("Contexte de l'interface absent");
  return c;
}
