use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::AsyncWriteExt;
use tokio::sync::Notify;

use crate::error::{Error, Result};

const LATEST_URL: &str = "https://api.github.com/repos/Zyhloh/artemis/releases/latest";
const EVENT: &str = "update:changed";
const PROGRESS: &str = "update:progress";
const POLL: Duration = Duration::from_secs(30);
const RETRY: Duration = Duration::from_secs(90);
const LIMITED: Duration = Duration::from_secs(15 * 60);

static POKE: OnceLock<Notify> = OnceLock::new();

fn poker() -> &'static Notify {
    POKE.get_or_init(Notify::new)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    pub version: String,
    pub tag: String,
    pub title: String,
    pub notes: String,
    pub url: String,
    pub asset: String,
    pub asset_name: String,
    pub size: u64,
    pub published_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub current: String,
    pub latest: Option<Release>,
    pub checked_at: Option<i64>,
    pub error: Option<String>,
    pub checking: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub received: u64,
    pub total: u64,
    pub stage: &'static str,
}

#[derive(Default)]
pub struct Updates {
    latest: Mutex<Option<Release>>,
    checked_at: Mutex<Option<i64>>,
    error: Mutex<Option<String>>,
    checking: Mutex<bool>,
    etag: Mutex<Option<String>>,
}

impl Updates {
    fn status(&self, current: &str) -> Status {
        Status {
            current: current.to_owned(),
            latest: self.latest.lock().ok().and_then(|slot| slot.clone()),
            checked_at: self.checked_at.lock().ok().and_then(|slot| *slot),
            error: self.error.lock().ok().and_then(|slot| slot.clone()),
            checking: self.checking.lock().map(|slot| *slot).unwrap_or(false),
        }
    }

    fn set_checking(&self, value: bool) {
        if let Ok(mut slot) = self.checking.lock() {
            *slot = value;
        }
    }
}

#[derive(Debug, Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Debug, Deserialize)]
struct Payload {
    tag_name: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    body: Option<String>,
    html_url: String,
    #[serde(default)]
    published_at: Option<String>,
    #[serde(default)]
    assets: Vec<Asset>,
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_secs() as i64)
        .unwrap_or_default()
}

fn parse(version: &str) -> Option<(u64, u64, u64, bool)> {
    let trimmed = version.trim().trim_start_matches(['v', 'V']);
    let (core, pre) = trimmed.split_once('-').unwrap_or((trimmed, ""));
    let mut parts = core.split('.').map(|part| part.parse::<u64>().ok());

    let major = parts.next()??;
    let minor = parts.next().unwrap_or(Some(0))?;
    let patch = parts.next().unwrap_or(Some(0))?;

    Some((major, minor, patch, pre.is_empty()))
}

pub fn newer(candidate: &str, current: &str) -> bool {
    match (parse(candidate), parse(current)) {
        (Some((a, b, c, stable)), Some((x, y, z, current_stable))) => {
            (a, b, c, stable) > (x, y, z, current_stable)
        }
        _ => false,
    }
}

fn current(handle: &AppHandle) -> String {
    handle.package_info().version.to_string()
}

fn release(payload: Payload) -> Option<Release> {
    let asset = payload
        .assets
        .iter()
        .find(|asset| asset.name.to_lowercase().ends_with("setup.exe"))?;

    Some(Release {
        version: payload.tag_name.trim_start_matches(['v', 'V']).to_owned(),
        title: payload
            .name
            .filter(|name| !name.trim().is_empty())
            .unwrap_or_else(|| payload.tag_name.clone()),
        tag: payload.tag_name,
        notes: payload.body.unwrap_or_default(),
        url: payload.html_url,
        asset: asset.browser_download_url.clone(),
        asset_name: asset.name.clone(),
        size: asset.size,
        published_at: payload.published_at.unwrap_or_default(),
    })
}

enum Outcome {
    Unchanged,
    Found(Option<Release>),
    Limited,
    Failed(String),
}

async fn fetch(web: &reqwest::Client, state: &Updates) -> Outcome {
    let mut request = web.get(LATEST_URL);

    if let Some(etag) = state.etag.lock().ok().and_then(|slot| slot.clone()) {
        request = request.header("If-None-Match", etag);
    }

    let response = match request.send().await {
        Ok(response) => response,
        Err(cause) => return Outcome::Failed(cause.to_string()),
    };

    if response.status() == reqwest::StatusCode::NOT_MODIFIED {
        return Outcome::Unchanged;
    }

    let remaining = response
        .headers()
        .get("x-ratelimit-remaining")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u32>().ok());

    if response.status() == reqwest::StatusCode::FORBIDDEN && remaining == Some(0) {
        return Outcome::Limited;
    }

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Outcome::Found(None);
    }

    if !response.status().is_success() {
        return Outcome::Failed(format!("GitHub responded {}", response.status()));
    }

    let etag = response
        .headers()
        .get("etag")
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);

    if let Ok(mut slot) = state.etag.lock() {
        *slot = etag;
    }

    match response.json::<Payload>().await {
        Ok(payload) => Outcome::Found(release(payload)),
        Err(cause) => Outcome::Failed(cause.to_string()),
    }
}

fn adopt(handle: &AppHandle, state: &Updates, found: Option<Release>) {
    let version = current(handle);
    let next = found.filter(|entry| newer(&entry.version, &version));

    let changed = state
        .latest
        .lock()
        .map(|slot| slot.as_ref().map(|entry| entry.tag.clone()) != next.as_ref().map(|entry| entry.tag.clone()))
        .unwrap_or(true);

    if let Ok(mut slot) = state.latest.lock() {
        *slot = next;
    }

    if changed {
        if let Some(entry) = state.latest.lock().ok().and_then(|slot| slot.clone()) {
            println!("[update] {} is available", entry.tag);
        }
    }
}

async fn check(handle: &AppHandle, web: &reqwest::Client) -> Duration {
    let state = handle.state::<Updates>();

    state.set_checking(true);
    let _ = handle.emit(EVENT, state.status(&current(handle)));

    let outcome = fetch(web, &state).await;

    let delay = match outcome {
        Outcome::Unchanged => {
            if let Ok(mut slot) = state.error.lock() {
                *slot = None;
            }
            POLL
        }
        Outcome::Found(found) => {
            if let Ok(mut slot) = state.error.lock() {
                *slot = None;
            }
            adopt(handle, &state, found);
            POLL
        }
        Outcome::Limited => {
            if let Ok(mut slot) = state.error.lock() {
                *slot = Some(String::from("GitHub rate limit reached, retrying later"));
            }
            LIMITED
        }
        Outcome::Failed(reason) => {
            if let Ok(mut slot) = state.error.lock() {
                *slot = Some(reason);
            }
            RETRY
        }
    };

    if let Ok(mut slot) = state.checked_at.lock() {
        *slot = Some(now());
    }

    state.set_checking(false);
    let _ = handle.emit(EVENT, state.status(&current(handle)));

    delay
}

pub fn start(handle: AppHandle) {
    tauri::async_runtime::spawn(run(handle));
}

async fn run(handle: AppHandle) {
    let agent = format!("Artemis/{}", current(&handle));

    let web = match reqwest::Client::builder()
        .user_agent(agent)
        .timeout(Duration::from_secs(20))
        .build()
    {
        Ok(web) => web,
        Err(cause) => {
            println!("[update] checker disabled: {cause}");
            return;
        }
    };

    loop {
        let delay = check(&handle, &web).await;

        tokio::select! {
            _ = tokio::time::sleep(delay) => {}
            _ = poker().notified() => {}
        }
    }
}

#[tauri::command]
pub fn update_status(handle: AppHandle, state: State<'_, Updates>) -> Status {
    state.status(&current(&handle))
}

#[tauri::command]
pub fn update_check() {
    poker().notify_one();
}

fn stash(release: &Release) -> Result<PathBuf> {
    let dir = std::env::temp_dir().join("Artemis").join("updates");
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join(&release.asset_name))
}

#[tauri::command]
pub async fn update_install(handle: AppHandle) -> Result<()> {
    let release = handle
        .state::<Updates>()
        .latest
        .lock()
        .ok()
        .and_then(|slot| slot.clone())
        .ok_or_else(|| Error::Sidecar(String::from("no update is available")))?;

    let target = stash(&release)?;
    let partial = target.with_extension("part");

    let web = reqwest::Client::builder()
        .user_agent(format!("Artemis/{}", current(&handle)))
        .build()
        .map_err(|cause| Error::Sidecar(cause.to_string()))?;

    let response = web
        .get(&release.asset)
        .send()
        .await
        .map_err(|cause| Error::Sidecar(cause.to_string()))?;

    if !response.status().is_success() {
        return Err(Error::Sidecar(format!(
            "the download failed with {}",
            response.status()
        )));
    }

    let total = response.content_length().unwrap_or(release.size);
    let mut file = tokio::fs::File::create(&partial).await?;
    let mut stream = response.bytes_stream();
    let mut received: u64 = 0;
    let mut last = std::time::Instant::now();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|cause| Error::Sidecar(cause.to_string()))?;
        file.write_all(&chunk).await?;
        received += chunk.len() as u64;

        if last.elapsed() >= Duration::from_millis(120) {
            last = std::time::Instant::now();
            let _ = handle.emit(
                PROGRESS,
                Progress {
                    received,
                    total,
                    stage: "downloading",
                },
            );
        }
    }

    file.flush().await?;
    drop(file);

    if total > 0 && received != total {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(Error::Sidecar(String::from("the download ended early")));
    }

    tokio::fs::rename(&partial, &target).await?;

    let _ = handle.emit(
        PROGRESS,
        Progress {
            received,
            total,
            stage: "installing",
        },
    );

    std::process::Command::new(&target)
        .spawn()
        .map_err(|cause| Error::Sidecar(format!("the installer could not start: {cause}")))?;

    tokio::time::sleep(Duration::from_millis(600)).await;
    handle.exit(0);

    Ok(())
}
