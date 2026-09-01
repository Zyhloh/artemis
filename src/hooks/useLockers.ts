import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  LOCKER_EVENT,
  forgetLockerSession,
  refreshLook,
  rememberedLooks,
  type Look
} from "@lib/locker";
import type { Account } from "@/types";

const SWEEP = 60000;
const SPACING = 1500;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useLockers(accounts: Account[]) {
  const [looks, setLooks] = useState<ReadonlyMap<string, Look>>(new Map());
  const roster = useRef<Account[]>(accounts);
  const greeted = useRef(new Set<string>());
  const busy = useRef(false);

  roster.current = accounts;

  const adopt = useCallback((look: Look | null) => {
    if (!look) return;

    setLooks((current) => {
      const held = current.get(look.accountId);
      if (held?.outfitId === look.outfitId && held.avatar === look.avatar) {
        return current;
      }

      const next = new Map(current);
      next.set(look.accountId, look);
      return next;
    });
  }, []);

  useEffect(() => {
    let running = true;

    rememberedLooks()
      .then((known) => {
        if (!running) return;
        console.info("[locker] restored", known.length, "cached look(s)");
        setLooks(new Map(known.map((look) => [look.accountId, look])));
      })
      .catch((reason: unknown) => console.warn("[locker] roster failed:", reason));

    const pending = listen<Look>(LOCKER_EVENT, (event) => {
      if (running) adopt(event.payload);
    });

    return () => {
      running = false;
      void pending.then((off) => off());
    };
  }, [adopt]);

  useEffect(() => {
    let running = true;

    const sweep = async () => {
      if (busy.current) return;
      busy.current = true;

      try {
        for (const account of roster.current) {
          if (!running) return;

          await refreshLook(account)
            .then(adopt)
            .catch((reason: unknown) =>
              console.warn("[locker] sweep failed for", account.displayName, reason)
            );

          if (running) await wait(SPACING);
        }
      } finally {
        busy.current = false;
      }
    };

    void sweep();
    const timer = window.setInterval(() => void sweep(), SWEEP);

    return () => {
      running = false;
      window.clearInterval(timer);
    };
  }, [adopt]);

  useEffect(() => {
    let running = true;

    for (const account of accounts) {
      if (greeted.current.has(account.accountId)) continue;

      greeted.current.add(account.accountId);

      void refreshLook(account)
        .then((look) => {
          if (running) adopt(look);
          if (!look) {
            console.warn(
              "[locker] no equipped outfit found for",
              account.displayName
            );
          }
        })
        .catch((reason: unknown) =>
          console.warn("[locker] first look failed for", account.displayName, reason)
        );
    }

    return () => {
      running = false;
    };
  }, [accounts, adopt]);

  useEffect(() => {
    const living = new Set(accounts.map((entry) => entry.accountId));

    setLooks((current) => {
      const stale = [...current.keys()].filter((id) => !living.has(id));
      if (!stale.length) return current;

      const next = new Map(current);
      for (const id of stale) {
        next.delete(id);
        greeted.current.delete(id);
        forgetLockerSession(id);
      }

      return next;
    });
  }, [accounts]);

  const refresh = useCallback(
    (account: Account) => {
      void refreshLook(account)
        .then(adopt)
        .catch(() => undefined);
    },
    [adopt]
  );

  return { looks, refresh };
}
