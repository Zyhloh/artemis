import { Icon, type IconName } from "@components/Icon/Icon";
import { trayAction } from "@lib/tray";
import "./TrayMenu.css";

interface Entry {
  id: string;
  label: string;
  icon: IconName;
  danger?: boolean;
}

const TABS: Entry[] = [
  { id: "library", label: "Library", icon: "library" },
  { id: "downloads", label: "Downloads", icon: "download" },
  { id: "item-shop", label: "Item Shop", icon: "shop" },
  { id: "settings", label: "Settings", icon: "settings" }
];

const ACCOUNT: Entry = { id: "switch-account", label: "Switch Account", icon: "user" };
const QUIT: Entry = { id: "quit", label: "Quit Artemis", icon: "close", danger: true };

function Row({ entry }: { entry: Entry }) {
  return (
    <button
      className={`tray__item${entry.danger ? " tray__item--danger" : ""}`}
      onClick={() => void trayAction(entry.id)}
    >
      <span className="tray__glyph">
        <Icon name={entry.icon} size={16} />
      </span>
      <span className="tray__label">{entry.label}</span>
    </button>
  );
}

export function TrayMenu() {
  return (
    <div className="tray" role="menu">
      <div className="tray__group">
        {TABS.map((entry) => (
          <Row entry={entry} key={entry.id} />
        ))}
      </div>
      <span className="tray__rule" />
      <div className="tray__group">
        <Row entry={ACCOUNT} />
      </div>
      <span className="tray__rule" />
      <div className="tray__group">
        <Row entry={QUIT} />
      </div>
    </div>
  );
}
