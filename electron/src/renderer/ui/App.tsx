// Application ReLaunch en React (lot E6, décision D4). Reprend le prototype « ReLaunch × WeCraft » (référence
// visuelle D8) et le pont vers le processus principal (ancien app.ts). Aucune donnée lue dans un fichier n'est
// insérée comme HTML : React l'affiche toujours comme du texte.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as RMouseEvent, type RefObject } from "react";
import type { AppInfo, DeleteResult, InstanceList, SettingResult, ThemeKey, UpdateCheck } from "../../shared/api";
import { useBarsModel } from "./Bars";
import { Ctx, useApp, type AppCtx, type Ui } from "./ctx";
import {
  BARSIZES,
  clone,
  isPinned,
  loadCar,
  loadHome,
  loadPref,
  load,
  NAVDEF,
  normPins,
  pinDrop,
  PRESET_NAMES,
  PRESETS,
  pullRaw,
  gById,
  store,
  THEMES,
  tidy,
  toInst,
  VIEWS,
  type Car,
  type HomePref,
  type Inst,
  type NavConfig,
  type Pref,
  type View,
} from "./model";
import { DiscordAsk, Drawer, LaunchBox, Notice, Pop, RamDialog, UpdateDialog, type LaunchUi } from "./Overlays";
import { moveNav, playFlip, Settings, snapPos } from "./Settings";
import { Discover, emptyDraft } from "./Discover";
import { Favorites, Home, Soon, SOON, Wecraft } from "./Views";
import type { MpDraft } from "./ctx";

const SECTION_NAMES: Record<View, string> = {
  home: "Accueil",
  wecraft: "WeCraft",
  relaunch: "ReLaunch",
  welive: "WeLive",
  relink: "ReLink",
  settings: "Réglages",
  favorites: "Favoris",
  discover: "Découvrir",
  live: "Diffusion Partenaires",
  news: "Info & News",
};
const SECTION_ORDER: View[] = ["home", "wecraft", "relaunch", "welive", "relink", "settings", "favorites", "discover", "live", "news"];

type FailureReason = Extract<SettingResult, { ok: false }>["reason"];
const SAVE_ERRORS: Record<FailureReason, string> = {
  invalid: "Thème inconnu : rien n'a été enregistré.",
  unreadable: "Thème appliqué pour cette session : le fichier de réglages est utilisé par un autre programme. Il n'a pas été modifié.",
  "not-backed-up": "Thème appliqué pour cette session : le fichier de réglages est abîmé et n'a pas pu être copié de côté, il n'a donc pas été modifié.",
  "write-failed": "Thème appliqué pour cette session : l'enregistrement a échoué.",
};
const START_ERRORS = {
  busy: "Un lancement ou un téléchargement de mods est déjà en cours.",
  invalid: "Instance introuvable : la liste a peut-être changé. Réessayez.",
  "no-version": "Version de Minecraft inconnue pour cette instance : réglez-la d'abord.",
} as const;
const DELETE_ERRORS: Record<Extract<DeleteResult, { ok: false }>["reason"], string> = {
  invalid: "Instance introuvable : la liste a peut-être changé.",
  refused: "Ce dossier ne peut pas être supprimé ici (il n'est pas dans un dossier d'instances connu).",
  busy: "Un lancement ou un téléchargement de mods est en cours : réessayez dans un instant.",
  "trash-failed": "La corbeille de Windows a refusé ce dossier : rien n'a été supprimé.",
};
const isTheme = (v: unknown): v is ThemeKey => typeof v === "string" && (THEMES as readonly string[]).includes(v);

function startView(pref: Pref): View {
  let vw = pref.start || "home";
  try {
    vw = localStorage.getItem("proto-view2") || vw;
  } catch {
    // stockage indisponible
  }
  return (VIEWS as readonly string[]).includes(vw) ? (vw as View) : "home";
}

export function App() {
  // ------------------------------------------------------------ état
  const [inst, setInst] = useState<Inst[]>([]);
  const [hidden, setHidden] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [pref, setPref] = useState<Pref>(loadPref);
  const [car, setCar] = useState<Car>(loadCar);
  const [home, setHome] = useState<HomePref>(loadHome);
  const [nav, setNav] = useState<NavConfig>(() => {
    const n = load<NavConfig | null>("proto-nav5", null) ?? clone(NAVDEF);
    normPins(n, () => true);
    return n;
  });
  const [ui, setUiState] = useState<Ui>(() => {
    let skin = 0;
    try {
      const ss = Number(localStorage.getItem("proto-skinsel"));
      if (ss >= 0 && ss < 10) skin = ss;
    } catch {
      // stockage indisponible
    }
    return { view: startView(loadPref()), sel: "i1", wcSrc: "all", wcQ: "", delId: null, setTab: "nav", fold: { orga: true, pins: true }, pop: null, popAnchor: null, drawer: null, skin, rlTab: "profil" };
  });
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [tip, setTip] = useState<{ text: string; el: HTMLElement } | null>(null);
  const [appVer, setAppVer] = useState("");
  const [defaultRam, setDefaultRamState] = useState(4);
  const [notice, setNotice] = useState<string[]>([]);
  const [launchUi, setLaunchUi] = useState<LaunchUi>({ box: false, name: "", status: null, error: null });
  const [ram, setRam] = useState<{ id: string; name: string; ram: number } | null>(null);
  const [mp, setMpState] = useState<MpDraft>(emptyDraft);
  const setMp = useCallback((fn: (d: MpDraft) => MpDraft) => setMpState(fn), []);
  const [upd, setUpd] = useState<Extract<UpdateCheck, { state: "available" }> | null>(null);
  const [discordOn, setDiscordOn] = useState(false);
  const [discordAsk, setDiscordAsk] = useState(false);
  const hist = useRef<string[]>([]);
  const back = useRef(false);
  const flip = useRef<{ before: Record<string, DOMRect>; key?: string } | null>(null);
  const toastT = useRef<number | null>(null);
  const job = useRef<string | null>(null);
  const polling = useRef<number | null>(null);
  const lastLoad = useRef(0);
  const loading = useRef<Promise<void> | null>(null);
  const applyingSaved = useRef(false);
  const mainRef = useRef<HTMLElement>(null);

  const byIdMap = useMemo(() => new Map(inst.map((x) => [x.id, x])), [inst]);
  const byId = useCallback((id: string) => byIdMap.get(id), [byIdMap]);
  const setUi = useCallback((patch: Partial<Ui>) => setUiState((u) => ({ ...u, ...patch })), []);

  const toast = useCallback((m: string, ms = 2400) => {
    setToastMsg(m);
    if (toastT.current !== null) window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToastMsg(null), ms);
  }, []);

  // ------------------------------------------------------------ navigation entre pages
  const show = useCallback(
    (v0: string, opts?: Partial<Ui>) => {
      const v = ((VIEWS as readonly string[]).includes(v0) ? v0 : "home") as View;
      setUiState((u) => {
        const prevKey = `${u.view}|${u.view === "relink" ? u.rlTab : ""}`;
        const next: Ui = { ...u, ...opts, view: v };
        const newKey = `${v}|${v === "relink" ? next.rlTab : ""}`;
        if (!back.current && prevKey !== newKey) {
          hist.current.push(prevKey);
          if (hist.current.length > 30) hist.current.shift();
        }
        back.current = false;
        return next;
      });
      try {
        localStorage.setItem("proto-view2", v);
      } catch {
        // stockage indisponible
      }
      if (mainRef.current) mainRef.current.scrollTop = 0;
    },
    [],
  );
  const reclick = useCallback(() => {
    const m = pref.reclick || "back";
    if (m === "none") return;
    const cur = `${ui.view}|${ui.view === "relink" ? ui.rlTab : ""}`;
    if (m === "home") {
      if (ui.view !== "home") show("home");
      return;
    }
    while (hist.current.length && hist.current[hist.current.length - 1] === cur) hist.current.pop();
    const k = hist.current.pop() || "home|";
    const p = k.split("|");
    back.current = true;
    show(p[0]!, p[0] === "relink" ? { rlTab: p[1] || "profil" } : undefined);
  }, [pref.reclick, ui.view, ui.rlTab, show]);

  // ------------------------------------------------------------ préférences et navigation enregistrées
  const editNav = useCallback((fn: (n: NavConfig) => void, opts?: { pins?: boolean; flip?: string }) => {
    if (opts?.flip !== undefined) flip.current = { before: snapPos(), key: opts.flip };
    setNav((n0) => {
      const n = clone(n0);
      fn(n);
      if (opts?.pins) tidy(n);
      store("proto-nav5", n);
      return n;
    });
  }, []);
  useLayoutEffect(() => {
    if (flip.current) {
      playFlip(flip.current.before, flip.current.key);
      flip.current = null;
    }
  }, [nav]);
  const editPref = useCallback((fn: (p: Pref) => void) => {
    setPref((p0) => {
      const p = clone(p0);
      fn(p);
      store("proto-pref2", p);
      return p;
    });
  }, []);
  const editCar = useCallback((fn: (c: Car) => void) => {
    setCar((c0) => {
      const c = { ...c0 };
      fn(c);
      store("proto-car", c);
      return c;
    });
  }, []);
  const editHome = useCallback((fn: (h: HomePref) => void) => {
    setHome((h0) => {
      const h = { ...h0 };
      fn(h);
      store("proto-home3", h);
      return h;
    });
  }, []);

  // Thème : attribut sur <html>, enregistré dans launcher_config.json (4 thèmes de base)
  const setSkin = useCallback(
    (s0: string) => {
      const s = isTheme(s0) ? s0 : "phenix";
      const root = document.documentElement;
      for (const v of ["--acc", "--acc-2", "--acc-deep", "--spark"]) root.style.removeProperty(v);
      if (s === "phenix") root.removeAttribute("data-skin");
      else root.setAttribute("data-skin", s);
      editPref((p) => (p.skin = s));
      if (applyingSaved.current) return;
      void window.wecraft.settings
        .setTheme(s)
        .catch((): SettingResult => ({ ok: false, reason: "write-failed" }))
        .then((r) => {
          if (!r.ok) toast(SAVE_ERRORS[r.reason], 4000);
          else if (r.reset)
            setNotice([
              `Thème enregistré, mais ${r.reset.name} était abîmé : il a été copié dans ${r.reset.copyName} puis remplacé. Vos autres réglages sont revenus aux valeurs par défaut (ils restent dans la copie).`,
            ]);
        });
    },
    [editPref, toast],
  );
  useEffect(() => {
    // thème mémorisé localement appliqué tout de suite (sans réécrire le fichier de réglages)
    applyingSaved.current = true;
    setSkin(pref.skin);
    applyingSaved.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------ instances (lot E2)
  const loadInstances = useCallback(
    (rescan = false): Promise<void> => {
      if (loading.current) return loading.current;
      lastLoad.current = Date.now();
      loading.current = window.wecraft.instances
        .list(rescan)
        .then((d: InstanceList) => {
          const list = (d.instances || []).map(toInst);
          setInst(list);
          setHidden(d.hidden || 0);
          setLoaded(true);
          setUiState((u) => (list.some((x) => x.id === u.sel) || !list[0] ? u : { ...u, sel: list[0].id }));
          const known = new Set(list.map((x) => x.id));
          setNav((n0) => {
            const n = clone(n0);
            normPins(n, (id) => known.has(id));
            if (JSON.stringify(n) !== JSON.stringify(n0)) store("proto-nav5", n);
            return n;
          });
        })
        .catch(() => toast("Impossible de lire la liste des instances.", 4000))
        .finally(() => {
          loading.current = null;
        });
      return loading.current;
    },
    [toast],
  );
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastLoad.current > 5000) void loadInstances();
    }, 5000);
    const f = () => {
      if (Date.now() - lastLoad.current > 2000) void loadInstances();
    };
    window.addEventListener("focus", f);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", f);
    };
  }, [loadInstances]);

  const toggleFav = useCallback(
    (id: string) => {
      const x = byId(id);
      if (!x) return;
      const fav = !x.fav;
      setInst((l) => l.map((i) => (i.id === id ? { ...i, fav } : i)));
      void window.wecraft.instances
        .setFavorite(id, fav)
        .catch((): SettingResult => ({ ok: false, reason: "write-failed" }))
        .then((r) => {
          if (!r.ok) {
            toast("Favori non enregistré : " + SAVE_ERRORS[r.reason].replace(/^Thème[^:]*: /, ""), 4000);
            void loadInstances();
          }
        });
    },
    [byId, toast, loadInstances],
  );

  // ------------------------------------------------------------ épingles
  const togglePin = useCallback(
    (id: string) => {
      const was = isPinned(nav, id);
      editNav((n) => (was ? pullRaw(n, id) : void n.pins.push({ t: "i", id })), { pins: true });
      toast(was ? "Retiré des épingles" : "Épinglé");
    },
    [nav, editNav, toast],
  );
  const applyPreset = useCallback(
    (k: string) => {
      const p = PRESETS[k]!();
      editNav((n) => {
        n.joined = p.cfg.joined !== false;
        for (const f of ["mode", "single", "h", "v", "junction"] as const) if (p.cfg[f] !== undefined) (n as unknown as Record<string, unknown>)[f] = p.cfg[f];
        n.items = p.items;
        n.pinMode = p.pinMode;
        if (p.dock) n.dock = p.dock;
      });
      setUi({ pop: null });
      toast(`Configuration « ${PRESET_NAMES[k]} » appliquée`);
    },
    [editNav, setUi, toast],
  );

  // ------------------------------------------------------------ lancement (lot E4)
  const pollJob = useCallback(
    (id: string) => {
      if (polling.current !== null) window.clearInterval(polling.current);
      job.current = id;
      const tick = () => {
        void window.wecraft.launch
          .status(id)
          .then((s) => {
            if (!s) throw new Error("perdu");
            setLaunchUi((l) => ({ ...l, box: true, status: s, error: null }));
            if ((s.phase === "termine" || s.phase === "erreur") && polling.current !== null) {
              window.clearInterval(polling.current);
              polling.current = null;
              void loadInstances(true);
            }
          })
          .catch(() => {
            if (polling.current !== null) window.clearInterval(polling.current);
            polling.current = null;
            setLaunchUi((l) => ({ ...l, status: null, error: "Suivi du lancement interrompu." }));
          });
      };
      polling.current = window.setInterval(tick, 400);
      tick();
    },
    [loadInstances],
  );
  const launch = useCallback(
    (id: string) => {
      const x = byId(id);
      if (!x) return;
      if (!x.v) {
        toast("Version de Minecraft inconnue pour cette instance : réglez-la d'abord.");
        return;
      }
      if (polling.current !== null) {
        setLaunchUi((l) => ({ ...l, box: true }));
        toast("Un lancement est déjà en cours.", 4000);
        return;
      }
      setRam({ id: x.id, name: x.n, ram: x.r && x.r >= 1 && x.r <= 16 ? x.r : defaultRam });
    },
    [byId, toast, defaultRam],
  );
  const startLaunch = (r: number, repair: boolean) => {
    const req = ram;
    setRam(null);
    if (!req) return;
    void window.wecraft.launch
      .start(req.id, { ram: r, repair })
      .then((res) => {
        if (!res.ok) {
          toast(START_ERRORS[res.reason], 4000);
          return;
        }
        setDefaultRamState(r);
        setLaunchUi({ box: true, name: req.name || "Lancement", status: null, error: null });
        pollJob(res.job);
      })
      .catch(() => toast("Le lancement n'a pas pu démarrer.", 4000));
  };

  // ------------------------------------------------------------ suppression (lot E8)
  const askDelete = useCallback((id: string) => setUi({ delId: id }), [setUi]);
  const confirmDelete = useCallback(() => {
    const id = ui.delId;
    if (!id) return;
    const name = byId(id)?.n ?? "l'instance";
    setUi({ delId: null });
    void window.wecraft.instances
      .remove(id, true)
      .catch((): DeleteResult => ({ ok: false, reason: "trash-failed" }))
      .then((r) => {
        if (r.ok) toast(`« ${name} » est dans la corbeille.${r.metaForgotten ? "" : " Ses réglages n'ont pas pu être oubliés."}`, 4000);
        else toast(DELETE_ERRORS[r.reason], 4000);
        void loadInstances(true);
      });
  }, [ui.delId, byId, setUi, toast, loadInstances]);

  // ------------------------------------------------------------ mises à jour (lot E5)
  const checkUpdates = useCallback(
    (manual: boolean) => {
      void window.wecraft.update
        .check(manual)
        .catch((): UpdateCheck => ({ state: "error", message: "Vérification impossible." }))
        .then((c) => {
          if (c.state === "available") setUpd(c);
          else if (manual && c.state === "none") toast(`ReLaunch est à jour (v${c.current}).${c.latest ? ` Dernière version publiée : v${c.latest}.` : ""}`, 4000);
          else if (manual && c.state === "error") toast(c.message, 4000);
        });
    },
    [toast],
  );

  const setDefaultRam = useCallback((r: number) => {
    setDefaultRamState(r);
    void window.wecraft.settings.setRam(r).catch(() => false);
  }, []);
  const openDataDir = useCallback(() => {
    void window.wecraft.app.openDataDir().then((ok) => {
      if (!ok) toast("Le dossier de données n'a pas pu être ouvert.");
    });
  }, [toast]);

  const editModpack = useCallback(
    (id: string) => {
      void window.wecraft.modpacks.editInfo(id).then((info) => {
        if (!info) {
          toast("Les informations de ce modpack sont illisibles (wecraft_modpack.json) : il ne peut pas être modifié ici.", 4000);
          return;
        }
        setMpState({ name: info.name, mc: info.mc, loader: info.loader, selected: info.selected, edit: info });
        show("discover");
      });
    },
    [toast, show],
  );

  /** Statut Discord : `answer` = réponse à la question du premier démarrage de cette version. */
  const setDiscord = useCallback(
    (on: boolean, answer = false) => {
      void window.wecraft.discord.set(on, answer).then(
        (ok) => {
          if (ok) setDiscordOn(on);
          else toast("Réglage Discord non enregistré.", 4000);
        },
        () => toast("Réglage Discord non enregistré.", 4000),
      );
    },
    [toast],
  );

  const toggleDrawer = useCallback((k: string) => setUiState((u) => ({ ...u, drawer: u.drawer === k ? null : k })), []);

  // ------------------------------------------------------------ démarrage
  useEffect(() => {
    void (async () => {
      await loadInstances(); // avant getInfo : un instances_meta.json abîmé est ainsi signalé dans le bandeau
      let info: AppInfo;
      try {
        info = await window.wecraft.app.getInfo();
      } catch {
        toast("Informations de l'application indisponibles.", 4000);
        return;
      }
      setAppVer(info.version);
      setDefaultRamState(info.ram);
      void window.wecraft.discord.state().then(
        (d) => {
          setDiscordOn(d.enabled);
          setDiscordAsk(d.askNow);
        },
        () => undefined, // statut Discord facultatif
      );
      if (info.savedTheme) {
        applyingSaved.current = true;
        setSkin(info.savedTheme);
        applyingSaved.current = false;
      }
      const lines: string[] = [];
      if (info.invalidFiles.length > 0) {
        lines.push(
          "Certains fichiers de réglages étaient illisibles. Ils n'ont pas été effacés : une copie a été conservée dans le dossier des réglages, et des valeurs par défaut sont utilisées.",
        );
        for (const f of info.invalidFiles) lines.push(`• ${f.name} → ${f.copyName ? `copie : ${f.copyName}` : "copie impossible (fichier laissé tel quel)"}`);
      }
      if (info.migrated.length > 0) lines.push(`Réglages repris d'un ancien dossier WeCraft (copie) : ${info.migrated.join(", ")}.`);
      if (lines.length) setNotice(lines);
      // premier rendu réellement affiché : la mise à jour en attente peut être validée
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          void window.wecraft.app.rendered().catch(() => undefined);
          checkUpdates(false);
        }),
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------ actions (délégation, comme le prototype)
  const onClick = (e: RMouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (ui.pop && !t.closest("#pop") && !t.closest("[data-popbtn]")) setUi({ pop: null });
    if (ui.drawer && !t.closest("#drawer") && !t.closest("[data-drawer]")) setUi({ drawer: null });
    const go = t.closest<HTMLElement>("[data-go]");
    if (go) {
      if (go.closest("#bars") && go.getAttribute("aria-current") === "page") {
        reclick();
        return;
      }
      const o: Partial<Ui> = {};
      if (go.dataset["rl"]) o.rlTab = go.dataset["rl"];
      else if (go.dataset["go"] === "relink" && ui.rlTab === "shop") o.rlTab = "profil";
      if (go.dataset["set"]) o.setTab = go.dataset["set"];
      show(go.dataset["go"]!, o);
      return;
    }
    const pl = t.closest<HTMLElement>("[data-play]");
    if (pl) {
      launch(pl.dataset["play"]!);
      return;
    }
    const st = t.closest<HTMLElement>("[data-settab]");
    if (st) {
      setUi({ setTab: st.dataset["settab"]! });
      return;
    }
    const th = t.closest<HTMLElement>("[data-theme]");
    if (th) {
      setSkin(th.dataset["theme"]!);
      return;
    }
    const ly = t.closest<HTMLElement>("[data-lay]");
    if (ly) {
      const c = JSON.parse(ly.dataset["lay"]!) as Partial<NavConfig>;
      editNav((n) => Object.assign(n, c));
      return;
    }
    const a = t.closest<HTMLElement>("[data-act]");
    if (!a) return;
    const act = a.dataset["act"]!;
    const i = Number(a.dataset["i"]);
    switch (act) {
      case "create":
        show("discover");
        break;
      case "mpEdit":
        editModpack(a.dataset["id"]!);
        break;
      case "noInst":
        toast("Aucune instance à lancer pour l'instant.");
        break;
      case "reclickPref":
        editPref((p) => (p.reclick = a.dataset["v"]!));
        break;
      case "carN":
        editCar((c) => (c.n = Number(a.dataset["n"])));
        break;
      case "carAuto":
        editCar((c) => (c.auto = !c.auto));
        break;
      case "drawer":
        toggleDrawer(a.dataset["drawer"]!);
        break;
      case "closeDrawer":
        setUi({ drawer: null });
        break;
      case "pin":
        togglePin(a.dataset["id"]!);
        break;
      case "openGroup":
        setUiState((u) => (u.pop && u.pop.gid === a.dataset["gid"] ? { ...u, pop: null } : { ...u, pop: { kind: "group", gid: a.dataset["gid"]! }, popAnchor: a.dataset["a"] ?? null }));
        break;
      case "openSection":
        setUiState((u) => (u.pop && u.pop.kind === "section" ? { ...u, pop: null } : { ...u, pop: { kind: "section" }, popAnchor: "nav-pins" }));
        break;
      case "openGroupIn":
        setUi({ pop: { kind: "group", gid: a.dataset["gid"]!, back: true } });
        break;
      case "popBack":
        setUi({ pop: { kind: "section" } });
        break;
      case "closePop":
        setUi({ pop: null });
        break;
      case "ungroup": {
        const id = a.dataset["id"]!;
        editNav(
          (n) => {
            pullRaw(n, id);
            n.pins.push({ t: "i", id });
          },
          { pins: true },
        );
        break;
      }
      case "dissolve": {
        const gid = a.dataset["gid"]!;
        editNav(
          (n) => {
            const dg = gById(n, gid);
            if (!dg) return;
            const di = n.pins.indexOf(dg);
            n.pins.splice(di, 1, ...dg.items.map((id) => ({ t: "i" as const, id })));
          },
          { pins: true },
        );
        if (ui.pop && ui.pop.gid === gid) setUi({ pop: null });
        break;
      }
      case "bgMode":
        editPref((p) => (p.bg = a.dataset["v"]!));
        break;
      case "style":
        editPref((p) => (p.style = a.dataset["v"]!));
        toast(a.dataset["v"] === "lg" ? "Style Liquid Glass activé" : "Style standard activé");
        break;
      case "pinMode":
        editNav((n) => (n.pinMode = a.dataset["m"] as NavConfig["pinMode"]));
        setUi({ pop: null });
        break;
      case "dockSide":
        editNav((n) => (n.dock.side = a.dataset["s"] as NavConfig["dock"]["side"]));
        break;
      case "dockAlign":
        editNav((n) => (n.dock.align = a.dataset["al"] as NavConfig["dock"]["align"]));
        break;
      case "fav":
        toggleFav(a.dataset["id"]!);
        break;
      case "del":
        askDelete(a.dataset["id"]!);
        break;
      case "delNo":
        setUi({ delId: null });
        break;
      case "delYes":
        confirmDelete();
        break;
      case "updCheck":
        checkUpdates(true);
        break;
      case "folder":
        openDataDir();
        break;
      case "navOn":
        editNav((n) => (n.items[i]!.on = !n.items[i]!.on));
        break;
      case "navUp":
        moveNav(editNav, nav, i, i - 1);
        break;
      case "navDown":
        moveNav(editNav, nav, i, i + 1);
        break;
      case "navCount":
        editNav((n) => {
          if (a.dataset["n"] === "1") {
            n.mode = "single";
            n.single = n.single || "left";
          } else {
            n.mode = "double";
            if (n.joined !== false && !(["top", "bottom"].includes(n.h) && ["left", "right"].includes(n.v))) {
              n.h = "top";
              n.v = "left";
              n.junction = "logo";
            }
          }
        });
        break;
      case "navJoin":
        editNav((n) => {
          n.joined = n.joined === false;
          if (n.joined && !(["top", "bottom"].includes(n.h) && ["left", "right"].includes(n.v))) {
            n.h = "top";
            n.v = "left";
            n.junction = "logo";
          }
        });
        break;
      case "fold":
        setUiState((u) => ({ ...u, fold: { ...u.fold, [a.dataset["k"]!]: !u.fold[a.dataset["k"]!] } }));
        break;
      case "preset":
        applyPreset(a.dataset["p"]!);
        break;
      case "navBar":
        editNav((n) => (n.items[i]!.bar = a.dataset["b"] as "h" | "v"));
        break;
      case "navReset":
        editNav((n) => Object.assign(n, clone(NAVDEF)));
        break;
      case "barSize":
        if (BARSIZES[a.dataset["v"]!]) editNav((n) => (n.size = a.dataset["v"]!));
        break;
      case "resumeTgl":
        editHome((h) => (h.resume = !h.resume));
        break;
      case "pref":
        editPref((p) => (p[a.dataset["k"]!] = !p[a.dataset["k"]!]));
        break;
      case "discord":
        setDiscord(!discordOn);
        break;
      default:
        toast("Pas encore disponible dans cette version.");
    }
  };

  // Glisser-déposer des épingles (barre, barre séparée, section, réglages)
  const pinDrag = useRef<string | null>(null);
  const clearDrop = () => document.querySelectorAll(".dropon,.dragging").forEach((x) => x.classList.remove("dropon", "dragging"));
  const dnd = {
    onDragStart: (e: DragEvent) => {
      const d = (e.target as HTMLElement).closest?.<HTMLElement>("[data-pin-drag]");
      if (!d) return;
      pinDrag.current = d.dataset["pinDrag"]!;
      setTip(null);
      d.classList.add("dragging");
      try {
        e.dataTransfer.setData("text/plain", pinDrag.current);
        e.dataTransfer.effectAllowed = "move";
      } catch {
        // glisser indisponible
      }
      e.stopPropagation();
    },
    onDragOver: (e: DragEvent) => {
      if (!pinDrag.current) return;
      const t = (e.target as HTMLElement).closest("[data-pin-drop],[data-pin-zone]");
      if (!t) return;
      e.preventDefault();
      if (!t.classList.contains("dropon")) {
        document.querySelectorAll(".dropon").forEach((x) => x.classList.remove("dropon"));
        t.classList.add("dropon");
      }
    },
    onDrop: (e: DragEvent) => {
      if (!pinDrag.current) return;
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-pin-drop]") ?? (e.target as HTMLElement).closest<HTMLElement>("[data-pin-zone]");
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      const d = pinDrag.current;
      pinDrag.current = null;
      clearDrop();
      // calculé tout de suite sur une copie (le résultat décide du message et de la fenêtre à ouvrir)
      const n = clone(nav);
      const r = pinDrop(n, d, t.dataset["pinDrop"] || "zone");
      tidy(n);
      store("proto-nav5", n);
      setNav(n);
      if (r?.toast) toast(r.toast);
      if (r?.pop) setUi({ pop: { kind: "group", gid: r.pop.gid, rename: true }, popAnchor: r.pop.anchor });
    },
    onDragEnd: () => {
      pinDrag.current = null;
      clearDrop();
    },
  };

  // Échap : ferme les épingles, puis le panneau latéral
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (ui.pop) setUi({ pop: null });
      else if (ui.drawer) setUi({ drawer: null });
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [ui.pop, ui.drawer, setUi]);

  const ctx: AppCtx = {
    inst,
    hidden,
    loaded,
    byId,
    ui,
    nav,
    pref,
    car,
    home,
    appVer,
    defaultRam,
    setUi,
    show,
    reclick,
    launch,
    toggleFav,
    togglePin,
    editNav,
    applyPreset,
    editPref,
    editCar,
    editHome,
    setSkin,
    toast,
    toggleDrawer,
    askDelete,
    confirmDelete,
    checkUpdates,
    setDefaultRam,
    openDataDir,
    mp,
    setMp,
    editModpack,
    refreshInstances: () => void loadInstances(true),
    discordOn,
  };

  const extras: ExtrasProps = { toastMsg, tip, launchUi, setLaunchUi, ram, setRam, startLaunch, upd, setUpd, job };
  return (
    <Ctx.Provider value={ctx}>
      <Notice lines={notice} onClose={() => setNotice([])} />
      <DiscordAsk
        open={discordAsk && !upd}
        onAnswer={(on) => {
          setDiscordAsk(false);
          setDiscord(on, true);
        }}
      />
      <Shell dnd={dnd} onClick={onClick} mainRef={mainRef} setTip={setTip} extras={extras} />
    </Ctx.Provider>
  );
}

interface ExtrasProps {
  toastMsg: string | null;
  tip: { text: string; el: HTMLElement } | null;
  launchUi: LaunchUi;
  setLaunchUi: (f: (l: LaunchUi) => LaunchUi) => void;
  ram: { id: string; name: string; ram: number } | null;
  setRam: (r: null) => void;
  startLaunch: (ram: number, repair: boolean) => void;
  upd: Extract<UpdateCheck, { state: "available" }> | null;
  setUpd: (u: null) => void;
  job: RefObject<string | null>;
}

function Shell({
  dnd,
  onClick,
  mainRef,
  setTip,
  extras: p,
}: {
  dnd: Record<string, (e: DragEvent) => void>;
  onClick: (e: RMouseEvent<HTMLDivElement>) => void;
  mainRef: RefObject<HTMLElement | null>;
  setTip: (t: { text: string; el: HTMLElement } | null) => void;
  extras: ExtrasProps;
}) {
  const { ui, pref, nav } = useApp();
  const bars = useBarsModel();
  const rootRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const lastTip = useRef("");
  if (p.tip) lastTip.current = p.tip.text;
  const cls = [
    "app",
    ui.view === "home" ? "on-home" : "",
    bars.pf ? "pf" : "",
    bars.dock ? `dk-${bars.dock}` : "",
    pref.style === "lg" ? "lg" : "",
    pref.bg === "plain" ? "bg-plain" : "",
    pref.bg === "flat" ? "bg-flat" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const showTip = (b: HTMLElement | null) => {
    if (b && b.dataset["tip"]) setTip({ text: b.dataset["tip"], el: b });
  };
  // Info-bulle des barres : placée à côté du bouton, dans la fenêtre
  useLayoutEffect(() => {
    const tip = tipRef.current;
    const host = rootRef.current;
    const b = p.tip?.el;
    if (!tip || !b || !host) return;
    const bar = b.closest(".bar,.dock");
    const ar = host.getBoundingClientRect();
    const r = b.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    let x: number;
    let y: number;
    if (!bar) {
      x = r.right - ar.left - tr.width;
      y = r.bottom - ar.top + 8;
    } else {
      const vert = bar.classList.contains("v");
      const right = vert && r.left - ar.left > ar.width / 2;
      const bottom = !vert && r.top - ar.top > ar.height / 2;
      if (vert) {
        y = r.top - ar.top + r.height / 2 - tr.height / 2;
        x = right ? r.left - ar.left - tr.width - 10 : r.right - ar.left + 10;
      } else {
        x = r.left - ar.left + r.width / 2 - tr.width / 2;
        y = bottom ? r.top - ar.top - tr.height - 10 : r.bottom - ar.top + 10;
      }
    }
    x = Math.max(6, Math.min(x, ar.width - tr.width - 6));
    y = Math.max(6, Math.min(y, ar.height - tr.height - 6));
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  });
  return (
    <div
      ref={rootRef}
      className={cls}
      id="appRoot"
      style={{ ["--nb" as string]: `${(nav.size && BARSIZES[nav.size] ? BARSIZES[nav.size]! : BARSIZES["m"]!).b}px`, gridTemplateColumns: bars.grid[0], gridTemplateRows: bars.grid[1], gridTemplateAreas: bars.grid[2] }}
      onClick={onClick}
      {...dnd}
    >
      <div className="bg" aria-hidden="true"></div>
      <div
        id="bars"
        style={{ display: "contents" }}
        onMouseOver={(e) => showTip((e.target as HTMLElement).closest<HTMLElement>("[data-tip]"))}
        onMouseOut={(e) => {
          if ((e.target as HTMLElement).closest("[data-tip]")) setTip(null);
        }}
        onFocus={(e) => showTip((e.target as HTMLElement).closest<HTMLElement>("[data-tip]"))}
        onBlur={() => setTip(null)}
      >
        {bars.node}
      </div>
      <main className="main" id="main" ref={mainRef}>
        {SECTION_ORDER.map((v) => (
          <section key={v} className="view" id={`v-${v}`} data-a={`v-${v}`} data-name={SECTION_NAMES[v]} hidden={ui.view !== v}>
            {ui.view === v ? <ViewBody v={v} /> : null}
          </section>
        ))}
      </main>
      <div className="overlay" id="createOv" hidden data-a="m-create" data-name="Créer un WePack">
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="cTitle" id="createModal"></div>
      </div>
      <div className="overlay lightbox" id="shotOv" hidden data-a="m-shot" data-name="Capture">
        <div className="modal" role="dialog" aria-modal="true" id="shotModal"></div>
      </div>
      <LaunchBox
        st={p.launchUi}
        onClose={() => p.setLaunchUi((l) => ({ ...l, box: false }))}
        onAnswer={(force) => {
          if (p.job.current) void window.wecraft.launch.answer(p.job.current, force);
        }}
      />
      <UpdateDialog check={p.upd} onClose={() => p.setUpd(null)} />
      <RamDialog open={!!p.ram} name={p.ram?.name ?? ""} ram={p.ram?.ram ?? 4} onCancel={() => p.setRam(null)} onGo={p.startLaunch} />
      <Drawer />
      <Pop />
      <div className="toast" id="toast" hidden={!p.toastMsg} role="status">
        {p.toastMsg ?? ""}
      </div>
      <div className="tip" id="tip" hidden={!p.tip} ref={tipRef}>
        {lastTip.current}
      </div>
    </div>
  );
}

function ViewBody({ v }: { v: View }) {
  if (v === "home") return <Home />;
  if (v === "wecraft") return <Wecraft />;
  if (v === "favorites") return <Favorites />;
  if (v === "settings") return <Settings />;
  if (v === "discover") return <Discover />;
  const s = SOON[v]!;
  return <Soon title={s.title} sub={s.sub} text={s.text} />;
}
