import { useEffect, useLayoutEffect, useRef, useState, type WheelEvent } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "@components/Icon/Icon";
import "./ContextMenu.css";

export interface MenuItem {
  id: string;
  label: string;
  icon?: IconName;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  active?: boolean;
  run: () => void;
}

export type MenuEntry = MenuItem | "separator";

interface ContextMenuProps {
  anchor: DOMRect | null;
  items: MenuEntry[];
  onClose: () => void;
}

const GAP = 6;
const EDGE = 8;
const EXIT = 140;

export function ContextMenu({ anchor: target, items, onClose }: ContextMenuProps) {
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(target);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (target) {
      setAnchor(target);
      setLeaving(false);
      return;
    }

    if (!anchor) return;

    setLeaving(true);

    const timer = setTimeout(() => {
      setAnchor(null);
      setLeaving(false);
    }, EXIT);

    return () => clearTimeout(timer);
  }, [target]);

  useLayoutEffect(() => {
    const node = panel.current;

    if (!anchor || !node) {
      setPlace(null);
      return;
    }

    const width = node.offsetWidth;
    const height = node.offsetHeight;
    const maxLeft = window.innerWidth - width - EDGE;
    const left = Math.max(EDGE, Math.min(anchor.right - width, maxLeft));

    const below = anchor.bottom + GAP;
    const fits = below + height <= window.innerHeight - EDGE;
    const top = fits ? below : Math.max(EDGE, anchor.top - GAP - height);

    setPlace({ left, top });
  }, [anchor, items.length]);

  useEffect(() => {
    if (!anchor || leaving) return;

    const away = (event: PointerEvent) => {
      if (panel.current?.contains(event.target as Node)) return;

      const onAnchor =
        event.clientX >= anchor.left &&
        event.clientX <= anchor.right &&
        event.clientY >= anchor.top &&
        event.clientY <= anchor.bottom;

      if (!onAnchor) onClose();
    };

    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);

    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [anchor, leaving, onClose]);

  if (!anchor) return null;

  const forward = (event: WheelEvent<HTMLDivElement>) => {
    const scroller = document.querySelector<HTMLElement>(".window__scroll");
    scroller?.scrollBy({ top: event.deltaY, left: event.deltaX });
    onClose();
  };

  return createPortal(
    <div
      className={`menu${place ? " menu--ready" : ""}${leaving ? " menu--leaving" : ""}`}
      ref={panel}
      role="menu"
      style={place ? { left: place.left, top: place.top } : undefined}
      onWheel={forward}
    >
      {items.map((entry, index) =>
        entry === "separator" ? (
          <span className="menu__rule" key={`rule-${index}`} />
        ) : (
          <button
            className={`menu__item${entry.danger ? " menu__item--danger" : ""}${
              entry.active ? " menu__item--active" : ""
            }`}
            key={entry.id}
            role="menuitem"
            disabled={entry.disabled}
            onClick={() => {
              onClose();
              entry.run();
            }}
          >
            {entry.icon && (
              <span className="menu__icon">
                <Icon name={entry.icon} size={14} />
              </span>
            )}
            <span className="menu__copy">
              <span className="menu__label">{entry.label}</span>
              {entry.hint && <span className="menu__hint">{entry.hint}</span>}
            </span>
            {entry.active && (
              <span className="menu__check">
                <Icon name="check" size={13} strokeWidth={2.4} />
              </span>
            )}
          </button>
        )
      )}
    </div>,
    document.body
  );
}
