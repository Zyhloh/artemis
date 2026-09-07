use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const STORE_DIR: &str = "Artemis";
const FILE: &str = "settings.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CloseBehaviour {
    Quit,
    #[default]
    Tray,
    Taskbar,
}

const fn yes() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub install_root: Option<String>,
    pub close_behaviour: CloseBehaviour,
    #[serde(default = "yes")]
    pub auto_shortcuts: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            install_root: None,
            close_behaviour: CloseBehaviour::Tray,
            auto_shortcuts: true,
        }
    }
}

fn path(handle: &AppHandle) -> Result<PathBuf> {
    let dir = handle
        .path()
        .config_dir()
        .map_err(|_| Error::ConfigMissing)?
        .join(STORE_DIR);

    std::fs::create_dir_all(&dir)?;
    Ok(dir.join(FILE))
}

pub fn load(handle: &AppHandle) -> Settings {
    path(handle)
        .ok()
        .and_then(|file| std::fs::read_to_string(file).ok())
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn save(handle: &AppHandle, settings: &Settings) -> Result<()> {
    let raw = serde_json::to_string_pretty(settings)?;
    std::fs::write(path(handle)?, raw)?;
    Ok(())
}

pub fn install_root(handle: &AppHandle) -> PathBuf {
    load(handle)
        .install_root
        .filter(|root| !root.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(crate::library::default_install_root)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub install_root: String,
    pub default_install_root: String,
    pub custom: bool,
    pub close_behaviour: CloseBehaviour,
    pub auto_shortcuts: bool,
    pub start_with_windows: bool,
}

fn overview(handle: &AppHandle) -> Overview {
    let settings = load(handle);
    let fallback = crate::library::default_install_root();

    Overview {
        custom: settings
            .install_root
            .as_deref()
            .is_some_and(|root| !root.trim().is_empty()),
        install_root: install_root(handle).to_string_lossy().into_owned(),
        default_install_root: fallback.to_string_lossy().into_owned(),
        close_behaviour: settings.close_behaviour,
        auto_shortcuts: settings.auto_shortcuts,
        start_with_windows: crate::startup::enabled(),
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Patch {
    pub close_behaviour: Option<CloseBehaviour>,
    pub auto_shortcuts: Option<bool>,
    pub start_with_windows: Option<bool>,
}

#[tauri::command]
pub fn settings_get(handle: AppHandle) -> Overview {
    overview(&handle)
}

#[tauri::command]
pub fn settings_update(handle: AppHandle, patch: Patch) -> Result<Overview> {
    let mut settings = load(&handle);

    if let Some(value) = patch.close_behaviour {
        settings.close_behaviour = value;
    }

    if let Some(value) = patch.auto_shortcuts {
        settings.auto_shortcuts = value;
    }

    save(&handle, &settings)?;

    if let Some(value) = patch.start_with_windows {
        crate::startup::set(value)?;
    }

    Ok(overview(&handle))
}

#[tauri::command]
pub fn settings_set_install_root(handle: AppHandle, root: Option<String>) -> Result<Overview> {
    let mut settings = load(&handle);

    settings.install_root = match root {
        Some(value) if !value.trim().is_empty() => {
            let target = PathBuf::from(value.trim());
            std::fs::create_dir_all(&target)?;
            Some(target.to_string_lossy().into_owned())
        }
        _ => None,
    };

    save(&handle, &settings)?;
    Ok(overview(&handle))
}
