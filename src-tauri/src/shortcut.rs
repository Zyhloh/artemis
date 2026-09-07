use std::fs;
use std::path::PathBuf;

use serde::Deserialize;
use tauri::AppHandle;

use crate::error::{Error, Result};
use crate::legendary;

const SCHEME: &str = "artemis";
const EXTENSION: &str = "url";

#[derive(Debug, Deserialize)]
struct Record {
    #[serde(default)]
    title: String,
    #[serde(default)]
    executable: String,
    #[serde(default)]
    install_path: String,
}

fn sanitise(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|glyph| match glyph as u32 {
            0x3c | 0x3e | 0x3a | 0x22 | 0x2f | 0x5c | 0x7c | 0x3f | 0x2a => ' ',
            code if code < 0x20 => ' ',
            _ => glyph,
        })
        .collect();

    let trimmed = cleaned.trim().trim_end_matches('.').trim();

    if trimmed.is_empty() {
        String::from("Game")
    } else {
        trimmed.to_owned()
    }
}

#[cfg(windows)]
fn desktop() -> Result<PathBuf> {
    use windows::Win32::UI::Shell::{FOLDERID_Desktop, SHGetKnownFolderPath, KF_FLAG_DEFAULT};

    let raw = unsafe { SHGetKnownFolderPath(&FOLDERID_Desktop, KF_FLAG_DEFAULT, None) }
        .map_err(|error| Error::Sidecar(error.to_string()))?;

    let path = unsafe { raw.to_string() }
        .map_err(|error| Error::Sidecar(error.to_string()))?;

    unsafe { windows::Win32::System::Com::CoTaskMemFree(Some(raw.0 as *const _)) };

    Ok(PathBuf::from(path))
}

#[cfg(not(windows))]
fn desktop() -> Result<PathBuf> {
    Err(Error::Sidecar(String::from(
        "desktop shortcuts are only supported on Windows",
    )))
}

fn record(handle: &AppHandle, app_name: &str) -> Result<Record> {
    let path = legendary::config_dir(handle)?.join("installed.json");
    let raw = fs::read_to_string(path)?;

    let mut store: std::collections::HashMap<String, Record> = serde_json::from_str(&raw)?;

    store
        .remove(app_name)
        .ok_or_else(|| Error::Sidecar(String::from("that game is not installed")))
}

#[tauri::command]
pub fn shortcut_create(handle: AppHandle, app_name: String) -> Result<String> {
    create(&handle, &app_name)
}

pub fn create(handle: &AppHandle, app_name: &str) -> Result<String> {
    let entry = record(handle, app_name)?;

    if entry.install_path.is_empty() {
        return Err(Error::Sidecar(String::from(
            "that game has no install folder on record",
        )));
    }

    let icon = PathBuf::from(&entry.install_path).join(entry.executable.replace('/', "\\"));

    let label = sanitise(if entry.title.is_empty() {
        app_name
    } else {
        &entry.title
    });

    let target = desktop()?.join(format!("{label}.{EXTENSION}"));

    let mut body = String::from("[InternetShortcut]\r\n");
    body.push_str(&format!("URL={SCHEME}://launch/{app_name}\r\n"));

    if icon.is_file() {
        body.push_str(&format!("IconFile={}\r\n", icon.display()));
        body.push_str("IconIndex=0\r\n");
    }

    fs::write(&target, body)?;

    Ok(target.display().to_string())
}
