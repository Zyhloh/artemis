use crate::appearance::Backdrop;
use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const CONFIG_FILE: &str = "config.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSection {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppearanceSection {
    pub backdrop: Backdrop,
}

impl Default for AppearanceSection {
    fn default() -> Self {
        Self {
            backdrop: Backdrop::Acrylic,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub app: AppSection,
    #[serde(default)]
    pub appearance: AppearanceSection,
}

impl Config {
    pub fn load(handle: &AppHandle) -> Result<Self> {
        let path = locate(handle).ok_or(Error::ConfigMissing)?;
        let raw = std::fs::read_to_string(path)?;
        Ok(serde_json::from_str(&raw)?)
    }
}

fn locate(handle: &AppHandle) -> Option<PathBuf> {
    let installed = [
        handle.path().resource_dir().ok(),
        std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(PathBuf::from)),
    ];

    let found = installed
        .into_iter()
        .flatten()
        .map(|dir| dir.join(CONFIG_FILE))
        .find(|path| path.is_file());

    if found.is_some() {
        return found;
    }

    std::env::current_dir()
        .ok()?
        .ancestors()
        .map(|dir| dir.join(CONFIG_FILE))
        .find(|path| path.is_file())
}
