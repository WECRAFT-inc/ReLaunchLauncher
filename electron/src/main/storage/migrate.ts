// Reprise des réglages d'anciens dossiers (port de migrate_old_settings en Python, constat S8).
// Uniquement des COPIES, et seulement si WeCraft n'a pas encore le fichier : rien n'est supprimé ni écrasé.
import path from "node:path";
import { MIGRATED_FILES } from "../paths";
import { nodeFs, type StoreFs } from "./jsonStore";

export interface MigrationResult {
  file: string;
  from: string;
}

async function exists(fs: StoreFs, p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function migrateOldSettings(dataDir: string, legacyDirs: readonly string[], fs: StoreFs = nodeFs): Promise<MigrationResult[]> {
  const done: MigrationResult[] = [];
  for (const name of MIGRATED_FILES) {
    const target = path.join(dataDir, name);
    if (await exists(fs, target)) continue;
    for (const dir of legacyDirs) {
      const src = path.join(dir, name);
      try {
        if (!(await exists(fs, src))) continue;
        await fs.mkdir(dataDir);
        await fs.copyNew(src, target); // jamais d'écrasement (COPYFILE_EXCL)
        done.push({ file: target, from: src });
        break;
      } catch {
        // essai suivant ; une reprise impossible ne doit jamais empêcher WeCraft de démarrer
      }
    }
  }
  return done;
}
