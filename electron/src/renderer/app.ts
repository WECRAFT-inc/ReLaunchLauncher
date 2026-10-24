// Pont entre l'interface (reprise du prototype ReLaunch × WeCraft, prototype.js) et le processus
// principal. Aucun accès au système ici : uniquement window.wecraft.
// - Thème : celui de launcher_config.json est appliqué au démarrage ; un thème choisi dans
//   Réglages > Apparence y est enregistré (les 4 thèmes de base ; la couleur personnalisée reste locale).
// - Fichiers de réglages mis de côté et réglages repris : signalés une fois.
import type { AppInfo, DeleteResult, LaunchStatus, UpdateCheck, SettingResult, ThemeKey, WeCraftApi } from "../shared/api";

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
  "not-backed-up":
    "Thème appliqué pour cette session : le fichier de réglages est abîmé et n'a pas pu être copié de côté, il n'a donc pas été modifié.",
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
        else if (r.reset) {
          showNoticeLines([
            `Thème enregistré, mais ${r.reset.name} était abîmé : il a été copié dans ${r.reset.copyName} puis ` +
              "remplacé. Vos autres réglages sont revenus aux valeurs par défaut (ils restent dans la copie).",
          ]);
        }
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
  showNoticeLines(lines);
}

function showNoticeLines(lines: string[]): void {
  if (lines.length === 0) return;
  el("wc-notice-text").replaceChildren(...lines.flatMap((l, i) => (i === 0 ? [l] : [document.createElement("br"), l])));
  el("wc-notice").hidden = false;
}

// ---------------------------------------------------------------- instances (lot E2)
let lastLoad = 0;
let loading: Promise<void> | null = null;

/** Relit les instances (lecture seule) et les transmet à l'interface du prototype. */
function loadInstances(rescan = false): Promise<void> {
  if (loading) return loading;
  lastLoad = Date.now();
  loading = window.wecraft.instances
    .list(rescan)
    .then((list) => {
      document.dispatchEvent(new CustomEvent("relaunch:instances", { detail: list }));
    })
    .catch(() => toast("Impossible de lire la liste des instances."))
    .finally(() => {
      loading = null;
    });
  return loading;
}

function setupInstances(): void {
  // Comme la version Python : dossier WeCraft relu souvent (seuls les dossiers modifiés), autres launchers
  // au plus toutes les 60 s (géré par le processus principal).
  window.setInterval(() => {
    if (document.visibilityState === "visible" && Date.now() - lastLoad > 5000) void loadInstances();
  }, 5000);
  window.addEventListener("focus", () => {
    if (Date.now() - lastLoad > 2000) void loadInstances();
  });
  document.addEventListener("relaunch:set-fav", (e) => {
    const d = (e as CustomEvent<{ id?: unknown; fav?: unknown }>).detail;
    if (typeof d?.id !== "string" || typeof d.fav !== "boolean") return;
    void window.wecraft.instances
      .setFavorite(d.id, d.fav)
      .catch((): SettingResult => ({ ok: false, reason: "write-failed" }))
      .then((r) => {
        if (!r.ok) {
          toast("Favori non enregistré : " + SAVE_ERRORS[r.reason].replace(/^Thème[^:]*: /, ""));
          void loadInstances(); // remet l'affichage d'accord avec le fichier
        }
      });
  });
}

// ---------------------------------------------------------------- lancement (lot E4)
let defaultRam = 4;
let pending: { id: string; name: string } | null = null;
let polling: number | null = null;
let currentJob: string | null = null;

const START_ERRORS = {
  busy: "Un lancement est déjà en cours.",
  invalid: "Instance introuvable : la liste a peut-être changé. Réessayez.",
  "no-version": "Version de Minecraft inconnue pour cette instance : réglez-la d'abord.",
} as const;

function setRamLabel(): void {
  el("ramVal").textContent = `${(el("ramRange") as HTMLInputElement).value} Go`;
}

function closeRamDialog(): void {
  el("ramOv").hidden = true;
  pending = null;
}

/** Affiche l'état RÉEL du lancement : la barre n'avance que sur des fichiers réellement téléchargés. */
function showStatus(s: LaunchStatus): void {
  el("launchBox").hidden = false;
  const bar = el("lBar");
  if (s.phase === "termine") bar.style.width = "100%";
  else if (s.progress && s.progress.total > 0) bar.style.width = `${Math.round((100 * s.progress.done) / s.progress.total)}%`;
  else bar.style.width = "0";
  const lines = [s.progress && s.phase === "installation" ? `${s.message} (${s.progress.done}/${s.progress.total})` : s.message, ...s.notes];
  el("lMsg").textContent = lines.join("\n");
  el("lAsk").hidden = s.phase !== "accord";
  if (s.phase === "accord") {
    el("lMsg").textContent =
      `${s.message}\nLe forcer à se fermer ? Une partie en cours n'est pas concernée ; s'il était en train d'enregistrer, ` +
      "cet enregistrement pourrait être perdu.";
  }
}

function poll(job: string): void {
  if (polling !== null) window.clearInterval(polling);
  currentJob = job;
  const tick = (): void => {
    void window.wecraft.launch
      .status(job)
      .then((s) => {
        if (!s) throw new Error("perdu");
        showStatus(s);
        if ((s.phase === "termine" || s.phase === "erreur") && polling !== null) {
          window.clearInterval(polling);
          polling = null;
          void loadInstances(true);
        }
      })
      .catch(() => {
        if (polling !== null) window.clearInterval(polling);
        polling = null;
        el("lMsg").textContent = "Suivi du lancement interrompu.";
      });
  };
  polling = window.setInterval(tick, 400);
  tick();
}

function setupLaunch(): void {
  const range = el("ramRange") as HTMLInputElement;
  range.addEventListener("input", setRamLabel);
  el("ramCancel").addEventListener("click", closeRamDialog);
  el("ramClose").addEventListener("click", closeRamDialog);
  el("ramOv").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeRamDialog();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el("ramOv").hidden) closeRamDialog();
  });
  document.addEventListener("relaunch:launch", (e) => {
    const d = (e as CustomEvent<{ id?: unknown; name?: unknown; ram?: unknown }>).detail;
    if (typeof d?.id !== "string") return;
    if (polling !== null) {
      el("launchBox").hidden = false;
      toast(START_ERRORS.busy);
      return;
    }
    pending = { id: d.id, name: typeof d.name === "string" ? d.name : "" };
    const ram = typeof d.ram === "number" && d.ram >= 1 && d.ram <= 16 ? d.ram : defaultRam;
    range.value = String(Math.round(ram));
    setRamLabel();
    (el("ramRepair") as HTMLInputElement).checked = false;
    el("ramName").textContent = pending.name;
    el("ramOv").hidden = false;
    el("ramGo").focus();
  });
  el("ramGo").addEventListener("click", () => {
    if (!pending) return;
    const { id, name } = pending;
    const ram = Number(range.value);
    const repair = (el("ramRepair") as HTMLInputElement).checked;
    closeRamDialog();
    void window.wecraft.launch
      .start(id, { ram, repair })
      .then((r) => {
        if (!r.ok) {
          toast(START_ERRORS[r.reason]);
          return;
        }
        defaultRam = ram;
        el("lName").textContent = name || "Lancement";
        poll(r.job);
      })
      .catch(() => toast("Le lancement n'a pas pu démarrer."));
  });
  const answer = (force: boolean): void => {
    el("lAsk").hidden = true;
    const job = currentJob;
    if (job) void window.wecraft.launch.answer(job, force);
  };
  el("lForce").addEventListener("click", () => answer(true));
  el("lNo").addEventListener("click", () => answer(false));
}

// ---------------------------------------------------------------- suppression (lot E8)
const DELETE_ERRORS: Record<Extract<DeleteResult, { ok: false }>["reason"], string> = {
  invalid: "Instance introuvable : la liste a peut-être changé.",
  refused: "Ce dossier ne peut pas être supprimé ici (il n'est pas dans un dossier d'instances connu).",
  busy: "Un lancement est en cours : réessayez dans un instant.",
  "trash-failed": "La corbeille de Windows a refusé ce dossier : rien n'a été supprimé.",
};

function setupDelete(): void {
  document.addEventListener("relaunch:delete", (e) => {
    const d = (e as CustomEvent<{ id?: unknown; name?: unknown }>).detail;
    if (typeof d?.id !== "string") return;
    const name = typeof d.name === "string" ? d.name : "l'instance";
    void window.wecraft.instances
      .remove(d.id, true)
      .catch((): DeleteResult => ({ ok: false, reason: "trash-failed" }))
      .then((r) => {
        if (r.ok) toast(`« ${name} » est dans la corbeille.${r.metaForgotten ? "" : " Ses réglages n'ont pas pu être oubliés."}`);
        else toast(DELETE_ERRORS[r.reason]);
        void loadInstances(true);
      });
  });
}

// ---------------------------------------------------------------- mises à jour (lot E5)
let updPoll: number | null = null;

function showUpdate(c: Extract<UpdateCheck, { state: "available" }>): void {
  el("updVer").textContent = `v${c.current}  →  v${c.latest}`;
  el("updNotes").textContent = c.notes || "Nouvelle version du launcher.";
  el("updMsg").textContent = c.auto ? "" : "Installation automatique indisponible ici : la page de la mise à jour va s'ouvrir.";
  el("updGo").textContent = c.auto ? "Mettre à jour" : "Voir la mise à jour";
  el("updGo").dataset["auto"] = c.auto ? "1" : "";
  el("updBarBox").hidden = true;
  (el("updGo") as HTMLButtonElement).disabled = false;
  (el("updLater") as HTMLButtonElement).disabled = false;
  el("updOv").hidden = false;
}

function checkUpdates(manual: boolean): void {
  void window.wecraft.update
    .check(manual)
    .catch((): UpdateCheck => ({ state: "error", message: "Vérification impossible." }))
    .then((c) => {
      if (c.state === "available") showUpdate(c);
      else if (manual && c.state === "none") toast(`ReLaunch est à jour (v${c.current}).${c.latest ? ` Dernière version publiée : v${c.latest}.` : ""}`);
      else if (manual && c.state === "error") toast(c.message);
    });
}

function setupUpdates(): void {
  const close = (): void => {
    if (updPoll === null) el("updOv").hidden = true;
  };
  el("updLater").addEventListener("click", close);
  el("updClose").addEventListener("click", close);
  document.addEventListener("relaunch:update-check", () => checkUpdates(true));
  el("updGo").addEventListener("click", () => {
    if (!el("updGo").dataset["auto"]) {
      void window.wecraft.update.openPage();
      el("updOv").hidden = true;
      return;
    }
    (el("updGo") as HTMLButtonElement).disabled = true;
    (el("updLater") as HTMLButtonElement).disabled = true;
    void window.wecraft.update.install().then((started) => {
      if (!started) {
        el("updMsg").textContent = "La mise à jour n'a pas pu démarrer.";
        (el("updGo") as HTMLButtonElement).disabled = false;
        (el("updLater") as HTMLButtonElement).disabled = false;
        return;
      }
      el("updBarBox").hidden = false;
      updPoll = window.setInterval(() => {
        void window.wecraft.update.status().then((s) => {
          el("updBar").style.width = s.total > 0 ? `${Math.min(100, Math.round((100 * s.done) / s.total))}%` : "0";
          el("updMsg").textContent =
            s.phase === "download" && s.total > 0 ? `Téléchargement... ${Math.floor((100 * s.done) / s.total)} %` : s.message;
          if (s.phase === "error" && updPoll !== null) {
            window.clearInterval(updPoll);
            updPoll = null;
            (el("updGo") as HTMLButtonElement).disabled = false;
            (el("updLater") as HTMLButtonElement).disabled = false;
          }
        });
      }, 300);
    });
  });
}

async function main(): Promise<void> {
  el("wc-notice-close").addEventListener("click", () => {
    el("wc-notice").hidden = true;
  });
  setupThemeBridge();
  setupInstances();
  setupLaunch();
  setupDelete();
  setupUpdates();
  await loadInstances(); // avant getInfo : un instances_meta.json abîmé est ainsi signalé dans le bandeau
  let info: AppInfo;
  try {
    info = await window.wecraft.app.getInfo();
  } catch {
    toast("Informations de l'application indisponibles.");
    return;
  }
  document.dispatchEvent(new CustomEvent("relaunch:info", { detail: { version: info.version } }));
  defaultRam = info.ram;
  if (info.savedTheme) {
    applyingSaved = true; // le thème vient des réglages : inutile de le réécrire
    document.dispatchEvent(new CustomEvent("wecraft:apply-skin", { detail: info.savedTheme }));
    applyingSaved = false;
  }
  showNotices(info);
  // premier rendu réellement affiché : la mise à jour en attente peut être validée
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      void window.wecraft.app.rendered().catch(() => undefined);
      checkUpdates(false);
    }),
  );
}

void main();
