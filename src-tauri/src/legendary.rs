use crate::error::{Error, Result};
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

const SIDECAR: &str = "legendary";
const STORE_DIR: &str = "Artemis";
const CONFIG_DIR: &str = "legendary";
const CONFIG_ENV: &str = "LEGENDARY_CONFIG_PATH";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Output {
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

pub fn config_dir(handle: &AppHandle) -> Result<PathBuf> {
    let dir = handle
        .path()
        .config_dir()
        .map_err(|_| Error::ConfigMissing)?
        .join(STORE_DIR)
        .join(CONFIG_DIR);

    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub async fn run(handle: &AppHandle, args: &[&str]) -> Result<Output> {
    let dir = config_dir(handle)?;

    let command = handle
        .shell()
        .sidecar(SIDECAR)?
        .env(CONFIG_ENV, dir.to_string_lossy().to_string())
        .args(args);

    let output = command.output().await.map_err(Error::from)?;

    Ok(Output {
        code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

pub fn account_id(handle: &AppHandle) -> Option<String> {
    let path = config_dir(handle).ok()?.join("user.json");
    let raw = std::fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;

    value
        .get("account_id")
        .and_then(|id| id.as_str())
        .map(str::to_owned)
}
