import { useCallback, useEffect, useRef, useState } from "react";
import { listLibrary, refreshLibrary, watchLibrary } from "@lib/library";
import { ensureLibraryLink } from "@lib/launcher";
import type {
  Account,
  LibraryGame,
  LibrarySnapshot,
  LibraryStatus
} from "@/types";

const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : "Your library could not be loaded.";

let cached: LibraryGame[] | null = null;

export function useLibrary(account: Account | null) {
  const accountId = account?.accountId ?? null;
  const [games, setGames] = useState<LibraryGame[]>(cached ?? []);
  const [status, setStatus] = useState<LibraryStatus>(() => {
    if (!accountId) return "signedOut";
    return cached ? "ready" : "loading";
  });
  const [error, setError] = useState<string | null>(null);
  const held = useRef(account);
  held.current = account;

  useEffect(() => {
    const owner = held.current;

    if (!accountId || !owner) {
      cached = null;
      setGames([]);
      setError(null);
      setStatus("signedOut");
      return;
    }

    let live = true;

    const adopt = (snapshot: LibrarySnapshot) => {
      if (!live) return;

      cached = snapshot.games;
      setGames(snapshot.games);

      if (snapshot.games.length || !snapshot.refreshing) {
        setError(snapshot.error);
        setStatus(snapshot.error && !snapshot.games.length ? "error" : "ready");
        return;
      }

      setStatus("loading");
    };

    const fail = (cause: unknown) => {
      if (!live || cached?.length) return;

      setError(message(cause));
      setStatus("error");
    };

    const watching = watchLibrary(adopt);

    listLibrary().then(adopt).catch(fail);

    ensureLibraryLink(owner)
      .then((relinked) => {
        if (live && relinked) void refreshLibrary();
      })
      .catch(fail);

    return () => {
      live = false;
      void watching.then((off) => off());
    };
  }, [accountId]);

  const reload = useCallback(() => {
    setError(null);
    if (!cached?.length) setStatus("loading");
    return refreshLibrary();
  }, []);

  return { games, status, error, reload };
}
