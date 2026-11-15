// Page WeCraft : ordre des instances (rangées comme des cartes), masquage des instances anciennes et
// sélection par plage. Fonctions pures, sans DOM ni stockage : testées dans tests/instOrder.test.ts.

export interface InstViewPrefs {
  /** « auto » : favoris puis récentes ; « manual » : ordre rangé à la main (glisser les cartes). */
  sort: "auto" | "manual";
  /** Ordre manuel (identifiants). Une instance absente de la liste se place après les autres. */
  order: string[];
  /** Masquer les instances lancées il y a plus de `hideDays` jours (jamais lancée = jamais masquée). */
  hideOld: boolean;
  hideDays: number;
}

export const HIDE_CHOICES: readonly (readonly [number, string])[] = [
  [30, "1 mois"],
  [90, "3 mois"],
  [180, "6 mois"],
  [365, "1 an"],
  [730, "2 ans"],
];

export const INST_VIEW_DEFAULT: InstViewPrefs = { sort: "auto", order: [], hideOld: false, hideDays: 365 };

export function cleanInstView(v: unknown): InstViewPrefs {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const days = HIDE_CHOICES.some(([d]) => d === o["hideDays"]) ? (o["hideDays"] as number) : 365;
  const order = Array.isArray(o["order"]) ? [...new Set((o["order"] as unknown[]).filter((x): x is string => typeof x === "string" && x.length <= 300))].slice(0, 5000) : [];
  return { sort: o["sort"] === "manual" ? "manual" : "auto", order, hideOld: o["hideOld"] === true, hideDays: days };
}

/** Trie selon l'ordre manuel ; les instances inconnues de l'ordre gardent leur place relative, à la fin. */
export function sortByOrder<T extends { id: string }>(list: T[], order: string[]): T[] {
  const pos = new Map(order.map((id, i) => [id, i]));
  return list
    .map((x, i) => ({ x, i, p: pos.get(x.id) }))
    .sort((a, b) => (a.p ?? Infinity) - (b.p ?? Infinity) || a.i - b.i)
    .map(({ x }) => x);
}

/**
 * Nouvel ordre complet : `flat` (ordre affiché de toutes les instances) sans `moving`, puis `moving` réinsérées
 * (dans leur ordre d'affichage) avant ou après `target`. Sans cible : à la fin.
 */
export function moveInOrder(flat: string[], moving: string[], target: string | null, after = false): string[] {
  const mv = new Set(moving);
  const block = flat.filter((id) => mv.has(id));
  for (const id of moving) if (!block.includes(id)) block.push(id);
  const rest = flat.filter((id) => !mv.has(id));
  if (!target || mv.has(target)) {
    if (target && mv.has(target)) return flat; // lâché sur lui-même : rien ne bouge
    return [...rest, ...block];
  }
  let i = rest.indexOf(target);
  if (i < 0) return [...rest, ...block];
  if (after) i += 1;
  return [...rest.slice(0, i), ...block, ...rest.slice(i)];
}

/** Lancée il y a plus de `days` jours (une instance jamais lancée n'est jamais « ancienne »). */
export function isOld(x: { last?: number }, days: number, now = Date.now()): boolean {
  return typeof x.last === "number" && x.last > 0 && now - x.last > days * 86_400_000;
}

/** Identifiants entre `a` et `b` inclus, dans l'ordre affiché (Maj+clic). */
export function rangeBetween(flat: string[], a: string, b: string): string[] {
  const i = flat.indexOf(a);
  const j = flat.indexOf(b);
  if (i < 0 || j < 0) return j >= 0 ? [b] : [];
  return flat.slice(Math.min(i, j), Math.max(i, j) + 1);
}
