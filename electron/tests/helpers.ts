// Outils de test : dossiers temporaires jetables (jamais les vrais réglages) et disque « simulé ».
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { nodeFs, type StoreFs } from "../src/main/storage/jsonStore";

export function tempDir(name: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), `wecraft-${name}-`));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Erreur système comme celles de Node (code EPERM, EACCES, ENOENT…). */
export function sysError(code: string): NodeJS.ErrnoException {
  const e = new Error(code) as NodeJS.ErrnoException;
  e.code = code;
  return e;
}

/** Disque réel, avec des opérations remplaçables pour simuler verrous et antivirus. */
export function faultyFs(overrides: Partial<StoreFs>): StoreFs {
  return { ...nodeFs, ...overrides };
}

export const noSleep = async () => {};
