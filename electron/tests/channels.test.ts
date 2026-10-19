// Le preload (bac à sable) ne peut pas importer shared/channels.ts : il garde une copie des noms.
// Ce test vérifie que les deux listes sont identiques et que le preload n'expose rien d'autre.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { ALL_CHANNELS } from "../src/shared/channels";

const PRELOAD_SRC = readFileSync(path.join(__dirname, "..", "..", "src", "preload", "preload.ts"), "utf8");

test("le preload utilise exactement les canaux déclarés", () => {
  const used = [...PRELOAD_SRC.matchAll(/=\s*"([a-z]+:[a-z-]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(used, [...ALL_CHANNELS].sort());
});

test("le preload n'expose qu'un seul objet et aucun module Node", () => {
  assert.equal((PRELOAD_SRC.match(/exposeInMainWorld/g) ?? []).length, 1);
  assert.doesNotMatch(PRELOAD_SRC, /from "node:|require\(|ipcRenderer\.(on|send|sendSync)\b/);
  assert.doesNotMatch(PRELOAD_SRC, /exposeInMainWorld\([^)]*ipcRenderer\s*\)/);
});
