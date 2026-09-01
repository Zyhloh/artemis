import { useState } from "react";
import { GameMenu } from "@components/GameMenu/GameMenu";
import { Icon } from "@components/Icon/Icon";
import { InstallModal } from "@components/InstallModal/InstallModal";
import { useLibrary } from "@hooks/useLibrary";
import type {
  Account,
  DownloadJob,
  GameSession,
  LibraryGame
} from "@/types";
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

const ACTIVE: DownloadJob["stage"][] = ["preparing", "downloading", "paused"];

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

  if (status === "signedOut") {
    return (
      <div className="library__state">
        <p className="library__notice">Please Login To Fetch Your Library</p>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="library__state">
        <span className="library__spinner" />
        <p className="library__notice">Fetching your library…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="library__state">
        <p className="library__notice">{error}</p>
        <button className="library__retry" onClick={() => void reload()}>
          Try Again
        </button>
      </div>
    );
  }

  if (!games.length) {
    return (
      <div className="library__state">
        <p className="library__notice">No games found on this account</p>
      </div>
    );
  }

  return (
    <>
      <div className="library">
        {games.map((game) => {
          const job = jobs.find((entry) => entry.appName === game.appName);
          const active = job !== undefined && ACTIVE.includes(job.stage);
          const downloading = active && job.kind === "install";
          const busy = active;
          const filled = downloading ? job.percent : game.installed ? 100 : 0;

          const session = sessions.find(
            (entry) => entry.appName === game.appName
          );

          const launching = session?.stage === "launching";
          const running = session?.stage === "running";
          const playable = game.installed && !busy && !session;

          const action = () => {
            if (busy && job) return onRequestCancel(job);
            if (running) return onRequestStop(game);
            if (playable) return onLaunch(game.appName);
            if (!game.installed) return setInstalling(game);
          };

          const glyph = busy || running ? "close" : playable ? "play" : "download";

          return (
            <article
              className={`library__card${
                game.installed ? " library__card--installed" : ""
              }`}
              key={game.appName}
            >
              <button
                className="library__art"
                onClick={action}
                disabled={launching}
                aria-label={`${game.title} actions`}
              >
                {game.art ? (
                  <>
                    <img
                      className="library__image"
                      src={game.art}
                      alt=""
                      draggable={false}
                      loading="lazy"
                    />
                    <img
                      className="library__image library__image--colour"
                      src={game.art}
                      alt=""
                      draggable={false}
                      aria-hidden="true"
                      style={{ clipPath: `inset(0 ${100 - filled}% 0 0)` }}
                    />
                  </>
                ) : (
                  <span className="library__fallback">{game.title}</span>
                )}

                {running && <span className="library__badge">Running</span>}

                <span
                  className={`library__overlay${
                    launching || running ? " library__overlay--pinned" : ""
                  }`}
                >
                  {launching ? (
                    <span className="library__spinner library__spinner--art" />
                  ) : (
                    <Icon name={glyph} size={26} />
                  )}
                </span>
              </button>

              <div className="library__meta">
                <div className="library__text">
                  <h2 className="library__title">
                    {game.title}
                  </h2>
                  {game.developer && (
                    <p className="library__developer">{game.developer}</p>
                  )}
                </div>

                <button
                  className="manage__trigger"
                  onClick={() => setManaging(game)}
                  disabled={!game.installed}
                  aria-label={`Manage ${game.title}`}
                >
                  <Icon name="more" size={15} />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <GameMenu
        game={managing}
        onClose={() => setManaging(null)}
        onUpdate={onUpdate}
        onVerify={onVerify}
        onUninstall={onUninstall}
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
