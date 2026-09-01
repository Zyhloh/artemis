use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::accounts;
use crate::credentials::base64;
use crate::paths;

const LOOK_FILE: &str = "locker.json";
const AVATAR_FILE: &str = "avatar.png";
const EVENT: &str = "locker:changed";
const MAX_AVATAR_BYTES: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Look {
    pub account_id: String,
    pub outfit_id: String,
    #[serde(default)]
    pub outfit_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
}

#[derive(Default)]
pub struct Lockers {
    looks: Mutex<HashMap<String, Look>>,
}

impl Lockers {
    fn get(&self, account_id: &str) -> Option<Look> {
        self.looks
            .lock()
            .ok()
            .and_then(|looks| looks.get(account_id).cloned())
    }

    fn all(&self) -> Vec<Look> {
        self.looks
            .lock()
            .map(|looks| looks.values().cloned().collect())
            .unwrap_or_default()
    }

    fn set(&self, look: Look) {
        if let Ok(mut looks) = self.looks.lock() {
            looks.insert(look.account_id.clone(), look);
        }
    }
}

fn as_data_url(bytes: &[u8]) -> String {
    format!("data:image/png;base64,{}", base64(bytes))
}

fn read_avatar(handle: &AppHandle, account_id: &str) -> Option<String> {
    let bytes = std::fs::read(paths::account_file(handle, account_id, AVATAR_FILE)?).ok()?;

    (!bytes.is_empty()).then(|| as_data_url(&bytes))
}

fn restore(handle: &AppHandle, account_id: &str) -> Option<Look> {
    let raw = std::fs::read_to_string(paths::account_file(handle, account_id, LOOK_FILE)?).ok()?;
    let mut look: Look = serde_json::from_str(&raw).ok()?;

    look.avatar = read_avatar(handle, account_id);
    Some(look)
}

fn persist(handle: &AppHandle, look: &Look) {
    let Some(path) = paths::account_file(handle, &look.account_id, LOOK_FILE) else {
        return;
    };

    let mut copy = look.clone();
    copy.avatar = None;

    if let Ok(raw) = serde_json::to_string(&copy) {
        let _ = std::fs::write(path, raw);
    }
}

#[tauri::command]
pub fn locker_roster(state: State<'_, Lockers>) -> Vec<Look> {
    state.all()
}

#[tauri::command]
pub async fn locker_remember(
    handle: AppHandle,
    state: State<'_, Lockers>,
    account_id: String,
    outfit_id: String,
    outfit_name: Option<String>,
    icon: String,
) -> Result<Option<Look>, String> {
    if account_id.is_empty() || outfit_id.is_empty() {
        return Ok(None);
    }

    if let Some(held) = state.get(&account_id) {
        if held.outfit_id == outfit_id && held.avatar.is_some() {
            return Ok(Some(held));
        }
    }

    if !icon.starts_with("https://cdn.fn-api.cc/") {
        return Err(String::from("the icon must come from the fn-api cdn"));
    }

    let response = reqwest::get(&icon).await.map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!("the icon responded {}", response.status()));
    }

    let bytes = response.bytes().await.map_err(|error| error.to_string())?;

    if bytes.is_empty() || bytes.len() > MAX_AVATAR_BYTES {
        return Err(String::from("the icon was empty or too large"));
    }

    if let Some(path) = paths::account_file(&handle, &account_id, AVATAR_FILE) {
        let _ = std::fs::write(path, &bytes);
    }

    let look = Look {
        account_id,
        outfit_id,
        outfit_name,
        avatar: Some(as_data_url(&bytes)),
    };

    persist(&handle, &look);
    state.set(look.clone());
    let _ = handle.emit(EVENT, look.clone());

    println!(
        "[locker] {} now wearing {}",
        look.account_id,
        look.outfit_name.as_deref().unwrap_or(&look.outfit_id)
    );

    Ok(Some(look))
}

pub fn start(handle: &AppHandle) {
    let Ok(store) = accounts::snapshot(handle) else {
        return;
    };

    let state = handle.state::<Lockers>();

    for account in &store.accounts {
        if let Some(look) = restore(handle, &account.account_id) {
            state.set(look);
        }
    }
}
