import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { DownloadJob } from "@/types";

const CHANGED = "download:changed";

export const listDownloads = () => invoke<DownloadJob[]>("download_list");

export const startDownload = (
  appName: string,
  title: string,
  path: string,
  tags: string[]
) => invoke<void>("download_start", { appName, title, path, tags });

export const verifyDownload = (appName: string, title: string) =>
  invoke<void>("download_verify", { appName, title });

export const importDownload = (appName: string, title: string, path: string) =>
  invoke<void>("download_import", { appName, title, path });

export const pauseDownload = (appName: string) =>
  invoke<void>("download_pause", { appName });

export const resumeDownload = (appName: string) =>
  invoke<void>("download_resume", { appName });

export const cancelDownload = (appName: string) =>
  invoke<void>("download_cancel", { appName });

export const clearDownload = (id: string) =>
  invoke<void>("download_clear", { id });

export const clearDownloadHistory = () =>
  invoke<void>("download_clear_history");

export const watchDownloads = (handler: (jobs: DownloadJob[]) => void) =>
  listen<DownloadJob[]>(CHANGED, ({ payload }) => handler(payload));
