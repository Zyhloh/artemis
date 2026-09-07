import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const NAVIGATE = "tray:navigate";

export const trayAction = (target: string) =>
  invoke<void>("tray_action", { target });

export const startupHidden = () => invoke<boolean>("startup_hidden");

export const watchTray = (handler: (target: string) => void) =>
  listen<string>(NAVIGATE, ({ payload }) => handler(payload));
