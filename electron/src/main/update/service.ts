// Mises à jour de ReLaunch (lot E5) : vérification, téléchargement vérifié, installation, suivi réel.
// Port de check_updates / show_update / explain_update_error. Rien n'est installé sans signature valide.
import path from "node:path";
import type { UpdateCheck, UpdateStatus } from "../../shared/api";
import { HttpError, type NetOptions } from "../net/download";
import { applyInstaller, files, skippedVersion, updateLog, writeProof, type UpdateEnv } from "./pending";
import { downloadUpdate, fetchLatestRelease, GITHUB_REPO, type ReleaseInfo } from "./release";
import { isNewer } from "./signature";

/** explain_update_error */
export function explainUpdateError(e: unknown): string {
  if (e instanceof HttpError) {
    if (e.status === 404) {
      return `Aucune release trouvée sur « ${GITHUB_REPO} ».\nVérifiez que le dépôt est public, que ce nom est exact et qu'une release est publiée (pas en brouillon).`;
    }
    if (e.status === 403 || e.status === 429) return "Limite de requêtes GitHub atteinte, réessayez dans une heure.";
    return `Erreur GitHub ${e.status}.`;
  }
  return `Connexion impossible (${e instanceof Error ? e.message : String(e)}).`;
}

export interface UpdateDeps {
  env: UpdateEnv;
  net?: NetOptions;
  fetchLatest?: typeof fetchLatestRelease;
  download?: typeof downloadUpdate;
  /** Quitte ReLaunch une fois l'installeur lancé. */
  quit: () => void;
}

export class UpdateService {
  private info: ReleaseInfo | null = null;
  private st: UpdateStatus = { phase: "idle", done: 0, total: 0, message: "" };
  /** Ce processus a lancé l'installeur : il ne valide plus rien (_UPDATE_HANDED_OFF). */
  handedOff = false;

  constructor(private readonly d: UpdateDeps) {}

  /** Installation automatique possible ? (application installée sous Windows, release complète) */
  private auto(i: ReleaseInfo): boolean {
    return this.d.env.packaged && this.d.env.platform === "win32" && !!i.url && !!i.sha256;
  }

  /** Au démarrage (manual=false) : silencieux, version abandonnée non reproposée. */
  async check(manual: boolean): Promise<UpdateCheck> {
    const cur = this.d.env.version;
    let info: ReleaseInfo;
    try {
      info = await (this.d.fetchLatest ?? fetchLatestRelease)(this.d.net ?? {});
    } catch (e) {
      await updateLog(this.d.env, `${GITHUB_REPO}  ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
      return manual ? { state: "error", message: explainUpdateError(e) } : { state: "none", current: cur, latest: null };
    }
    if (!manual && info.version === (await skippedVersion(this.d.env))) return { state: "none", current: cur, latest: info.version };
    if (!isNewer(info.version, cur)) return { state: "none", current: cur, latest: info.version };
    this.info = info;
    const notes = info.notes.length > 500 ? `${info.notes.slice(0, 500)}...` : info.notes;
    return { state: "available", current: cur, latest: info.version, notes, auto: this.auto(info) };
  }

  status(): UpdateStatus {
    return { ...this.st };
  }

  /** Télécharge, vérifie, puis lance l'installeur et quitte. Une seule installation à la fois. */
  install(): boolean {
    const info = this.info;
    if (!info || !this.auto(info) || this.st.phase === "download" || this.st.phase === "restart") return false;
    this.st = { phase: "download", done: 0, total: info.size, message: "Téléchargement..." };
    const dest = path.join(files(this.d.env).updates, `ReLaunch-Setup-${info.version}.exe`);
    void (async () => {
      try {
        const note = await (this.d.download ?? downloadUpdate)(info, dest, { ...(this.d.net ?? {}), onBytes: (n) => (this.st.done += n) });
        if (note) await updateLog(this.d.env, `v${info.version} : ${note}`);
        // preuve gardée à côté : l'installeur est revérifié avant chaque lancement (installation, retour arrière)
        if (!(await writeProof(this.d.env, dest, { version: info.version, sha256: info.sha256!, signature: info.signature ?? "" }))) throw new Error("Preuve de l'installeur impossible à enregistrer.");
        this.st = { ...this.st, phase: "restart", message: "Redémarrage..." };
        await applyInstaller(this.d.env, dest, info.version);
        this.handedOff = true;
        setTimeout(() => this.d.quit(), 500);
      } catch (e) {
        await updateLog(this.d.env, `v${info.version} : mise à jour refusée (${e instanceof Error ? e.message : String(e)})`);
        this.st = { phase: "error", done: 0, total: 0, message: `Échec de la mise à jour :\n${e instanceof Error ? e.message : String(e)}` };
      }
    })();
    return true;
  }

  /** Page de la release (GitHub uniquement), pour « Voir la mise à jour ». */
  page(): string | null {
    const u = this.info?.page;
    if (!u) return null;
    try {
      const url = new URL(u);
      return url.protocol === "https:" && url.hostname === "github.com" ? url.href : null;
    } catch {
      return null;
    }
  }
}
