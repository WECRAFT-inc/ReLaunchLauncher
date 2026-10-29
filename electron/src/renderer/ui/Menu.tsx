// Petit menu « ⋯ » : s'ouvre sous son bouton, se ferme au clic ailleurs, avec Échap ou après un choix.
// La liste est affichée au-dessus de tout (portail, position fixe) et gardée dans la fenêtre : elle n'est plus
// coupée par la barre latérale ni par le bord d'une zone qui défile.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEscapeLayer } from "./keys";
import { t } from "./i18n";

export interface MenuItem {
  label: string;
  /** Attributs data-* traités par l'application (data-act, data-id…), ou action locale. */
  data?: Record<string, string>;
  onClick?: () => void;
  danger?: boolean;
  hidden?: boolean;
  disabled?: boolean;
}

export function Menu({ items, label, children, className = "ib" }: { items: (MenuItem | "sep")[]; label?: string; children?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<CSSProperties>({ position: "fixed", visibility: "hidden", top: 0, left: 0 });
  useEscapeLayer(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => {
      const t0 = e.target as Node;
      if (ref.current?.contains(t0) || listRef.current?.contains(t0)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", f);
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true); // la liste suit son bouton quand la page défile
    return () => {
      document.removeEventListener("mousedown", f);
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [open]);
  // place la liste sous le bouton (ou au-dessus s'il n'y a pas la place), sans jamais sortir de la fenêtre
  const place = () => {
    if (!ref.current || !listRef.current) return;
    const b = ref.current.getBoundingClientRect();
    const l = listRef.current.getBoundingClientRect();
    const m = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = b.right - l.width; // aligné à droite du bouton, comme avant
    if (left < m) left = Math.min(b.left, vw - l.width - m);
    left = Math.max(m, Math.min(left, vw - l.width - m));
    let top = b.bottom + 6;
    if (top + l.height > vh - m) top = Math.max(m, b.top - l.height - 6);
    setPos({ position: "fixed", top, left, right: "auto", zIndex: 1000 });
  };
  useLayoutEffect(() => {
    if (open) place();
  }, [open]);
  const list = items.filter((x) => x === "sep" || !x.hidden);
  return (
    <span className="menu" ref={ref}>
      <button
        type="button"
        className={className}
        aria-haspopup="menu"
        aria-expanded={open ? "true" : "false"}
        aria-label={label ?? t("Plus d'actions")}
        title={label ?? t("Plus d'actions")}
        onClick={(e) => {
          e.stopPropagation(); // n'ouvre pas la carte qui contient le menu
          setOpen((o) => !o);
        }}
      >
        {children ?? "⋯"}
      </button>
      {open
        ? createPortal(
        <span
          ref={listRef}
          className="menu-list"
          style={pos}
          role="menu"
          onClick={(e) => {
            // les actions data-* remontent jusqu'à l'application (délégation) ; le menu se ferme
            const b = (e.target as HTMLElement).closest("button");
            if (b && !b.disabled) setOpen(false);
          }}
        >
          {list.map((x, i) =>
            x === "sep" ? (
              <i key={`s${i}`} className="menu-sep"></i>
            ) : (
              <button
                key={x.label}
                type="button"
                role="menuitem"
                className={x.danger ? "danger" : ""}
                disabled={x.disabled}
                {...Object.fromEntries(Object.entries(x.data ?? {}).map(([k, v]) => [`data-${k}`, v]))}
                onClick={
                  x.onClick
                    ? (e) => {
                        e.stopPropagation();
                        setOpen(false);
                        x.onClick!();
                      }
                    : undefined
                }
              >
                {t(x.label)}
              </button>
            ),
          )}
        </span>,
          document.body,
        )
        : null}
    </span>
  );
}
