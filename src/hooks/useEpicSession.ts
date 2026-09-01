import { useEffect, useState } from "react";
import type { EpicAuthSession } from "fnapi-js";
import { epic } from "@lib/epic";
import { closeLive } from "@lib/live";
import { holdSession } from "@lib/session";
import type { Account } from "@/types";

export type SessionStatus = "signed-out" | "opening" | "ready" | "error";

export function useEpicSession(account: Account | null) {
  const [session, setSession] = useState<EpicAuthSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>("signed-out");
  const accountId = account?.accountId ?? null;
  const deviceId = account?.deviceId ?? null;
  const secret = account?.secret ?? null;

  useEffect(() => {
    if (!accountId || !deviceId || !secret) {
      setSession(null);
      setStatus("signed-out");
      return;
    }

    setStatus("opening");

    let live = true;
    let opened: EpicAuthSession | null = null;

    epic
      .loginWithDeviceAuth({ accountId, deviceId, secret })
      .then((next) => {
        opened = next;

        if (live) {
          holdSession(next);
          setSession(next);
          setStatus("ready");
        } else {
          void next.logout().catch(() => undefined);
        }
      })
      .catch(() => {
        if (!live) return;

        setSession(null);
        setStatus("error");
      });

    return () => {
      live = false;
      holdSession(null);
      setSession(null);
      setStatus("signed-out");

      if (opened) {
        const stale = opened;

        void closeLive(stale)
          .then(() => stale.logout())
          .catch(() => undefined);
      }
    };
  }, [accountId, deviceId, secret]);

  return { session, status };
}
