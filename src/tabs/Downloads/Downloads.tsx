import { useMemo } from "react";
import { Icon, type IconName } from "@components/Icon/Icon";
import { useLibrary } from "@hooks/useLibrary";
import { artSource } from "@lib/library";
import type { Account, DownloadJob } from "@/types";
import "./Downloads.css";

interface DownloadsProps {
  account: Account | null;
  jobs: DownloadJob[];
  onPause: (appName: string) => void;
  onResume: (appName: string) => void;
  onRequestCancel: (job: DownloadJob) => void;
  onClear: (id: string) => void;
  onClearHistory: () => void;
  onNavigate: (id: string) => void;
}

const ACTIVE: DownloadJob["stage"][] = ["preparing", "downloading", "paused"];

const KIND: Record<DownloadJob["kind"], { label: string; icon: IconName }> = {
  install: { label: "Install", icon: "download" },
  verify: { label: "Verify", icon: "check" },
  import: { label: "Import", icon: "folder" }
};

const STAGE: Record<DownloadJob["kind"], Record<DownloadJob["stage"], string>> = {
  install: {
    preparing: "Preparing",
    downloading: "Downloading",
    paused: "Paused",
    done: "Installed",
    failed: "Failed"
  },
  verify: {
    preparing: "Preparing",
    downloading: "Verifying files",
    paused: "Interrupted",
    done: "Verified",
    failed: "Verification failed"
  },
  import: {
    preparing: "Reading folder",
    downloading: "Importing files",
    paused: "Interrupted",
    done: "Imported",
    failed: "Import failed"
  }
};

const rate = (value: number) =>
  value >= 1 ? `${value.toFixed(1)} MB/s` : `${Math.round(value * 1024)} KB/s`;

const size = (value: number) =>
  value >= 1024 ? `${(value / 1024).toFixed(2)} GB` : `${Math.round(value)} MB`;

const when = (seconds: number | null) => {
  if (!seconds) return "";

  const at = new Date(seconds * 1000);
  const now = new Date();
  const elapsed = (now.getTime() - at.getTime()) / 1000;

  if (elapsed < 60) return "Just now";
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)} min ago`;

  const sameDay = at.toDateString() === now.toDateString();
  const time = at.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  });

  if (sameDay) return `Today · ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (at.toDateString() === yesterday.toDateString()) return `Yesterday · ${time}`;

  return at.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
};

const status = (job: DownloadJob) => job.message ?? STAGE[job.kind][job.stage];

function Cover({
  source,
  kind,
  small
}: {
  source: string | null | undefined;
  kind: DownloadJob["kind"];
  small?: boolean;
}) {
  return (
    <span className={`downloads__cover${small ? " downloads__cover--small" : ""}`}>
      {source ? (
        <img className="downloads__cover-image" src={source} alt="" draggable={false} />
      ) : (
        <Icon name={KIND[kind].icon} size={small ? 14 : 17} />
      )}
    </span>
  );
}

export function Downloads({
  account,
  jobs,
  onPause,
  onResume,
  onRequestCancel,
  onClear,
  onClearHistory,
  onNavigate
}: DownloadsProps) {
  const { games } = useLibrary(account);
  const covers = useMemo(
    () => new Map(games.map((game) => [game.appName, artSource(game)])),
    [games]
  );

  const active = jobs.filter((job) => ACTIVE.includes(job.stage));
  const history = jobs.filter((job) => !ACTIVE.includes(job.stage));

  if (jobs.length === 0) {
    return (
      <div className="downloads">
        <header className="downloads__bar">
          <div className="downloads__heading">
            <h1 className="downloads__page">Downloads</h1>
          </div>
        </header>

        <div className="downloads__idle">
          <span className="downloads__orb">
            <Icon name="download" size={26} />
          </span>
          <h2 className="downloads__idle-title">Nothing here yet</h2>
          <p className="downloads__idle-copy">
            Installs, updates and file checks will appear here while they run,
            and stay in your history once they finish.
          </p>
          <button className="downloads__cta" onClick={() => onNavigate("library")}>
            <Icon name="library" size={14} />
            Browse Library
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="downloads">
      <header className="downloads__bar">
        <div className="downloads__heading">
          <h1 className="downloads__page">Downloads</h1>
          {active.length > 0 && (
            <span className="downloads__tally">{active.length} in progress</span>
          )}
        </div>

        {history.length > 0 && (
          <button className="downloads__chip" onClick={onClearHistory}>
            <Icon name="trash" size={13} />
            Clear History
          </button>
        )}
      </header>

      <section className="downloads__section">
        <h2 className="downloads__label">In Progress</h2>

        {active.length === 0 ? (
          <p className="downloads__quiet">
            <Icon name="check" size={13} />
            Nothing is downloading right now
          </p>
        ) : (
          <div className="downloads__list">
            {active.map((job) => {
              const plain = job.kind !== "install";
              const busy = job.stage === "downloading" || job.stage === "preparing";
              const vague = plain && job.percent === 0;

              return (
                <article className="downloads__job" key={job.id}>
                  <Cover source={covers.get(job.appName)} kind={job.kind} />

                  <div className="downloads__body">
                    <div className="downloads__row">
                      <span className="downloads__title">{job.title}</span>
                      <span className="downloads__kind">{KIND[job.kind].label}</span>
                      {!vague && (
                        <span className="downloads__percent">
                          {job.percent.toFixed(1)}%
                        </span>
                      )}
                    </div>

                    <div
                      className={`downloads__track${
                        vague ? " downloads__track--vague" : ""
                      }`}
                    >
                      <span
                        className={`downloads__fill downloads__fill--${job.stage}`}
                        style={vague ? undefined : { width: `${Math.min(100, job.percent)}%` }}
                      />
                    </div>

                    <div className="downloads__meta">
                      <span className="downloads__stage">{status(job)}</span>

                      {job.stage === "downloading" && !plain && (
                        <>
                          <span className="downloads__pill">
                            <Icon name="download" size={11} />
                            {rate(job.speed)}
                          </span>
                          <span className="downloads__pill">
                            <Icon name="disk" size={11} />
                            {rate(job.diskWrite)}
                          </span>
                          <span className="downloads__pill">
                            <Icon name="clock" size={11} />
                            {job.eta || "--:--:--"}
                          </span>
                          <span className="downloads__pill">
                            {size(job.downloaded)} downloaded
                          </span>
                        </>
                      )}

                      {job.stage === "downloading" && job.kind === "verify" && !vague && (
                        <span className="downloads__pill">
                          <Icon name="disk" size={11} />
                          {rate(job.speed)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="downloads__controls">
                    {busy && !plain && (
                      <button
                        className="downloads__control"
                        onClick={() => onPause(job.appName)}
                        aria-label="Pause download"
                      >
                        <Icon name="pause" size={14} />
                      </button>
                    )}

                    {job.stage === "paused" && (
                      <button
                        className="downloads__control"
                        onClick={() => onResume(job.appName)}
                        aria-label={plain ? "Restart" : "Resume download"}
                      >
                        <Icon name={plain ? "refresh" : "play"} size={14} />
                      </button>
                    )}

                    <button
                      className="downloads__control downloads__control--danger"
                      onClick={() => onRequestCancel(job)}
                      aria-label="Cancel"
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="downloads__section">
        <h2 className="downloads__label">History</h2>

        {history.length === 0 ? (
          <p className="downloads__quiet">
            <Icon name="clock" size={13} />
            Completed downloads will show up here
          </p>
        ) : (
          <div className="downloads__table">
            {history.map((job) => (
              <article
                className={`downloads__entry${
                  job.stage === "failed" ? " downloads__entry--failed" : ""
                }`}
                key={job.id}
              >
                <Cover source={covers.get(job.appName)} kind={job.kind} small />

                <span className="downloads__cell downloads__cell--title">
                  <span className="downloads__title">{job.title}</span>
                  <span className="downloads__stage">{status(job)}</span>
                </span>

                <span className="downloads__cell downloads__cell--kind">
                  {KIND[job.kind].label}
                </span>

                <span className="downloads__cell downloads__cell--size">
                  {job.kind === "install" && job.written > 0 ? size(job.written) : ""}
                </span>

                <span className="downloads__cell downloads__cell--time">
                  {when(job.finishedAt ?? job.startedAt)}
                </span>

                <span className="downloads__controls">
                  {job.stage === "failed" && (
                    <button
                      className="downloads__control"
                      onClick={() => onResume(job.appName)}
                      aria-label="Try again"
                    >
                      <Icon name="refresh" size={14} />
                    </button>
                  )}

                  <button
                    className="downloads__control"
                    onClick={() => onClear(job.id)}
                    aria-label="Remove entry"
                  >
                    <Icon name="close" size={14} />
                  </button>
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
