// Gestion centralisée de la touche Échap : un seul écouteur pour toute l'interface.
// Chaque panneau, fenêtre ou menu ouvert s'inscrit comme « couche » ; Échap ferme la DERNIÈRE couche ouverte.
// Sans couche ouverte, Échap ramène à l'accueil (rien ne se passe si l'accueil est déjà affiché).
// Échap ne ferme jamais ReLaunch et n'interrompt aucune opération : fermer une fenêtre de suivi laisse
// le téléchargement ou le lancement continuer dans le processus principal.
import { useEffect, useRef } from "react";

interface Layer {
  id: number;
  close: () => void;
}

const stack: Layer[] = [];
let nextId = 0;

/** Inscrit une couche tant que `open` est vrai ; `close` est toujours la version la plus récente. */
export function useEscapeLayer(open: boolean, close: () => void): void {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => {
    if (!open) return;
    const layer: Layer = { id: ++nextId, close: () => ref.current() };
    stack.push(layer);
    return () => {
      const i = stack.findIndex((l) => l.id === layer.id);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [open]);
}

/** Nombre de couches ouvertes (tests et diagnostic). */
export function openLayers(): number {
  return stack.length;
}

/**
 * Traite un appui sur Échap. Renvoie ce qui a été fait.
 * - champ de recherche non vide : Chromium le vide lui-même, on ne navigue pas ;
 * - couche ouverte : la dernière est fermée ;
 * - sinon : `goHome` (l'appelant ne fait rien si l'accueil est déjà affiché).
 */
export function handleEscape(target: EventTarget | null, goHome: () => void): "input" | "layer" | "home" {
  const el = target as HTMLInputElement | null;
  if (el && el.tagName === "INPUT" && el.type === "search" && el.value !== "") return "input";
  const top = stack[stack.length - 1];
  if (top) {
    top.close();
    return "layer";
  }
  goHome();
  return "home";
}
