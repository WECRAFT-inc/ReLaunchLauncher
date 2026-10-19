// Interface WeCraft (processus de rendu). Aucun accès au système : uniquement window.wecraft.
// Règle du prompt maître (§10.4) : aucune information fictive, aucun état de réussite non vérifié.
import type { AppInfo, ExternalLinkId, ThemeKey, WeCraftApi } from "../shared/api";

declare global {
  interface Window {
    wecraft: WeCraftApi;
  }
}

const THEMES: readonly ThemeKey[] = ["phenix", "relink", "aurore", "glace"];
const PAGES = ["home", "instances", "modpacks", "settings"] as const;
type Page = (typeof PAGES)[number];

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Élément manquant : #${id}`);
  return node as T;
}

function isPage(value: string | undefined): value is Page {
  return value !== undefined && (PAGES as readonly string[]).includes(value);
}

function isThemeKey(value: string | undefined): value is ThemeKey {
  return value !== undefined && (THEMES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------- navigation
function showPage(page: Page): void {
  for (const p of PAGES) el(`page-${p}`).hidden = p !== page;
  document.querySelectorAll<HTMLButtonElement>(".nav-btn").forEach((b) => {
    b.setAttribute("aria-selected", String(b.dataset["page"] === page));
  });
}

function setupNavigation(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".nav-btn"));
  buttons.forEach((b, i) => {
    b.addEventListener("click", () => {
      const page = b.dataset["page"];
      if (isPage(page)) showPage(page);
    });
    // Flèches haut/bas pour passer d'un onglet à l'autre
    b.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const next = buttons[(i + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length];
      next?.focus();
      next?.click();
    });
  });
}

// ---------------------------------------------------------------- thème
function applyTheme(key: ThemeKey): void {
  document.documentElement.dataset["theme"] = key;
  document.querySelectorAll<HTMLButtonElement>("[data-theme-key]").forEach((b) => {
    b.setAttribute("aria-checked", String(b.dataset["themeKey"] === key));
  });
}

function setupThemes(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-theme-key]").forEach((b) => {
    b.addEventListener("click", () => {
      const key = b.dataset["themeKey"];
      if (isThemeKey(key)) applyTheme(key);
    });
  });
}

// ---------------------------------------------------------------- liens externes
function setupLinks(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-link]").forEach((b) => {
    b.addEventListener("click", () => {
      const id = b.dataset["link"] as ExternalLinkId | undefined;
      if (id) void window.wecraft.links.open(id);
    });
  });
}

// ---------------------------------------------------------------- informations réelles
function renderInfo(info: AppInfo): void {
  const dot = el("status-dot");
  dot.className = "dot " + (info.dataDirExists ? "ok" : "warn");
  el("status-text").textContent = info.dataDirExists
    ? "Réglages WeCraft trouvés (lecture seule)"
    : "Aucun réglage WeCraft trouvé sur ce PC";

  const data = el("card-data");
  data.replaceChildren();
  const pathEl = document.createElement("span");
  pathEl.className = "mono";
  pathEl.textContent = info.dataDir;
  data.append(pathEl, document.createElement("br"), info.dataDirExists ? "Dossier présent" : "Dossier absent");

  el("card-version").textContent = `WeCraft ${info.version} · Electron ${info.electron}`;

  if (info.savedTheme) {
    applyTheme(info.savedTheme);
    el("theme-note").textContent =
      "Thème repris de vos réglages WeCraft. Un changement ici s'applique à cette session ; son enregistrement arrivera au lot E1.";
  }

  const rows: Array<[string, string]> = [
    ["WeCraft", info.version],
    ["Electron", info.electron],
    ["Chromium", info.chrome],
    ["Node.js", info.node],
    ["Système", `${info.platform} (${info.arch})`],
    ["Réglages", info.dataDir],
  ];
  const diag = el("diag");
  diag.replaceChildren();
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    diag.append(dt, dd);
  }
}

function renderInfoError(): void {
  el("status-dot").className = "dot warn";
  el("status-text").textContent = "Informations indisponibles";
  el("card-data").textContent = "Impossible de lire les informations de l'application.";
  el("card-version").textContent = "—";
}

async function main(): Promise<void> {
  setupNavigation();
  setupThemes();
  setupLinks();
  try {
    renderInfo(await window.wecraft.app.getInfo());
  } catch {
    renderInfoError();
  }
}

void main();
