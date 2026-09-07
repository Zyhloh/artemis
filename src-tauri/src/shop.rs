use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::error::{Error, Result};

const SHOP_URL: &str = "https://prod.fn-api.cc/v1/itemshop";
const SECTIONS_URL: &str = "https://prod.fn-api.cc/v1/itemshop/sections";

const STORE_DIR: &str = "Artemis";
const CACHE_FILE: &str = "shop.json";
const EVENT: &str = "shop:changed";

const POLL: Duration = Duration::from_secs(30);
const RETRY: Duration = Duration::from_secs(10);
const RESET_GRACE: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub key: String,
    pub fetched_at: String,
    pub resets_at: Option<String>,
    pub shop: serde_json::Value,
    pub sections: serde_json::Value,
}

#[derive(Default)]
pub struct Shop {
    current: Mutex<Option<Snapshot>>,
}

impl Shop {
    fn read(&self) -> Option<Snapshot> {
        self.current.lock().ok().and_then(|slot| slot.clone())
    }

    fn key(&self) -> Option<String> {
        self.current
            .lock()
            .ok()
            .and_then(|slot| slot.as_ref().map(|entry| entry.key.clone()))
    }

    fn set(&self, snapshot: Snapshot) {
        if let Ok(mut slot) = self.current.lock() {
            slot.replace(snapshot);
        }
    }
}

#[tauri::command]
pub fn shop_snapshot(state: State<'_, Shop>) -> Option<Snapshot> {
    state.read()
}

fn cache_path(handle: &AppHandle) -> Result<std::path::PathBuf> {
    let dir = handle
        .path()
        .config_dir()
        .map_err(|_| Error::ConfigMissing)?
        .join(STORE_DIR);

    std::fs::create_dir_all(&dir)?;
    Ok(dir.join(CACHE_FILE))
}

fn restore(handle: &AppHandle) -> Option<Snapshot> {
    let raw = std::fs::read_to_string(cache_path(handle).ok()?).ok()?;
    serde_json::from_str(&raw).ok()
}

fn persist(handle: &AppHandle, snapshot: &Snapshot) {
    let Ok(path) = cache_path(handle) else {
        return;
    };

    if let Ok(raw) = serde_json::to_string(snapshot) {
        let _ = std::fs::write(path, raw);
    }
}

fn text(value: &serde_json::Value, field: &str) -> Option<String> {
    value.get(field)?.as_str().map(|found| found.to_owned())
}

async fn pull(web: &reqwest::Client, url: &str) -> std::result::Result<serde_json::Value, String> {
    let response = web
        .get(url)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!("{url} responded {}", response.status()));
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|error| error.to_string())
}

async fn fetch(web: &reqwest::Client) -> std::result::Result<Snapshot, String> {
    let (shop, sections) = tokio::try_join!(pull(web, SHOP_URL), pull(web, SECTIONS_URL))?;

    let hash = text(&shop, "hash").unwrap_or_default();
    let layout = text(&sections, "layoutLastModified").unwrap_or_default();
    let fetched_at = text(&shop, "fetchedAt").unwrap_or_default();

    if hash.is_empty() {
        return Err(String::from("the item shop response carried no hash"));
    }

    Ok(Snapshot {
        key: format!("{hash}:{layout}"),
        resets_at: text(&shop, "resetsAt"),
        fetched_at,
        shop,
        sections,
    })
}

fn wait_for(snapshot: Option<&Snapshot>) -> Duration {
    let Some(resets) = snapshot.and_then(|entry| entry.resets_at.as_deref()) else {
        return POLL;
    };

    let Some(at) = epoch(resets) else {
        return POLL;
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_secs() as i64)
        .unwrap_or_default();

    let remaining = at - now;

    if remaining > 0 && remaining < POLL.as_secs() as i64 {
        return Duration::from_secs(remaining as u64) + RESET_GRACE;
    }

    POLL
}

pub(crate) fn epoch(stamp: &str) -> Option<i64> {
    if stamp.len() < 19 {
        return None;
    }

    let number = |from: usize, to: usize| -> Option<i64> {
        stamp.get(from..to)?.parse::<i64>().ok()
    };

    let year = number(0, 4)?;
    let month = number(5, 7)?;
    let day = number(8, 10)?;
    let hour = number(11, 13)?;
    let minute = number(14, 16)?;
    let second = number(17, 19)?;

    let leaps = |y: i64| y / 4 - y / 100 + y / 400;
    let mut days = (year - 1970) * 365 + leaps(year - 1) - leaps(1969);

    const MONTHS: [i64; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;

    for index in 0..(month - 1) as usize {
        days += MONTHS.get(index).copied()?;
        if index == 1 && leap {
            days += 1;
        }
    }

    days += day - 1;

    Some(days * 86_400 + hour * 3_600 + minute * 60 + second)
}

pub fn start(handle: AppHandle) {
    tauri::async_runtime::spawn(run(handle));
}

async fn run(handle: AppHandle) {
    if let Some(cached) = restore(&handle) {
        handle.state::<Shop>().set(cached);
    }

    let web = match reqwest::Client::builder()
        .user_agent("Artemis/1.0")
        .timeout(Duration::from_secs(20))
        .build()
    {
        Ok(web) => web,
        Err(error) => {
            println!("[shop] watcher disabled: {error}");
            return;
        }
    };

    loop {
        let state = handle.state::<Shop>();

        let delay = match fetch(&web).await {
            Ok(snapshot) => {
                if state.key().as_deref() == Some(snapshot.key.as_str()) {
                    wait_for(Some(&snapshot))
                } else {
                    println!("[shop] item shop updated ({})", snapshot.fetched_at);
                    persist(&handle, &snapshot);
                    let wait = wait_for(Some(&snapshot));
                    let _ = handle.emit(EVENT, &snapshot);
                    state.set(snapshot);
                    wait
                }
            }
            Err(reason) => {
                println!("[shop] fetch deferred: {reason}");
                RETRY
            }
        };

        tokio::time::sleep(delay).await;
    }
}
