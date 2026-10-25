// Versions d'un loader pour une version de Minecraft (fenêtre « Créer un WePack » > « Sur mesure »).
// Sert aussi à dire si la combinaison est possible : liste vide ou loader non pris en charge = refus expliqué,
// jamais une instance impossible à lancer.
import type { NetOptions } from "../net/download";
import { forgeVersions, isModernForgeMc, type ForgeLike } from "./forge";
import { loaderVersions, type SimpleLoader } from "./loaders";

export interface LoaderVersionItem {
  /** Version telle qu'elle est notée dans wecraft.json (« 47.2.0 », « 0.16.9 »). */
  version: string;
  stable: boolean;
  /** Version recommandée par l'éditeur du loader (Forge), sinon la plus récente stable. */
  recommended: boolean;
}

export type LoaderVersionList = { ok: true; versions: LoaderVersionItem[] } | { ok: false; message: string };

export interface LoaderListDeps {
  simple?: typeof loaderVersions;
  forge?: typeof forgeVersions;
}

const UNSTABLE = /beta|alpha|pre|rc|snapshot/i;

/** Liste la plus récente d'abord ; message clair si la combinaison n'existe pas ou si le réseau manque. */
export async function loaderVersionList(loader: string, mc: string, net: NetOptions = {}, d: LoaderListDeps = {}): Promise<LoaderVersionList> {
  try {
    if (loader === "Fabric" || loader === "Quilt") {
      const list = await (d.simple ?? loaderVersions)(loader as SimpleLoader, mc, net);
      if (!list.length) return { ok: false, message: `${loader} n'existe pas pour Minecraft ${mc}.` };
      const best = list.find((v) => v.stable) ?? list[0]!;
      return { ok: true, versions: list.map((v) => ({ version: v.version, stable: v.stable, recommended: v === best })) };
    }
    if (loader === "Forge" || loader === "NeoForge") {
      if (!isModernForgeMc(mc)) return { ok: false, message: `${loader} pour Minecraft ${mc} (avant 1.13) n'est pas pris en charge par ReLaunch.` };
      if (loader === "NeoForge" && /^1\.(\d+)/.exec(mc) && Number(/^1\.(\d+)/.exec(mc)![1]) < 20) return { ok: false, message: `NeoForge n'existe pas pour Minecraft ${mc} (à partir de 1.20.1).` };
      const { available, preferred } = await (d.forge ?? forgeVersions)(loader as ForgeLike, mc, net);
      if (!available.length) return { ok: false, message: `${loader} n'existe pas pour Minecraft ${mc}.` };
      const newest = [...available].reverse();
      const best = preferred && available.includes(preferred) ? preferred : (newest.find((v) => !UNSTABLE.test(v)) ?? newest[0]!);
      // artefact « 1.20.1-47.2.0 » -> « 47.2.0 » (forme lue et retrouvée par le lancement)
      const short = (v: string) => (v.startsWith(`${mc}-`) ? v.slice(mc.length + 1) : v);
      return { ok: true, versions: newest.map((v) => ({ version: short(v), stable: !UNSTABLE.test(v), recommended: v === best })) };
    }
    return { ok: false, message: "Loader inconnu." };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return { ok: false, message: /ne supporte pas|pas pris en charge|n'existe pas/.test(m) ? m : `Liste des versions de ${loader} inaccessible (${m}).` };
  }
}
