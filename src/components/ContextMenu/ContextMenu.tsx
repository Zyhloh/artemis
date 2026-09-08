import { Icon, type IconName } from "@components/Icon/Icon";
import { Popover } from "@components/Popover/Popover";
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

export function ContextMenu({ anchor, items, onClose }: ContextMenuProps) {
  return (
    <Popover anchor={anchor} onClose={onClose} role="menu" className="menu" forwardWheel>
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
    </Popover>
  );
}
