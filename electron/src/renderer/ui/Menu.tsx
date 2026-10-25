// Petit menu « ⋯ » : s'ouvre sous son bouton, se ferme au clic ailleurs, avec Échap ou après un choix.
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  useEscapeLayer(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
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
      {open ? (
        <span
          className="menu-list"
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
        </span>
      ) : null}
    </span>
  );
}
