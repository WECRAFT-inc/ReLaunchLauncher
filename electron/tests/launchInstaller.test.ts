// Lancement de l'installeur de mise à jour : secours si Windows / l'antivirus refuse (spawn EPERM).
import assert from "node:assert/strict";
import { test } from "node:test";
import { startInstaller, startProcessScript } from "../src/main/update/launchInstaller";

const F = "C:\\Users\\a\\AppData\\Roaming\\.wecraft\\updates\\ReLaunch-Setup-2.0.25-rc2.exe";
const eperm = async () => {
  throw Object.assign(new Error("spawn EPERM"), { code: "EPERM" });
};

test("direct accepté : aucune autre méthode", async () => {
  const calls: string[] = [];
  const how = await startInstaller(F, ["/S", "--force-run"], { spawnDetached: async (f, a) => void calls.push([f, ...a].join(" ")), powershell: async () => (calls.push("ps"), 0) });
  assert.equal(how, "direct");
  assert.deepEqual(calls, [`${F} /S --force-run`]);
});

test("direct refusé (EPERM) → PowerShell Start-Process avec les mêmes arguments", async () => {
  let got: string[] = [];
  const lines: string[] = [];
  const how = await startInstaller(F, ["/S", "--force-run"], { spawnDetached: eperm, powershell: async (a) => ((got = a), 0), log: (l) => lines.push(l) });
  assert.equal(how, "PowerShell");
  assert.equal(got.at(-2), "-Command");
  assert.equal(got.at(-1), `Start-Process -FilePath '${F}' -ArgumentList '/S','--force-run'`);
  assert.ok(lines.some((l) => /direct refusé \(spawn EPERM\)/.test(l)));
});

test("tout refusé sauf le shell Windows ; puis tout refusé → message qui parle de l'antivirus", async () => {
  let opened = "";
  assert.equal(await startInstaller(F, ["/S"], { spawnDetached: eperm, powershell: async () => 1, shellOpen: async (f) => void (opened = f) }), "shell Windows");
  assert.equal(opened, F);
  await assert.rejects(startInstaller(F, ["/S"], { spawnDetached: eperm, powershell: eperm, shellOpen: eperm }), /antivirus/);
});

test("Start-Process : guillemets échappés, chemins et arguments douteux refusés", () => {
  assert.equal(startProcessScript("C:\\a'b\\ReLaunch-Setup-1.exe", []), "Start-Process -FilePath 'C:\\a''b\\ReLaunch-Setup-1.exe'");
  assert.throws(() => startProcessScript("ReLaunch.exe", []), /refusé/);
  assert.throws(() => startProcessScript("C:\\x\\a.bat", []), /refusé/);
  assert.throws(() => startProcessScript(F, ["/S; Remove-Item C:\\"]), /refusés/);
});
