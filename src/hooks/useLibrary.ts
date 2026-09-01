import { useCallback, useEffect, useRef, useState } from "react";
import { listLibrary } from "@lib/library";
import { ensureLibraryLink } from "@lib/launcher";
import type { Account, LibraryGame, LibraryStatus } from "@/types";

const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : "Your library could not be loaded.";

export function useLibrary(account: Account | null) {
  const [games, setGames] = useState<LibraryGame[]>([]);
  const [status, setStatus] = useState<LibraryStatus>("signedOut");
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++request.current;

    if (!account) {
      setGames([]);
      setError(null);
      setStatus("signedOut");
      return;
    }

    setStatus("loading");
    setError(null);

    try {
      await ensureLibraryLink(account);

      const found = await listLibrary();
      if (ticket !== request.current) return;

      setGames(found);
      setStatus("ready");
    } catch (cause) {
      if (ticket !== request.current) return;

      setGames([]);
      setError(message(cause));
      setStatus("error");
    }
  }, [account]);

  useEffect(() => {
    void load();
  }, [load]);

  return { games, status, error, reload: load };
}
