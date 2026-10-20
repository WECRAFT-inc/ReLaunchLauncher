// Pont entre l'interface (reprise du prototype ReLaunch × WeCraft, prototype.js) et le processus
// principal. Aucun accès au système ici : uniquement window.wecraft.
// - Thème : celui de launcher_config.json est appliqué au démarrage ; un thème choisi dans
//   Réglages > Apparence y est enregistré (les 4 thèmes de base ; la couleur personnalisée reste locale).
// - Fichiers de réglages mis de côté et réglages repris : signalés une fois.
import type { AppInfo, SettingResult, ThemeKey, WeCraftApi } from "../shared/api";

declare global {
  interface Window {
    wecraft: WeCraftApi;
  }
}

const THEMES: readonly ThemeKey[] = ["phenix", "relink", "aurore", "glace"];

function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Élément manquant : #${id}`);
  return node;
}

type FailureReason = Extract<SettingResult, { ok: false }>["reason"];
const SAVE_ERRORS: Record<FailureReason, string> = {
  invalid: "Thème inconnu : rien n'a été enregistré.",
  unreadable: "Thème appliqué pour cette session : le fichier de réglages est utilisé par un autre programme. Il n'a pas été modifié.",
  "write-failed": "Thème appliqué pour cette session : l'enregistrement a échoué.",
};

/** Message court, dans la bulle de notification du prototype. */
function toast(message: string): void {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = message;
  t.hidden = false;
  window.setTimeout(() => {
    t.hidden = true;
  }, 4000);
}

let applyingSaved = false;

function setupThemeBridge(): void {
  document.addEventListener("wecraft:skin-changed", (e) => {
    const key = (e as CustomEvent<unknown>).detail;
    if (applyingSaved || !isThemeKey(key)) return; // couleur personnalisée : non enregistrée
    void window.wecraft.settings
      .setTheme(key)
      .catch((): SettingResult => ({ ok: false, reason: "write-failed" }))
      .then((r) => {
        if (!r.ok) toast(SAVE_ERRORS[r.reason]);
      });
  });
}

function showNotices(info: AppInfo): void {
  const lines: string[] = [];
  if (info.invalidFiles.length > 0) {
    lines.push(
      "Certains fichiers de réglages étaient illisibles. Ils n'ont pas été effacés : une copie a été conservée " +
        "dans le dossier des réglages, et des valeurs par défaut sont utilisées.",
    );
    for (const f of info.invalidFiles) {
      lines.push(`• ${f.name} → ${f.copyName ? `copie : ${f.copyName}` : "copie impossible (fichier laissé tel quel)"}`);
    }
  }
  if (info.migrated.length > 0) lines.push(`Réglages repris d'un ancien dossier WeCraft (copie) : ${info.migrated.join(", ")}.`);
  if (lines.length === 0) return;
  el("wc-notice-text").replaceChildren(...lines.flatMap((l, i) => (i === 0 ? [l] : [document.createElement("br"), l])));
  el("wc-notice").hidden = false;
}

async function main(): Promise<void> {
  el("wc-notice-close").addEventListener("click", () => {
    el("wc-notice").hidden = true;
  });
  setupThemeBridge();
  let info: AppInfo;
  try {
    info = await window.wecraft.app.getInfo();
  } catch {
    toast("Informations de l'application indisponibles.");
    return;
  }
  document.dispatchEvent(new CustomEvent("relaunch:info", { detail: { version: info.version } }));
  if (info.savedTheme) {
    applyingSaved = true; // le thème vient des réglages : inutile de le réécrire
    document.dispatchEvent(new CustomEvent("wecraft:apply-skin", { detail: info.savedTheme }));
    applyingSaved = false;
  }
  showNotices(info);
}

void main();
