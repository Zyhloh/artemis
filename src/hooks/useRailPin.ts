import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "artemis.rail.pinned";

export function useRailPin() {
  const [pinned, setPinned] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "true"
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(pinned));
  }, [pinned]);

  const toggle = useCallback(() => setPinned((value) => !value), []);

  return { pinned, toggle };
}
