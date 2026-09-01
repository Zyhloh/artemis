import { useEffect, useState } from "react";
import type { EpicAuthSession } from "fnapi-js";
import { Icon } from "@components/Icon/Icon";
import { useRowAction } from "@hooks/useRowAction";
import { reasonOf } from "@lib/epicError";
import { findUsers, relationOf } from "@lib/friends";
import { Avatar } from "./Avatar";
import { RowAction, RowNote } from "./RowAction";
import type { FriendRow, Relation, RequestRow, SearchRow } from "@/types";

interface AddFriendProps {
  session: EpicAuthSession | null;
  friends: FriendRow[];
  requests: RequestRow[];
  onAdd: (accountId: string) => Promise<void>;
  onAccept: (accountId: string) => Promise<void>;
  onRefresh: () => void;
}

const MINIMUM = 3;
const DEBOUNCE = 420;

const DETAIL: Record<Relation, string> = {
  friend: "Already friends",
  incoming: "Sent you a request",
  outgoing: "Request pending",
  none: "Not on your list"
};

export function AddFriend({
  session,
  friends,
  requests,
  onAdd,
  onAccept,
  onRefresh
}: AddFriendProps) {
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const trimmed = term.trim();

    if (!session || trimmed.length < MINIMUM) {
      setRows([]);
      setBusy(false);
      return;
    }

    let live = true;
    setBusy(true);

    const timer = window.setTimeout(() => {
      findUsers(session, trimmed)
        .then((found) => {
          if (live) setRows(found);
        })
        .catch(() => {
          if (live) setRows([]);
        })
        .finally(() => {
          if (live) setBusy(false);
        });
    }, DEBOUNCE);

    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [term, session]);

  const visible = rows.filter(
    (row) => relationOf(row.accountId, friends, requests) !== "outgoing"
  );

  const trimmed = term.trim();

  return (
    <div className="social__pane">
      <div className="social__search">
        <Icon name="search" size={14} />
        <input
          className="social__input"
          type="text"
          value={term}
          spellCheck={false}
          placeholder="Search by display name"
          onChange={(event) => setTerm(event.target.value)}
        />
        {busy && <span className="social__spinner social__spinner--small" />}
      </div>

      {trimmed.length > 0 && trimmed.length < MINIMUM && (
        <p className="social__empty">Type at least three characters</p>
      )}

      {!busy && trimmed.length >= MINIMUM && visible.length === 0 && (
        <p className="social__empty">
          {rows.length > 0
            ? "Everyone matching already has a request pending"
            : "Nobody found by that name"}
        </p>
      )}

      <div className="social__scroll">
        <section className="social__group">
          {visible.map((row) => (
            <SearchEntry
              key={row.accountId}
              row={row}
              relation={relationOf(row.accountId, friends, requests)}
              onAdd={onAdd}
              onAccept={onAccept}
              onRefresh={onRefresh}
            />
          ))}
        </section>
      </div>
    </div>
  );
}

interface SearchEntryProps {
  row: SearchRow;
  relation: Relation;
  onAdd: (accountId: string) => Promise<void>;
  onAccept: (accountId: string) => Promise<void>;
  onRefresh: () => void;
}

function SearchEntry({
  row,
  relation,
  onAdd,
  onAccept,
  onRefresh
}: SearchEntryProps) {
  const action = useRowAction(onRefresh);

  const send = () =>
    void action.run(
      "send",
      {
        busy: "Sending request…",
        done: "Request sent",
        failed: (error: unknown) =>
          reasonOf(error, "That request could not be sent")
      },
      () => onAdd(row.accountId)
    );

  const accept = () =>
    void action.run(
      "accept",
      {
        busy: "Accepting…",
        done: "You are now friends",
        failed: (error: unknown) =>
          reasonOf(error, "That request could not be accepted")
      },
      () => onAccept(row.accountId)
    );

  return (
    <article className="social__row">
      <Avatar name={row.displayName} face={null} />

      <span className="social__copy">
        <span className="social__name" dir="auto">
          {row.displayName}
        </span>

        <RowNote
          phase={action.phase}
          message={action.message}
          fallback={DETAIL[relation]}
        />
      </span>

      {relation === "friend" ? (
        <button className="social__icon" disabled aria-label="Already friends">
          <Icon name="check" size={14} strokeWidth={2.2} />
        </button>
      ) : relation === "incoming" ? (
        <RowAction
          icon="check"
          label={`Accept ${row.displayName}`}
          phase={action.phaseFor("accept")}
          onFire={accept}
        />
      ) : (
        <RowAction
          icon="plus"
          label={`Send a request to ${row.displayName}`}
          phase={action.phaseFor("send")}
          onFire={send}
        />
      )}
    </article>
  );
}
