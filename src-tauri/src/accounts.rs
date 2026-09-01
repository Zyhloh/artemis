use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, PoisonError};
use tauri::{AppHandle, Manager};

const STORE_DIR: &str = "Artemis";
const STORE_FILE: &str = "accounts.json";

static LOCK: Mutex<()> = Mutex::new(());

fn guard() -> MutexGuard<'static, ()> {
    LOCK.lock().unwrap_or_else(PoisonError::into_inner)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Launcher {
    pub access_token: String,
    pub expires_at: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub refresh_expires_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub account_id: String,
    pub display_name: String,
    pub device_id: String,
    pub secret: String,
    #[serde(default)]
    pub launcher: Option<Launcher>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Store {
    pub current: Option<String>,
    pub accounts: Vec<Account>,
}

pub fn store_path(handle: &AppHandle) -> Result<PathBuf> {
    let dir = handle
        .path()
        .config_dir()
        .map_err(|_| Error::ConfigMissing)?
        .join(STORE_DIR);

    fs::create_dir_all(&dir)?;
    Ok(dir.join(STORE_FILE))
}

fn read(handle: &AppHandle) -> Result<Store> {
    let path = store_path(handle)?;

    if !path.is_file() {
        return Ok(Store::default());
    }

    Ok(serde_json::from_str(&fs::read_to_string(path)?).unwrap_or_default())
}

fn write(handle: &AppHandle, store: &Store) -> Result<()> {
    fs::write(store_path(handle)?, serde_json::to_string_pretty(store)?)?;
    Ok(())
}

pub fn snapshot(handle: &AppHandle) -> Result<Store> {
    let _lock = guard();
    read(handle)
}

pub fn save_launcher(
    handle: &AppHandle,
    account_id: &str,
    device_id: &str,
    launcher: Launcher,
) -> Result<Option<Store>> {
    let _lock = guard();
    let mut store = read(handle)?;

    let Some(entry) = store
        .accounts
        .iter_mut()
        .find(|entry| entry.account_id == account_id && entry.device_id == device_id)
    else {
        return Ok(None);
    };

    entry.launcher = Some(launcher);
    write(handle, &store)?;
    Ok(Some(store))
}

#[tauri::command]
pub fn accounts_list(handle: AppHandle) -> Result<Store> {
    let _lock = guard();
    read(&handle)
}

#[tauri::command]
pub fn accounts_add(handle: AppHandle, account: Account) -> Result<Store> {
    let _lock = guard();
    let mut store = read(&handle)?;

    let existing = store
        .accounts
        .iter()
        .find(|entry| entry.account_id == account.account_id)
        .and_then(|entry| entry.launcher.clone());

    let mut account = account;
    account.launcher = account.launcher.or(existing);

    store.accounts.retain(|entry| entry.account_id != account.account_id);
    store.current = Some(account.account_id.clone());
    store.accounts.push(account);

    write(&handle, &store)?;
    crate::profile::poke();
    Ok(store)
}

#[tauri::command]
pub fn accounts_set_launcher(
    handle: AppHandle,
    account_id: String,
    launcher: Launcher,
) -> Result<Store> {
    let _lock = guard();
    let mut store = read(&handle)?;

    if let Some(entry) = store
        .accounts
        .iter_mut()
        .find(|entry| entry.account_id == account_id)
    {
        entry.launcher = Some(launcher);
        write(&handle, &store)?;
    }

    Ok(store)
}

#[tauri::command]
pub fn accounts_switch(handle: AppHandle, account_id: String) -> Result<Store> {
    let _lock = guard();
    let mut store = read(&handle)?;

    if store.accounts.iter().any(|entry| entry.account_id == account_id) {
        store.current = Some(account_id);
        write(&handle, &store)?;
        crate::profile::poke();
    }

    Ok(store)
}

#[tauri::command]
pub fn accounts_remove(handle: AppHandle, account_id: String) -> Result<Store> {
    let _lock = guard();
    let mut store = read(&handle)?;

    store.accounts.retain(|entry| entry.account_id != account_id);

    if store.current.as_deref() == Some(account_id.as_str()) {
        store.current = store.accounts.first().map(|entry| entry.account_id.clone());
    }

    write(&handle, &store)?;
    crate::profile::poke();
    Ok(store)
}
