import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import {
  APP_ENTRY,
  CONTENT_SECURITY_POLICY,
  EXTERNAL_LINKS,
  isAppUrl,
  isExternalLinkId,
  mimeType,
  resolveAppAsset,
  secureWebPreferences,
} from "../src/main/security";

const ROOT = path.resolve("/opt/wecraft/renderer");

test("options de fenêtre : isolation, bac à sable, pas de Node", () => {
  const w = secureWebPreferences("/x/preload.js", false);
  assert.equal(w.contextIsolation, true);
  assert.equal(w.nodeIntegration, false);
  assert.equal(w.nodeIntegrationInWorker, false);
  assert.equal(w.nodeIntegrationInSubFrames, false);
  assert.equal(w.sandbox, true);
  assert.equal(w.webSecurity, true);
  assert.equal(w.allowRunningInsecureContent, false);
  assert.equal(w.webviewTag, false);
  assert.equal(w.experimentalFeatures, false);
  assert.equal(w.devTools, false);
});

test("CSP : ni eval, ni script en ligne, ni réseau depuis l'interface", () => {
  assert.doesNotMatch(CONTENT_SECURITY_POLICY, /unsafe-eval|\*/);
  // Seule exception : les attributs style="…" (pas les scripts, pas les balises <style>).
  const unsafe = CONTENT_SECURITY_POLICY.split("; ").filter((d) => d.includes("unsafe-inline"));
  assert.deepEqual(unsafe, ["style-src-attr 'unsafe-inline'"]);
  assert.match(CONTENT_SECURITY_POLICY, /script-src app:\/\/wecraft(;|$)/);
  assert.match(CONTENT_SECURITY_POLICY, /default-src 'none'/);
  assert.match(CONTENT_SECURITY_POLICY, /connect-src 'none'/);
  assert.match(CONTENT_SECURITY_POLICY, /object-src 'none'/);
});

test("isAppUrl n'accepte que l'interface de WeCraft", () => {
  assert.equal(isAppUrl(APP_ENTRY), true);
  assert.equal(isAppUrl("app://wecraft/sub/page.html"), true);
  for (const bad of [
    "https://wecraft/index.html",
    "file:///C:/index.html",
    "app://autre/index.html",
    "app://user:pw@wecraft/index.html",
    "app://wecraft.evil.com/index.html",
    "javascript:alert(1)",
    "pas une adresse",
    "",
  ]) {
    assert.equal(isAppUrl(bad), false, bad);
  }
});

test("resolveAppAsset reste dans le dossier de l'interface", () => {
  assert.equal(resolveAppAsset(ROOT, "app://wecraft/"), path.join(ROOT, "index.html"));
  assert.equal(resolveAppAsset(ROOT, "app://wecraft/index.html"), path.join(ROOT, "index.html"));
  assert.equal(resolveAppAsset(ROOT, "app://wecraft/assets/fonts/Inter-Bold.otf"), path.join(ROOT, "assets", "fonts", "Inter-Bold.otf"));
  assert.equal(resolveAppAsset(ROOT, "app://wecraft/styles.css?v=1#x"), path.join(ROOT, "styles.css"));
});

test("resolveAppAsset : jamais de fichier hors du dossier, quelle que soit l'adresse", () => {
  // L'analyseur d'URL ramène « /../x » à « /x » : le résultat doit simplement rester dans ROOT.
  for (const tricky of [
    "app://wecraft/../secret.txt",
    "app://wecraft/%2e%2e/secret.txt",
    "app://wecraft/assets/%2e%2e/%2e%2e/%2e%2e/secret.txt",
    "app://wecraft/./././../../../etc/passwd",
    "app://wecraft//etc/passwd",
  ]) {
    const r = resolveAppAsset(ROOT, tricky);
    assert.ok(r === null || r.startsWith(ROOT + path.sep), `${tricky} -> ${r}`);
  }
});

test("resolveAppAsset refuse les formes dangereuses", () => {
  for (const bad of [
    "app://wecraft/%2e%2e%2fsecret.txt",
    "app://wecraft/..%5csecret.txt",
    "app://wecraft/assets%5c..%5c..%5csecret.txt",
    "app://wecraft/C:/Windows/win.ini",
    "app://wecraft/C%3A%5CWindows%5Cwin.ini",
    "app://wecraft/index.html%00.png",
    "app://wecraft/%E0%A4%A",
    "app://autre/index.html",
    "file:///etc/passwd",
  ]) {
    assert.equal(resolveAppAsset(ROOT, bad), null, bad);
  }
});

test("resolveAppAsset refuse aussi les remontées avec les règles de chemin Windows", () => {
  const winRoot = "C:\\WeCraft\\resources\\renderer";
  assert.equal(resolveAppAsset(winRoot, "app://wecraft/app.js", path.win32), "C:\\WeCraft\\resources\\renderer\\app.js");
  assert.equal(resolveAppAsset(winRoot, "app://wecraft/..%5c..%5capp.asar", path.win32), null);
  assert.equal(resolveAppAsset(winRoot, "app://wecraft/D:/x.js", path.win32), null);
});

test("types MIME : seuls les fichiers attendus sont servis", () => {
  assert.equal(mimeType("index.html"), "text/html; charset=utf-8");
  assert.equal(mimeType("a/B.OTF"), "font/otf");
  assert.equal(mimeType("evil.exe"), null);
  assert.equal(mimeType("sans-extension"), null);
});

test("liens externes : identifiants connus, en HTTPS uniquement", () => {
  assert.equal(isExternalLinkId("modrinth"), true);
  assert.equal(isExternalLinkId("toString"), false);
  assert.equal(isExternalLinkId("__proto__"), false);
  assert.equal(isExternalLinkId("https://evil.example"), false);
  assert.equal(isExternalLinkId(42), false);
  for (const url of Object.values(EXTERNAL_LINKS)) assert.match(url, /^https:\/\//);
});
