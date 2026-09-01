use crate::appearance::{Appearance, Current};
use crate::config::Config;
use crate::error::Result;
use serde::Serialize;
use tauri::{AppHandle, State, WebviewWindow};

#[derive(Debug, Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub author: String,
    pub identifier: String,
}

#[tauri::command]
pub fn get_config(handle: AppHandle) -> Result<Config> {
    Config::load(&handle)
}

#[tauri::command]
pub fn get_app_info(handle: AppHandle) -> AppInfo {
    let package = handle.package_info();

    AppInfo {
        name: package.name.clone(),
        version: package.version.to_string(),
        author: package.authors.to_string(),
        identifier: handle.config().identifier.clone(),
    }
}

#[tauri::command]
pub fn get_appearance(window: WebviewWindow, current: State<'_, Current>) -> Appearance {
    current
        .get()
        .unwrap_or_else(|| crate::appearance::resolve(&window, crate::appearance::Backdrop::Acrylic))
}
