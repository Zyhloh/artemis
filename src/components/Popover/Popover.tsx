import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type WheelEvent
} from "react";
import { createPortal } from "react-dom";
import "./Popover.css";

interface PopoverProps {
  anchor: DOMRect | null;
  onClose: () => void;
  role?: string;
  className?: string;
  forwardWheel?: boolean;
  children: ReactNode;
}

const GAP = 6;
const EDGE = 8;
const EXIT = 140;

export function Popover({
  anchor: target,
  onClose,
  role = "dialog",
  className = "",
  forwardWheel = false,
  children
}: PopoverProps) {
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
  }, [anchor, children]);

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

    const scrolled = (event: Event) => {
      if (!panel.current?.contains(event.target as Node)) onClose();
    };

    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", scrolled, true);

    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", scrolled, true);
    };
  }, [anchor, leaving, onClose]);

  if (!anchor) return null;

  const forward = (event: WheelEvent<HTMLDivElement>) => {
    if (!forwardWheel) return;

    const scroller = document.querySelector<HTMLElement>(".window__scroll");
    scroller?.scrollBy({ top: event.deltaY, left: event.deltaX });
    onClose();
  };

  return createPortal(
    <div
      className={`popover${place ? " popover--ready" : ""}${
        leaving ? " popover--leaving" : ""
      }${className ? ` ${className}` : ""}`}
      ref={panel}
      role={role}
      style={place ? { left: place.left, top: place.top } : undefined}
      onWheel={forward}
    >
      {children}
    </div>,
    document.body
  );
}
