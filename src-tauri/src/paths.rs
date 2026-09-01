use tauri::{AppHandle, Manager};

const STORE_DIR: &str = "Artemis";
const PROFILE_DIR: &str = "profiles";

fn safe(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|glyph| glyph.is_ascii_alphanumeric() || glyph == '_' || glyph == '.')
}

pub fn account_dir(handle: &AppHandle, account_id: &str) -> Option<std::path::PathBuf> {
    if !safe(account_id) {
        return None;
    }

    let dir = handle
        .path()
        .config_dir()
        .ok()?
        .join(STORE_DIR)
        .join(PROFILE_DIR)
        .join(account_id);

    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

pub fn account_file(
    handle: &AppHandle,
    account_id: &str,
    name: &str,
) -> Option<std::path::PathBuf> {
    if !safe(name) {
        return None;
    }

    Some(account_dir(handle, account_id)?.join(name))
}
