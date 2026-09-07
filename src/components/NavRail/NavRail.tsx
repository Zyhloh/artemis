import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@components/Icon/Icon";
import { useRailPin } from "@hooks/useRailPin";
import { displayName, initial } from "@lib/display";
import "./NavRail.css";

export interface NavRailItem {
  id: string;
  label: string;
  icon: IconName;
  badge?: number;
}

export interface NavRailGroup {
  id: string;
  label?: string;
  items: NavRailItem[];
}

export interface NavRailAccount {
  name: string;
  avatar?: string | null;
}

interface NavRailProps {
  groups: NavRailGroup[];
  footer: NavRailGroup;
  account: NavRailAccount | null;
  active: string;
  onSelect: (id: string) => void;
  onLogin: () => void;
  onLogout: () => void;
  onSwitch: () => void;
}

interface IndicatorRect {
  top: number;
  height: number;
  ready: boolean;
}

export function NavRail({
  groups,
  footer,
  account,
  active,
  onSelect,
  onLogin,
  onLogout,
  onSwitch
}: NavRailProps) {
  const { pinned } = useRailPin();
  const [menuOpen, setMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const menuVisible = account !== null && menuOpen;

  const railRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());

  const [rect, setRect] = useState<IndicatorRect>({
    top: 0,
    height: 40,
    ready: false
  });
  const [animated, setAnimated] = useState(false);

  const measure = useCallback(() => {
    const rail = railRef.current;
    const target = itemRefs.current.get(active);
    if (!rail || !target) return;

    const railBox = rail.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();

    setRect({
      top: targetBox.top - railBox.top,
      height: targetBox.height,
      ready: true
    });
  }, [active]);

  useLayoutEffect(() => {
    measure();
  }, [measure, pinned]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    const list = listRef.current;
    if (!rail) return;

    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    list?.addEventListener("scroll", measure, { passive: true });

    return () => {
      observer.disconnect();
      list?.removeEventListener("scroll", measure);
    };
  }, [measure]);

  useEffect(() => {
    if (!menuVisible) return;

    const dismiss = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape);

    return () => {
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", escape);
    };
  }, [menuVisible]);

  const registerItem = (id: string) => (element: HTMLButtonElement | null) => {
    if (element) {
      itemRefs.current.set(id, element);
    } else {
      itemRefs.current.delete(id);
    }
  };

  const renderItem = (item: NavRailItem) => (
    <button
      key={item.id}
      ref={registerItem(item.id)}
      className={`rail__item${item.id === active ? " rail__item--active" : ""}`}
      onClick={() => onSelect(item.id)}
      aria-current={item.id === active}
    >
      <span className="rail__glyph">
        <Icon name={item.icon} />
        {item.badge ? (
          <span className="rail__badge">{item.badge > 9 ? "9+" : item.badge}</span>
        ) : null}
      </span>
      <span className="rail__label">{item.label}</span>
    </button>
  );

  const renderGroup = (group: NavRailGroup) => (
    <section className="rail__group" key={group.id}>
      {group.label && <span className="rail__group-label">{group.label}</span>}
      {group.items.map(renderItem)}
    </section>
  );

  const indicatorClass = [
    "rail__indicator",
    rect.ready ? "rail__indicator--ready" : "",
    animated && rect.ready ? "rail__indicator--animated" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`rail${pinned ? " rail--pinned" : ""}${
        menuVisible ? " rail--menu" : ""
      }`}
      ref={railRef}
    >
      <span
        className={indicatorClass}
        style={{
          transform: `translateY(${rect.top}px)`,
          height: `${rect.height}px`
        }}
      />

      <nav className="rail__panel">
        <div className="rail__items" ref={listRef}>
          {groups.map(renderGroup)}
        </div>

        <div className="rail__account" ref={accountRef}>
          {account && (
            <div
              className={`rail__menu${menuVisible ? " rail__menu--open" : ""}`}
              role="menu"
            >
              <button
                className="rail__menu-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onSwitch();
                }}
              >
                Switch Account
              </button>
              <button
                className="rail__menu-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
              >
                Logout
              </button>
            </div>
          )}

          <button
            className={`rail__user${menuVisible ? " rail__user--open" : ""}`}
            onClick={
              account ? () => setMenuOpen((open) => !open) : onLogin
            }
            aria-haspopup={account ? "menu" : undefined}
            aria-expanded={account ? menuVisible : undefined}
          >
            <span className="rail__avatar">
              {account?.avatar ? (
                <img
                  className="rail__face"
                  src={account.avatar}
                  alt=""
                  draggable={false}
                />
              ) : account ? (
                initial(account.name)
              ) : (
                <Icon name="user" size={15} />
              )}
            </span>
            <span
              className="rail__label rail__name"
              dir="auto"
            >
              {account ? displayName(account.name) : "Login"}
            </span>
          </button>
        </div>

        <footer className="rail__foot">{renderGroup(footer)}</footer>
      </nav>
    </div>
  );
}
