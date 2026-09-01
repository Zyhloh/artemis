use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Notify;

use crate::accounts::{self, Account};
use crate::credentials::{grant, GrantError, ANDROID_ID, ANDROID_SECRET};
use crate::paths;

const MCP_BASE_URL: &str = "https://fngw-mcp-gc-livefn.ol.epicgames.com";
const WALLET_PROFILE: &str = "common_core";
const MTX_PREFIX: &str = "Currency:Mtx";
const SUMMARY_FILE: &str = "summary.json";

const PROFILES: [&str; 14] = [
    "common_core",
    "athena",
    "campaign",
    "common_public",
    "creative",
    "collections",
    "metadata",
    "collection_book_people0",
    "collection_book_schematics0",
    "outpost0",
    "theater0",
    "theater1",
    "theater2",
    "recycle_bin",
];

const POLL: Duration = Duration::from_secs(15);
const RETRY: Duration = Duration::from_secs(20);
const TOKEN_MARGIN_SECS: i64 = 120;
const EVENT: &str = "profile:changed";

static POKE: OnceLock<Notify> = OnceLock::new();

fn poker() -> &'static Notify {
    POKE.get_or_init(Notify::new)
}

pub fn poke() {
    poker().notify_one();
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub account_id: String,
    pub display_name: String,
    pub revision: i64,
    pub vbucks: i64,
    pub platform: String,
    pub updated: String,
}

#[derive(Default)]
pub struct Profiles {
    current: Mutex<Option<Summary>>,
}

impl Profiles {
    fn read(&self) -> Option<Summary> {
        self.current.lock().ok().and_then(|slot| slot.clone())
    }

    fn set(&self, summary: Option<Summary>) {
        if let Ok(mut slot) = self.current.lock() {
            *slot = summary;
        }
    }
}

#[tauri::command]
pub fn profile_wallet(state: State<'_, Profiles>) -> Option<Summary> {
    state.read()
}

#[tauri::command]
pub fn profile_document(
    handle: AppHandle,
    account_id: String,
    profile_id: String,
) -> Option<serde_json::Value> {
    let path = paths::account_file(&handle, &account_id, &format!("{profile_id}.json"))?;
    let raw = std::fs::read_to_string(path).ok()?;

    serde_json::from_str(&raw).ok()
}

fn restore(handle: &AppHandle, account: &Account) -> Option<Summary> {
    let path = paths::account_file(handle, &account.account_id, SUMMARY_FILE)?;
    let raw = std::fs::read_to_string(path).ok()?;
    let mut summary: Summary = serde_json::from_str(&raw).ok()?;

    summary.display_name = account.display_name.clone();
    Some(summary)
}

fn persist_summary(handle: &AppHandle, summary: &Summary) {
    let Some(path) = paths::account_file(handle, &summary.account_id, SUMMARY_FILE) else {
        return;
    };

    if let Ok(raw) = serde_json::to_string(summary) {
        let _ = std::fs::write(path, raw);
    }
}

fn persist_profile(
    handle: &AppHandle,
    account_id: &str,
    profile_id: &str,
    profile: &serde_json::Value,
) {
    let Some(path) = paths::account_file(handle, account_id, &format!("{profile_id}.json")) else {
        return;
    };

    if let Ok(raw) = serde_json::to_string(profile) {
        let _ = std::fs::write(path, raw);
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfileEnvelope {
    #[serde(default)]
    profile_changes: Vec<ProfileChange>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfileChange {
    #[serde(default)]
    profile: Option<serde_json::Value>,
}

struct Ticket {
    token: String,
    expires_at: i64,
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_secs() as i64)
        .unwrap_or_default()
}

async fn ticket_for(
    web: &reqwest::Client,
    account: &Account,
    held: &mut Option<Ticket>,
) -> std::result::Result<String, GrantError> {
    if let Some(ticket) = held.as_ref() {
        if ticket.expires_at - now_secs() > TOKEN_MARGIN_SECS {
            return Ok(ticket.token.clone());
        }
    }

    let token = grant(
        web,
        ANDROID_ID,
        ANDROID_SECRET,
        &[
            ("grant_type", "device_auth"),
            ("account_id", &account.account_id),
            ("device_id", &account.device_id),
            ("secret", &account.secret),
        ],
    )
    .await?;

    let expires_at = crate::shop::epoch(&token.expires_at).unwrap_or_else(|| now_secs() + 3600);
    let access = token.access_token.clone();

    held.replace(Ticket {
        token: token.access_token,
        expires_at,
    });

    Ok(access)
}

async fn query(
    web: &reqwest::Client,
    token: &str,
    account_id: &str,
    profile_id: &str,
) -> std::result::Result<serde_json::Value, String> {
    let url =
        format!("{MCP_BASE_URL}/fortnite/api/game/v2/profile/{account_id}/client/QueryProfile");

    let response = web
        .post(url)
        .bearer_auth(token)
        .query(&[("profileId", profile_id), ("rvn", "-1")])
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;

    if !status.is_success() {
        return Err(format!("{profile_id} responded {status}"));
    }

    let envelope: ProfileEnvelope =
        serde_json::from_str(&body).map_err(|error| error.to_string())?;

    envelope
        .profile_changes
        .into_iter()
        .find_map(|change| change.profile)
        .ok_or_else(|| format!("{profile_id} returned no profile"))
}

fn revision_of(profile: &serde_json::Value) -> i64 {
    profile
        .get("rvn")
        .and_then(|value| value.as_i64())
        .unwrap_or_default()
}

fn wallet_of(account: &Account, profile: &serde_json::Value) -> Summary {
    let vbucks = profile
        .get("items")
        .and_then(|value| value.as_object())
        .map(|items| {
            items
                .values()
                .filter(|item| {
                    item.get("templateId")
                        .and_then(|value| value.as_str())
                        .is_some_and(|template| template.starts_with(MTX_PREFIX))
                })
                .filter_map(|item| item.get("quantity").and_then(|value| value.as_i64()))
                .sum()
        })
        .unwrap_or(0);

    Summary {
        account_id: account.account_id.clone(),
        display_name: account.display_name.clone(),
        revision: revision_of(profile),
        vbucks,
        platform: profile
            .get("stats")
            .and_then(|stats| stats.get("attributes"))
            .and_then(|attrs| attrs.get("current_mtx_platform"))
            .and_then(|value| value.as_str())
            .unwrap_or("Unknown")
            .to_owned(),
        updated: profile
            .get("updated")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_owned(),
    }
}

fn signed_in(handle: &AppHandle) -> Option<Account> {
    let store = accounts::snapshot(handle).ok()?;
    let current = store.current.clone()?;

    store
        .accounts
        .into_iter()
        .find(|entry| entry.account_id == current)
}

pub fn start(handle: AppHandle) {
    tauri::async_runtime::spawn(run(handle));
}

async fn sync(
    handle: &AppHandle,
    web: &reqwest::Client,
    account: &Account,
    token: &str,
    seen: &mut HashMap<String, i64>,
) -> std::result::Result<Option<Summary>, String> {
    let mut wallet = None;
    let mut skipped = 0;

    for profile_id in PROFILES {
        let profile = match query(web, token, &account.account_id, profile_id).await {
            Ok(profile) => profile,
            Err(reason) => {
                if profile_id == WALLET_PROFILE {
                    return Err(reason);
                }

                skipped += 1;
                continue;
            }
        };

        let revision = revision_of(&profile);

        if seen.get(profile_id).copied() == Some(revision) {
            continue;
        }

        persist_profile(handle, &account.account_id, profile_id, &profile);
        seen.insert(profile_id.to_owned(), revision);

        if profile_id == WALLET_PROFILE {
            wallet = Some(wallet_of(account, &profile));
        }
    }

    if skipped > 0 {
        println!(
            "[profile] {skipped} profile(s) unavailable for {}",
            account.display_name
        );
    }

    Ok(wallet)
}

async fn run(handle: AppHandle) {
    let web = match reqwest::Client::builder()
        .user_agent("Artemis/1.0")
        .timeout(Duration::from_secs(30))
        .build()
    {
        Ok(web) => web,
        Err(error) => {
            println!("[profile] watcher disabled: {error}");
            return;
        }
    };

    let mut ticket: Option<Ticket> = None;
    let mut owner: Option<String> = None;
    let mut seen: HashMap<String, i64> = HashMap::new();

    loop {
        let state = handle.state::<Profiles>();
        let account = signed_in(&handle);

        let delay = match account {
            None => {
                if owner.take().is_some() {
                    ticket = None;
                    seen.clear();
                    state.set(None);
                    let _ = handle.emit(EVENT, None::<Summary>);
                }

                POLL
            }
            Some(account) => {
                if owner.as_deref() != Some(account.account_id.as_str()) {
                    owner = Some(account.account_id.clone());
                    ticket = None;
                    seen.clear();

                    let cached = restore(&handle, &account);
                    state.set(cached.clone());
                    let _ = handle.emit(EVENT, cached);
                }

                match ticket_for(&web, &account, &mut ticket).await {
                    Err(GrantError::Rejected(code)) => {
                        println!(
                            "[profile] device auth rejected for {} ({code})",
                            account.display_name
                        );
                        RETRY
                    }
                    Err(GrantError::Transient(reason)) => {
                        println!("[profile] auth deferred: {reason}");
                        RETRY
                    }
                    Ok(token) => match sync(&handle, &web, &account, &token, &mut seen).await {
                        Err(reason) => {
                            println!("[profile] sync deferred: {reason}");
                            ticket = None;
                            seen.clear();
                            RETRY
                        }
                        Ok(None) => POLL,
                        Ok(Some(summary)) => {
                            println!(
                                "[profile] {} refreshed — {} V-Bucks",
                                summary.display_name, summary.vbucks
                            );

                            persist_summary(&handle, &summary);
                            state.set(Some(summary.clone()));
                            let _ = handle.emit(EVENT, Some(summary));
                            POLL
                        }
                    },
                }
            }
        };

        tokio::select! {
            _ = tokio::time::sleep(delay) => {}
            _ = poker().notified() => {}
        }
    }
}
