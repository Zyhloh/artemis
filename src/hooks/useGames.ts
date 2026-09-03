import { useCallback, useEffect, useState } from "react";
import {
  launchGame,
  listSessions,
  pendingLaunch,
  stopGame,
  watchLaunchFailures,
  watchLaunchRequests,
  watchSessions
} from "@lib/games";
import { ensureLibraryLink } from "@lib/launcher";
import type { Account, GameSession, LaunchFailure } from "@/types";

export function useGames(account: Account | null) {
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [failure, setFailure] = useState<LaunchFailure | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    watchLaunchFailures(setFailure).then((fn) => {
      unlisten = fn;
    });

    return () => unlisten?.();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listSessions()
      .then(setSessions)
      .catch(() => undefined);

    watchSessions(setSessions).then((fn) => {
      unlisten = fn;
    });

    return () => unlisten?.();
  }, []);

  const launch = useCallback(
    (appName: string) => {
      setSessions((current) =>
        current.some((entry) => entry.appName === appName)
          ? current
          : [...current, { appName, stage: "launching" }]
      );

      void (async () => {
        try {
          if (account) await ensureLibraryLink(account);

          await launchGame(appName);
        } catch {
          setSessions((current) =>
            current.filter((entry) => entry.appName !== appName)
          );
        }
      })();
    },
    [account]
  );

  useEffect(() => {
    if (!account) return;

    let live = true;

    const drop = watchLaunchRequests((appName) => {
      if (live) launch(appName);
    });

    void pendingLaunch()
      .then((appName) => {
        if (live && appName) launch(appName);
      })
      .catch(() => undefined);

    return () => {
      live = false;
      void drop.then((off) => off()).catch(() => undefined);
    };
  }, [account, launch]);

  const stop = useCallback((appName: string) => {
    void stopGame(appName);
  }, []);

  const dismiss = useCallback(() => setFailure(null), []);

  return { sessions, launch, stop, failure, dismiss };
}
