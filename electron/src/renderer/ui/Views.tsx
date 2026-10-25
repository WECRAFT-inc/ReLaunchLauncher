// Pages Accueil, WeCraft, Favoris et pages « bientôt » (port du prototype, même balisage).
import { useEffect, useRef, type CSSProperties } from "react";
import { useApp } from "./ctx";
import { Ic } from "./Ic";
import { InstIcon } from "./symbols";
import { ago, detail, isPinned, SC, type Inst } from "./model";

type Css = CSSProperties & Record<`--${string}`, string>;
/** Couverture : fond choisi pour l'instance (si les images de fond sont activées), sinon dégradé. */
const coverOf = (x: Inst, imgs: boolean): Css => {
  const c = x.icon?.kind === "gen" ? x.icon.c : x.c;
  return imgs && x.bg ? { "--c1": c[0], "--c2": c[1], backgroundImage: `url("${x.bg}")`, backgroundSize: "cover", backgroundPosition: "center" } : { "--c1": c[0], "--c2": c[1] };
};

export function PinBtn({ id }: { id: string }) {
  const { nav } = useApp();
  const on = isPinned(nav, id);
  const l = on ? "Retirer de la barre" : "Épingler dans la barre";
  return (
    <button className="pinbtn" data-act="pin" data-id={id} aria-pressed={on ? "true" : "false"} aria-label={l} title={l}>
      <Ic n="pins" />
    </button>
  );
}

export function Soon({ title, sub, text }: { title: string; sub: string; text: string }) {
  return (
    <>
      <div className="vhead">
        <div>
          <h2>{title}</h2>
          <div className="sub">{sub}</div>
        </div>
      </div>
      <div className="card rl-empty">
        <b>Pas encore disponible</b>
        <p className="muted">{text}</p>
      </div>
    </>
  );
}

export const SOON: Record<string, { title: string; sub: string; text: string }> = {
  relaunch: { title: "ReLaunch", sub: "Events et serveurs", text: "Les events et serveurs ReLaunch arriveront avec les comptes ReLink." },
  welive: { title: "WeLive", sub: "Contenus Minecraft francophones", text: "Les séries, lives, serveurs et créateurs recommandés arriveront dans une prochaine version." },
  relink: { title: "Compte ReLink", sub: "Profil, captures d'écran, skins et shop", text: "Les comptes ReLink ne sont pas encore disponibles." },
  live: { title: "Diffusion Partenaires", sub: "Lives des partenaires", text: "Aucun live pour l'instant." },
  news: { title: "Info & News", sub: "Actualités et annonces", text: "Aucune actualité pour l'instant." },
  discover: { title: "Découvrir", sub: "Modpacks, mods, shaders et serveurs", text: "Le catalogue (Modrinth) arrivera dans une prochaine version." },
};

export function Home() {
  const { inst, ui, byId, setUi, pref } = useApp();
  const sel = byId(ui.sel) ?? inst[0];
  const bgStyle: CSSProperties | undefined = sel?.bg && pref.imgs !== false ? { backgroundImage: `linear-gradient(90deg, rgba(8,9,14,.82), rgba(8,9,14,.35)), url("${sel.bg}")` } : undefined;
  if (!sel) {
    return (
      <div className="home nocar">
        <div className="hmain">
          <h2 className="huge" aria-label="ReLaunch">
            RELAUNCH
          </h2>
          <div className="playrow">
            <select id="homeSel" aria-label="Instance ou serveur" disabled>
              <option>Aucune instance pour l'instant</option>
            </select>
            <button className="btn play" id="homePlay" data-act="noInst">
              Jouer
            </button>
          </div>
          <span className="seldet" id="homeDet">
            Aucune instance trouvée sur ce PC (WeCraft, CurseForge, Modrinth, Prism).
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className={`home nocar${bgStyle ? " has-bg" : ""}`} style={bgStyle}>
      <div className="hmain">
        <span className="hmeta">
          <button className="newsbtn" data-go="news" data-a="home-news">
            <Ic n="news" />
            Info &amp; News
          </button>
        </span>
        <h2 className="huge" aria-label="ReLaunch">
          RELAUNCH
        </h2>
        <div className="playrow">
          <select id="homeSel" aria-label="Instance ou serveur" value={sel.id} onChange={(e) => setUi({ sel: e.target.value })}>
            <optgroup label="ReLaunch · serveurs"></optgroup>
            <optgroup label="WeCraft · instances">
              {inst.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.n}
                </option>
              ))}
            </optgroup>
          </select>
          <button className="btn play" data-play={sel.id} id="homePlay">
            Jouer
          </button>
        </div>
        <span className="seldet" id="homeDet">
          {detail(sel)}
        </span>
      </div>
    </div>
  );
}

const SRC_CHIPS = ["all", "WeCraft", "CurseForge", "Prism", "Modrinth"];

export function Wecraft() {
  const { inst, hidden, ui, setUi, byId, pref } = useApp();
  const recent = inst
    .filter((x) => x.last)
    .sort((a, b) => b.last! - a.last!)
    .slice(0, 5);
  const q = ui.wcQ.trim().toLowerCase();
  const rows = inst.filter((i) => (ui.wcSrc === "all" || i.s === ui.wcSrc) && i.n.toLowerCase().includes(q)).sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0));
  const del = ui.delId ? byId(ui.delId) : undefined;
  const noRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ui.delId) noRef.current?.focus();
  }, [ui.delId]);
  return (
    <>
      <div className="vhead">
        <div>
          <h2>WeCraft</h2>
          <div className="sub">Ton launcher Minecraft : instances, modpacks et outils</div>
        </div>
      </div>
      <div className="qa">
        <button className="btn" data-act="create">
          <Ic n="create" />
          Créer un WePack<small>Nouvelle instance personnalisée</small>
        </button>
        <button className="btn" data-act="import">
          <Ic n="import" />
          Importer une instance<small>Prism, CurseForge, Modrinth</small>
        </button>
        <button className="btn" data-go="discover">
          <Ic n="discover" />
          Parcourir les modpacks<small>Catalogue de contenus</small>
        </button>
      </div>
      <div className="sect">
        <h3>Dernières instances lancées</h3>
        <div className="hscroll">
          {recent.length ? null : (
            <span className="faint" style={{ fontSize: "13px" }}>
              Aucune instance lancée pour l'instant.
            </span>
          )}
          {recent.map((x) => (
            <div key={x.id} className="wcard" data-a={`wrec-${x.id}`}>
              <div className="cover" style={coverOf(x, pref.imgs !== false)}>
                <InstIcon icon={x.icon} fallback={x.c} name={x.n} size={44} className="on-cover" />
              </div>
              <b>{x.n}</b>
              <small>{`${x.l} · ${x.v} · ${ago(x.last)}`}</small>
              <span className="row">
                <button className="btn sm pri" data-play={x.id}>
                  <Ic n="play" />
                  Jouer
                </button>
                <PinBtn id={x.id} />
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="sect">
        <h3>Toutes les instances</h3>
        <div className="toolbar">
          <div className="chips" id="wcSrc">
            {SRC_CHIPS.map((s) => (
              <button key={s} className="chip" data-src={s} aria-pressed={ui.wcSrc === s ? "true" : "false"} onClick={() => setUi({ wcSrc: s })}>
                {s === "all" ? "Toutes" : s}
              </button>
            ))}
          </div>
          <input type="search" id="wcQ" placeholder="Rechercher une instance" aria-label="Rechercher une instance" value={ui.wcQ} onChange={(e) => setUi({ wcQ: e.target.value })} />
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Instance</th>
                <th>Version</th>
                <th>Loader</th>
                <th>Mods</th>
                <th>Mémoire</th>
                <th>Source</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="wcRows">
              {rows.map((i) => (
                <tr key={i.id} data-a={`inst-${i.id}`}>
                  <td>
                    <button className="star" data-act="fav" data-id={i.id} aria-pressed={i.fav ? "true" : "false"} aria-label="Favori">
                      ★
                    </button>
                  </td>
                  <td>
                    <span className="row inst-name">
                      <InstIcon icon={i.icon} fallback={i.c} name={i.n} size={30} />
                      <b>{i.n}</b>
                    </span>
                  </td>
                  <td className="num">{i.v || "?"}</td>
                  <td>{`${i.l} ${i.lv}`}</td>
                  <td className="num">{i.m || "—"}</td>
                  <td className="num">{i.r ? `${i.r} Go` : "—"}</td>
                  <td>
                    <span className="src" style={{ "--sc": SC[i.s] ?? "var(--acc)" } as Css}>
                      {i.s}
                    </span>
                  </td>
                  <td>
                    <span className="row" style={{ justifyContent: "flex-end" }}>
                      <PinBtn id={i.id} />
                      <button className="ib" data-act="instEdit" data-id={i.id} aria-label={`Réglages de ${i.n}`} title="Réglages (nom, version, loader, RAM, icône, fond)">
                        ⚙
                      </button>
                      {i.mp ? (
                        <button className="ib" data-act="mpEdit" data-id={i.id} aria-label={`Modifier les mods de ${i.n}`} title="Modifier les mods (Découvrir)">
                          ✎
                        </button>
                      ) : null}
                      <button className="ib" data-act="del" data-id={i.id} aria-label={`Supprimer ${i.n}`} title="Supprimer (corbeille)">
                        🗑
                      </button>
                      <button className="btn sm pri" data-play={i.id}>
                        Jouer
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length ? null : (
                <tr>
                  <td colSpan={8} className="faint">
                    {inst.length ? "Aucune instance ne correspond." : "Aucune instance trouvée sur ce PC (WeCraft, CurseForge, Modrinth, Prism)."}
                  </td>
                </tr>
              )}
              {hidden ? (
                <tr>
                  <td colSpan={8} className="faint">
                    {`${hidden} instance${hidden > 1 ? "s masquées" : " masquée"} (réglage de WeCraft).`}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="confirm gl" id="delBox" hidden={!del}>
          <span style={{ fontSize: "13.5px" }}>
            Supprimer <b id="delName">{del?.n ?? ""}</b> ? Le dossier et tout son contenu (mods, mondes, captures) partent à la corbeille de Windows.
            <span id="delSrc">{del && del.s !== "WeCraft" ? ` Cette instance vient de ${del.s} : elle disparaîtra aussi de ${del.s}.` : ""}</span>
          </span>
          <span className="row">
            <button className="btn sm" data-act="delNo" ref={noRef}>
              Annuler
            </button>
            <button className="btn sm danger" data-act="delYes">
              Supprimer
            </button>
          </span>
        </div>
      </div>
    </>
  );
}

export function Favorites() {
  const { inst, pref } = useApp();
  const f = inst.filter((x) => x.fav);
  return (
    <>
      <div className="vhead">
        <div>
          <h2>Favoris</h2>
          <div className="sub">{`${f.length} instances et serveurs épinglés`}</div>
        </div>
      </div>
      {f.length ? (
        <div className="favgrid">
          {f.map((x) => (
            <div key={x.id} className="favc" data-a={`favc-${x.id}`}>
              <div className="cover" style={coverOf(x, pref.imgs !== false)}>
                <InstIcon icon={x.icon} fallback={x.c} name={x.n} size={44} className="on-cover" />
              </div>
              <span className="row">
                <b>{x.n}</b>
                <button className="star" data-act="fav" data-id={x.id} aria-pressed="true" aria-label="Retirer des favoris">
                  ★
                </button>
              </span>
              <small>{detail(x)}</small>
              <span className="row">
                <button className="btn sm pri" data-play={x.id}>
                  <Ic n="play" />
                  Jouer
                </button>
                <PinBtn id={x.id} />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">Aucun favori. Clique sur l'étoile d'une instance dans WeCraft pour l'épingler.</div>
      )}
    </>
  );
}
