use crate::error::{Error, Result};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathStatus {
    pub path: String,
    pub writable: bool,
    pub elevated: bool,
}

#[cfg(windows)]
pub fn is_elevated() -> bool {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::Security::{
        GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY,
    };
    use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    unsafe {
        let mut token = Default::default();

        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
            return false;
        }

        let mut elevation = TOKEN_ELEVATION::default();
        let mut size = size_of::<TOKEN_ELEVATION>() as u32;

        let ok = GetTokenInformation(
            token,
            TokenElevation,
            Some(&mut elevation as *mut _ as *mut _),
            size,
            &mut size,
        )
        .is_ok();

        let _ = CloseHandle(token);

        ok && elevation.TokenIsElevated != 0
    }
}

#[cfg(not(windows))]
pub fn is_elevated() -> bool {
    true
}

#[cfg(windows)]
fn wide(value: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;

    std::ffi::OsStr::new(value)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(windows)]
fn grant(path: &str) -> Result<()> {
    use windows::core::{w, PCWSTR};
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::System::Threading::{WaitForSingleObject, INFINITE};
    use windows::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW};
    use windows::Win32::UI::WindowsAndMessaging::SW_HIDE;

    let script = format!(
        "/c mkdir \"{path}\" 2>nul & icacls \"{path}\" /grant \"%USERNAME%:(OI)(CI)M\""
    );

    let parameters = wide(&script);

    let mut info = SHELLEXECUTEINFOW {
        cbSize: size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS,
        lpVerb: w!("runas"),
        lpFile: w!("cmd.exe"),
        lpParameters: PCWSTR(parameters.as_ptr()),
        nShow: SW_HIDE.0,
        ..Default::default()
    };

    unsafe {
        ShellExecuteExW(&mut info).map_err(|_| {
            Error::Sidecar("the administrator prompt was dismissed".to_owned())
        })?;

        if !info.hProcess.is_invalid() {
            WaitForSingleObject(info.hProcess, INFINITE);
            let _ = CloseHandle(HANDLE(info.hProcess.0));
        }
    }

    Ok(())
}

#[cfg(not(windows))]
fn grant(_path: &str) -> Result<()> {
    Err(Error::Sidecar(
        "elevation is only supported on Windows".to_owned(),
    ))
}

#[tauri::command]
pub async fn app_is_elevated() -> Result<bool> {
    Ok(is_elevated())
}

#[tauri::command]
pub async fn install_grant_path(path: String) -> Result<()> {
    grant(&path)
}
