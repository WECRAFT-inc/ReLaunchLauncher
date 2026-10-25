// Loaders Forge et NeoForge (lot E3), installeur « moderne » (Minecraft 1.13 et plus), comme
// minecraft_launcher_lib : l'installeur officiel est téléchargé, puis ses « processeurs » (programmes Java
// fournis par Forge/NeoForge) sont exécutés avec le Java de Mojang vérifié.
//
// Garde-fous autour du plan de xmcl (constats X3, X4, X8 de l'audit E3) :
// - installeur et bibliothèques : serveurs officiels en HTTPS, empreinte SHA-1 obligatoire (.sha1 Maven sinon) ;
// - écritures (« materialize ») : uniquement à l'intérieur du dossier .minecraft ;
// - commandes Java : uniquement NOTRE Java vérifié, classpath uniquement dans .minecraft/libraries,
//   sans interpréteur de commandes, avec délai maximal ; sorties vérifiées par xmcl (empreintes publiées).
import { spawn } from "node:child_process";
import path from "node:path";
import { fetchBytes, IntegrityError, type NetOptions } from "../net/download";
import { installJavaRuntime, type InstallJavaOptions } from "./javaRuntime";
import { ensureVanillaJson, installVersionFiles, isSafeVersionId, net, type InstalledVersion, type InstallVanillaOptions } from "./vanilla";
import { allowedUrls, hardenFiles, inside, safeDownloader, type InstallFile, type JavaCommand } from "./xmcl";

export type ForgeLike = "Forge" | "NeoForge";

const FORGE_META = "https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml";
const FORGE_PROMOS = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
const NEO = "https://maven.neoforged.net/releases/net/neoforged/";

/** Versions listées dans un maven-metadata.xml (ordre du fichier : de la plus ancienne à la plus récente). */
export function parseMavenVersions(xml: string): string[] {
  return [...xml.matchAll(/<version>\s*([0-9A-Za-z.+_-]{1,80})\s*<\/version>/g)].map((m) => m[1]!);
}

/** « 1.21.1 » -> préfixe NeoForge « 21.1. » ; « 1.21 » -> « 21.0. ». */
export function neoForgePrefix(mc: string): string | null {
  const m = /^1\.(\d+)(?:\.(\d+))?$/.exec(mc);
  return m ? `${m[1]}.${m[2] ?? "0"}.` : null;
}

/** Version de Minecraft prise en charge par l'installeur moderne (1.13 et plus). */
export function isModernForgeMc(mc: string): boolean {
  const m = /^1\.(\d+)/.exec(mc);
  return Boolean(m && Number(m[1]) >= 13);
}

export interface ForgeChoice {
  /** Projet Maven NeoForge (« forge » pour 1.20.1, « neoforge » ensuite) ; « forge » pour Forge. */
  project: "forge" | "neoforge";
  /** Version d'artefact publiée (ex. « 1.20.1-47.2.0 », « 21.1.5 »). */
  artifact: string;
  note: string | null;
}

const isUnstable = (v: string) => /beta|alpha|pre|rc|snapshot/i.test(v);

/** Choix comme ensure_loader : version exacte demandée (v == demandé ou v se termine par « -demandé »), sinon la plus récente. */
export function chooseForgeVersion(kind: ForgeLike, mc: string, available: string[], wanted: string | null, preferred: string | null = null): ForgeChoice {
  const project: "forge" | "neoforge" = kind === "NeoForge" && mc !== "1.20.1" ? "neoforge" : "forge";
  if (available.length === 0) throw new Error(`${kind} ne supporte pas Minecraft ${mc}.`);
  let note: string | null = null;
  if (wanted) {
    const hit = available.find((v) => v === wanted || v.endsWith("-" + wanted));
    if (hit) return { project, artifact: hit, note: null };
    note = `${kind} ${wanted} introuvable : dernière version utilisée.`;
  }
  if (preferred && available.includes(preferred)) return { project, artifact: preferred, note };
  const stable = available.filter((v) => !isUnstable(v));
  return { project, artifact: (stable.length ? stable : available)[(stable.length ? stable : available).length - 1]!, note };
}

/** Versions publiées pour cette version de Minecraft (+ version recommandée Forge si connue). */
export async function forgeVersions(kind: ForgeLike, mc: string, opts: NetOptions = {}): Promise<{ available: string[]; preferred: string | null }> {
  if (!isModernForgeMc(mc)) throw new Error(`${kind} pour Minecraft ${mc} (avant 1.13) n'est pas encore pris en charge par ReLaunch.`);
  if (kind === "Forge") {
    const xml = (await fetchBytes(FORGE_META, 8 * 1024 * 1024, {}, opts)).toString("utf8");
    const available = parseMavenVersions(xml).filter((v) => v.startsWith(mc + "-"));
    let preferred: string | null = null;
    try {
      const promos = JSON.parse((await fetchBytes(FORGE_PROMOS, 1024 * 1024, {}, opts)).toString("utf8")) as { promos?: Record<string, unknown> };
      const rec = promos.promos?.[`${mc}-recommended`] ?? promos.promos?.[`${mc}-latest`];
      if (typeof rec === "string") preferred = `${mc}-${rec}`;
    } catch {
      preferred = null; // sans promotions : la plus récente stable
    }
    return { available, preferred };
  }
  if (mc === "1.20.1") {
    const xml = (await fetchBytes(`${NEO}forge/maven-metadata.xml`, 4 * 1024 * 1024, {}, opts)).toString("utf8");
    return { available: parseMavenVersions(xml).filter((v) => v.startsWith("1.20.1-")), preferred: null };
  }
  const prefix = neoForgePrefix(mc);
  if (!prefix) throw new Error(`Version de Minecraft inattendue : ${mc}`);
  const xml = (await fetchBytes(`${NEO}neoforge/maven-metadata.xml`, 8 * 1024 * 1024, {}, opts)).toString("utf8");
  return { available: parseMavenVersions(xml).filter((v) => v.startsWith(prefix)), preferred: null };
}

/** Fichier de l'installeur officiel (empreinte complétée ensuite par hardenFiles). */
export function installerFile(mcDir: string, kind: ForgeLike, choice: ForgeChoice): InstallFile {
  const v = choice.artifact;
  if (!/^[0-9A-Za-z.+_-]{1,80}$/.test(v)) throw new Error(`Version invalide : ${v}`);
  const rel =
    kind === "Forge"
      ? `net/minecraftforge/forge/${v}/forge-${v}-installer.jar`
      : `net/neoforged/${choice.project}/${v}/${choice.project}-${v}-installer.jar`;
  const url = kind === "Forge" ? `https://maven.minecraftforge.net/${rel}` : `https://maven.neoforged.net/releases/${rel}`;
  return { path: path.join(mcDir, "libraries", ...rel.split("/")), urls: [url], validator: "zip" };
}

// ---------------------------------------------------------------- garde-fous du plan


export class UnsafePlanError extends Error {
  constructor(what: string) {
    super(`Plan d'installation refusé : ${what}`);
    this.name = "UnsafePlanError";
  }
}

/** Vérifie une commande Java proposée par xmcl avant de l'exécuter. */
export function checkJavaCommand(cmd: JavaCommand, java: string, mcDir: string): void {
  if (path.resolve(cmd.executable) !== path.resolve(java)) throw new UnsafePlanError(`programme non autorisé (${cmd.executable})`);
  if (cmd.cwd && !inside(mcDir, cmd.cwd)) throw new UnsafePlanError("dossier de travail hors de .minecraft");
  const cp = cmd.args.indexOf("-cp");
  if (cp < 0 || cp + 1 >= cmd.args.length) throw new UnsafePlanError("commande Java sans classpath");
  const libs = path.join(mcDir, "libraries");
  for (const entry of cmd.args[cp + 1]!.split(path.delimiter)) {
    if (!entry || !inside(libs, entry) || !/\.(jar|zip)$/i.test(entry)) throw new UnsafePlanError(`classpath hors de libraries (${entry})`);
  }
  const before = cmd.args.slice(0, cp);
  if (before.some((a) => /^-(javaagent|agentlib|agentpath|XX:OnError|XX:OnOutOfMemoryError)/i.test(a))) throw new UnsafePlanError("option Java interdite");
}

interface PlanTask {
  id: string;
  type: string;
  files?: InstallFile[];
  operations?: { type: string; path?: string; source?: string; archive?: string; archives?: string[] }[];
  outputs?: { path: string }[];
  strategies?: JavaCommand[][];
}

/** Durcit un plan : fichiers vérifiés, écritures et commandes confinées. */
export async function hardenPlan(plan: { schemaVersion: 1; tasks: PlanTask[] }, mcDir: string, java: string, n: NetOptions): Promise<void> {
  for (const t of plan.tasks) {
    if (t.type === "files" && t.files) {
      for (const f of t.files) if (!inside(mcDir, f.path)) throw new UnsafePlanError(`fichier hors de .minecraft (${f.path})`);
      t.files = await hardenFiles(t.files, n);
    } else if (t.type === "materialize") {
      for (const op of t.operations ?? []) {
        for (const p of [op.path, op.source, op.archive, ...(op.archives ?? [])]) {
          if (p !== undefined && !inside(mcDir, p)) throw new UnsafePlanError(`écriture hors de .minecraft (${p})`);
        }
      }
      for (const o of t.outputs ?? []) if (!inside(mcDir, o.path)) throw new UnsafePlanError(`sortie hors de .minecraft (${o.path})`);
    } else if (t.type === "java") {
      for (const s of t.strategies ?? []) for (const c of s) checkJavaCommand(c, java, mcDir);
      for (const o of t.outputs ?? []) if (!inside(mcDir, o.path)) throw new UnsafePlanError(`sortie hors de .minecraft (${o.path})`);
    } else {
      throw new UnsafePlanError(`type de tâche inconnu (${t.type})`);
    }
  }
}

/** Exécution d'une commande Java vérifiée : sans shell, sans fenêtre, avec délai maximal. */
export function runJavaCommand(cmd: JavaCommand, java: string, mcDir: string, timeoutMs = 15 * 60_000, signal?: AbortSignal): Promise<void> {
  try {
    checkJavaCommand(cmd, java, mcDir);
  } catch (e) {
    return Promise.reject(e);
  }
  return new Promise((resolve, reject) => {
    const child = spawn(cmd.executable, cmd.args, {
      cwd: cmd.cwd ?? mcDir,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
      ...(signal ? { signal } : {}),
    });
    let err = "";
    child.stderr?.on("data", (d: Buffer) => {
      err = (err + d.toString("utf8")).slice(-4000);
    });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Processeur ${path.basename(cmd.args[cmd.args.indexOf("-cp") + 2] ?? "?")} en échec (code ${code}) : ${err.trim().slice(-600)}`));
    });
  });
}

export interface ForgeInstallOptions extends InstallVanillaOptions {
  onNote?: (note: string) => void;
  java?: Pick<InstallJavaOptions, "platform">;
}

/** Installe Minecraft `mc`, le Java de Mojang adapté, puis Forge/NeoForge ; renvoie la version à lancer. */
export async function installForgeLike(mcDir: string, kind: ForgeLike, mc: string, wanted: string | null, opts: ForgeInstallOptions): Promise<InstalledVersion & { java: string }> {
  const n = net(opts);
  const { xmcl } = opts;
  await ensureVanillaJson(mcDir, mc, opts);
  const base = await installVersionFiles(mcDir, mc, opts);

  const javaOpts: InstallJavaOptions = { ...n, onProgress: (p) => opts.onStep?.({ phase: "java", progress: p }) };
  if (opts.java?.platform) javaOpts.platform = opts.java.platform;
  const java = (await installJavaRuntime(mcDir, base.javaComponent, javaOpts)).executable;

  const { available, preferred } = await forgeVersions(kind, mc, n);
  const choice = chooseForgeVersion(kind, mc, available, wanted, preferred);
  if (choice.note) opts.onNote?.(choice.note);
  const installer = installerFile(mcDir, kind, choice);
  if (allowedUrls(installer.urls, n).length === 0) throw new IntegrityError(installer.urls[0]!, "adresse non autorisée");

  const runtimeOpts: Parameters<typeof xmcl.createRuntime>[0] = {
    download: safeDownloader({ ...n, onProgress: (progress) => opts.onStep?.({ phase: "fichiers", progress }) }),
    runJava: (cmd) => runJavaCommand(cmd, java, mcDir, undefined, opts.signal),
  };
  if (opts.signal) runtimeOpts.signal = opts.signal;
  const runtime = xmcl.createRuntime(runtimeOpts);
  const workflow = xmcl.createModernForgeWorkflow({
    id: `${kind}:${choice.artifact}`,
    minecraftDir: mcDir,
    minecraftVersion: mc,
    installer,
    artifactVersion: choice.artifact,
    java,
  });
  let version: string | null = null;
  for (let stage = 0; stage < 32; stage++) {
    const step = await workflow.next();
    if (step.done) {
      version = step.result.version;
      break;
    }
    await hardenPlan(step.plan as { schemaVersion: 1; tasks: PlanTask[] }, mcDir, java, n);
    opts.onStep?.({ phase: "loader", kind });
    const execOpts: { attempts: number; signal?: AbortSignal } = { attempts: 3 };
    if (opts.signal) execOpts.signal = opts.signal;
    await xmcl.execute(step.plan as never, runtime, execOpts);
  }
  if (!version || !isSafeVersionId(version)) throw new Error(`Installation de ${kind} inachevée.`);
  // Vérification finale : tout ce que la version demande est présent et a la bonne empreinte.
  const done = await installVersionFiles(mcDir, version, opts);
  return { ...done, java };
}
