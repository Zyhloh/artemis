import { invoke } from "@tauri-apps/api/core";
import type { Appearance, AppConfig, AppInfo } from "@/types";

export const getConfig = () => invoke<AppConfig>("get_config");

export const getAppInfo = () => invoke<AppInfo>("get_app_info");

export const getAppearance = () => invoke<Appearance>("get_appearance");
