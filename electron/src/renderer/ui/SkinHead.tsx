/**
 * Vraie tête du joueur : skin envoyé à ReLink, sinon skin du compte Minecraft lié. Les six faces de la tête
 * (avec le calque du chapeau) sont découpées dans le skin, puis posées sur le cube 3D de la barre de navigation.
 * Sans skin disponible : la tête dessinée habituelle (Steve, ou skin du launcher choisi).
 */
import { useEffect, useState, type CSSProperties } from "react";
import { useApp } from "./ctx";

export interface HeadFaces {
  f: string;
  t: string;
  u: string;
  l: string;
  r: string;
  b: string;
}

// [x, y] de chaque face (8 × 8) dans un skin 64 × 64 ; le calque du chapeau est 32 pixels plus à droite.
// Le cube est vu de trois quarts : sa face droite (.r) montre le côté gauche du personnage.
const REGIONS: Record<keyof HeadFaces, [number, number]> = { f: [8, 8], t: [8, 0], u: [16, 0], r: [16, 8], l: [0, 8], b: [24, 8] };

const cache = new Map<string, Promise<HeadFaces | null>>();

/** Découpe les faces de la tête d'un skin (data:image/png). */
export function headFaces(skin: string): Promise<HeadFaces | null> {
  const c = cache.get(skin);
  if (c) return c;
  const p = new Promise<HeadFaces | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        if (img.width !== 64 || (img.height !== 64 && img.height !== 32)) return resolve(null);
        const src = document.createElement("canvas");
        src.width = 64;
        src.height = img.height;
        const sx = src.getContext("2d", { willReadFrequently: true });
        if (!sx) return resolve(null);
        sx.drawImage(img, 0, 0);
        // ancien skin dont le calque du chapeau est plein (souvent tout noir) : on l'ignore, comme Minecraft
        const hat = sx.getImageData(40, 8, 8, 8).data;
        let opaque = true;
        let same = true;
        for (let i = 0; i < hat.length; i += 4) {
          if (hat[i + 3]! < 255) opaque = false;
          if (hat[i] !== hat[0] || hat[i + 1] !== hat[1] || hat[i + 2] !== hat[2]) same = false;
        }
        const useHat = !(opaque && same);
        const out = {} as HeadFaces;
        for (const [k, [x, y]] of Object.entries(REGIONS) as [keyof HeadFaces, [number, number]][]) {
          const cv = document.createElement("canvas");
          cv.width = 8;
          cv.height = 8;
          const cx = cv.getContext("2d");
          if (!cx) return resolve(null);
          cx.imageSmoothingEnabled = false;
          cx.drawImage(src, x, y, 8, 8, 0, 0, 8, 8);
          if (useHat) cx.drawImage(src, x + 32, y, 8, 8, 0, 0, 8, 8);
          out[k] = cv.toDataURL("image/png");
        }
        resolve(out);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = skin;
  });
  cache.set(skin, p);
  return p;
}

/** Skin du joueur (tête), mis à jour quand le compte ou son skin change. */
export function usePlayerSkin(): string | null {
  const { account } = useApp();
  const [img, setImg] = useState<string | null>(null);
  const deps = `${account?.loggedIn ? 1 : 0}|${account?.minecraftSkin?.sha256 ?? ""}|${account?.user?.minecraftUuid ?? ""}|${account?.user?.minecraftVerified ? 1 : 0}`;
  useEffect(() => {
    let alive = true;
    const load = () =>
      void window.wecraft.account.headSkin().then(
        (s) => alive && setImg(s),
        () => undefined,
      );
    load();
    // connexion Microsoft, changement de skin chez Mojang… : on revérifie de temps en temps et au retour sur la fenêtre
    const iv = window.setInterval(load, 10 * 60 * 1000);
    window.addEventListener("rl-head-refresh", load);
    return () => {
      alive = false;
      window.clearInterval(iv);
      window.removeEventListener("rl-head-refresh", load);
    };
  }, [deps]);
  return img;
}

/** Faces de la tête du joueur, ou null tant qu'aucun skin n'est disponible. */
export function usePlayerHead(): HeadFaces | null {
  const skin = usePlayerSkin();
  const [faces, setFaces] = useState<HeadFaces | null>(null);
  useEffect(() => {
    let alive = true;
    if (!skin) setFaces(null);
    else void headFaces(skin).then((f) => alive && setFaces(f));
    return () => {
      alive = false;
    };
  }, [skin]);
  return faces;
}

/** Tête 3D texturée avec les faces d'un vrai skin. */
export function RealHead({ faces, size }: { faces: HeadFaces; size: number }) {
  const bg = (u: string) => ({ backgroundImage: `url("${u}")` });
  return (
    <span className="head3d real" style={{ "--s": `${size}px` } as CSSProperties}>
      <i className="b" style={bg(faces.b)}></i>
      <i className="u" style={bg(faces.u)}></i>
      <i className="l" style={bg(faces.l)}></i>
      <i className="t" style={bg(faces.t)}></i>
      <i className="r" style={bg(faces.r)}></i>
      <i className="f" style={bg(faces.f)}></i>
    </span>
  );
}
