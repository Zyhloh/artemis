import { useCallback, useEffect, useRef, useState } from "react";
import type { EpicAuthSession, LiveClient } from "fnapi-js";
import {
  applyPresence,
  dropPresence,
  loadFriends,
  loadPresences,
  seedPresence
} from "@lib/friends";
import { presenceStore } from "@lib/presence";
import { loadAvatars, type Face } from "@lib/avatars";
import { openLive } from "@lib/live";
import type { FriendRow, RequestRow } from "@/types";

type Status = "idle" | "loading" | "ready" | "error";

const POLL = 30000;

export function useFriends(session: EpicAuthSession | null) {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [blocked, setBlocked] = useState<FriendRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const client = useRef<LiveClient | null>(null);
  const faces = useRef(new Map<string, Face>());
  const ticket = useRef(0);

  const dress = useCallback(
    <T extends { accountId: string; avatar: string | null }>(rows: T[]): T[] =>
      rows.map((row) => {
        const face = faces.current.get(row.accountId);
        return face === undefined || face === row.avatar
          ? row
          : { ...row, avatar: face };
      }),
    []
  );

  const paint = useCallback(
    async (ids: string[]) => {
      if (!session) return;

      const missing = ids.filter((id) => !faces.current.has(id));
      if (!missing.length) return;

      const found = await loadAvatars(session, missing).catch(
        () => new Map<string, Face>()
      );
      if (!found.size) return;

      for (const [accountId, face] of found) faces.current.set(accountId, face);

      setFriends(dress);
      setBlocked(dress);
      setRequests(dress);
    },
    [session, dress]
  );

  const refresh = useCallback(async () => {
    if (!session) {
      setFriends([]);
      setBlocked([]);
      setRequests([]);
      setStatus("idle");
      return;
    }

    const mine = ++ticket.current;
    setStatus((current) => (current === "ready" ? current : "loading"));

    try {
      const next = await loadFriends(session);
      if (mine !== ticket.current) return;

      setFriends(dress(next.friends));
      setBlocked(dress(next.blocked));
      setRequests(dress(next.requests));
      setStatus("ready");

      void paint([
        ...next.friends.map((entry) => entry.accountId),
        ...next.blocked.map((entry) => entry.accountId),
        ...next.requests.map((entry) => entry.accountId)
      ]);
    } catch {
      if (mine !== ticket.current) return;
      setStatus("error");
    }
  }, [session, dress, paint]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    faces.current.clear();

    if (!session) {
      client.current = null;
      return;
    }

    let running = true;
    let detach = () => undefined as void;

    const onPresence = (update: { accountId: string }) => {
      if (!running) return;

      const entry = presenceStore(session).get(update.accountId);

      setFriends((rows) =>
        entry
          ? applyPresence(rows, entry)
          : dropPresence(rows, update.accountId)
      );
    };

    const onSocial = () => {
      if (running) void refresh();
    };

    const swallow = () => undefined;

    const sweep = () => {
      void loadPresences(session)
        .then((entries) => {
          if (running) setFriends((rows) => seedPresence(rows, entries));
        })
        .catch(() => undefined);
    };

    openLive(session)
      .then((live) => {
        if (!running) return;

        client.current = live;
        sweep();

        const xmpp = session.xmpp;

        live.on("connected", sweep);
        live.on("presence", onPresence);
        live.on("friend:request", onSocial);
        live.on("friend:added", onSocial);
        live.on("friend:removed", onSocial);
        live.on("error", swallow);
        xmpp?.on("presence", onPresence);

        detach = () => {
          live.off("connected", sweep);
          live.off("presence", onPresence);
          live.off("friend:request", onSocial);
          live.off("friend:added", onSocial);
          live.off("friend:removed", onSocial);
          live.off("error", swallow);
          xmpp?.off("presence", onPresence);
        };
      })
      .catch(() => undefined);

    return () => {
      running = false;
      client.current = null;
      detach();
    };
  }, [session, refresh]);

  useEffect(() => {
    if (!session) return;

    let running = true;

    const sweep = () => {
      void loadPresences(session)
        .then((entries) => {
          if (running) setFriends((rows) => seedPresence(rows, entries));
        })
        .catch(() => undefined);
    };

    const timer = window.setInterval(sweep, POLL);

    return () => {
      running = false;
      window.clearInterval(timer);
    };
  }, [session]);

  const accept = useCallback(
    async (accountId: string) => {
      if (!session) throw new Error("Not signed in");

      await session.acceptFriendRequests([accountId]);
    },
    [session]
  );

  const decline = useCallback(
    async (accountId: string) => {
      if (!session) throw new Error("Not signed in");

      await session.removeFriend(accountId);
    },
    [session]
  );

  const add = useCallback(
    async (accountId: string) => {
      if (!session) throw new Error("Not signed in");

      await session.addFriend(accountId);
    },
    [session]
  );

  const nickname = useCallback(
    async (accountId: string, value: string) => {
      if (!session) throw new Error("Not signed in");

      await (value
        ? session.setFriendNickname(accountId, value)
        : session.removeFriendNickname(accountId));
    },
    [session]
  );

  const block = useCallback(
    async (accountId: string) => {
      if (!session) throw new Error("Not signed in");

      await session.blockAccount(accountId);
    },
    [session]
  );

  const unblock = useCallback(
    async (accountId: string) => {
      if (!session) throw new Error("Not signed in");

      await session.unblockAccount(accountId);
    },
    [session]
  );

  return {
    friends,
    blocked,
    requests,
    status,
    refresh,
    accept,
    decline,
    add,
    block,
    unblock,
    nickname,
    remove: decline
  };
}
