use crate::error::{Error, Result};
use crate::elevate::{self, PathStatus};
use crate::legendary;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

const FORTNITE: &str = "Fortnite";
const ART: [&str; 3] = ["DieselGameBoxTall", "OfferImageTall", "DieselGameBox"];
const WIDE: [&str; 2] = ["DieselGameBox", "Featured"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub app_name: String,
    pub title: String,
    pub developer: Option<String>,
    pub namespace: Option<String>,
    pub catalog_item_id: Option<String>,
    pub build_version: Option<String>,
    pub art: Option<String>,
    pub wide_art: Option<String>,
    pub installed: bool,
    pub install_path: Option<String>,
    pub install_size: Option<u64>,
    pub installed_version: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct Installed {
    app_name: String,
    #[serde(default)]
    install_path: Option<String>,
    #[serde(default)]
    install_size: Option<u64>,
    #[serde(default)]
    version: Option<String>,
}

fn image(images: &[Value], wanted: &[&str]) -> Option<String> {
    wanted.iter().find_map(|kind| {
        images.iter().find_map(|entry| {
            let matches = entry.get("type").and_then(Value::as_str) == Some(*kind);
            matches
                .then(|| entry.get("url").and_then(Value::as_str))
                .flatten()
                .map(str::to_owned)
        })
    })
}

fn text(value: &Value, path: &[&str]) -> Option<String> {
    let mut cursor = value;
    for key in path {
        cursor = cursor.get(key)?;
    }
    cursor.as_str().map(str::to_owned)
}

fn installed(handle: &AppHandle) -> Vec<Installed> {
    let Ok(dir) = legendary::config_dir(handle) else {
        return Vec::new();
    };

    let Ok(raw) = std::fs::read_to_string(dir.join("installed.json")) else {
        return Vec::new();
    };

    serde_json::from_str::<std::collections::HashMap<String, Installed>>(&raw)
        .map(|map| map.into_values().collect())
        .unwrap_or_default()
}

fn game(entry: &Value, owned: &[Installed]) -> Option<Game> {
    let app_name = entry.get("app_name")?.as_str()?.to_owned();
    let metadata = entry.get("metadata").unwrap_or(&Value::Null);
    let images = metadata
        .get("keyImages")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let local = owned.iter().find(|item| item.app_name == app_name);

    Some(Game {
        title: entry
            .get("app_title")
            .and_then(Value::as_str)
            .unwrap_or(&app_name)
            .to_owned(),
        developer: text(metadata, &["developer"]),
        namespace: text(metadata, &["namespace"]),
        catalog_item_id: text(metadata, &["id"]),
        build_version: text(entry, &["asset_infos", "Windows", "build_version"]),
        art: image(&images, &ART),
        wide_art: image(&images, &WIDE),
        installed: local.is_some(),
        install_path: local.and_then(|item| item.install_path.clone()),
        install_size: local.and_then(|item| item.install_size),
        installed_version: local.and_then(|item| item.version.clone()),
        app_name,
    })
}

#[tauri::command]
pub async fn library_list(handle: AppHandle) -> Result<Vec<Game>> {
    let output = legendary::run(&handle, &["list", "--json"]).await?;

    if output.code != Some(0) {
        return Err(Error::Sidecar(summarise(&output.stderr)));
    }

    let entries: Vec<Value> = serde_json::from_str(&output.stdout)?;
    let owned = installed(&handle);

    Ok(entries
        .iter()
        .filter(|entry| entry.get("app_name").and_then(Value::as_str) == Some(FORTNITE))
        .filter_map(|entry| game(entry, &owned))
        .collect())
}

#[tauri::command]
pub async fn library_authenticate(handle: AppHandle, code: String) -> Result<()> {
    legendary::run(&handle, &["auth", "--delete"]).await.ok();

    let output = legendary::run(&handle, &["auth", "--token", &code]).await?;

    if output.code != Some(0) {
        return Err(Error::Sidecar(summarise(&output.stderr)));
    }

    Ok(())
}

#[tauri::command]
pub async fn library_account(handle: AppHandle) -> Result<Option<String>> {
    Ok(legendary::account_id(&handle))
}

#[tauri::command]
pub async fn library_sign_out(handle: AppHandle) -> Result<()> {
    legendary::run(&handle, &["auth", "--delete"]).await?;
    Ok(())
}

fn summarise(stderr: &str) -> String {
    stderr
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("the library could not be read")
        .trim()
        .to_owned()
}

const INSTALL_ROOT: &str = "Artemis";

fn program_files() -> PathBuf {
    std::env::var("ProgramFiles(x86)")
        .or_else(|_| std::env::var("ProgramFiles"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(r"C:\Program Files (x86)"))
}

pub(crate) fn sanitise(name: &str) -> String {
    name.chars()
        .map(|glyph| match glyph as u32 {
            0x3c | 0x3e | 0x3a | 0x22 | 0x2f | 0x5c | 0x7c | 0x3f | 0x2a => '-',
            code if code < 0x20 => '-',
            _ => glyph,
        })
        .collect::<String>()
        .trim()
        .trim_end_matches('.')
        .to_owned()
}

#[tauri::command]
pub async fn install_default_path(title: String) -> Result<String> {
    let path = program_files().join(INSTALL_ROOT).join(sanitise(&title));
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn install_probe_path(path: String) -> Result<PathStatus> {
    let target = Path::new(&path);
    let writable = std::fs::create_dir_all(target).is_ok() && probe(target).is_ok();

    Ok(PathStatus {
        path: target.to_string_lossy().into_owned(),
        writable,
        elevated: elevate::is_elevated(),
    })
}

fn probe(target: &Path) -> std::io::Result<()> {
    let marker = target.join(".artemis-write-test");
    std::fs::write(&marker, b"")?;
    std::fs::remove_file(&marker)
}

#[tauri::command]
pub async fn install_prepare_path(path: String) -> Result<String> {
    let target = Path::new(&path);

    std::fs::create_dir_all(target)?;
    probe(target)?;

    Ok(target.to_string_lossy().into_owned())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub app_name: String,
    pub version: String,
    pub update_available: bool,
    pub install_size: u64,
}

#[tauri::command]
pub async fn library_updates(handle: AppHandle) -> Result<Vec<Status>> {
    let installed = legendary::run(&handle, &["list-installed", "--json"]).await?;

    if installed.code != Some(0) {
        return Err(Error::Sidecar(summarise(&installed.stderr)));
    }

    let library = legendary::run(&handle, &["list", "--json"]).await?;

    if library.code != Some(0) {
        return Err(Error::Sidecar(summarise(&library.stderr)));
    }

    let entries: Vec<Value> = serde_json::from_str(&installed.stdout)?;
    let catalogue: Vec<Value> = serde_json::from_str(&library.stdout)?;

    let latest = |app_name: &str, platform: &str| -> Option<String> {
        let game = catalogue
            .iter()
            .find(|game| text(game, &["app_name"]).as_deref() == Some(app_name))?;

        text(game, &["asset_infos", platform, "build_version"])
    };

    Ok(entries
        .iter()
        .filter(|entry| entry.get("is_dlc").and_then(Value::as_bool) != Some(true))
        .filter_map(|entry| {
            let app_name = entry.get("app_name")?.as_str()?.to_owned();
            let version = text(entry, &["version"]).unwrap_or_default();
            let platform = text(entry, &["platform"]).unwrap_or_else(|| String::from("Windows"));
            let newest = latest(&app_name, &platform);

            Some(Status {
                update_available: newest.is_some_and(|newest| newest != version),
                install_size: entry
                    .get("install_size")
                    .and_then(Value::as_u64)
                    .unwrap_or(0),
                app_name,
                version,
            })
        })
        .collect())
}

#[tauri::command]
pub async fn library_verify(handle: AppHandle, app_name: String) -> Result<String> {
    let output = legendary::run(&handle, &["verify", &app_name]).await?;

    let report = match output.code {
        Some(0) => summarise(&output.stdout),
        _ => summarise(&output.stderr),
    };

    Ok(report)
}

#[tauri::command]
pub async fn library_uninstall(handle: AppHandle, app_name: String) -> Result<()> {
    let output = legendary::run(&handle, &["-y", "uninstall", &app_name]).await?;

    if output.code != Some(0) {
        return Err(Error::Sidecar(summarise(&output.stderr)));
    }

    crate::game::args_clear(&handle, &app_name);

    Ok(())
}

#[tauri::command]
pub async fn library_import(handle: AppHandle, app_name: String, path: String) -> Result<()> {
    let output = legendary::run(&handle, &["-y", "import", &app_name, &path]).await?;

    if output.code != Some(0) {
        return Err(Error::Sidecar(summarise(&output.stderr)));
    }

    Ok(())
}

#[tauri::command]
pub async fn library_reveal(handle: AppHandle, path: String) -> Result<()> {
    use tauri_plugin_opener::OpenerExt;

    handle
        .opener()
        .open_path(path, None::<&str>)
        .map_err(|cause| Error::Sidecar(cause.to_string()))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagSize {
    pub tag: String,
    pub download: u64,
    pub disk: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub download_size: u64,
    pub disk_size: u64,
    pub tags: Vec<TagSize>,
}

fn sizes(value: &Value, key: &str) -> Vec<(String, u64)> {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| {
                    let tag = entry.get("tag")?.as_str()?.to_owned();
                    let size = entry.get("size")?.as_u64()?;
                    Some((tag, size))
                })
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub async fn install_manifest(handle: AppHandle, app_name: String) -> Result<Manifest> {
    let output = legendary::run(&handle, &["info", &app_name, "--json"]).await?;

    if output.code != Some(0) {
        return Err(Error::Sidecar(summarise(&output.stderr)));
    }

    let payload: Value = serde_json::from_str(&output.stdout)?;
    let manifest = payload.get("manifest").cloned().unwrap_or(Value::Null);

    let download = sizes(&manifest, "tag_download_size");
    let disk = sizes(&manifest, "tag_disk_size");

    let tags = download
        .iter()
        .map(|(tag, size)| TagSize {
            tag: tag.clone(),
            download: *size,
            disk: disk
                .iter()
                .find(|(name, _)| name == tag)
                .map(|(_, value)| *value)
                .unwrap_or(0),
        })
        .collect();

    Ok(Manifest {
        download_size: manifest
            .get("download_size")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        disk_size: manifest
            .get("disk_size")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        tags,
    })
}

#[tauri::command]
pub async fn install_space(path: String) -> Result<u64> {
    use sysinfo::Disks;

    let mut probe = PathBuf::from(&path);

    while !probe.exists() {
        match probe.parent() {
            Some(parent) => probe = parent.to_path_buf(),
            None => break,
        }
    }

    let target = probe.to_string_lossy().to_lowercase();
    let disks = Disks::new_with_refreshed_list();

    let best = disks
        .list()
        .iter()
        .filter(|disk| {
            let mount = disk.mount_point().to_string_lossy().to_lowercase();
            target.starts_with(&mount)
        })
        .max_by_key(|disk| disk.mount_point().to_string_lossy().len());

    Ok(best.map(|disk| disk.available_space()).unwrap_or(0))
}
