import { detailOf, ORDER, STATE_LABEL } from "@lib/friends";
import { Avatar } from "./Avatar";
import { Ticker } from "./Ticker";
import type { FriendRow } from "@/types";

interface FriendsListProps {
  friends: FriendRow[];
  blocked: FriendRow[];
  onOpen: (accountId: string) => void;
}

export function FriendsList({ friends, blocked, onOpen }: FriendsListProps) {
  const everyone = [...friends, ...blocked];

  const groups = ORDER.map((state) => ({
    state,
    rows: everyone
      .filter((entry) => entry.state === state)
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
  })).filter((group) => group.rows.length > 0);

  if (!groups.length) {
    return <p className="social__empty">No friends on this account yet</p>;
  }

  return (
    <div className="social__scroll">
      {groups.map((group) => (
        <section className="social__group" key={group.state}>
          <h3 className="social__caption">
            {STATE_LABEL[group.state]}
            <span className="social__count">{group.rows.length}</span>
          </h3>

          {group.rows.map((row) => (
            <button
              className="social__row social__row--tap"
              key={row.accountId}
              onClick={() => onOpen(row.accountId)}
            >
              <Avatar
                name={row.displayName}
                face={row.avatar}
                state={row.state}
              />

              <span className="social__copy">
                <span className="social__name" dir="auto">
                  {row.nickname ?? row.displayName}
                </span>
                <span className="social__detail" dir="auto">
                  <Ticker text={detailOf(row)} />
                </span>
              </span>

              <span className="social__chevron" aria-hidden="true">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m9.4 4.8 7.2 7.2-7.2 7.2" />
                </svg>
              </span>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
