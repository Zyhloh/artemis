import type { MenuEntry } from "@components/ContextMenu/ContextMenu";
import { hasComponents } from "@lib/install";
import type { LibraryGame } from "@/types";
import type { CardState } from "./state";

export interface MenuHandlers {
  onLaunch?: (game: LibraryGame) => void;
  onStop?: (game: LibraryGame) => void;
  onInstall?: (game: LibraryGame) => void;
  onLocate?: (game: LibraryGame) => void;
  onVerify?: (game: LibraryGame) => void;
  onComponents?: (game: LibraryGame) => void;
  onShortcut?: (game: LibraryGame) => void;
  onUninstall?: (game: LibraryGame) => void;
  onMore?: (game: LibraryGame) => void;
}

export function gameEntries(
  game: LibraryGame,
  state: CardState,
  handlers: MenuHandlers
): MenuEntry[] {
  const busy = state.busy || state.running || state.launching;

  const more: MenuEntry[] = handlers.onMore
    ? [
        "separator",
        {
          id: "more",
          label: "More Options",
          icon: "chevronRight",
          run: () => handlers.onMore?.(game)
        }
      ]
    : [];

  if (game.thirdParty) {
    return [
      {
        id: "external",
        label: `Managed by ${game.thirdParty}`,
        icon: "external",
        disabled: true,
        run: () => undefined
      },
      ...more
    ];
  }

  const entries: MenuEntry[] = [];

  if (!game.installed) {
    if (handlers.onInstall) {
      entries.push({
        id: "install",
        label: "Install",
        icon: "download",
        disabled: state.busy || state.requires,
        run: () => handlers.onInstall?.(game)
      });
    }

    if (handlers.onLocate) {
      entries.push({
        id: "locate",
        label: "Locate Existing Install",
        icon: "folder",
        disabled: state.busy || state.requires,
        run: () => handlers.onLocate?.(game)
      });
    }

    return [...entries, ...more];
  }

  if (handlers.onStop && state.running) {
    entries.push({
      id: "stop",
      label: "Close Game",
      icon: "close",
      run: () => handlers.onStop?.(game)
    });
  } else if (handlers.onLaunch) {
    entries.push({
      id: "launch",
      label: state.launching ? "Launching…" : "Play",
      icon: "play",
      disabled: !state.playable,
      run: () => handlers.onLaunch?.(game)
    });
  }

  if (handlers.onVerify) {
    entries.push({
      id: "verify",
      label: "Verify Files",
      icon: "check",
      disabled: busy,
      run: () => handlers.onVerify?.(game)
    });
  }

  if (handlers.onComponents && hasComponents(game.appName)) {
    entries.push({
      id: "components",
      label: "Modify Install",
      icon: "disk",
      disabled: busy,
      run: () => handlers.onComponents?.(game)
    });
  }

  if (handlers.onShortcut) {
    entries.push({
      id: "shortcut",
      label: "Create Shortcut",
      icon: "link",
      run: () => handlers.onShortcut?.(game)
    });
  }

  if (handlers.onUninstall) {
    entries.push({
      id: "uninstall",
      label: "Uninstall",
      icon: "trash",
      danger: true,
      disabled: busy,
      run: () => handlers.onUninstall?.(game)
    });
  }

  return [...entries, ...more];
}
