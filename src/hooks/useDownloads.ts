import { useCallback, useEffect, useState } from "react";
import {
  cancelDownload,
  clearDownload,
  listDownloads,
  pauseDownload,
  resumeDownload,
  importDownload,
  startDownload,
  verifyDownload,
  watchDownloads
} from "@lib/downloads";
import type { DownloadJob } from "@/types";

const ACTIVE: DownloadJob["stage"][] = ["preparing", "downloading", "paused"];

export function useDownloads() {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listDownloads()
      .then(setJobs)
      .catch(() => undefined);

    watchDownloads(setJobs).then((fn) => {
      unlisten = fn;
    });

    return () => unlisten?.();
  }, []);

  const start = useCallback(
    (appName: string, title: string, path: string, tags: string[]) =>
      startDownload(appName, title, path, tags),
    []
  );

  const verify = useCallback(
    (appName: string, title: string) => verifyDownload(appName, title),
    []
  );

  const adopt = useCallback(
    (appName: string, title: string, path: string) =>
      importDownload(appName, title, path),
    []
  );

  const pause = useCallback((appName: string) => {
    void pauseDownload(appName);
  }, []);

  const resume = useCallback((appName: string) => {
    void resumeDownload(appName);
  }, []);

  const cancel = useCallback((appName: string) => {
    void cancelDownload(appName);
  }, []);

  const clear = useCallback((appName: string) => {
    void clearDownload(appName);
  }, []);

  const pending = jobs.filter((job) => ACTIVE.includes(job.stage)).length;

  const find = useCallback(
    (appName: string) => jobs.find((job) => job.appName === appName),
    [jobs]
  );

  return {
    jobs,
    pending,
    find,
    start,
    verify,
    adopt,
    pause,
    resume,
    cancel,
    clear
  };
}
