// Pages Modrinth : description convertie en blocs sûrs (aucun HTML, aucun script), liens par jetons,
// images par adresses app:// d'hôtes autorisés, données vérifiées, rien d'inventé.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { MdBlock, MdInline } from "../src/shared/api";
import { LinkStore, safeExternalUrl } from "../src/main/links";
import { decodeEntities, htmlToMd, mdToBlocks } from "../src/main/modpacks/markdown";
import { cleanProjectQuery, getProject, getVersions, hitOf, projectSearchParams } from "../src/main/modpacks/projects";
import { MediaStore } from "../src/main/media/media";

const hooks = { image: (u: string) => (u.startsWith("https://cdn.modrinth.com/") ? `app://img/${u.length}` : null), link: (u: string) => (u.startsWith("https://") ? `T(${u})` : null) };
const flat = (v: unknown): string => JSON.stringify(v);

test("description : HTML dangereux supprimé, jamais transmis", () => {
  const evil = [
    '<script>alert(1)</script><img src=x onerror="alert(2)"><iframe src="https://evil"></iframe>',
    '<a href="javascript:alert(3)">clic</a> [lien](javascript:alert(4)) <style>body{}</style>',
    '<div onclick="x()" style="background:url(javascript:y)">texte</div><svg onload="z()"><circle/></svg>',
    "<form action=https://evil><input name=p></form><object data=x></object>",
  ].join("\n\n");
  const out = flat(mdToBlocks(evil, hooks));
  for (const bad of ["<script", "alert(1)", "onerror", "<iframe", "onclick", "<svg", "onload", "javascript:", "<form", "<object", "style="]) assert.ok(!out.includes(bad), bad);
  assert.ok(out.includes("texte") && out.includes("clic"), "le texte lisible reste");
  // liens javascript: -> pas de jeton
  const links = JSON.stringify(mdToBlocks("[a](javascript:alert(1)) [b](https://x.org/p)", hooks));
  assert.ok(links.includes('"token":null') && links.includes("T(https://x.org/p)"));
});

test("description : Markdown courant rendu en blocs (titres, listes, gras, code, images, citations)", () => {
  const b = mdToBlocks(
    [
      "# Titre",
      "Un **gras** et _italique_ avec `code` et ~~barré~~.",
      "",
      "- un",
      "- deux [lien](https://modrinth.com/mod/x)",
      "",
      "1. premier",
      "2) second",
      "",
      "> citation",
      "",
      "```",
      "<b>pas du html</b>",
      "```",
      "",
      "---",
      '<p align="center"><img src="https://cdn.modrinth.com/data/a/images/b.png" alt="Bannière"></p>',
      "![autre](https://imgur.com/x.png)",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
      "Ligne avec  ",
      "retour &amp; entité &#233;",
    ].join("\n"),
    hooks,
  );
  const types = b.map((x) => x.t);
  assert.deepEqual(types, ["h", "p", "ul", "ol", "quote", "pre", "hr", "p", "p", "p", "p", "p"]);
  const p1 = (b[1] as Extract<MdBlock, { t: "p" }>).c.map((i) => i.t);
  assert.deepEqual(p1, ["text", "b", "text", "i", "text", "code", "text", "s", "text"]);
  assert.equal((b[5] as Extract<MdBlock, { t: "pre" }>).v, "<b>pas du html</b>", "le code reste du texte");
  const imgs = flat(b).match(/"t":"img","src":[^,]+/g)!;
  assert.deepEqual(imgs, ['"t":"img","src":"app://img/44"', '"t":"img","src":null'], "image d'un hôte non autorisé : pas affichée");
  const last = (b[b.length - 1] as Extract<MdBlock, { t: "p" }>).c;
  assert.ok(last.some((i: MdInline) => i.t === "br"));
  assert.ok(flat(last).includes("retour & entité é"));
  assert.equal(decodeEntities("&lt;b&gt; &#x41; &#0; &unknown;"), "<b> A &#0; &unknown;");
  assert.ok(!htmlToMd("<details><summary>Voir</summary>caché</details>").includes("<"));
});

test("description : grosse entrée bornée, pas de blocage", () => {
  const t0 = Date.now();
  const b = mdToBlocks("**a ".repeat(60_000) + "\n".repeat(10_000) + "- x\n".repeat(5000), hooks);
  assert.ok(Date.now() - t0 < 4000, `trop lent : ${Date.now() - t0} ms`);
  assert.ok(b.length <= 1500);
});

test("liens : HTTPS seulement, sans identifiants ; jetons opaques", () => {
  assert.equal(safeExternalUrl("https://github.com/a/b"), "https://github.com/a/b");
  for (const bad of ["http://x.org", "javascript:alert(1)", "file:///C:/x", "https://u:p@x.org", "https://localhost/x", "data:text/html,x", 3]) assert.equal(safeExternalUrl(bad), null, String(bad));
  const l = new LinkStore();
  const t = l.token("https://modrinth.com/mod/sodium")!;
  assert.match(t, /^[0-9a-f]{24}$/);
  assert.equal(l.token("https://modrinth.com/mod/sodium"), t);
  assert.equal(l.url(t), "https://modrinth.com/mod/sodium");
  assert.equal(l.url("https://evil.example"), null);
});

test("recherche : valeurs inconnues ignorées, facettes par type", () => {
  assert.equal(cleanProjectQuery({ type: "plugin" }), null);
  const q = cleanProjectQuery({ type: "shader", query: "x".repeat(300), mc: "1.21.1", loader: "Iris", sort: "downloads", offset: 40, categories: ["realistic", "<b>"] })!;
  assert.deepEqual([q.query.length, q.loader, q.offset, q.categories], [200, "Iris", 40, ["realistic"]]);
  assert.deepEqual(JSON.parse(String(projectSearchParams(q)["facets"])), [["project_type:shader"], ["versions:1.21.1"], ["categories:iris"], ["categories:realistic"]]);
  const q2 = cleanProjectQuery({ type: "modpack", mc: "../x", loader: "Inconnu", sort: "drop table" })!;
  assert.deepEqual(JSON.parse(String(projectSearchParams(q2)["facets"])), [["project_type:modpack"]]);
  assert.equal(projectSearchParams(q2)["index"], "downloads");
});

test("page d'un projet : données vérifiées, images et liens remplacés, rien d'inventé", async () => {
  const media = new MediaStore({ dataDir: "/inexistant", ops: { size: () => null, cropSquare: () => Buffer.alloc(0), shrinkJpeg: () => Buffer.alloc(0) } });
  const links = new LinkStore();
  const project = {
    id: "AANobbMI",
    slug: "sodium",
    project_type: "mod",
    title: "Sodium",
    description: "Rapide",
    body: "Texte <script>x</script> ![i](https://cdn.modrinth.com/data/AANobbMI/images/a.png)",
    icon_url: "https://cdn.modrinth.com/data/AANobbMI/icon.png",
    categories: ["optimization"],
    loaders: ["fabric", "quilt"],
    game_versions: ["1.20.1", "1.21.1"],
    client_side: "required",
    server_side: "unsupported",
    downloads: 99,
    followers: 5,
    published: "2020-01-01T00:00:00Z",
    updated: "2026-10-01T00:00:00Z",
    license: { id: "LGPL-3.0-only", name: "GNU LGPL", url: "https://spdx.org/licenses/LGPL-3.0-only.html" },
    gallery: [{ url: "https://cdn.modrinth.com/data/AANobbMI/images/g.webp", title: "Avant/après" }, { url: "https://evil.example/x.png" }],
    source_url: "https://github.com/CaffeineMC/sodium",
    issues_url: "javascript:alert(1)",
    discord_url: null,
    donation_urls: [{ platform: "Patreon", url: "https://patreon.com/x" }],
  };
  const fetch = async (p: string) => {
    if (p === "/project/sodium") return project;
    if (p === "/project/AANobbMI/members") return [{ role: "Member", user: { username: "b" } }, { role: "Owner", user: { username: "jellysquid3" } }];
    throw new Error("inattendu " + p);
  };
  const v = await getProject(fetch, "sodium", media, links);
  assert.ok(!("error" in v));
  assert.equal(v.author, "jellysquid3");
  assert.match(v.icon!, /^app:\/\/wecraft\/remote\//);
  assert.equal(v.gallery.length, 1, "image d'un hôte non autorisé retirée");
  assert.deepEqual(v.links.map((l) => l.label), ["Code source", "Patreon"], "lien javascript: refusé, lien absent non inventé");
  assert.equal(links.url(v.page), "https://modrinth.com/mod/sodium");
  assert.ok(!JSON.stringify(v.body).includes("script"));
  assert.deepEqual([v.license?.id, links.url(v.license?.token)], ["LGPL-3.0-only", "https://spdx.org/licenses/LGPL-3.0-only.html"]);
  assert.deepEqual(await getProject(fetch, "../../etc", media, links), { error: "Projet invalide." });
  const empty = await getProject(async (p) => (p.endsWith("/members") ? [] : { id: "abc" }), "abc", null, links);
  assert.ok(!("error" in empty));
  assert.deepEqual([empty.author, empty.license, empty.published, empty.icon, empty.links, empty.gallery], [null, null, null, null, [], []], "champs absents : vides, pas inventés");
});

test("versions : canal, compatibilité, fichier principal ; identifiant vérifié ; résultats de recherche vérifiés", async () => {
  const fetch = async (_p: string, params?: Record<string, string | number>) => {
    assert.deepEqual(params, { game_versions: '["1.21.1"]', loaders: '["fabric"]' });
    return [
      { id: "v1", name: "Sodium 0.6", version_number: "mc1.21.1-0.6.0", version_type: "beta", game_versions: ["1.21.1"], loaders: ["fabric"], date_published: "2026-01-01T00:00:00Z", downloads: 3, files: [{ filename: "a.jar", size: 10, primary: false }, { filename: "sodium.jar", size: 20, primary: true }], dependencies: [{ dependency_type: "required" }, { dependency_type: "optional" }] },
      { id: "../x" },
    ];
  };
  const v = await getVersions(fetch, "AANobbMI", "1.21.1", "Fabric");
  assert.ok(Array.isArray(v) && v.length === 1);
  assert.deepEqual([v[0]!.channel, v[0]!.file, v[0]!.dependencies], ["beta", { name: "sodium.jar", size: 20 }, 1]);
  assert.deepEqual(await getVersions(fetch, "x/../y", null, null), { error: "Projet invalide." });
  assert.equal(hitOf({ project_id: "<img>" }, null), null);
  assert.deepEqual(hitOf({ project_id: "abc", title: "T", downloads: -5, versions: ["1.21"] }, null)!.downloads, 0);
});
