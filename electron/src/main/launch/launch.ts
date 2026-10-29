// Lancement d'une instance (lot E4), port de play / play_worker / ensure_loader (wecraft_launcher.py).
//
// Ordre, identique à la version Python :
//   1. fermer le launcher officiel (il réécrirait sinon ses profils par-dessus les nôtres) ; s'il ne se ferme
//      pas, l'utilisateur choisit : arrêt forcé, ou annulation (rien n'est modifié) ;
//   2. installer la version et le loader s'ils manquent (« réparer » : tout réinstaller) ; hors ligne, un
//      loader déjà installé pour EXACTEMENT cette version est réutilisé ;
//   3. créer / mettre à jour le profil « WECRAFT - <instance> » (sauvegarde + relecture de contrôle) ;
//   4. ouvrir le launcher officiel : c'est lui qui gère le compte Microsoft et démarre le jeu (§6).
//
// L'interface suit l'avancement en interrogeant `status()` (le preload n'écoute aucun message du processus
// principal) : chaque étape affichée correspond à ce qui est réellement en cours, jamais une estimation.
import { randomUUID } from "node:crypto";
import { joinArgs, OFFLINE_JVM_ARGS } from "../auth/offline";
import { mkdir } from "node:fs/promises";
import { forgeVersions, chooseForgeVersion, installForgeLike, isModernForgeMc, type ForgeLike } from "../install/forge";
import { chooseLoaderVersion, installedLoaderIds, installedVersionIds, installSimpleLoader, loaderVersions, type SimpleLoader } from "../install/loaders";
import { installVanilla, type InstallVanillaOptions, type VanillaStep } from "../install/vanilla";
import type { XmclApi } from "../install/xmcl";
import type { LaunchPhase, LaunchStatus } from "../../shared/api";
import type { LoaderName } from "../instances/formats";
import type { NetOptions } from "../net/download";
import { closeOfficialLauncher, openOfficialLauncher, type CloseResult } from "./officialLauncher";
import { installJavaRuntime } from "../install/javaRuntime";
import { applyShaderPrefs, type ShaderPrefs } from "./shaders";
import { setProfile, type ProfileDeps } from "./profiles";

export type { LaunchPhase, LaunchStatus };

export interface LaunchTarget {
  /** Dossier de jeu de l'instance (gameDir du profil). */
  gameDir: string;
  /** Nom du profil, « WECRAFT - <instance> ». */
  profileName: string;
  mc: string;
  loader: LoaderName | null;
  loaderVersion: string | null;
}

export interface LaunchOptions {
  ram: number;
  /** Tout réinstaller (bouton « Réparer »), comme force=True en Python. */
  repair?: boolean;
  /**
   * Lancement direct, sans le launcher officiel : session Minecraft (compte Microsoft connecté dans ReLaunch).
   * Le jeton n'est jamais écrit dans un journal ni renvoyé à l'interface.
   */
  direct?: { name: string; uuid: string; accessToken: string; brand: string; /** compte hors-ligne : pas de jeton réel, services Mojang coupés */ offline?: boolean; /** serveur d'event où le joueur est connecté automatiquement (« domaine[:port] ») */ join?: string };
}

/** Ce que l'orchestrateur utilise ; remplaçable dans les tests. */
export interface LaunchDeps {
  mcDir: string;
  profile: ProfileDeps;
  xmcl: () => XmclApi;
  net?: NetOptions;
  platform?: NodeJS.Platform;
  close?: (opts: { force?: boolean }) => Promise<CloseResult>;
  open?: () => Promise<boolean>;
  mkdir?: (dir: string) => Promise<unknown>;
  install?: Partial<Installers>;
  /** Journal de diagnostic. */
  log?: (line: string) => void;
  /** Launcher officiel ouvert avec le profil prêt (statut Discord « Prépare… », lot E9). */
  onOpened?: (t: LaunchTarget) => void;
  /** Shaders préférés (Réglages > Jeu) appliqués à l'instance avant l'ouverture. */
  shaders?: () => Promise<ShaderPrefs>;
}

export interface Installers {
  installedVersionIds: typeof installedVersionIds;
  installVanilla: typeof installVanilla;
  loaderVersions: typeof loaderVersions;
  installSimpleLoader: typeof installSimpleLoader;
  forgeVersions: typeof forgeVersions;
  installForgeLike: typeof installForgeLike;
}

const REAL: Installers = { installedVersionIds, installVanilla, loaderVersions, installSimpleLoader, forgeVersions, installForgeLike };
const LOADER_KEYS: Record<LoaderName, string> = { Fabric: "fabric", Quilt: "quilt", Forge: "forge", NeoForge: "neoforge" };
export const RAM_MIN = 1;
export const RAM_MAX = 16;

class Cancelled extends Error {}

interface Job {
  status: LaunchStatus;
  answer: ((force: boolean) => void) | null;
  promise: Promise<void>;
}

export class LaunchService {
  private current: Job | null = null;
  private readonly inst: Installers;

  constructor(private readonly deps: LaunchDeps) {
    this.inst = { ...REAL, ...deps.install };
  }

  /** Démarre un lancement ; un seul à la fois (comme les boutons désactivés de la version Python). */
  start(target: LaunchTarget, opts: LaunchOptions): { ok: true; job: string } | { ok: false; reason: "busy" | "invalid" } {
    if (this.current && !["termine", "erreur"].includes(this.current.status.phase)) return { ok: false, reason: "busy" };
    if (!Number.isInteger(opts.ram) || opts.ram < RAM_MIN || opts.ram > RAM_MAX) return { ok: false, reason: "invalid" };
    const status: LaunchStatus = opts.direct
      ? { job: randomUUID(), phase: "installation", message: "Préparation...", progress: null, notes: [], profile: null, opened: null }
      : { job: randomUUID(), phase: "fermeture", message: "Fermeture du launcher officiel...", progress: null, notes: [], profile: null, opened: null };
    const job: Job = { status, answer: null, promise: Promise.resolve() };
    const log = this.deps.log ?? (() => undefined);
    log(`Lancement : ${target.profileName} (Minecraft ${target.mc}, ${[target.loader ?? "Vanilla", target.loaderVersion].filter(Boolean).join(" ")}, ${opts.ram} Go${opts.repair ? ", réparer" : ""}${opts.direct ? ", direct" : ""})`);
    job.promise = this.run(job, target, opts).catch((e: unknown) => {
      log(`Erreur (${status.phase}) : ${e instanceof Error ? e.message : String(e)}`);
      status.phase = "erreur";
      status.progress = null;
      status.message = e instanceof Error ? e.message : String(e);
    });
    this.current = job;
    return { ok: true, job: status.job };
  }

  /** Un lancement est-il en cours ? (la suppression d'instance attend la fin, comme en Python) */
  busy(): boolean {
    return !!this.current && !["termine", "erreur"].includes(this.current.status.phase);
  }

  status(job: unknown): LaunchStatus | null {
    if (typeof job !== "string" || !this.current || this.current.status.job !== job) return null;
    const s = this.current.status;
    return { ...s, notes: [...s.notes], progress: s.progress ? { ...s.progress } : null };
  }

  /** Réponse de l'utilisateur à « forcer la fermeture du launcher officiel ? ». */
  answer(job: unknown, force: unknown): boolean {
    const j = this.current;
    if (typeof job !== "string" || typeof force !== "boolean" || !j || j.status.job !== job || !j.answer) return false;
    const a = j.answer;
    j.answer = null;
    a(force);
    return true;
  }

  /** Pour les tests : attend la fin du lancement en cours. */
  async settled(): Promise<void> {
    await this.current?.promise;
  }

  private async run(job: Job, t: LaunchTarget, opts: LaunchOptions): Promise<void> {
    const s = job.status;
    const d = this.deps;
    const platform = d.platform ?? process.platform;
    const close = d.close ?? ((o) => closeOfficialLauncher(o));
    await (d.mkdir ?? ((dir) => mkdir(dir, { recursive: true })))(t.gameDir);

    if (opts.direct) return this.runDirect(job, t, opts, opts.direct);

    // 1) fermer le launcher officiel
    let closed = await close({});
    if (!closed.ok && platform === "win32") {
      s.phase = "accord";
      s.message = closed.message;
      const force = await new Promise<boolean>((resolve) => (job.answer = resolve));
      if (force) {
        s.phase = "fermeture";
        s.message = "Fermeture forcée du launcher officiel...";
        closed = await close({ force: true });
      }
    }
    s.message = closed.message;
    this.deps.log?.(`Fermeture : ${closed.message}`);
    if (!closed.ok) {
      throw new Cancelled(`${closed.message}\nFermez le launcher officiel puis cliquez à nouveau sur LANCER.\nAucun fichier n'a été modifié.`);
    }

    // 2) installer ce qui manque
    s.phase = "installation";
    const xmcl = d.xmcl();
    const iopts: InstallVanillaOptions & { onNote: (n: string) => void } = {
      ...(d.net ?? {}),
      xmcl,
      onStep: (step) => this.step(s, step),
      onNote: (n) => s.notes.push(n),
    };
    const installed = await this.inst.installedVersionIds(d.mcDir);
    if (opts.repair || !installed.includes(t.mc)) {
      s.message = `Installation de ${t.mc}...`;
      await this.inst.installVanilla(d.mcDir, t.mc, iopts);
    }
    let launchId = t.mc;
    if (t.loader) launchId = await this.ensureLoader(s, t, installed, !!opts.repair, iopts);

    // 3) profil
    s.phase = "profil";
    s.progress = null;
    s.message = `Mise à jour du profil « ${t.profileName} »...`;
    await setProfile(d.mcDir, t.profileName, launchId, t.gameDir, opts.ram, d.profile);
    s.profile = t.profileName;
    this.deps.log?.(`Profil écrit : ${t.profileName} → ${launchId}`);
    if (d.shaders) {
      const note = await applyShaderPrefs(t.gameDir, await d.shaders().catch(() => ({ on: false, primary: null, secondary: null })));
      if (note) {
        s.notes.push(note);
        this.deps.log?.(note);
      }
    }

    // 4) ouvrir le launcher officiel
    s.phase = "ouverture";
    s.message = "Ouverture du launcher officiel...";
    s.opened = await (d.open ?? (() => openOfficialLauncher()))();
    if (s.opened) d.onOpened?.(t);
    this.deps.log?.(s.opened ? "Terminé : launcher officiel ouvert." : "Terminé : launcher officiel NON ouvert.");
    s.phase = "termine";
    s.message = s.opened
      ? `Profil « ${t.profileName} » prêt : cliquez sur Jouer dans le launcher officiel.`
      : `Le profil « ${t.profileName} » est prêt, mais le launcher officiel n'a pas pu être ouvert.\nOuvrez-le vous-même et choisissez ce profil.`;
  }

  /** Lancement direct : installation, Java de Mojang, puis le jeu démarré par ReLaunch (pas de profil officiel). */
  private async runDirect(job: Job, t: LaunchTarget, opts: LaunchOptions, ses: NonNullable<LaunchOptions["direct"]>): Promise<void> {
    const s = job.status;
    const d = this.deps;
    s.phase = "installation";
    const xmcl = d.xmcl();
    if (!xmcl.launchGame) throw new Error("Lancement direct indisponible dans cette version.");
    const iopts: InstallVanillaOptions & { onNote: (n: string) => void } = { ...(d.net ?? {}), xmcl, onStep: (step) => this.step(s, step), onNote: (n) => s.notes.push(n) };
    const installed = await this.inst.installedVersionIds(d.mcDir);
    if (opts.repair || !installed.includes(t.mc)) {
      s.message = `Installation de ${t.mc}...`;
      await this.inst.installVanilla(d.mcDir, t.mc, iopts);
    }
    let launchId = t.mc;
    if (t.loader) launchId = await this.ensureLoader(s, t, installed, !!opts.repair, iopts);
    if (d.shaders) {
      const note = await applyShaderPrefs(t.gameDir, await d.shaders().catch(() => ({ on: false, primary: null, secondary: null })));
      if (note) s.notes.push(note);
    }
    // Java fourni par Mojang pour cette version (vérifié fichier par fichier)
    const resolved = await xmcl.parseVersion(d.mcDir, launchId);
    const component = resolved.javaVersion?.component && /^[a-z0-9-]+$/.test(resolved.javaVersion.component) ? resolved.javaVersion.component : "jre-legacy";
    s.message = "Vérification de Java...";
    const java = await installJavaRuntime(d.mcDir, component, {
      ...(d.net ?? {}),
      onProgress: (p) => {
        s.message = "Téléchargement de Java...";
        s.progress = { done: p.filesDone, total: p.filesTotal };
      },
    });
    s.progress = null;
    s.phase = "ouverture";
    s.message = "Démarrage de Minecraft...";
    const child = await xmcl.launchGame({
      gamePath: t.gameDir,
      resourcePath: d.mcDir,
      javaPath: java.executable,
      version: launchId,
      maxMemory: opts.ram * 1024,
      minMemory: Math.min(1024, opts.ram * 512),
      gameProfile: { name: ses.name, id: ses.uuid },
      accessToken: ses.accessToken,
      launcherName: "ReLaunch",
      launcherBrand: ses.brand,
      ...(ses.offline ? { userType: "legacy" as const, extraJVMArgs: [...OFFLINE_JVM_ARGS], ...(ses.join ? { extraMCArgs: joinArgs(t.mc, ses.join) } : {}) } : {}),
    });
    child.once("error", () => this.deps.log?.("Le processus du jeu a signalé une erreur au démarrage."));
    child.once("exit", (code) => this.deps.log?.(`Jeu fermé (code ${code ?? "?"}).`));
    child.unref();
    s.opened = true;
    d.onOpened?.(t);
    this.deps.log?.(`Terminé : jeu démarré par ReLaunch (${launchId}, Java ${java.version}, compte ${ses.name}${ses.offline ? ", hors-ligne" : ""}${ses.join ? `, connexion auto à ${ses.join}` : ""}).`);
    s.phase = "termine";
    s.message = `Minecraft démarre (${ses.name}). La fenêtre du jeu va s'ouvrir.`;
  }

  private step(s: LaunchStatus, step: VanillaStep): void {
    if (step.phase === "liste") s.message = "Récupération de la liste des versions...";
    else if (step.phase === "version") s.message = "Vérification de la version...";
    else if (step.phase === "loader") {
      s.message = `Installation de ${step.kind} (étapes de son installeur)...`;
      s.progress = null; // pas de mesure fiable : aucune barre plutôt qu'une barre figée
    } else {
      s.message =
        step.phase === "fichiers" ? "Téléchargement des fichiers du jeu..." : step.phase === "java" ? "Téléchargement de Java (nécessaire à l'installation)..." : "Téléchargement des ressources (sons, textures)...";
      s.progress = { done: step.progress.filesDone, total: step.progress.filesTotal };
    }
  }

  /** ensure_loader : identifiant de version à lancer pour le loader de l'instance. */
  private async ensureLoader(s: LaunchStatus, t: LaunchTarget, installed: string[], repair: boolean, iopts: InstallVanillaOptions & { onNote: (n: string) => void }): Promise<string> {
    const kind = t.loader!;
    const key = LOADER_KEYS[kind];
    const offline = (e: unknown): string => {
      // Hors ligne : on réutilise un loader déjà installé pour cette version
      const local = installedLoaderIds(installed, key, t.mc);
      if (local.length) {
        s.notes.push(`Liste des versions de ${kind} inaccessible : version déjà installée utilisée (${local[local.length - 1]}).`);
        return local[local.length - 1]!;
      }
      throw e;
    };
    const net = this.deps.net ?? {};
    if (kind === "Fabric" || kind === "Quilt") {
      let available: Awaited<ReturnType<typeof loaderVersions>>;
      try {
        available = await this.inst.loaderVersions(kind as SimpleLoader, t.mc, net);
      } catch (e) {
        return offline(e);
      }
      const choice = chooseLoaderVersion(kind as SimpleLoader, available, t.loaderVersion, t.mc);
      if (choice.note) s.notes.push(choice.note);
      const id = `${key}-loader-${choice.version}-${t.mc}`;
      if (installed.includes(id) && !repair) return id;
      s.message = `Installation de ${kind} (peut prendre un moment)...`;
      return (await this.inst.installSimpleLoader(this.deps.mcDir, kind as SimpleLoader, t.mc, choice.version, iopts)).id;
    }
    if (!isModernForgeMc(t.mc)) {
      return offline(new Error(`${kind} pour Minecraft ${t.mc} (avant 1.13) n'est pas encore pris en charge par ReLaunch.`));
    }
    let list: Awaited<ReturnType<typeof forgeVersions>>;
    try {
      list = await this.inst.forgeVersions(kind as ForgeLike, t.mc, net);
    } catch (e) {
      return offline(e);
    }
    const choice = chooseForgeVersion(kind as ForgeLike, t.mc, list.available, t.loaderVersion, list.preferred);
    if (choice.note) s.notes.push(choice.note);
    const short = choice.artifact.split("-").pop()!;
    // Déjà installé ? (Forge : « 1.20.1-forge-47.2.0 » ; NeoForge : « neoforge-21.1.5 », sans la version de Minecraft)
    const already = installed.filter((id) => {
      const low = id.toLowerCase();
      if (!id.endsWith(`-${short}`) || !low.includes(key)) return false;
      if (kind === "Forge" && low.includes("neoforge")) return false;
      return installedLoaderIds([id], key, t.mc).length > 0 || id === `neoforge-${choice.artifact}`;
    });
    if (already.length && !repair) return already[already.length - 1]!;
    s.message = `Installation de ${kind} (peut prendre un moment)...`;
    return (await this.inst.installForgeLike(this.deps.mcDir, kind as ForgeLike, t.mc, choice.artifact, iopts)).id;
  }
}
