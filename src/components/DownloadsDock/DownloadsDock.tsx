import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@components/Icon/Icon";
import type { DownloadJob } from "@/types";
import "./DownloadsDock.css";

interface DownloadsDockProps {
  jobs: DownloadJob[];
  pending: number;
  veiled?: boolean;
  onPause: (appName: string) => void;
  onResume: (appName: string) => void;
  onRequestCancel: (job: DownloadJob) => void;
  onClear: (appName: string) => void;
}

const LABEL: Record<DownloadJob["stage"], string> = {
  preparing: "Preparing",
  downloading: "Downloading",
  paused: "Paused",
  done: "Completed",
  failed: "Failed"
};

const IMPORT: Record<DownloadJob["stage"], string> = {
  preparing: "Reading Folder",
  downloading: "Importing Files",
  paused: "Paused",
  done: "Imported",
  failed: "Import Failed"
};

const VERIFY: Record<DownloadJob["stage"], string> = {
  preparing: "Preparing",
  downloading: "Verifying Game Files",
  paused: "Paused",
  done: "Verified",
  failed: "Verification Failed"
};

const rate = (value: number) =>
  value >= 1 ? `${value.toFixed(1)} MB/s` : `${Math.round(value * 1024)} KB/s`;

const size = (value: number) =>
  value >= 1024 ? `${(value / 1024).toFixed(2)} GB` : `${Math.round(value)} MB`;

export function DownloadsDock({
  jobs,
  pending,
  veiled = false,
  onPause,
  onResume,
  onRequestCancel,
  onClear
}: DownloadsDockProps) {
  const [open, setOpen] = useState(false);
  const dock = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const dismiss = (event: PointerEvent) => {
      if (!dock.current?.contains(event.target as Node)) setOpen(false);
    };

    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape);

    return () => {
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  const toggle = useCallback(() => setOpen((value) => !value), []);

  return (
    <div className={`dock${veiled ? " dock--veiled" : ""}`} ref={dock}>
      <section
        className={`dock__panel${open ? " dock__panel--open" : ""}`}
        aria-hidden={!open}
        inert={!open}
      >
        <header className="dock__head">
          <span className="dock__heading">Downloads</span>
        </header>

        <div className="dock__list">
          {jobs.length === 0 && <p className="dock__empty">No downloads yet</p>}

          {jobs.map((job) => {
            const busy = job.stage === "downloading" || job.stage === "preparing";
            const settled = job.stage === "done" || job.stage === "failed";
            const checking = job.kind === "verify";
            const adopting = job.kind === "import";
            const plain = checking || adopting;
            const words = checking ? VERIFY : adopting ? IMPORT : LABEL;
            const vague = plain && job.percent === 0 && !settled;

            return (
              <article className="dock__job" key={job.appName}>
                <div className="dock__row">
                  <span className="dock__title">
                    {job.title}
                  </span>

                  <div className="dock__controls">
                    {busy && !plain && (
                      <button
                        className="dock__control"
                        onClick={() => onPause(job.appName)}
                        aria-label="Pause download"
                      >
                        <Icon name="pause" size={13} />
                      </button>
                    )}

                    {job.stage === "paused" && (
                      <button
                        className="dock__control"
                        onClick={() => onResume(job.appName)}
                        aria-label={plain ? "Restart" : "Resume download"}
                      >
                        <Icon name={plain ? "refresh" : "play"} size={13} />
                      </button>
                    )}

                    {job.stage === "failed" && (
                      <button
                        className="dock__control"
                        onClick={() => onResume(job.appName)}
                        aria-label="Try again"
                      >
                        <Icon name="refresh" size={13} />
                      </button>
                    )}

                    <button
                      className="dock__control dock__control--danger"
                      onClick={() =>
                        settled ? onClear(job.appName) : onRequestCancel(job)
                      }
                      aria-label={settled ? "Remove entry" : "Cancel download"}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                </div>

                <div className={`dock__track${vague ? " dock__track--vague" : ""}`}>
                  <span
                    className={`dock__fill dock__fill--${job.stage}`}
                    style={
                      vague
                        ? undefined
                        : { width: `${Math.min(100, job.percent)}%` }
                    }
                  />
                </div>

                <div className="dock__meta">
                  <span className="dock__stage">
                    {job.message ??
                    (job.stage === "paused" && plain
                      ? "Interrupted"
                      : words[job.stage])}
                  </span>
                  {!vague && (
                    <span className="dock__percent">
                      {job.percent.toFixed(1)}%
                    </span>
                  )}
                </div>

                {job.stage === "downloading" && checking && !vague && (
                  <div className="dock__pills">
                    <span className="dock__pill">
                      <Icon name="disk" size={11} />
                      <span className="dock__figure">{rate(job.speed)}</span>
                    </span>
                  </div>
                )}

                {job.stage === "downloading" && !plain && (
                  <div className="dock__pills">
                    <span className="dock__pill">
                      <Icon name="download" size={11} />
                      <span className="dock__figure">{rate(job.speed)}</span>
                    </span>
                    <span className="dock__pill">
                      <Icon name="disk" size={11} />
                      <span className="dock__figure">{rate(job.diskWrite)}</span>
                    </span>
                    <span className="dock__pill">
                      <Icon name="clock" size={11} />
                      <span className="dock__figure">{job.eta || "--:--:--"}</span>
                    </span>
                  </div>
                )}

                {settled && !plain && (
                  <div className="dock__pills">
                    <span className="dock__pill">
                      <Icon name="disk" size={11} />
                      <span className="dock__figure">
                        {size(job.written)} written
                      </span>
                    </span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <button
        className={`dock__toggle${open ? " dock__toggle--open" : ""}`}
        onClick={toggle}
        aria-label="Downloads"
        aria-expanded={open}
      >
        <Icon name="download" size={18} />
        {pending > 0 && (
          <span className="dock__badge">{pending > 9 ? "9+" : pending}</span>
        )}
      </button>
    </div>
  );
}
