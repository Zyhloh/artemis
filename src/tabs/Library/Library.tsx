import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ContextMenu, type MenuEntry } from "@components/ContextMenu/ContextMenu";
import { GameMenu } from "@components/GameMenu/GameMenu";
import { Icon } from "@components/Icon/Icon";
import { InstallModal } from "@components/InstallModal/InstallModal";
import { useFlip } from "@hooks/useFlip";
import { useLibrary } from "@hooks/useLibrary";
import { createShortcut } from "@lib/library";
import type { Account, DownloadJob, GameSession, LibraryGame } from "@/types";
import { FilterPanel } from "./FilterPanel";
import { GameCard } from "./GameCard";
import {
  EMPTY_FILTERS,
  SORT_LABELS,
  activeFilterCount,
  applyFilters,
  resolveCard,
  type Filters,
  type Sort,
  type View
} from "./state";
import "./Library.css";

interface LibraryProps {
  account: Account | null;
  jobs: DownloadJob[];
  sessions: GameSession[];
  onInstall: (
    appName: string,
    title: string,
    path: string,
    tags: string[]
  ) => Promise<void>;
  onImport: (appName: string, title: string, path: string) => Promise<void>;
  onRequestCancel: (job: DownloadJob) => void;
  onLaunch: (appName: string) => void;
  onRequestStop: (game: LibraryGame) => void;
  onUpdate: (game: LibraryGame) => void;
  onVerify: (game: LibraryGame) => void;
  onUninstall: (game: LibraryGame) => void;
}

interface Anchored {
  game: LibraryGame;
  rect: DOMRect;
}

const VIEW_KEY = "library.view";
const SORT_KEY = "library.sort";
const PANEL_KEY = "library.filters";

const remembered = <T extends string>(key: string, allowed: T[], fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return allowed.includes(stored as T) ? (stored as T) : fallback;
  } catch {
    return fallback;
  }
};

const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
};

export function Library({
  account,
  jobs,
  sessions,
  onInstall,
  onImport,
  onRequestCancel,
  onLaunch,
  onRequestStop,
  onUpdate,
  onVerify,
  onUninstall
}: LibraryProps) {
  const { games, status, error, reload } = useLibrary(account);
  const [installing, setInstalling] = useState<LibraryGame | null>(null);
  const [managing, setManaging] = useState<LibraryGame | null>(null);
  const [menu, setMenu] = useState<Anchored | null>(null);
  const [sortAnchor, setSortAnchor] = useState<DOMRect | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [view, setView] = useState<View>(() =>
    remembered(VIEW_KEY, ["grid", "list"], "grid")
  );
  const [sort, setSort] = useState<Sort>(() =>
    remembered(SORT_KEY, ["installed", "az", "za"], "installed")
  );
  const [panel, setPanel] = useState(() =>
    remembered(PANEL_KEY, ["open", "closed"], "closed") === "open"
  );

  useEffect(() => {
    if (!toast) return;

    const timer = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  const chooseView = useCallback((next: View) => {
    setView(next);
    remember(VIEW_KEY, next);
  }, []);

  const chooseSort = useCallback((next: Sort) => {
    setSort(next);
    remember(SORT_KEY, next);
  }, []);

  const togglePanel = useCallback(() => {
    setPanel((current) => {
      remember(PANEL_KEY, current ? "closed" : "open");
      return !current;
    });
  }, []);

  const grid = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const closeSort = useCallback(() => setSortAnchor(null), []);

  const shown = useMemo(
    () => applyFilters(games, query, filters, sort),
    [games, query, filters, sort]
  );

  useFlip(grid, `${view}:${shown.map((game) => game.appName).join(",")}`);

  const primary = useCallback(
    (game: LibraryGame) => {
      const state = resolveCard(game, jobs, sessions);

      if (state.busy && state.job) return onRequestCancel(state.job);
      if (state.running) return onRequestStop(game);
      if (state.playable) return onLaunch(game.appName);
      if (state.installable) return setInstalling(game);
    },
    [jobs, sessions, onRequestCancel, onRequestStop, onLaunch]
  );

  const locate = useCallback(
    async (game: LibraryGame) => {
      const picked = await open({
        directory: true,
        multiple: false,
        title: `Locate the existing ${game.title} folder`
      }).catch(() => null);

      if (typeof picked === "string") void onImport(game.appName, game.title, picked);
    },
    [onImport]
  );

  const shortcut = useCallback((game: LibraryGame) => {
    setToast(`Creating shortcut for ${game.title}…`);

    createShortcut(game.appName)
      .then(() => setToast(`${game.title} shortcut added to your desktop`))
      .catch((cause) =>
        setToast(
          cause instanceof Error ? cause.message : "That shortcut could not be created"
        )
      );
  }, []);

  const entries = useMemo((): MenuEntry[] => {
    if (!menu) return [];

    const { game } = menu;
    const state = resolveCard(game, jobs, sessions);
    const more: MenuEntry[] = [
      "separator",
      {
        id: "more",
        label: "More Options",
        icon: "chevronRight",
        run: () => setManaging(game)
      }
    ];

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

    if (!game.installed) {
      return [
        {
          id: "install",
          label: "Install",
          icon: "download",
          disabled: state.busy,
          run: () => setInstalling(game)
        },
        {
          id: "locate",
          label: "Locate Existing Install",
          icon: "folder",
          disabled: state.busy,
          run: () => void locate(game)
        },
        ...more
      ];
    }

    return [
      {
        id: "verify",
        label: "Verify Files",
        icon: "check",
        disabled: state.busy || state.running || state.launching,
        run: () => {
          onVerify(game);
          setToast(`Verifying ${game.title}`);
        }
      },
      {
        id: "shortcut",
        label: "Create Shortcut",
        icon: "link",
        run: () => shortcut(game)
      },
      {
        id: "uninstall",
        label: "Uninstall",
        icon: "trash",
        danger: true,
        disabled: state.busy || state.running || state.launching,
        run: () => onUninstall(game)
      },
      ...more
    ];
  }, [menu, jobs, sessions, locate, shortcut, onVerify, onUninstall]);

  const sortEntries = useMemo(
    (): MenuEntry[] =>
      (Object.keys(SORT_LABELS) as Sort[]).map((key) => ({
        id: key,
        label: SORT_LABELS[key],
        active: key === sort,
        run: () => chooseSort(key)
      })),
    [sort, chooseSort]
  );

  const active = activeFilterCount(filters);
  const filtering = active > 0 || query.trim().length > 0;

  let body: ReactNode;

  if (status === "signedOut") {
    body = (
      <div className="library__state">
        <p className="library__notice">Please Login To Fetch Your Library</p>
      </div>
    );
  } else if (status === "loading") {
    body = (
      <div className="library__state">
        <span className="library__spinner" />
        <p className="library__notice">Fetching your library…</p>
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="library__state">
        <p className="library__notice">{error}</p>
        <button className="library__retry" onClick={() => void reload()}>
          Try Again
        </button>
      </div>
    );
  } else if (!games.length) {
    body = (
      <div className="library__state">
        <p className="library__notice">No games found on this account</p>
      </div>
    );
  } else if (!shown.length) {
    body = (
      <div className="library__state">
        <p className="library__notice">Nothing matches your search or filters</p>
        <button
          className="library__retry"
          onClick={() => {
            setQuery("");
            setFilters(EMPTY_FILTERS);
          }}
        >
          Clear Filters
        </button>
      </div>
    );
  } else {
    body = (
      <div
        className={view === "grid" ? "library__grid" : "library__table"}
        ref={grid}
      >
        {shown.map((game) => (
          <GameCard
            key={game.appName}
            game={game}
            state={resolveCard(game, jobs, sessions)}
            view={view}
            onPrimary={primary}
            onMenu={(target, rect) =>
              setMenu((current) =>
                current?.game.appName === target.appName
                  ? null
                  : { game: target, rect }
              )
            }
          />
        ))}
      </div>
    );
  }

  const signedIn = status !== "signedOut";

  return (
    <>
      <div className="library">
        <header className="library__bar">
          <div className="library__heading">
            <h1 className="library__page">Library</h1>
            {signedIn && games.length > 0 && (
              <span className="library__tally">
                {filtering ? `${shown.length} of ${games.length}` : games.length}
              </span>
            )}
          </div>

          {signedIn && (
            <div className="library__controls">
              <label className="library__search">
                <Icon name="search" size={14} />
                <input
                  className="library__input"
                  type="text"
                  value={query}
                  placeholder="Search"
                  spellCheck={false}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    className="library__clear"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                  >
                    <Icon name="close" size={12} strokeWidth={2.2} />
                  </button>
                )}
              </label>

              <button
                className={`library__chip${sortAnchor ? " library__chip--on" : ""}`}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setSortAnchor((current) => (current ? null : rect));
                }}
              >
                <span className="library__chip-dim">Sort</span>
                {SORT_LABELS[sort]}
                <Icon name="chevronDown" size={13} />
              </button>

              <div className="library__views" role="group" aria-label="View">
                <button
                  className={`library__view${view === "grid" ? " library__view--on" : ""}`}
                  onClick={() => chooseView("grid")}
                  aria-label="Grid view"
                  aria-pressed={view === "grid"}
                >
                  <Icon name="grid" size={15} />
                </button>
                <button
                  className={`library__view${view === "list" ? " library__view--on" : ""}`}
                  onClick={() => chooseView("list")}
                  aria-label="List view"
                  aria-pressed={view === "list"}
                >
                  <Icon name="list" size={15} />
                </button>
              </div>

              <button
                className={`library__chip${panel ? " library__chip--on" : ""}`}
                onClick={togglePanel}
                aria-pressed={panel}
              >
                <Icon name="filter" size={14} />
                Filters
                {active > 0 && <span className="library__pill">{active}</span>}
              </button>
            </div>
          )}
        </header>

        <div className="library__body">
          <div className="library__main">{body}</div>

          {signedIn && panel && games.length > 0 && (
            <FilterPanel games={games} filters={filters} onChange={setFilters} />
          )}
        </div>
      </div>

      <ContextMenu anchor={menu?.rect ?? null} items={entries} onClose={closeMenu} />
      <ContextMenu anchor={sortAnchor} items={sortEntries} onClose={closeSort} />

      {toast && (
        <div className="library__toast" role="status">
          {toast}
        </div>
      )}

      <GameMenu
        game={managing}
        onClose={() => setManaging(null)}
        onUpdate={onUpdate}
      />

      <InstallModal
        game={installing}
        onInstall={onInstall}
        onImport={onImport}
        onClose={() => setInstalling(null)}
      />
    </>
  );
}
