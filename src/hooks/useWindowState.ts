import { useEffect, useState } from "react";
import { isMaximized, onResized } from "@lib/window";

export function useWindowState() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    isMaximized().then(setMaximized);
    onResized(setMaximized).then((fn) => {
      unlisten = fn;
    });

    return () => unlisten?.();
  }, []);

  return { maximized };
}
