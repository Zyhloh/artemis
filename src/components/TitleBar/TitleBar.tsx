import { Icon } from "@components/Icon/Icon";
import { TrafficLights } from "@components/TrafficLights/TrafficLights";
import "./TitleBar.css";

export type FriendsState = "on" | "busy" | "off";

interface TitleBarProps {
  friendsOpen: boolean;
  friendsState: FriendsState;
  onToggleFriends: () => void;
  zoomable?: boolean;
}

const HINT: Record<FriendsState, string> = {
  on: "Show friends",
  busy: "Connecting to Epic",
  off: "Sign in to see friends"
};

export function TitleBar({
  friendsOpen,
  friendsState,
  onToggleFriends,
  zoomable = true
}: TitleBarProps) {
  return (
    <header
      className={`titlebar${friendsOpen ? " titlebar--covered" : ""}`}
      data-tauri-drag-region
    >
      <TrafficLights zoomable={zoomable} />

      <span className="titlebar__title">Artemis</span>

      <button
        className={`titlebar__action${friendsOpen ? " titlebar__action--on" : ""}`}
        onClick={onToggleFriends}
        disabled={friendsState !== "on"}
        aria-label={friendsOpen ? "Hide friends" : HINT[friendsState]}
        aria-busy={friendsState === "busy"}
        aria-expanded={friendsOpen}
        aria-controls="friends"
      >
        {friendsState === "busy" ? (
          <span className="titlebar__spinner" />
        ) : (
          <Icon name="friends" size={16} />
        )}
      </button>
    </header>
  );
}
