import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const CHANGED = "update:changed";
const PROGRESS = "update:progress";

export interface Release {
  version: string;
  tag: string;
  title: string;
  notes: string;
  url: string;
  asset: string;
  assetName: string;
  size: number;
  publishedAt: string;
}

export interface UpdateStatus {
  current: string;
  latest: Release | null;
  checkedAt: number | null;
  error: string | null;
  checking: boolean;
}

export interface UpdateProgress {
  received: number;
  total: number;
  stage: "downloading" | "installing";
}

export const updateStatus = () => invoke<UpdateStatus>("update_status");

export const checkForUpdates = () => invoke<void>("update_check");

export const installUpdate = () => invoke<void>("update_install");

export const watchUpdates = (handler: (status: UpdateStatus) => void) =>
  listen<UpdateStatus>(CHANGED, ({ payload }) => handler(payload));

export const watchUpdateProgress = (handler: (progress: UpdateProgress) => void) =>
  listen<UpdateProgress>(PROGRESS, ({ payload }) => handler(payload));
