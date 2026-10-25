// Description d'un projet Modrinth (Markdown, parfois mêlé de HTML) -> blocs de données sûrs pour l'interface.
// Le texte n'est JAMAIS inséré comme HTML : l'interface ne reçoit que des objets (titre, paragraphe, liste…)
// qu'elle affiche avec React. Le HTML de la description est réduit à ce qui a un équivalent Markdown (image,
// lien, gras, italique, titres, retours à la ligne) ; tout le reste (scripts, styles, iframes, formulaires,
// attributs) disparaît. Les images et les liens passent par des fonctions du processus principal :
// image -> adresse app:// (hôtes autorisés seulement), lien -> jeton à ouvrir dans le navigateur.

import type { MdBlock as Block, MdInline as Inline } from "../../shared/api";
export type { Block, Inline };

export interface MdHooks {
  /** Adresse d'image -> adresse app:// affichable, ou null (image non affichée, texte alternatif gardé). */
  image: (url: string) => string | null;
  /** Adresse de lien -> jeton, ou null (texte affiché sans lien). */
  link: (url: string) => string | null;
}

export const MAX_BODY = 120_000;
const MAX_BLOCKS = 1500;

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", mdash: "—", ndash: "–", hellip: "…", copy: "©", reg: "®" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z0-9]{2,8});/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k in ENT) return ENT[k]!;
    const n = k.startsWith("#x") ? parseInt(k.slice(2), 16) : k.startsWith("#") ? parseInt(k.slice(1), 10) : NaN;
    return Number.isFinite(n) && n > 31 && n < 0x110000 && !(n >= 0xd800 && n < 0xe000) ? String.fromCodePoint(n) : m;
  });
}

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? "") : null;
};

/** HTML -> Markdown équivalent ; tout autre balise est retirée (son texte reste, sauf script/style/iframe…). */
export function htmlToMd(s: string): string {
  return s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|template|svg|math|form|noscript|textarea|select)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|iframe|object|embed|template|svg|math|form|noscript|textarea|select)\b[^>]*>/gi, "")
    .replace(/<img\b[^>]*>/gi, (t) => {
      const src = attr(t, "src");
      return src ? ` ![${(attr(t, "alt") ?? "").replace(/[[\]]/g, "")}](${src.replace(/[()\s]/g, encodeURIComponent)}) ` : "";
    })
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi, (t, inner: string) => {
      const href = attr(t, "href");
      return href ? `[${inner}](${href.replace(/[()\s]/g, encodeURIComponent)})` : inner;
    })
    .replace(/<br\s*\/?>/gi, "  \n")
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_t, l: string, inner: string) => `\n\n${"#".repeat(Number(l))} ${inner.replace(/\n/g, " ")}\n\n`)
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, "**$2**")
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, "_$2_")
    .replace(/<(code)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, "`$2`")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|ul|ol|li|center|details|summary|table|tr|blockquote|section|article|header|footer|figure|figcaption|h[1-6])\s*>/gi, "\n\n")
    .replace(/<hr\s*\/?>/gi, "\n\n---\n\n")
    .replace(/<\/?[a-z][^>]*>/gi, "");
}

/** Texte en ligne -> éléments (gras, italique, barré, code, liens, images, retours à la ligne). */
export function parseInline(s: string, h: MdHooks, depth = 0): Inline[] {
  const out: Inline[] = [];
  const text = (v: string) => {
    if (!v) return;
    const last = out[out.length - 1];
    if (last && last.t === "text") last.v += v;
    else out.push({ t: "text", v });
  };
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    let m: RegExpExecArray | null;
    if (rest.startsWith("  \n") || rest.startsWith("\\\n")) {
      out.push({ t: "br" });
      i += rest.startsWith("  \n") ? 3 : 2;
      continue;
    }
    if (rest[0] === "\n") {
      text(" ");
      i++;
      continue;
    }
    if ((m = /^`([^`\n]{1,500})`/.exec(rest))) {
      out.push({ t: "code", v: m[1]! });
      i += m[0].length;
      continue;
    }
    if ((m = /^!\[([^\]\n]{0,300})\]\(\s*<?([^)\s>]{1,2048})>?(?:\s+"[^"]*")?\s*\)/.exec(rest))) {
      out.push({ t: "img", src: h.image(decodeEntities(m[2]!)), alt: decodeEntities(m[1]!) });
      i += m[0].length;
      continue;
    }
    if (depth < 4 && (m = /^\[((?:[^[\]\n]|\[[^[\]\n]*\]){0,600})\]\(\s*<?([^)\s>]{1,2048})>?(?:\s+"[^"]*")?\s*\)/.exec(rest))) {
      out.push({ t: "a", token: h.link(decodeEntities(m[2]!)), c: parseInline(m[1]!, h, depth + 1) });
      i += m[0].length;
      continue;
    }
    if (depth < 4 && (m = /^(\*\*|__)(?=\S)([\s\S]{1,600}?\S)\1/.exec(rest))) {
      out.push({ t: "b", c: parseInline(m[2]!, h, depth + 1) });
      i += m[0].length;
      continue;
    }
    if (depth < 4 && (m = /^~~(?=\S)([\s\S]{1,600}?\S)~~/.exec(rest))) {
      out.push({ t: "s", c: parseInline(m[1]!, h, depth + 1) });
      i += m[0].length;
      continue;
    }
    if (depth < 4 && (m = /^(\*|_)(?=\S)([^*_\n]{1,1000}?\S)\1(?![A-Za-z0-9])/.exec(rest))) {
      out.push({ t: "i", c: parseInline(m[2]!, h, depth + 1) });
      i += m[0].length;
      continue;
    }
    if ((m = /^<?(https:\/\/[^\s<>()]{4,2048})>?/.exec(rest)) && (i === 0 || /\s|\(/.test(s[i - 1]!))) {
      const url = m[1]!.replace(/[.,;:!?]+$/, "");
      out.push({ t: "a", token: h.link(url), c: [{ t: "text", v: url }] });
      i += m[0].indexOf(url) + url.length + (m[0].endsWith(">") ? 1 : 0);
      continue;
    }
    if (rest[0] === "\\" && rest.length > 1 && /[\\`*_{}[\]()#+\-.!~|>]/.test(rest[1]!)) {
      text(rest[1]!);
      i += 2;
      continue;
    }
    text(rest[0]!);
    i++;
  }
  for (const n of out) if (n.t === "text") n.v = decodeEntities(n.v);
  return out;
}

/** Markdown (avec HTML) -> blocs sûrs. */
export function mdToBlocks(source: string, h: MdHooks): Block[] {
  // les blocs de code (```) sont mis de côté : leur contenu reste du texte, jamais converti
  const fences: string[] = [];
  const raw = String(source ?? "").slice(0, MAX_BODY).replace(/\r\n?/g, "\n");
  const protectedSrc = raw.replace(/^[ \t]*```[^\n]*\n[\s\S]*?^[ \t]*```[ \t]*$/gm, (m) => `\n\u0000${fences.push(m) - 1}\u0000\n`);
  const md = htmlToMd(protectedSrc).replace(/\u0000(\d+)\u0000/g, (_m, n: string) => fences[Number(n)] ?? "");
  const lines = md.split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    const t = para.join("\n").trim();
    if (t) blocks.push({ t: "p", c: parseInline(t, h) });
    para = [];
  };
  for (let i = 0; i < lines.length && blocks.length < MAX_BLOCKS; i++) {
    const line = lines[i]!;
    let m: RegExpExecArray | null;
    if (/^\s*```/.test(line)) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]!); i++) code.push(lines[i]!);
      blocks.push({ t: "pre", v: code.join("\n").slice(0, 20_000) });
      continue;
    }
    if ((m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
      flush();
      blocks.push({ t: "h", level: Math.min(4, m[1]!.length) as 1 | 2 | 3 | 4, c: parseInline(m[2]!, h) });
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      blocks.push({ t: "hr" });
      continue;
    }
    if (/^\s{0,3}>/.test(line)) {
      flush();
      const q: string[] = [];
      for (; i < lines.length && /^\s{0,3}>/.test(lines[i]!); i++) q.push(lines[i]!.replace(/^\s{0,3}>\s?/, ""));
      i--;
      blocks.push({ t: "quote", c: parseInline(q.join("\n").trim(), h) });
      continue;
    }
    if ((m = /^\s{0,3}([-*+]|\d{1,3}[.)])\s+/.exec(line))) {
      flush();
      const ordered = /\d/.test(m[1]!);
      const items: string[] = [];
      for (; i < lines.length; i++) {
        const l = lines[i]!;
        const mm = /^\s{0,6}([-*+]|\d{1,3}[.)])\s+(.*)$/.exec(l);
        if (mm) items.push(mm[2]!);
        else if (l.trim() && items.length && /^\s{2,}/.test(l)) items[items.length - 1] += " " + l.trim();
        else break;
      }
      i--;
      blocks.push({ t: ordered ? "ol" : "ul", items: items.slice(0, 300).map((x) => parseInline(x, h)) });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      // tableau : chaque ligne devient un paragraphe « cellule · cellule » (lisible, sans mise en page fragile)
      flush();
      if (/^\s*\|?\s*:?-{2,}/.test(line)) continue;
      const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length) blocks.push({ t: "p", c: parseInline(cells.join(" · "), h) });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks.slice(0, MAX_BLOCKS);
}
