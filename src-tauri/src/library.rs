use crate::error::{Error, Result};
use crate::elevate::{self, PathStatus};
use crate::legendary;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

const ART: [&str; 3] = ["DieselGameBoxTall", "OfferImageTall", "DieselGameBox"];
const WIDE: [&str; 2] = ["DieselGameBox", "Featured"];
const ART_DIR: &str = "art";
const EVENT: &str = "library:changed";
const STALE_AFTER: Duration = Duration::from_secs(10 * 60);
const ART_PARALLEL: usize = 6;
const MEASURE_AFTER: Duration = Duration::from_secs(10 * 60);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Game,
    App,
    Extra,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub app_name: String,
    pub title: String,
    pub developer: Option<String>,
    pub namespace: Option<String>,
    pub catalog_item_id: Option<String>,
    pub build_version: Option<String>,
    pub kind: Kind,
    pub platforms: Vec<String>,
    pub third_party: Option<String>,
    pub art: Option<String>,
    pub art_file: Option<String>,
    pub wide_art: Option<String>,
    pub wide_art_file: Option<String>,
    pub installed: bool,
    pub install_path: Option<String>,
    pub install_size: Option<u64>,
    pub installed_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub games: Vec<Game>,
    pub refreshing: bool,
    pub error: Option<String>,
}

#[derive(Default)]
pub struct Library {
    known: Mutex<Option<Vec<Game>>>,
    refreshed: Mutex<Option<Instant>>,
    refreshing: AtomicBool,
    sizes: Mutex<HashMap<String, (u64, Instant)>>,
    measuring: AtomicBool,
}

impl Library {
    fn measured(&self) -> HashMap<String, u64> {
        self.sizes
            .lock()
            .map(|sizes| {
                sizes
                    .iter()
                    .map(|(path, (bytes, _))| (path.clone(), *bytes))
                    .collect()
            })
            .unwrap_or_default()
    }

    fn unmeasured(&self, roots: Vec<String>, force: bool) -> Vec<String> {
        let Ok(sizes) = self.sizes.lock() else {
            return Vec::new();
        };

        roots
            .into_iter()
            .filter(|root| {
                force
                    || sizes
                        .get(root)
                        .is_none_or(|(_, at)| at.elapsed() > MEASURE_AFTER)
            })
            .collect()
    }

    fn record(&self, root: String, bytes: u64) {
        if let Ok(mut sizes) = self.sizes.lock() {
            sizes.insert(root, (bytes, Instant::now()));
        }
    }

    fn stale(&self) -> bool {
        self.refreshed
            .lock()
            .ok()
            .and_then(|slot| *slot)
            .is_none_or(|at| at.elapsed() > STALE_AFTER)
    }

    fn touch(&self) {
        if let Ok(mut slot) = self.refreshed.lock() {
            slot.replace(Instant::now());
        }
    }

    fn remember(&self, games: &[Game]) -> bool {
        let Ok(mut slot) = self.known.lock() else {
            return true;
        };

        let changed = slot.as_deref() != Some(games);
        slot.replace(games.to_vec());
        changed
    }
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

fn read_json(path: &Path) -> Option<Value> {
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
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

fn owned(dir: &Path) -> HashSet<String> {
    let Some(assets) = read_json(&dir.join("assets.json")) else {
        return HashSet::new();
    };

    let Some(platforms) = assets.as_object() else {
        return HashSet::new();
    };

    platforms
        .values()
        .filter_map(Value::as_array)
        .flatten()
        .filter_map(|asset| text(asset, &["app_name"]))
        .collect()
}

fn art_dir(handle: &AppHandle) -> Option<PathBuf> {
    let dir = handle.path().config_dir().ok()?.join("Artemis").join(ART_DIR);
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

fn art_key(url: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;

    for byte in url.bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }

    format!("{hash:016x}")
}

fn cached_art(dir: Option<&Path>, url: Option<&str>) -> Option<String> {
    let target = dir?.join(art_key(url?));
    target
        .exists()
        .then(|| target.to_string_lossy().into_owned())
}

async fn store_art(dir: PathBuf, web: reqwest::Client, url: String) {
    let target = dir.join(art_key(&url));

    if target.exists() {
        return;
    }

    let Ok(response) = web.get(&url).send().await else {
        return;
    };

    if !response.status().is_success() {
        return;
    }

    if let Ok(bytes) = response.bytes().await {
        let _ = std::fs::write(target, &bytes);
    }
}

fn categories(metadata: &Value) -> Vec<String> {
    metadata
        .get("categories")
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| text(entry, &["path"]))
                .collect()
        })
        .unwrap_or_default()
}

fn kind_of(paths: &[String]) -> Kind {
    let has = |wanted: &str| paths.iter().any(|path| path == wanted);

    if has("games") || has("games/experience") {
        Kind::Game
    } else if has("applications") || has("software") {
        Kind::App
    } else if has("digitalextras") || paths.iter().any(|path| path.starts_with("addons")) {
        Kind::Extra
    } else {
        Kind::Game
    }
}

fn listable(entry: &Value, owned: &HashSet<String>) -> bool {
    let Some(app_name) = entry.get("app_name").and_then(Value::as_str) else {
        return false;
    };

    if !owned.contains(app_name) {
        return false;
    }

    let metadata = entry.get("metadata").unwrap_or(&Value::Null);

    if metadata.get("mainGameItem").is_some() {
        return false;
    }

    let paths = categories(metadata);

    !paths.iter().any(|path| path == "engines" || path.starts_with("engines/"))
}

fn footprint(root: &Path) -> u64 {
    let mut total = 0;
    let mut pending = vec![root.to_path_buf()];

    while let Some(dir) = pending.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };

        for entry in entries.flatten() {
            let Ok(kind) = entry.file_type() else {
                continue;
            };

            if kind.is_symlink() {
                continue;
            }

            if kind.is_dir() {
                pending.push(entry.path());
            } else if let Ok(meta) = entry.metadata() {
                total += meta.len();
            }
        }
    }

    total
}

fn root_key(path: &str) -> String {
    path.trim_end_matches(['\\', '/']).to_lowercase()
}

async fn measure(handle: AppHandle, force: bool) {
    let state = handle.state::<Library>();

    if state.measuring.swap(true, Ordering::SeqCst) {
        return;
    }

    let roots: Vec<String> = {
        let mut seen = HashSet::new();

        installed(&handle)
            .into_iter()
            .filter_map(|item| item.install_path)
            .filter(|path| seen.insert(root_key(path)))
            .collect()
    };

    for root in state.unmeasured(roots, force) {
        let target = PathBuf::from(&root);
        let bytes = tauri::async_runtime::spawn_blocking(move || footprint(&target))
            .await
            .unwrap_or(0);

        state.record(root_key(&root), bytes);
    }

    state.measuring.store(false, Ordering::SeqCst);
    publish(&handle, local(&handle), false, None);
}

fn game(
    art: Option<&Path>,
    entry: &Value,
    installs: &[Installed],
    sizes: &HashMap<String, u64>,
) -> Option<Game> {
    let app_name = entry.get("app_name")?.as_str()?.to_owned();
    let metadata = entry.get("metadata").unwrap_or(&Value::Null);
    let images = metadata
        .get("keyImages")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let local = installs.iter().find(|item| item.app_name == app_name);
    let footprint = local.and_then(|item| item.install_path.as_deref()).map(|root| {
        let key = root_key(root);

        sizes.get(&key).copied().unwrap_or_else(|| {
            installs
                .iter()
                .filter(|item| {
                    item.install_path
                        .as_deref()
                        .is_some_and(|path| root_key(path) == key)
                })
                .filter_map(|item| item.install_size)
                .sum::<u64>()
        })
    });

    let tall = image(&images, &ART);
    let wide = image(&images, &WIDE);

    let platforms = entry
        .get("asset_infos")
        .and_then(Value::as_object)
        .map(|assets| assets.keys().cloned().collect())
        .unwrap_or_default();

    Some(Game {
        title: entry
            .get("app_title")
            .and_then(Value::as_str)
            .unwrap_or(&app_name)
            .trim()
            .to_owned(),
        developer: text(metadata, &["developer"]),
        namespace: text(metadata, &["namespace"]),
        catalog_item_id: text(metadata, &["id"]),
        build_version: text(entry, &["asset_infos", "Windows", "build_version"]),
        kind: kind_of(&categories(metadata)),
        platforms,
        third_party: text(
            metadata,
            &["customAttributes", "ThirdPartyManagedProvider", "value"],
        ),
        art_file: cached_art(art, tall.as_deref()),
        wide_art_file: cached_art(art, wide.as_deref()),
        art: tall,
        wide_art: wide,
        installed: local.is_some(),
        install_path: local.and_then(|item| item.install_path.clone()),
        install_size: footprint.filter(|total| *total > 0),
        installed_version: local.and_then(|item| item.version.clone()),
        app_name,
    })
}

fn stored(handle: &AppHandle) -> Vec<Value> {
    let Ok(dir) = legendary::config_dir(handle) else {
        return Vec::new();
    };

    let owned = owned(&dir);

    let Ok(files) = std::fs::read_dir(dir.join("metadata")) else {
        return Vec::new();
    };

    files
        .flatten()
        .map(|file| file.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
        .filter_map(|path| read_json(&path))
        .filter(|entry| listable(entry, &owned))
        .collect()
}

fn art_urls(entries: &[Value]) -> Vec<String> {
    entries
        .iter()
        .flat_map(|entry| {
            let images = entry
                .get("metadata")
                .and_then(|meta| meta.get("keyImages"))
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();

            [image(&images, &ART), image(&images, &WIDE)]
        })
        .flatten()
        .collect()
}

fn local(handle: &AppHandle) -> Vec<Game> {
    let installs = installed(handle);
    let art = art_dir(handle);
    let sizes = handle.state::<Library>().measured();

    let mut games: Vec<Game> = stored(handle)
        .iter()
        .filter_map(|entry| game(art.as_deref(), entry, &installs, &sizes))
        .collect();

    games.sort_by(|left, right| {
        left.title
            .to_lowercase()
            .cmp(&right.title.to_lowercase())
            .then_with(|| left.app_name.cmp(&right.app_name))
    });

    games
}

fn publish(handle: &AppHandle, games: Vec<Game>, refreshing: bool, error: Option<String>) {
    let changed = handle.state::<Library>().remember(&games);

    if changed || !refreshing || error.is_some() {
        let _ = handle.emit(
            EVENT,
            Snapshot {
                games,
                refreshing,
                error,
            },
        );
    }
}

async fn fetch(handle: &AppHandle) -> Result<()> {
    let output = legendary::run(handle, &["list", "--json"]).await?;

    if output.code != Some(0) {
        return Err(Error::Sidecar(summarise(&output.stderr)));
    }

    Ok(())
}

async fn cache_art(handle: &AppHandle) {
    let Some(dir) = art_dir(handle) else {
        return;
    };

    let Ok(web) = reqwest::Client::builder()
        .user_agent("Artemis/1.0")
        .timeout(Duration::from_secs(20))
        .build()
    else {
        return;
    };

    let pending: Vec<String> = art_urls(&stored(handle))
        .into_iter()
        .filter(|url| !dir.join(art_key(url)).exists())
        .collect();

    if pending.is_empty() {
        return;
    }

    futures_util::stream::iter(pending)
        .map(|url| store_art(dir.clone(), web.clone(), url))
        .buffer_unordered(ART_PARALLEL)
        .collect::<Vec<()>>()
        .await;
}

async fn refresh(handle: AppHandle) {
    let state = handle.state::<Library>();

    if state.refreshing.swap(true, Ordering::SeqCst) {
        return;
    }

    let error = match fetch(&handle).await {
        Ok(()) => {
            state.touch();
            publish(&handle, local(&handle), true, None);
            cache_art(&handle).await;
            None
        }
        Err(cause) => {
            println!("[library] refresh deferred: {cause}");
            Some(cause.to_string())
        }
    };

    state.refreshing.store(false, Ordering::SeqCst);
    publish(&handle, local(&handle), false, error);
}

fn kick(handle: &AppHandle, force: bool) -> bool {
    let state = handle.state::<Library>();

    if state.refreshing.load(Ordering::SeqCst) {
        return true;
    }

    if !force && !state.stale() {
        return false;
    }

    tauri::async_runtime::spawn(refresh(handle.clone()));
    true
}

#[tauri::command]
pub fn library_list(handle: AppHandle, state: State<'_, Library>) -> Snapshot {
    let games = local(&handle);
    state.remember(&games);

    let refreshing = kick(&handle, games.is_empty());
    tauri::async_runtime::spawn(measure(handle.clone(), false));

    Snapshot {
        games,
        refreshing,
        error: None,
    }
}

#[tauri::command]
pub fn library_refresh(handle: AppHandle) {
    publish(&handle, local(&handle), true, None);
    kick(&handle, true);
    tauri::async_runtime::spawn(measure(handle, true));
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

pub(crate) fn default_install_root() -> PathBuf {
    program_files().join(INSTALL_ROOT)
}

#[tauri::command]
pub async fn install_default_path(handle: AppHandle, title: String) -> Result<String> {
    let path = crate::settings::install_root(&handle).join(sanitise(&title));
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
    publish(&handle, local(&handle), false, None);

    Ok(())
}

#[tauri::command]
pub async fn library_import(handle: AppHandle, app_name: String, path: String) -> Result<()> {
    let output = legendary::run(&handle, &["-y", "import", &app_name, &path]).await?;

    if output.code != Some(0) {
        return Err(Error::Sidecar(summarise(&output.stderr)));
    }

    publish(&handle, local(&handle), false, None);

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
