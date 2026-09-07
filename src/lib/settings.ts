import { invoke } from "@tauri-apps/api/core";

export type CloseBehaviour = "quit" | "tray" | "taskbar";

export interface SettingsOverview {
  installRoot: string;
  defaultInstallRoot: string;
  custom: boolean;
  closeBehaviour: CloseBehaviour;
  autoShortcuts: boolean;
  startWithWindows: boolean;
}

export interface SettingsPatch {
  closeBehaviour?: CloseBehaviour;
  autoShortcuts?: boolean;
  startWithWindows?: boolean;
}

export const getSettings = () => invoke<SettingsOverview>("settings_get");

export const updateSettings = (patch: SettingsPatch) =>
  invoke<SettingsOverview>("settings_update", { patch });

export const setInstallRoot = (root: string | null) =>
  invoke<SettingsOverview>("settings_set_install_root", { root });
