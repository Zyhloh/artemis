import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import { ContextMenu, type MenuEntry } from "@components/ContextMenu/ContextMenu";
import { Icon } from "@components/Icon/Icon";
import { useColumns } from "@hooks/useColumns";
import { useFlip } from "@hooks/useFlip";
import { useLibrary } from "@hooks/useLibrary";
import type { Account, DownloadJob, GameSession, LibraryGame } from "@/types";
import { FilterMenu } from "./FilterMenu";
import { GameCard } from "./GameCard";
import { gameEntries } from "./menu";
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
  onRequestCancel: (job: DownloadJob) => void;
  onLaunch: (appName: string) => void;
  onRequestStop: (game: LibraryGame) => void;
  onVerify: (game: LibraryGame) => void;
  onUninstall: (game: LibraryGame) => void;
  onComponents: (game: LibraryGame) => void;
  onInstallRequest: (game: LibraryGame) => void;
  onManage: (game: LibraryGame) => void;
  onLocate: (game: LibraryGame) => void;
  onShortcut: (game: LibraryGame) => void;
}

interface Anchored {
  game: LibraryGame;
  rect: DOMRect;
}

const VIEW_KEY = "library.view";
const SORT_KEY = "library.sort";

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
  onRequestCancel,
  onLaunch,
  onRequestStop,
  onVerify,
  onUninstall,
  onComponents,
  onInstallRequest,
  onManage,
  onLocate,
  onShortcut
}: LibraryProps) {
  const { games, status, error, reload } = useLibrary(account);
  const [menu, setMenu] = useState<Anchored | null>(null);
  const [sortAnchor, setSortAnchor] = useState<DOMRect | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [view, setView] = useState<View>(() =>
    remembered(VIEW_KEY, ["grid", "list"], "grid")
  );
  const [sort, setSort] = useState<Sort>(() =>
    remembered(SORT_KEY, ["installed", "az", "za"], "installed")
  );
  const [filterAnchor, setFilterAnchor] = useState<DOMRect | null>(null);

  const chooseView = useCallback((next: View) => {
    setView(next);
    remember(VIEW_KEY, next);
  }, []);

  const chooseSort = useCallback((next: Sort) => {
    setSort(next);
    remember(SORT_KEY, next);
  }, []);

  const grid = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const closeSort = useCallback(() => setSortAnchor(null), []);
  const closeFilters = useCallback(() => setFilterAnchor(null), []);

  const shown = useMemo(
    () => applyFilters(games, query, filters, sort),
    [games, query, filters, sort]
  );

  const columns = useColumns();

  useFlip(
    grid,
    `${view}:${columns}:${shown.map((game) => game.appName).join(",")}`,
    false
  );

  const primary = useCallback(
    (game: LibraryGame) => {
      const state = resolveCard(game, jobs, sessions, games);

      if (state.busy && state.job) return onRequestCancel(state.job);
      if (state.running) return onRequestStop(game);
      if (state.playable) return onLaunch(game.appName);
      if (state.installable) return onInstallRequest(game);
    },
    [
      games,
      jobs,
      sessions,
      onRequestCancel,
      onRequestStop,
      onLaunch,
      onInstallRequest
    ]
  );

  const entries = useMemo((): MenuEntry[] => {
    if (!menu) return [];

    const { game } = menu;

    return gameEntries(game, resolveCard(game, jobs, sessions, games), {
      onInstall: onInstallRequest,
      onLocate,
      onVerify,
      onComponents,
      onShortcut,
      onUninstall,
      onMore: onManage
    });
  }, [
    menu,
    games,
    jobs,
    sessions,
    onInstallRequest,
    onLocate,
    onVerify,
    onComponents,
    onShortcut,
    onUninstall,
    onManage
  ]);

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
        style={
          view === "grid"
            ? ({ "--library-columns": columns } as CSSProperties)
            : undefined
        }
      >
        {shown.map((game) => (
          <GameCard
            key={game.appName}
            game={game}
            state={resolveCard(game, jobs, sessions, games)}
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
                className={`library__chip${filterAnchor ? " library__chip--on" : ""}`}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setFilterAnchor((current) => (current ? null : rect));
                }}
                aria-pressed={filterAnchor !== null}
              >
                <Icon name="filter" size={14} />
                Filters
                {active > 0 && <span className="library__pill">{active}</span>}
              </button>
            </div>
          )}
        </header>

        <div className="library__main">{body}</div>
      </div>

      <ContextMenu anchor={menu?.rect ?? null} items={entries} onClose={closeMenu} />
      <ContextMenu anchor={sortAnchor} items={sortEntries} onClose={closeSort} />
      <FilterMenu
        anchor={filterAnchor}
        games={games}
        filters={filters}
        onChange={setFilters}
        onClose={closeFilters}
      />

    </>
  );
}
