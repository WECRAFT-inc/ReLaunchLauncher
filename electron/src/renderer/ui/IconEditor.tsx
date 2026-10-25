// Éditeur d'icône d'instance : dégradé + symbole de la bibliothèque, ou image du PC recadrée (zoom, cadrage
// à la souris). L'image est lue, vérifiée et recadrée par le processus principal ; rien n'est écrit tant que
// l'utilisateur n'a pas cliqué sur « Enregistrer l'icône ».
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { IconChoice, InstanceIcon } from "../../shared/api";
import { useEscapeLayer } from "./keys";
import { load, store } from "./model";
import { InstIcon, PALETTES, randomIcon, SYMBOLS, SymbolSvg } from "./symbols";

type Imported = { key: string; ext: string; width: number; height: number; url: string };
type Gen = { c: [string, string]; sym: string | null };
const RECENTS = "rl-icon-recents";
const BOX = 168;

/** Style de l'aperçu recadré (même calcul que cropRect côté processus principal). */
export function cropStyle(img: { width: number; height: number; url: string }, crop: { zoom: number; cx: number; cy: number }, box: number) {
  const scale = (box * crop.zoom) / Math.min(img.width, img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const left = Math.min(0, Math.max(box - w, box / 2 - crop.cx * w));
  const top = Math.min(0, Math.max(box - h, box / 2 - crop.cy * h));
  return { backgroundImage: `url("${img.url}")`, backgroundSize: `${w}px ${h}px`, backgroundPosition: `${left}px ${top}px` };
}

export function IconEditor({
  open,
  name,
  current,
  fallback,
  onCancel,
  onSave,
}: {
  open: boolean;
  name: string;
  current: InstanceIcon | null;
  fallback: [string, string];
  onCancel: () => void;
  onSave: (choice: IconChoice | null, view: InstanceIcon | null) => void;
}) {
  const [gen, setGen] = useState<Gen>({ c: PALETTES[0]!, sym: null });
  const [img, setImg] = useState<Imported | null>(null);
  const [mode, setMode] = useState<"gen" | "file">("gen");
  const [crop, setCrop] = useState({ zoom: 1, cx: 0.5, cy: 0.5 });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [recents, setRecents] = useState<Gen[]>([]);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  useEscapeLayer(open, onCancel);

  useEffect(() => {
    if (!open) return;
    setMsg("");
    setBusy(false);
    setImg(null);
    setCrop({ zoom: 1, cx: 0.5, cy: 0.5 });
    setRecents(load<Gen[]>(RECENTS, []).filter((r) => Array.isArray(r?.c)).slice(0, 6));
    if (current?.kind === "gen") {
      setGen({ c: current.c, sym: current.sym });
      setMode("gen");
    } else {
      setGen({ c: fallback, sym: null });
      setMode("gen");
    }
  }, [open, current, fallback]);

  const importImg = () => {
    setMsg("");
    void window.wecraft.media.importIcon().then((r) => {
      if (r.ok) {
        setImg(r);
        setMode("file");
        setCrop({ zoom: 1, cx: 0.5, cy: 0.5 });
      } else if (!r.canceled) setMsg(r.message ?? "Image refusée.");
    });
  };

  const save = () => {
    if (busy) return;
    if (mode === "file" && img) {
      setBusy(true);
      void window.wecraft.media.makeIcon(img.key, img.ext, crop).then((r) => {
        setBusy(false);
        if (!r.ok) return setMsg(r.message);
        onSave(r.icon, { kind: "file", url: r.url });
      });
      return;
    }
    const next = [gen, ...recents.filter((r) => !(r.c[0] === gen.c[0] && r.c[1] === gen.c[1] && r.sym === gen.sym))].slice(0, 6);
    store(RECENTS, next);
    onSave({ c: gen.c, sym: gen.sym }, { kind: "gen", c: gen.c, sym: gen.sym });
  };

  const down = (e: RPointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cx: crop.cx, cy: crop.cy };
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !img) return;
    const scale = (BOX * crop.zoom) / Math.min(img.width, img.height);
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    setCrop((c) => ({ ...c, cx: clamp(d.cx - (e.clientX - d.x) / (img.width * scale)), cy: clamp(d.cy - (e.clientY - d.y) / (img.height * scale)) }));
  };

  const preview: InstanceIcon = { kind: "gen", c: gen.c, sym: gen.sym };
  return (
    <div className="overlay" hidden={!open} data-a="m-icon" data-name="Éditeur d'icônes" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal ied" role="dialog" aria-modal="true" aria-labelledby="iedTitle">
        <header>
          <h3 id="iedTitle">Éditeur d'icônes</h3>
          <button className="xbtn" aria-label="Fermer" onClick={onCancel}>
            ✕
          </button>
        </header>
        <div className="ied-body">
          <div className="ied-left">
            <div className="ied-prev card">
              {mode === "file" && img ? (
                <div className="ied-crop" style={{ width: `${BOX}px`, height: `${BOX}px`, ...cropStyle(img, crop, BOX) }} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)} aria-label="Cadrage : faites glisser l'image" role="img"></div>
              ) : (
                <InstIcon icon={preview} fallback={fallback} name={name} size={BOX} className="big" />
              )}
              {mode === "gen" ? (
                <span className="ied-sizes">
                  <InstIcon icon={preview} fallback={fallback} name={name} size={40} />
                  <InstIcon icon={preview} fallback={fallback} name={name} size={28} />
                  <InstIcon icon={preview} fallback={fallback} name={name} size={18} />
                </span>
              ) : (
                <label className="field ied-zoom">
                  Zoom
                  <input type="range" min="1" max="4" step="0.05" value={crop.zoom} onChange={(e) => setCrop((c) => ({ ...c, zoom: Number(e.target.value) }))} aria-label="Zoom" />
                </label>
              )}
            </div>
            <button className="btn" onClick={() => (setGen(randomIcon()), setMode("gen"))}>
              ↻ Aléatoire
            </button>
            <button className="btn" onClick={importImg}>
              Importer une image
            </button>
            {recents.length ? (
              <div className="ied-recents">
                <b>Récents</b>
                <span>
                  {recents.map((r, i) => (
                    <button key={i} className="ib" aria-label="Icône récente" onClick={() => (setGen(r), setMode("gen"))}>
                      <InstIcon icon={{ kind: "gen", c: r.c, sym: r.sym }} fallback={fallback} name={name} size={30} />
                    </button>
                  ))}
                </span>
              </div>
            ) : null}
          </div>
          <div className="ied-right">
            <h4>Arrière-plan</h4>
            <div className="ied-pals">
              {PALETTES.map((p) => (
                <button
                  key={p.join()}
                  className="ied-pal"
                  style={{ background: `linear-gradient(135deg, ${p[0]}, ${p[1]})` }}
                  aria-label={`Dégradé ${p[0]} vers ${p[1]}`}
                  aria-pressed={mode === "gen" && gen.c[0] === p[0] && gen.c[1] === p[1] ? "true" : "false"}
                  onClick={() => (setGen((g) => ({ ...g, c: p })), setMode("gen"))}
                ></button>
              ))}
            </div>
            <h4>Symbole</h4>
            <div className="ied-syms">
              <button className="ied-sym" aria-pressed={mode === "gen" && !gen.sym ? "true" : "false"} onClick={() => (setGen((g) => ({ ...g, sym: null })), setMode("gen"))} title="Initiales du nom">
                <b>Aa</b>
              </button>
              {Object.entries(SYMBOLS).map(([k, s]) => (
                <button key={k} className="ied-sym" title={s.l} aria-label={s.l} aria-pressed={mode === "gen" && gen.sym === k ? "true" : "false"} onClick={() => (setGen((g) => ({ ...g, sym: k })), setMode("gen"))}>
                  <SymbolSvg sym={k} size={26} />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mfoot ied-foot">
          <small className="muted">{msg || (mode === "file" ? "Faites glisser l'image pour la cadrer, puis réglez le zoom." : "Mélange un dégradé et un symbole, ou importe ta propre image.")}</small>
          <span className="row">
            <button className="btn" onClick={() => onSave(null, null)} title="Revenir à l'icône par défaut">
              Par défaut
            </button>
            <button className="btn" onClick={onCancel}>
              Annuler
            </button>
            <button className="btn pri" onClick={save} disabled={busy}>
              {busy ? "Enregistrement…" : "Enregistrer l'icône"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
