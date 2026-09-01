import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function useWindowFocus() {
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    const current = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    current.isFocused().then(setFocused);
    current.onFocusChanged(({ payload }) => setFocused(payload)).then((fn) => {
      unlisten = fn;
    });

    return () => unlisten?.();
  }, []);

  return focused;
}
