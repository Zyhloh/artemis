use crate::error::{Error, Result};

pub const HIDDEN_FLAG: &str = "--hidden";
const VALUE: &str = "Artemis";

pub fn requested_hidden() -> bool {
    std::env::args().skip(1).any(|arg| arg == HIDDEN_FLAG)
}

#[cfg(windows)]
mod registry {
    use super::{Error, Result, HIDDEN_FLAG, VALUE};
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{
        HKEY, HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_BINARY, REG_SZ, RegCloseKey,
        RegCreateKeyExW, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW,
        REG_OPTION_NON_VOLATILE,
    };
    use windows::core::{HSTRING, PCWSTR};

    const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    const APPROVED: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
    const ENABLED: [u8; 12] = [0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    struct Key(HKEY);

    impl Drop for Key {
        fn drop(&mut self) {
            unsafe {
                let _ = RegCloseKey(self.0);
            }
        }
    }

    fn open(path: &str, write: bool) -> Option<Key> {
        let mut key = HKEY::default();
        let access = if write { KEY_READ | KEY_WRITE } else { KEY_READ };

        let status = unsafe {
            if write {
                RegCreateKeyExW(
                    HKEY_CURRENT_USER,
                    &HSTRING::from(path),
                    None,
                    PCWSTR::null(),
                    REG_OPTION_NON_VOLATILE,
                    access,
                    None,
                    &mut key,
                    None,
                )
            } else {
                RegOpenKeyExW(HKEY_CURRENT_USER, &HSTRING::from(path), None, access, &mut key)
            }
        };

        (status == ERROR_SUCCESS).then_some(Key(key))
    }

    fn read(key: &Key, name: &str) -> Option<Vec<u8>> {
        let mut size: u32 = 0;
        let wide = HSTRING::from(name);

        let status = unsafe {
            RegQueryValueExW(key.0, &wide, None, None, None, Some(&mut size))
        };

        if status != ERROR_SUCCESS {
            return None;
        }

        let mut buffer = vec![0u8; size as usize];

        let status = unsafe {
            RegQueryValueExW(
                key.0,
                &wide,
                None,
                None,
                Some(buffer.as_mut_ptr()),
                Some(&mut size),
            )
        };

        (status == ERROR_SUCCESS).then_some(buffer)
    }

    fn command() -> Result<String> {
        let exe = std::env::current_exe()?;
        Ok(format!("\"{}\" {HIDDEN_FLAG}", exe.display()))
    }

    pub fn enabled() -> bool {
        let Some(run) = open(RUN, false) else {
            return false;
        };

        if read(&run, VALUE).is_none() {
            return false;
        }

        open(APPROVED, false)
            .and_then(|approved| read(&approved, VALUE))
            .map(|bytes| bytes.first().is_some_and(|flag| flag & 0x01 == 0))
            .unwrap_or(true)
    }

    pub fn set(enabled: bool) -> Result<()> {
        let run = open(RUN, true)
            .ok_or_else(|| Error::Sidecar(String::from("the startup registry key is unavailable")))?;
        let wide = HSTRING::from(VALUE);

        if !enabled {
            unsafe {
                let _ = RegDeleteValueW(run.0, &wide);
            }

            if let Some(approved) = open(APPROVED, true) {
                unsafe {
                    let _ = RegDeleteValueW(approved.0, &wide);
                }
            }

            return Ok(());
        }

        let command = command()?;
        let mut data: Vec<u8> = command
            .encode_utf16()
            .chain(std::iter::once(0))
            .flat_map(u16::to_le_bytes)
            .collect();

        let status = unsafe { RegSetValueExW(run.0, &wide, None, REG_SZ, Some(&data)) };

        if status != ERROR_SUCCESS {
            return Err(Error::Sidecar(String::from(
                "the startup entry could not be written",
            )));
        }

        data.clear();

        if let Some(approved) = open(APPROVED, true) {
            unsafe {
                let _ = RegSetValueExW(approved.0, &wide, None, REG_BINARY, Some(&ENABLED));
            }
        }

        Ok(())
    }
}

#[cfg(windows)]
pub use registry::{enabled, set};

#[cfg(not(windows))]
pub fn enabled() -> bool {
    false
}

#[cfg(not(windows))]
pub fn set(_enabled: bool) -> Result<()> {
    Err(Error::Sidecar(String::from(
        "starting with the system is only supported on Windows",
    )))
}
