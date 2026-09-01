use std::sync::OnceLock;
use std::time::{Duration, SystemTime};

use serde::Deserialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::Notify;

use crate::accounts::{self, Account, Launcher};

pub(crate) const TOKEN_URL: &str =
    "https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token";
const VERIFY_URL: &str =
    "https://account-public-service-prod.ol.epicgames.com/account/api/oauth/verify";
const EXCHANGE_URL: &str =
    "https://account-public-service-prod.ol.epicgames.com/account/api/oauth/exchange";
const KILL_URL: &str =
    "https://account-public-service-prod.ol.epicgames.com/account/api/oauth/sessions/kill";

const LAUNCHER_ID: &str = "34a02cf8f4414e29b15921876da36f9a";
const LAUNCHER_SECRET: &str = "daafbccc737745039dffe53d94fc76cf";
pub(crate) const ANDROID_ID: &str = "3f69e56c7649492c8cc29f1af08a8a12";
pub(crate) const ANDROID_SECRET: &str = "b51ee9cb12234f50a69efa67ef53812e";

const TICK: Duration = Duration::from_secs(15);
const SWEEP: Duration = Duration::from_secs(300);
const POKE_DELAY: Duration = Duration::from_secs(10);
const RENEW_WITHIN_SECS: i64 = 1800;
const EVENT: &str = "accounts:changed";

static POKE: OnceLock<Notify> = OnceLock::new();

fn poker() -> &'static Notify {
    POKE.get_or_init(Notify::new)
}

pub fn poke() {
    poker().notify_one();
}

pub fn start(handle: AppHandle) {
    tauri::async_runtime::spawn(run(handle));
}

#[derive(Deserialize)]
pub(crate) struct TokenResponse {
    pub(crate) access_token: String,
    pub(crate) expires_at: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    refresh_expires_at: Option<String>,
}

#[derive(Deserialize)]
struct VerifyResponse {
    expires_in: i64,
}

#[derive(Deserialize)]
struct ExchangeResponse {
    code: String,
}

#[derive(Deserialize)]
struct ApiFailure {
    #[serde(rename = "errorCode", default)]
    error_code: String,
}

pub(crate) enum GrantError {
    Rejected(String),
    Transient(String),
}

pub(crate) fn base64(data: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);

    for chunk in data.chunks(3) {
        let a = chunk[0] as u32;
        let b = chunk.get(1).copied().unwrap_or(0) as u32;
        let c = chunk.get(2).copied().unwrap_or(0) as u32;
        let packed = (a << 16) | (b << 8) | c;

        out.push(TABLE[(packed >> 18 & 63) as usize] as char);
        out.push(TABLE[(packed >> 12 & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[(packed >> 6 & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(packed & 63) as usize] as char
        } else {
            '='
        });
    }

    out
}

fn basic(id: &str, secret: &str) -> String {
    format!("Basic {}", base64(format!("{id}:{secret}").as_bytes()))
}

pub(crate) async fn grant(
    web: &reqwest::Client,
    id: &str,
    secret: &str,
    params: &[(&str, &str)],
) -> std::result::Result<TokenResponse, GrantError> {
    let mut form: Vec<(&str, &str)> = params.to_vec();
    form.push(("token_type", "eg1"));

    let response = web
        .post(TOKEN_URL)
        .header("Authorization", basic(id, secret))
        .form(&form)
        .send()
        .await
        .map_err(|error| GrantError::Transient(error.to_string()))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| GrantError::Transient(error.to_string()))?;

    if status.is_success() {
        return serde_json::from_str(&body).map_err(|error| GrantError::Transient(error.to_string()));
    }

    let code = serde_json::from_str::<ApiFailure>(&body)
        .map(|failure| failure.error_code)
        .unwrap_or_default();

    if status.is_client_error() {
        Err(GrantError::Rejected(code))
    } else {
        Err(GrantError::Transient(format!("{status} {code}")))
    }
}

enum Health {
    Alive(i64),
    Dead,
    Unknown,
}

async fn access_health(web: &reqwest::Client, access_token: &str) -> Health {
    let response = match web.get(VERIFY_URL).bearer_auth(access_token).send().await {
        Ok(response) => response,
        Err(_) => return Health::Unknown,
    };

    let status = response.status();

    if status.is_success() {
        return match response.json::<VerifyResponse>().await {
            Ok(body) => Health::Alive(body.expires_in),
            Err(_) => Health::Unknown,
        };
    }

    if status.is_client_error() {
        Health::Dead
    } else {
        Health::Unknown
    }
}

async fn kill_session(web: &reqwest::Client, access_token: &str) {
    let _ = web
        .delete(format!("{KILL_URL}/{access_token}"))
        .bearer_auth(access_token)
        .send()
        .await;
}

fn as_launcher(token: TokenResponse) -> Launcher {
    Launcher {
        access_token: token.access_token,
        expires_at: token.expires_at,
        refresh_token: token.refresh_token,
        refresh_expires_at: token.refresh_expires_at,
    }
}

async fn mint(
    web: &reqwest::Client,
    account: &Account,
) -> std::result::Result<Launcher, GrantError> {
    let android = grant(
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

    let exchange = async {
        let response = web
            .get(EXCHANGE_URL)
            .bearer_auth(&android.access_token)
            .send()
            .await
            .map_err(|error| GrantError::Transient(error.to_string()))?;

        if !response.status().is_success() {
            return Err(GrantError::Transient(format!(
                "exchange failed: {}",
                response.status()
            )));
        }

        response
            .json::<ExchangeResponse>()
            .await
            .map_err(|error| GrantError::Transient(error.to_string()))
    }
    .await;

    let exchange = match exchange {
        Ok(exchange) => exchange,
        Err(error) => {
            kill_session(web, &android.access_token).await;
            return Err(error);
        }
    };

    let launcher = grant(
        web,
        LAUNCHER_ID,
        LAUNCHER_SECRET,
        &[
            ("grant_type", "exchange_code"),
            ("exchange_code", &exchange.code),
        ],
    )
    .await;

    kill_session(web, &android.access_token).await;
    launcher.map(as_launcher)
}

async fn renew(web: &reqwest::Client, account: &Account) -> Option<Launcher> {
    let saved = account.launcher.as_ref();
    let refresh_token = saved.and_then(|launcher| launcher.refresh_token.clone());

    if let (Some(launcher), Some(refresh)) = (saved, refresh_token.as_deref()) {
        match access_health(web, &launcher.access_token).await {
            Health::Alive(remaining) if remaining > RENEW_WITHIN_SECS => return None,
            Health::Unknown => return None,
            _ => {}
        }

        match grant(
            web,
            LAUNCHER_ID,
            LAUNCHER_SECRET,
            &[("grant_type", "refresh_token"), ("refresh_token", refresh)],
        )
        .await
        {
            Ok(token) => {
                println!(
                    "[credentials] refreshed launcher token for {}",
                    account.display_name
                );
                return Some(as_launcher(token));
            }
            Err(GrantError::Transient(reason)) => {
                println!(
                    "[credentials] refresh deferred for {}: {reason}",
                    account.display_name
                );
                return None;
            }
            Err(GrantError::Rejected(code)) => {
                println!(
                    "[credentials] refresh token rejected for {} ({code}), re-minting from device auth",
                    account.display_name
                );
            }
        }
    }

    match mint(web, account).await {
        Ok(launcher) => {
            println!(
                "[credentials] minted new launcher token for {}",
                account.display_name
            );
            Some(launcher)
        }
        Err(GrantError::Rejected(code)) => {
            println!(
                "[credentials] device auth rejected for {} ({code})",
                account.display_name
            );
            None
        }
        Err(GrantError::Transient(reason)) => {
            println!(
                "[credentials] mint deferred for {}: {reason}",
                account.display_name
            );
            None
        }
    }
}

async fn sweep(handle: &AppHandle, web: &reqwest::Client) {
    let Ok(store) = accounts::snapshot(handle) else {
        return;
    };

    for account in &store.accounts {
        if account.device_id.is_empty() || account.secret.is_empty() {
            continue;
        }

        let Some(launcher) = renew(web, account).await else {
            continue;
        };

        match accounts::save_launcher(handle, &account.account_id, &account.device_id, launcher) {
            Ok(Some(updated)) => {
                let _ = handle.emit(EVENT, &updated);
            }
            Ok(None) => {
                println!(
                    "[credentials] account {} changed during renewal, tokens not saved",
                    account.display_name
                );
            }
            Err(error) => {
                println!(
                    "[credentials] failed to save tokens for {}: {error}",
                    account.display_name
                );
            }
        }
    }
}

fn mtime(handle: &AppHandle) -> Option<SystemTime> {
    let path = accounts::store_path(handle).ok()?;
    std::fs::metadata(path).ok()?.modified().ok()
}

async fn run(handle: AppHandle) {
    let web = match reqwest::Client::builder()
        .user_agent("Artemis/1.0")
        .timeout(Duration::from_secs(30))
        .build()
    {
        Ok(web) => web,
        Err(error) => {
            println!("[credentials] watcher disabled: {error}");
            return;
        }
    };

    let mut seen = mtime(&handle);
    let mut last_sweep: Option<tokio::time::Instant> = None;

    loop {
        let mut poked = false;

        tokio::select! {
            _ = tokio::time::sleep(TICK) => {}
            _ = poker().notified() => {
                poked = true;
                tokio::time::sleep(POKE_DELAY).await;
            }
        }

        let current = mtime(&handle);
        let changed = current != seen;
        let due = last_sweep.is_none_or(|at| at.elapsed() >= SWEEP);

        if !poked && !changed && !due {
            continue;
        }

        sweep(&handle, &web).await;
        last_sweep = Some(tokio::time::Instant::now());
        seen = mtime(&handle);
    }
}
