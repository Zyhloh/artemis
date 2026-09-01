import { invoke } from "@tauri-apps/api/core";
import type {
  GameStatus,
  InstallManifest,
  LibraryGame,
  PathStatus
} from "@/types";

export const listLibrary = () => invoke<LibraryGame[]>("library_list");

export const authenticateLibrary = (code: string) =>
  invoke<void>("library_authenticate", { code });

export const libraryAccount = () => invoke<string | null>("library_account");

export const signOutLibrary = () => invoke<void>("library_sign_out");

export const defaultInstallPath = (title: string) =>
  invoke<string>("install_default_path", { title });

export const prepareInstallPath = (path: string) =>
  invoke<string>("install_prepare_path", { path });

export const probeInstallPath = (path: string) =>
  invoke<PathStatus>("install_probe_path", { path });

export const grantInstallPath = (path: string) =>
  invoke<void>("install_grant_path", { path });

export const importInstall = (appName: string, path: string) =>
  invoke<void>("library_import", { appName, path });

export const checkUpdates = () => invoke<GameStatus[]>("library_updates");

export const verifyGame = (appName: string) =>
  invoke<string>("library_verify", { appName });

export const uninstallGame = (appName: string) =>
  invoke<void>("library_uninstall", { appName });

export const createShortcut = (appName: string) =>
  invoke<string>("shortcut_create", { appName });

export const revealFolder = (path: string) =>
  invoke<void>("library_reveal", { path });

export const installManifest = (appName: string) =>
  invoke<InstallManifest>("install_manifest", { appName });

export const installSpace = (path: string) =>
  invoke<number>("install_space", { path });
