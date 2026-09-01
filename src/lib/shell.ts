const DEVTOOLS_COMBO_KEYS = ["I", "J", "C"];

function isDevtoolsShortcut(event: KeyboardEvent): boolean {
  if (event.key === "F12") return true;

  const key = event.key.toUpperCase();

  if (event.ctrlKey && event.shiftKey && DEVTOOLS_COMBO_KEYS.includes(key)) {
    return true;
  }

  return event.ctrlKey && key === "U";
}

export function lockShell(): void {
  const locked = !import.meta.env.DEV;

  window.addEventListener("contextmenu", (event) => event.preventDefault());

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Tab" || (locked && isDevtoolsShortcut(event))) {
        event.preventDefault();
      }
    },
    { capture: true }
  );
}
