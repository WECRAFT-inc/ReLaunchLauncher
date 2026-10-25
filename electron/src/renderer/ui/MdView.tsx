// Affichage des descriptions Modrinth : blocs préparés par le processus principal, rendus avec React
// (aucun HTML inséré, aucun script possible). Liens ouverts dans le navigateur par jeton ; images servies
// par ReLaunch (app://), remplacées par leur texte si elles ne se chargent pas.
import type { ReactNode } from "react";
import type { MdBlock, MdInline } from "../../shared/api";
import { t } from "./i18n";

function Img({ src, alt }: { src: string | null; alt: string }) {
  if (!src) return alt ? <span className="md-alt">{`[image : ${alt}]`}</span> : null;
  return (
    <img
      className="md-img"
      src={src}
      alt={alt}
      loading="lazy"
      onError={(e) => {
        const el = e.target as HTMLImageElement;
        el.replaceWith(document.createTextNode(alt ? `[image : ${alt}]` : ""));
      }}
    />
  );
}

export function Inlines({ c }: { c: MdInline[] }): ReactNode {
  return c.map((n, i) => {
    switch (n.t) {
      case "text":
        return n.v;
      case "b":
        return (
          <strong key={i}>
            <Inlines c={n.c} />
          </strong>
        );
      case "i":
        return (
          <em key={i}>
            <Inlines c={n.c} />
          </em>
        );
      case "s":
        return (
          <s key={i}>
            <Inlines c={n.c} />
          </s>
        );
      case "code":
        return <code key={i}>{n.v}</code>;
      case "br":
        return <br key={i} />;
      case "img":
        return <Img key={i} src={n.src} alt={n.alt} />;
      case "a":
        return n.token ? (
          <a
            key={i}
            href="#"
            className="md-a"
            title={t("Ouvrir dans le navigateur")}
            onClick={(e) => {
              e.preventDefault();
              void window.wecraft.projects.openLink(n.token!);
            }}
          >
            <Inlines c={n.c} />
          </a>
        ) : (
          <span key={i}>
            <Inlines c={n.c} />
          </span>
        );
    }
  });
}

export function MdView({ blocks }: { blocks: MdBlock[] }) {
  if (!blocks.length) return <p className="faint">{t("Aucune description fournie par l'auteur.")}</p>;
  return (
    <div className="md">
      {blocks.map((b, i) => {
        switch (b.t) {
          case "h": {
            const H = (["h2", "h3", "h4", "h5"] as const)[b.level - 1]!;
            return (
              <H key={i}>
                <Inlines c={b.c} />
              </H>
            );
          }
          case "p":
            return (
              <p key={i}>
                <Inlines c={b.c} />
              </p>
            );
          case "ul":
          case "ol": {
            const L = b.t;
            return (
              <L key={i}>
                {b.items.map((it, k) => (
                  <li key={k}>
                    <Inlines c={it} />
                  </li>
                ))}
              </L>
            );
          }
          case "quote":
            return (
              <blockquote key={i}>
                <Inlines c={b.c} />
              </blockquote>
            );
          case "pre":
            return <pre key={i}>{b.v}</pre>;
          case "hr":
            return <hr key={i} />;
        }
      })}
    </div>
  );
}
