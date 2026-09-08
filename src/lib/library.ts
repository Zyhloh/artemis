import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  GameStatus,
  InstallManifest,
  LibraryGame,
  LibrarySnapshot,
  PathStatus
} from "@/types";

export const artSource = (game: LibraryGame): string | null =>
  game.artFile ? convertFileSrc(game.artFile) : game.art;

const CHANGED = "library:changed";

export const listLibrary = () => invoke<LibrarySnapshot>("library_list");

export const refreshLibrary = () => invoke<void>("library_refresh");

export const watchLibrary = (handler: (snapshot: LibrarySnapshot) => void) =>
  listen<LibrarySnapshot>(CHANGED, ({ payload }) => handler(payload));

export const authenticateLibrary = (code: string) =>
  invoke<void>("library_authenticate", { code });

export const libraryAccount = () => invoke<string | null>("library_account");

export const signOutLibrary = () => invoke<void>("library_sign_out");

export const defaultInstallPath = (appName: string, title: string) =>
  invoke<string>("install_default_path", { appName, title });

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
