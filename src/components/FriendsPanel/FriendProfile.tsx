import { useEffect, useRef, useState } from "react";
import { Icon } from "@components/Icon/Icon";
import { useAction } from "@hooks/useAction";
import { reasonOf } from "@lib/epicError";
import { detailOf, STATE_LABEL } from "@lib/friends";
import { Avatar } from "./Avatar";
import { Ticker } from "./Ticker";
import type { FriendRow } from "@/types";

type Intent = "remove" | "block" | "unblock";

interface FriendProfileProps {
  friend: FriendRow;
  onBack: () => void;
  onNickname: (accountId: string, nickname: string) => Promise<void>;
  onRemove: (accountId: string) => Promise<void>;
  onBlock: (accountId: string) => Promise<void>;
  onUnblock: (accountId: string) => Promise<void>;
  onRefresh: () => void;
}

const ASK: Record<Intent, string> = {
  remove: "Are you sure you wish to remove this friend?",
  block: "Are you sure you wish to block this friend?",
  unblock: "Are you sure you wish to unblock this account?"
};

const CONFIRM: Record<Intent, string> = {
  remove: "Remove Friend",
  block: "Block",
  unblock: "Unblock"
};

const WORKING: Record<Intent, string> = {
  remove: "Removing…",
  block: "Blocking…",
  unblock: "Unblocking…"
};

const SETTLED: Record<Intent, string> = {
  remove: "Friend removed",
  block: "Account blocked",
  unblock: "Account unblocked"
};

const BROKE: Record<Intent, string> = {
  remove: "That friend could not be removed",
  block: "That account could not be blocked",
  unblock: "That account could not be unblocked"
};

export function FriendProfile({
  friend,
  onBack,
  onNickname,
  onRemove,
  onBlock,
  onUnblock,
  onRefresh
}: FriendProfileProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(friend.nickname ?? "");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditing(false);
    setIntent(null);
    setDraft(friend.nickname ?? "");
  }, [friend.accountId, friend.nickname]);

  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!copied) return;

    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const save = useAction(
    async () => {
      await onNickname(friend.accountId, draft.trim());
    },
    () => {
      setEditing(false);
      onRefresh();
    }
  );

  const settle = useAction(
    async () => {
      if (intent === "remove") await onRemove(friend.accountId);
      if (intent === "block") await onBlock(friend.accountId);
      if (intent === "unblock") await onUnblock(friend.accountId);
    },
    () => {
      onBack();
      onRefresh();
    }
  );

  const blocked = friend.state === "blocked";

  const copy = () => {
    void navigator.clipboard
      .writeText(friend.accountId)
      .then(() => setCopied(true))
      .catch(() => undefined);
  };

  return (
    <div className="profile">
      <button className="profile__back" onClick={onBack}>
        <Icon name="chevronLeft" size={14} />
        Back
      </button>

      <div className="profile__head">
        <Avatar
          name={friend.displayName}
          face={friend.avatar}
          state={friend.state}
          large
        />

        <h2 className="profile__name" dir="auto">
          {friend.nickname ?? friend.displayName}
        </h2>

        {friend.nickname && (
          <p className="profile__alias" dir="auto">
            {friend.displayName}
          </p>
        )}

        <button
          className="profile__id"
          onClick={copy}
          aria-label="Copy account ID"
        >
          <bdi>{friend.accountId}</bdi>
          <Icon name={copied ? "check" : "copy"} size={11} />
        </button>
      </div>

      <p className="profile__status" dir="auto">
        <Ticker text={blocked ? STATE_LABEL.blocked : detailOf(friend)} />
      </p>

      {intent ? (
        <div className="profile__actions">
          <p
            className={`profile__ask${
              settle.phase === "failed" ? " profile__ask--bad" : ""
            }${settle.phase === "done" ? " profile__ask--good" : ""}`}
            key={settle.phase}
          >
            {settle.phase === "failed"
              ? reasonOf(settle.error, BROKE[intent])
              : settle.phase === "done"
                ? SETTLED[intent]
                : ASK[intent]}
          </p>

          <button
            className={`profile__button profile__button--solid${
              intent === "unblock" ? " profile__button--calm" : ""
            }${settle.phase === "failed" ? " profile__button--broke" : ""}`}
            onClick={() => void settle.fire()}
            disabled={settle.phase === "busy" || settle.phase === "done"}
          >
            {settle.phase === "busy" && <span className="profile__spinner" />}
            {settle.phase === "busy"
              ? WORKING[intent]
              : settle.phase === "done"
                ? "Done"
                : settle.phase === "failed"
                  ? "Try Again"
                  : CONFIRM[intent]}
          </button>

          <button
            className="profile__button"
            onClick={() => setIntent(null)}
            disabled={settle.phase === "busy" || settle.phase === "done"}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="profile__actions">
          {editing ? (
            <>
              <div className="profile__editor">
                <input
                  className="social__input profile__field"
                  ref={field}
                  type="text"
                  value={draft}
                  maxLength={16}
                  spellCheck={false}
                  placeholder="Nickname"
                  disabled={save.phase === "busy" || save.phase === "done"}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void save.fire();
                    if (event.key === "Escape") setEditing(false);
                  }}
                />

                <button
                  className="profile__save"
                  onClick={() => void save.fire()}
                  disabled={save.phase === "busy" || save.phase === "done"}
                  aria-label="Save nickname"
                >
                  {save.phase === "busy" ? (
                    <span className="profile__spinner" />
                  ) : save.phase === "failed" ? (
                    <Icon name="close" size={13} strokeWidth={2.4} />
                  ) : save.phase === "done" ? (
                    <Icon name="check" size={13} strokeWidth={2.4} />
                  ) : (
                    "Save"
                  )}
                </button>
              </div>

              {(save.phase === "done" || save.phase === "failed") && (
                <p
                  className={`profile__ask profile__ask--tight ${
                    save.phase === "failed"
                      ? "profile__ask--bad"
                      : "profile__ask--good"
                  }`}
                  key={save.phase}
                >
                  {save.phase === "failed"
                    ? reasonOf(save.error, "That nickname could not be saved")
                    : draft.trim()
                      ? "Nickname saved"
                      : "Nickname removed"}
                </p>
              )}
            </>
          ) : (
            !blocked && (
              <button className="profile__button" onClick={() => setEditing(true)}>
                {friend.nickname ? "Edit Nickname" : "Add Nickname"}
              </button>
            )
          )}

          {!blocked && (
            <button
              className="profile__button profile__button--danger"
              onClick={() => setIntent("remove")}
            >
              Remove Friend
            </button>
          )}

          <button
            className={`profile__button${blocked ? "" : " profile__button--danger"}`}
            onClick={() => setIntent(blocked ? "unblock" : "block")}
          >
            {blocked ? "Unblock" : "Block"}
          </button>
        </div>
      )}
    </div>
  );
}
