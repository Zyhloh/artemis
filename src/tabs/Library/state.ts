import type { IconName } from "@components/Icon/Icon";
import type {
  DownloadJob,
  GameSession,
  LibraryGame,
  LibraryKind
} from "@/types";

export type View = "grid" | "list";
export type Sort = "installed" | "az" | "za";

export interface Filters {
  installed: boolean;
  kinds: LibraryKind[];
  platforms: string[];
}

export const EMPTY_FILTERS: Filters = {
  installed: false,
  kinds: [],
  platforms: []
};

export const KIND_LABELS: Record<LibraryKind, string> = {
  game: "Games",
  app: "Apps",
  extra: "Extras"
};

export const SORT_LABELS: Record<Sort, string> = {
  installed: "Installed first",
  az: "Title A–Z",
  za: "Title Z–A"
};

const ACTIVE: DownloadJob["stage"][] = ["preparing", "downloading", "paused"];

export interface CardState {
  job: DownloadJob | undefined;
  busy: boolean;
  downloading: boolean;
  filled: number;
  launching: boolean;
  running: boolean;
  playable: boolean;
  installable: boolean;
  glyph: IconName;
  status: string;
  primary: string;
}

const percent = (value: number) => `${Math.round(value)}%`;

export function resolveCard(
  game: LibraryGame,
  jobs: DownloadJob[],
  sessions: GameSession[]
): CardState {
  const job = jobs.find(
    (entry) => entry.appName === game.appName && ACTIVE.includes(entry.stage)
  );
  const busy = job !== undefined;
  const downloading = busy && job.kind === "install";
  const filled = downloading ? job.percent : game.installed ? 100 : 0;

  const session = sessions.find((entry) => entry.appName === game.appName);
  const launching = session?.stage === "launching";
  const running = session?.stage === "running";
  const playable = game.installed && !busy && !session;
  const installable = !game.installed && !busy && !game.thirdParty;

  const glyph: IconName = busy || running ? "close" : playable ? "play" : "download";

  let status = game.developer ?? "";
  let primary = game.installed ? "Play" : "Install";

  if (game.thirdParty) {
    status = `Requires ${game.thirdParty}`;
    primary = "External";
  }

  if (busy && job) {
    if (job.stage === "paused") status = "Paused";
    else if (job.stage === "preparing") status = "Preparing…";
    else if (job.kind === "verify") status = "Verifying files…";
    else if (job.kind === "import") status = "Importing…";
    else status = `Downloading · ${percent(job.percent)}`;

    primary = "Cancel";
  }

  if (launching) {
    status = "Launching…";
    primary = "Launching";
  }

  if (running) {
    status = "Running";
    primary = "Close";
  }

  return {
    job,
    busy,
    downloading,
    filled,
    launching,
    running,
    playable,
    installable,
    glyph,
    status,
    primary
  };
}

export function applyFilters(
  games: LibraryGame[],
  query: string,
  filters: Filters,
  sort: Sort
): LibraryGame[] {
  const needle = query.trim().toLowerCase();

  const kept = games.filter((game) => {
    if (needle && !game.title.toLowerCase().includes(needle)) return false;
    if (filters.installed && !game.installed) return false;
    if (filters.kinds.length && !filters.kinds.includes(game.kind)) return false;

    if (
      filters.platforms.length &&
      !game.platforms.some((platform) => filters.platforms.includes(platform))
    ) {
      return false;
    }

    return true;
  });

  const byTitle = (a: LibraryGame, b: LibraryGame) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" });

  if (sort === "za") return kept.sort((a, b) => byTitle(b, a));

  if (sort === "installed") {
    return kept.sort(
      (a, b) => Number(b.installed) - Number(a.installed) || byTitle(a, b)
    );
  }

  return kept.sort(byTitle);
}

export const activeFilterCount = (filters: Filters) =>
  Number(filters.installed) + filters.kinds.length + filters.platforms.length;
