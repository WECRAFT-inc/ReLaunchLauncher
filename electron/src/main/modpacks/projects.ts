// Pages Modrinth dans ReLaunch (grosse mise à jour) : recherche par type, page d'un projet, versions.
// Tout vient de l'API publique de Modrinth (api.modrinth.com, en HTTPS) et est VÉRIFIÉ ici avant d'être envoyé
// à l'interface : identifiants, textes bornés, images remplacées par des adresses app:// (hôtes autorisés),
// liens remplacés par des jetons, description convertie en blocs sûrs. Rien n'est inventé : un champ absent
// de la réponse est envoyé vide (null), l'interface affiche alors « non renseigné » ou rien.
import type { ProjectHit, ProjectSearch, ProjectType, ProjectVersion, ProjectView } from "../../shared/api";
import type { LinkStore } from "../links";
import type { MediaStore } from "../media/media";
import { mdToBlocks } from "./markdown";
import { explainModrinthError, MP_SORTS, type Fetch } from "./modrinth";

export const PROJECT_TYPES: readonly ProjectType[] = ["modpack", "mod", "resourcepack", "shader"];
const PID = /^[A-Za-z0-9]{1,64}$/;
const SLUG = /^[\w.-]{1,100}$/;
const VER = /^[0-9][0-9A-Za-z._-]{0,31}$/;
const LOADER_KEYS: Record<string, string[]> = { Fabric: ["fabric"], Forge: ["forge"], NeoForge: ["neoforge"], Quilt: ["quilt"], Iris: ["iris"], OptiFine: ["optifine"] };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const strOrNull = (v: unknown, max: number): string | null => (typeof v === "string" && v ? v.slice(0, max) : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
const date = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v)) ? v.slice(0, 40) : null);
const strList = (v: unknown, max: number, each = 64): string[] =>
  arr(v)
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .slice(0, max)
    .map((x) => x.slice(0, each));
const side = (v: unknown): "required" | "optional" | "unsupported" | null => (v === "required" || v === "optional" || v === "unsupported" ? v : null);
const ptype = (v: unknown): ProjectType | null => (v === "mod" || v === "modpack" || v === "resourcepack" || v === "shader" ? v : null);

export interface ProjectQuery {
  type: ProjectType;
  query: string;
  mc: string;
  loader: string;
  sort: string | null;
  offset: number;
  categories: string[];
}

/** Demande de recherche vérifiée (toute valeur inconnue est ignorée, jamais transmise à Modrinth). */
export function cleanProjectQuery(q: unknown): ProjectQuery | null {
  const o = obj(q);
  const type = ptype(o["type"]);
  if (!type) return null;
  const mc = typeof o["mc"] === "string" && VER.test(o["mc"]) ? o["mc"] : "";
  const loader = typeof o["loader"] === "string" && o["loader"] in LOADER_KEYS ? o["loader"] : "";
  const sort = typeof o["sort"] === "string" && Object.values(MP_SORTS).includes(o["sort"]) ? o["sort"] : null;
  const offset = typeof o["offset"] === "number" && Number.isInteger(o["offset"]) && o["offset"] >= 0 && o["offset"] <= 10_000 ? o["offset"] : 0;
  const categories = strList(o["categories"], 5, 40).filter((c) => /^[a-z0-9-]{1,40}$/.test(c));
  return { type, query: str(o["query"], 200), mc, loader, sort, offset, categories };
}

export function projectSearchParams(q: ProjectQuery, limit = 20): Record<string, string | number> {
  const facets: string[][] = [[`project_type:${q.type}`]];
  if (q.mc) facets.push([`versions:${q.mc}`]);
  if (q.loader) facets.push(LOADER_KEYS[q.loader]!.map((l) => `categories:${l}`));
  for (const c of q.categories) facets.push([`categories:${c}`]);
  return { query: q.query, facets: JSON.stringify(facets), limit, offset: q.offset, index: q.sort || (q.query ? "relevance" : "downloads") };
}

export function hitOf(h: Obj, media: MediaStore | null): ProjectHit | null {
  if (typeof h["project_id"] !== "string" || !PID.test(h["project_id"])) return null;
  return {
    id: h["project_id"],
    title: str(h["title"] ?? h["slug"] ?? h["project_id"], 200),
    author: str(h["author"], 100),
    description: str(h["description"], 400),
    downloads: num(h["downloads"]),
    follows: num(h["follows"]),
    categories: strList(h["display_categories"] ?? h["categories"], 12),
    slug: typeof h["slug"] === "string" && SLUG.test(h["slug"]) ? h["slug"] : null,
    type: ptype(h["project_type"]),
    icon: media ? media.remoteUrl(h["icon_url"]) : null,
    banner: media ? media.remoteUrl(h["featured_gallery"]) : null,
    updated: date(h["date_modified"]),
    clientSide: side(h["client_side"]),
    serverSide: side(h["server_side"]),
    mcVersions: strList(h["versions"], 400, 32),
  };
}

export async function searchProjects(fetch: Fetch, q: ProjectQuery, media: MediaStore | null): Promise<ProjectSearch> {
  try {
    const d = obj(await fetch("/search", projectSearchParams(q)));
    const hits = arr(d["hits"]).map((h) => hitOf(obj(h), media)).filter((h): h is ProjectHit => !!h);
    return { ok: true, total: num(d["total_hits"]) || hits.length, hits };
  } catch (e) {
    return { ok: false, message: explainModrinthError(e) };
  }
}

/** Page d'un projet : informations, description sûre, galerie, liens, licence, équipe. */
export async function getProject(fetch: Fetch, id: unknown, media: MediaStore | null, links: LinkStore): Promise<ProjectView | { error: string }> {
  if (typeof id !== "string" || !(PID.test(id) || SLUG.test(id))) return { error: "Projet invalide." };
  let p: Obj;
  try {
    p = obj(await fetch(`/project/${encodeURIComponent(id)}`));
  } catch (e) {
    return { error: explainModrinthError(e) };
  }
  if (typeof p["id"] !== "string" || !PID.test(p["id"])) return { error: "Réponse de Modrinth illisible." };
  let members: unknown[] = [];
  try {
    members = arr(await fetch(`/project/${encodeURIComponent(p["id"])}/members`));
  } catch {
    members = []; // équipe facultative : la page s'affiche sans
  }
  const owner = members.map(obj).find((m) => /owner/i.test(str(m["role"], 40))) ?? members.map(obj)[0];
  const ownerName = owner ? str(obj(owner["user"])["username"], 60) : "";
  const lic = obj(p["license"]);
  const link = (k: string, label: string) => {
    const token = links.token(p[k]);
    return token ? { label, token } : null;
  };
  const donations = arr(p["donation_urls"])
    .map(obj)
    .slice(0, 6)
    .map((d) => ({ label: str(d["platform"], 40) || "Soutenir", token: links.token(d["url"]) }))
    .filter((d): d is { label: string; token: string } => !!d.token);
  const slug = typeof p["slug"] === "string" && SLUG.test(p["slug"]) ? p["slug"] : null;
  const type = ptype(p["project_type"]);
  const pageToken = slug && type ? links.token(`https://modrinth.com/${type}/${slug}`) : null;
  return {
    id: p["id"],
    slug,
    type,
    title: str(p["title"], 200) || p["id"],
    description: str(p["description"], 600),
    body: mdToBlocks(str(p["body"], 200_000), { image: (u) => media?.remoteUrl(u) ?? null, link: (u) => links.token(u) }),
    icon: media ? media.remoteUrl(p["icon_url"]) : null,
    author: ownerName || null,
    categories: strList(p["categories"], 20),
    extraCategories: strList(p["additional_categories"], 20),
    loaders: strList(p["loaders"], 20),
    mcVersions: strList(p["game_versions"], 500, 32),
    clientSide: side(p["client_side"]),
    serverSide: side(p["server_side"]),
    downloads: num(p["downloads"]),
    followers: num(p["followers"]),
    published: date(p["published"]),
    updated: date(p["updated"]),
    license: lic["id"] || lic["name"] ? { id: str(lic["id"], 80) || null, name: str(lic["name"], 120) || null, token: links.token(lic["url"]) } : null,
    gallery: arr(p["gallery"])
      .map(obj)
      .slice(0, 24)
      .map((g) => ({ url: media ? media.remoteUrl(g["url"]) : null, title: strOrNull(g["title"], 200), description: strOrNull(g["description"], 600) }))
      .filter((g): g is { url: string; title: string | null; description: string | null } => !!g.url),
    links: [link("source_url", "Code source"), link("issues_url", "Signaler un problème"), link("wiki_url", "Wiki"), link("discord_url", "Discord"), ...donations].filter((l): l is { label: string; token: string } => !!l),
    page: pageToken,
  };
}

/** Versions publiées (filtrées par version de Minecraft et loader si demandés), les plus récentes d'abord. */
export async function getVersions(fetch: Fetch, id: unknown, mc: unknown, loader: unknown): Promise<ProjectVersion[] | { error: string }> {
  if (typeof id !== "string" || !PID.test(id)) return { error: "Projet invalide." };
  const params: Record<string, string> = {};
  if (typeof mc === "string" && VER.test(mc)) params["game_versions"] = JSON.stringify([mc]);
  if (typeof loader === "string" && loader in LOADER_KEYS) params["loaders"] = JSON.stringify(LOADER_KEYS[loader]);
  try {
    return arr(await fetch(`/project/${id}/version`, params))
      .map(obj)
      .filter((v) => typeof v["id"] === "string" && PID.test(v["id"]))
      .slice(0, 100)
      .map((v): ProjectVersion => {
        const files = arr(v["files"]).map(obj);
        const primary = files.find((f) => f["primary"] === true) ?? files[0];
        return {
          id: v["id"] as string,
          name: str(v["name"], 200),
          number: str(v["version_number"], 80),
          channel: v["version_type"] === "beta" || v["version_type"] === "alpha" ? v["version_type"] : "release",
          mcVersions: strList(v["game_versions"], 200, 32),
          loaders: strList(v["loaders"], 12),
          published: date(v["date_published"]),
          downloads: num(v["downloads"]),
          file: primary ? { name: str(primary["filename"], 200), size: num(primary["size"]) } : null,
          dependencies: arr(v["dependencies"]).map(obj).filter((d) => d["dependency_type"] === "required").length,
        };
      });
  } catch (e) {
    return { error: explainModrinthError(e) };
  }
}
