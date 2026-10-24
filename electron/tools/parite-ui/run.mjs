// Compare le DOM de l'ancienne interface (prototype) et de la nouvelle (React) sur des scénarios identiques.
const { chromium } = await import(process.env.PLAYWRIGHT || "playwright");
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const OUT = process.env.PARITE_OUT || "/tmp/parite-ui";
import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });
const ROOTS = { old: process.env.OLD_RENDERER || "/tmp/claude-0/old-renderer", new: path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..", "dist", "src", "renderer") };
const csp = "default-src 'none'; script-src http://wecraft.test; style-src-elem http://wecraft.test; style-src-attr 'unsafe-inline'; img-src http://wecraft.test data:; font-src http://wecraft.test; connect-src 'none'; object-src 'none'";
const INST = [
  { id: "iaaaa", name: "Create Above <b>&</b>", source: "CurseForge", version: "1.20.1", loader: "Fabric", loaderVersion: "0.15.7", ram: 8, fav: false },
  { id: "ibbbb", name: "Mon pack", source: "WeCraft", version: "1.18.2", loader: "Forge", loaderVersion: "40.2.0", ram: null, fav: true },
  { id: "icccc", name: "Vanilla Survie", source: "Prism", version: "1.21.1", loader: null, loaderVersion: null, ram: null, fav: false },
  { id: "idddd", name: "Modrinth Pack", source: "Modrinth", version: "1.20.4", loader: "Quilt", loaderVersion: "0.26.0", ram: 6, fav: false },
];
function canonScript() {
  function canon(n) {
    if (n.nodeType === 3) return null;
    if (n.nodeType !== 1) return null;
    const el = n;
    if (el.matches("section.view[hidden]")) return { t: "section-hidden", id: el.id };
    const attrs = {};
    for (const a of el.attributes) {
      if (["style", "selected", "value", "checked"].includes(a.name)) continue;
      attrs[a.name] = a.name === "class" ? a.value.split(/\s+/).filter(Boolean).sort().join(" ") : a.name === "hidden" ? "" : a.value;
    }
    if (el.getAttribute("style")) {
      const st = [];
      for (let i = 0; i < el.style.length; i++) { const p = el.style[i]; st.push(p + ":" + el.style.getPropertyValue(p).replace(/\s+/g, " ").trim()); }
      attrs.style = st.sort().join(";");
    }
    if (el.tagName === "SELECT" || el.tagName === "INPUT") attrs["(value)"] = el.type === "checkbox" ? String(el.checked) : el.value;
    const kids = [];
    let txt = "";
    const flush = () => { const t = txt.replace(/\s+/g, " ").trim(); if (t) kids.push(t); txt = ""; };
    for (const c of el.childNodes) {
      if (c.nodeType === 3) { txt += c.nodeValue; continue; }
      flush();
      const k = canon(c); if (k) kids.push(k);
    }
    flush();
    const sorted = {}; for (const key of Object.keys(attrs).sort()) sorted[key] = attrs[key];
    return { t: el.tagName.toLowerCase(), a: sorted, k: kids };
  }
  return JSON.stringify({ app: canon(document.getElementById("appRoot")), notice: canon(document.getElementById("wc-notice")), html: { skin: document.documentElement.getAttribute("data-skin") } }, null, 1);
}
async function run(which, sc) {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("console", m => { if (m.type() === "error") errors.push(m.text()) });
  await page.addInitScript(({ inst, local, upd }) => {
    Date.now = () => 1792800000000;
    for (const [k, v] of Object.entries(local)) localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
    const info = { version: "0.5.0", electron: "44", chrome: "-", node: "24", platform: "win32", arch: "x64", dataDir: "C:\\x", dataDirExists: true, savedTheme: null, startupMs: 900, portable: false, invalidFiles: [], migrated: [], ram: 5 };
    window.wecraft = { app: { getInfo: async () => info, rendered: async () => {}, openDataDir: async () => true }, settings: { setTheme: async () => ({ ok: true }), setRam: async () => true }, links: { open: async () => true },
      instances: { list: async () => ({ hidden: 1, instances: inst }), setFavorite: async () => ({ ok: true }), remove: async () => ({ ok: true, metaForgotten: true }) },
      launch: { start: async () => ({ ok: true, job: "j" }), status: async () => null, answer: async () => true },
      update: { check: async () => (upd ? { state: "available", current: "0.5.0", latest: "0.6.0", notes: "Notes <b>x</b>", auto: true } : { state: "none", current: "0.5.0", latest: "0.5.0" }), install: async () => false, status: async () => ({ phase: "idle", done: 0, total: 0, message: "" }), openPage: async () => false } };
  }, { inst: sc.inst ?? INST, local: sc.local ?? {}, upd: !!sc.upd });
  await page.route("http://wecraft.test/**", async r => { const rel = new URL(r.request().url()).pathname.replace(/^\/+/, "") || "index.html";
    let body; try { body = readFileSync(path.join(ROOTS[which], rel)); } catch { return r.fulfill({ status: 404, body: "" }); }
    if (rel === "index.html") body = Buffer.from(body.toString().replace(/app:\/\/wecraft/g, "http://wecraft.test"));
    const ct = rel.endsWith(".js") ? "text/javascript" : rel.endsWith(".css") ? "text/css" : rel.endsWith(".html") ? "text/html" : rel.endsWith(".woff2") ? "font/woff2" : "application/octet-stream";
    await r.fulfill({ body, headers: { "content-type": ct, "content-security-policy": csp } }); });
  await page.goto("http://wecraft.test/index.html"); await page.waitForTimeout(600);
  for (const st of sc.steps ?? []) {
    if (st.click) await page.click(st.click, { timeout: 3000 }).catch(e => errors.push("click " + st.click + ": " + e.message.split("\n")[0]));
    if (st.fill) await page.fill(st.fill[0], st.fill[1]);
    if (st.select) await page.selectOption(st.select[0], st.select[1]);
    if (st.drag) await page.dragAndDrop(st.drag[0], st.drag[1]).catch(e => errors.push("drag: " + e.message.split("\n")[0]));
    if (st.key) await page.keyboard.press(st.key);
    if (st.dragjs) await page.evaluate(([a, b]) => {
      const src = document.querySelector(a), dst = document.querySelector(b), dt = new DataTransfer();
      const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      fire(src, "dragstart"); fire(dst, "dragover"); fire(dst, "drop"); fire(src, "dragend");
    }, st.dragjs);
    await page.waitForTimeout(st.wait ?? 150);
  }
  await page.mouse.move(1270, 750); await page.waitForTimeout(100);
  const out = await page.evaluate(canonScript);
  if (sc.shot) await page.screenshot({ path: `${OUT}/${sc.name}-${which}.png` });
  await b.close();
  return { out, errors };
}
const SC = JSON.parse(readFileSync(process.argv[2], "utf8"));
let same = 0, diff = 0;
for (const sc of SC) {
  const [o, n] = [await run("old", sc), await run("new", sc)];
  if (o.out === n.out && !n.errors.length) { same++; continue; }
  diff++;
  writeFileSync(`${OUT}/${sc.name}-old.json`, o.out); writeFileSync(`${OUT}/${sc.name}-new.json`, n.out);
  console.log(`DIFF ${sc.name}  erreurs old=${JSON.stringify(o.errors)} new=${JSON.stringify(n.errors)}`);
}
console.log(`identiques ${same}, différents ${diff}`);
