import { reasonOf } from "@lib/epicError";
import { useRowAction } from "@hooks/useRowAction";
import { Avatar } from "./Avatar";
import { RowAction, RowNote } from "./RowAction";
import type { RequestRow } from "@/types";

interface FriendRequestsProps {
  requests: RequestRow[];
  onAccept: (accountId: string) => Promise<void>;
  onDecline: (accountId: string) => Promise<void>;
  onRefresh: () => void;
}

export function FriendRequests({
  requests,
  onAccept,
  onDecline,
  onRefresh
}: FriendRequestsProps) {
  if (!requests.length) {
    return <p className="social__empty">No pending requests</p>;
  }

  const incoming = requests.filter((entry) => entry.direction === "incoming");
  const outgoing = requests.filter((entry) => entry.direction === "outgoing");

  const section = (title: string, rows: RequestRow[]) =>
    rows.length > 0 && (
      <section className="social__group" key={title}>
        <h3 className="social__caption">
          {title}
          <span className="social__count">{rows.length}</span>
        </h3>

        {rows.map((row) => (
          <RequestEntry
            key={row.accountId}
            row={row}
            onAccept={onAccept}
            onDecline={onDecline}
            onRefresh={onRefresh}
          />
        ))}
      </section>
    );

  return (
    <div className="social__scroll">
      {section("Incoming", incoming)}
      {section("Outgoing", outgoing)}
    </div>
  );
}

interface RequestEntryProps {
  row: RequestRow;
  onAccept: (accountId: string) => Promise<void>;
  onDecline: (accountId: string) => Promise<void>;
  onRefresh: () => void;
}

function RequestEntry({
  row,
  onAccept,
  onDecline,
  onRefresh
}: RequestEntryProps) {
  const action = useRowAction(onRefresh);
  const inbound = row.direction === "incoming";

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

  const drop = () =>
    void action.run(
      "drop",
      inbound
        ? {
            busy: "Declining…",
            done: "Request declined",
            failed: (error: unknown) =>
              reasonOf(error, "That request could not be declined")
          }
        : {
            busy: "Cancelling…",
            done: "Request cancelled",
            failed: (error: unknown) =>
              reasonOf(error, "That request could not be cancelled")
          },
      () => onDecline(row.accountId)
    );

  return (
    <article className="social__row">
      <Avatar name={row.displayName} face={row.avatar} />

      <span className="social__copy">
        <span className="social__name" dir="auto">
          {row.displayName}
        </span>

        <RowNote
          phase={action.phase}
          message={action.message}
          fallback={inbound ? "Wants to be friends" : "Awaiting reply"}
        />
      </span>

      <div className="social__pair">
        {inbound && action.shows("accept") && (
          <RowAction
            icon="check"
            label={`Accept ${row.displayName}`}
            phase={action.phaseFor("accept")}
            onFire={accept}
          />
        )}

        {action.shows("drop") && (
          <RowAction
            icon="close"
            tone="no"
            label={`${inbound ? "Decline" : "Cancel"} ${row.displayName}`}
            phase={action.phaseFor("drop")}
            onFire={drop}
          />
        )}
      </div>
    </article>
  );
}
