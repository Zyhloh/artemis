import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { GameSession, LaunchArgs } from "@/types";

const CHANGED = "game:changed";

export const listSessions = () => invoke<GameSession[]>("game_list");

export const launchGame = (appName: string) =>
  invoke<void>("game_launch", { appName });

export const stopGame = (appName: string) =>
  invoke<void>("game_stop", { appName });

export const watchSessions = (handler: (sessions: GameSession[]) => void) =>
  listen<GameSession[]>(CHANGED, ({ payload }) => handler(payload));

export const getLaunchArgs = (appName: string) =>
  invoke<LaunchArgs>("launch_args_get", { appName });

export const setLaunchArgs = (appName: string, args: LaunchArgs) =>
  invoke<void>("launch_args_set", { appName, args });

export const pendingLaunch = () => invoke<string | null>("launch_pending");

export const watchLaunchRequests = (onRequest: (appName: string) => void) =>
  listen<string>("launch:request", (event) => onRequest(event.payload));
