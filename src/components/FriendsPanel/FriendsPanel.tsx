import { useEffect, useState } from "react";
import type { EpicAuthSession } from "fnapi-js";
import { Icon, type IconName } from "@components/Icon/Icon";
import { AddFriend } from "./AddFriend";
import { FriendRequests } from "./FriendRequests";
import { FriendProfile } from "./FriendProfile";
import { FriendsList } from "./FriendsList";
import type { FriendRow, RequestRow } from "@/types";
import "./FriendsPanel.css";

type Tab = "friends" | "add" | "requests";

interface FriendsPanelProps {
  open: boolean;
  session: EpicAuthSession | null;
  friends: FriendRow[];
  blocked: FriendRow[];
  requests: RequestRow[];
  status: "idle" | "loading" | "ready" | "error";
  onAccept: (accountId: string) => Promise<void>;
  onDecline: (accountId: string) => Promise<void>;
  onAdd: (accountId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onRemove: (accountId: string) => Promise<void>;
  onBlock: (accountId: string) => Promise<void>;
  onUnblock: (accountId: string) => Promise<void>;
  onNickname: (accountId: string, nickname: string) => Promise<void>;
  onClose: () => void;
}

const TABS: { id: Tab; icon: IconName; label: string }[] = [
  { id: "friends", icon: "friends", label: "Friends" },
  { id: "add", icon: "personAdd", label: "Add a friend" },
  { id: "requests", icon: "inbox", label: "Requests" }
];

export function FriendsPanel({
  open,
  session,
  friends,
  blocked,
  requests,
  status,
  onAccept,
  onDecline,
  onAdd,
  onRefresh,
  onRemove,
  onBlock,
  onUnblock,
  onNickname,
  onClose
}: FriendsPanelProps) {
  const [tab, setTab] = useState<Tab>("friends");
  const [back, setBack] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const select = (next: Tab) => {
    if (next === tab) return;

    setBack(
      TABS.findIndex((entry) => entry.id === next) <
        TABS.findIndex((entry) => entry.id === tab)
    );

    setViewing(null);
    setTab(next);
  };

  const enter = (accountId: string) => {
    setBack(false);
    setViewing(accountId);
  };

  const leave = () => {
    setBack(true);
    setViewing(null);
  };

  const profile =
    viewing === null
      ? null
      : [...friends, ...blocked].find((entry) => entry.accountId === viewing) ??
        null;

  useEffect(() => {
    if (!open) return;

    const handle = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      if (viewing) leave();
      else onClose();
    };

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [open, viewing, onClose]);

  useEffect(() => {
    if (!open) setViewing(null);
  }, [open]);

  const pending = requests.filter((entry) => entry.direction === "incoming").length;

  return (
    <>
      <div
        className={`scrim${open ? " scrim--open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        id="friends"
        className={`friends${open ? " friends--open" : ""}`}
        aria-label="Friends"
        aria-hidden={!open}
        inert={!open}
      >
        <header className="friends__head">
          <nav className="social__tabs" role="tablist">
            {TABS.map((entry) => (
              <button
                className={`social__tab${
                  tab === entry.id ? " social__tab--on" : ""
                }`}
                key={entry.id}
                onClick={() => select(entry.id)}
                aria-label={entry.label}
                aria-selected={tab === entry.id}
                role="tab"
              >
                <Icon name={entry.icon} size={15} />
                {entry.id === "requests" && pending > 0 && (
                  <span className="social__dot">{pending > 9 ? "9+" : pending}</span>
                )}
              </button>
            ))}
          </nav>

          <button
            className="friends__close"
            onClick={onClose}
            aria-label="Close friends"
            aria-controls="friends"
          >
            <Icon name="close" size={14} />
          </button>
        </header>

        <div
          className={`social__body social__swap${back ? " social__swap--back" : ""}`}
          key={`${tab}:${viewing ?? ""}`}
        >
          {!session && (
            <p className="social__empty">Sign in to see your friends</p>
          )}

          {session && status === "loading" && (
            <div className="social__state">
              <span className="social__spinner" />
            </div>
          )}

          {session && status === "error" && (
            <p className="social__empty">Your friends list could not be loaded</p>
          )}

          {session && status === "ready" && tab === "friends" && !profile && (
            <FriendsList
              friends={friends}
              blocked={blocked}
              onOpen={enter}
            />
          )}

          {session && status === "ready" && tab === "friends" && profile && (
            <FriendProfile
              friend={profile}
              onBack={leave}
              onNickname={onNickname}
              onRemove={onRemove}
              onBlock={onBlock}
              onUnblock={onUnblock}
              onRefresh={onRefresh}
            />
          )}

          {session && status === "ready" && tab === "add" && (
            <AddFriend
              session={session}
              friends={friends}
              requests={requests}
              onAdd={onAdd}
              onAccept={onAccept}
              onRefresh={onRefresh}
            />
          )}

          {session && status === "ready" && tab === "requests" && (
            <FriendRequests
              requests={requests}
              onAccept={onAccept}
              onDecline={onDecline}
              onRefresh={onRefresh}
            />
          )}
        </div>
      </aside>
    </>
  );
}
