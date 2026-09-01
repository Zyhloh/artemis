use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::utils::config::Color;
use tauri::window::{Effect, EffectsBuilder};
use tauri::{Theme, WebviewWindow};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Backdrop {
    Mica,
    Acrylic,
    Blur,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Appearance {
    pub backdrop: Backdrop,
    pub mode: Mode,
}

#[derive(Debug, Default)]
pub struct Current(Mutex<Option<Appearance>>);

impl Current {
    pub fn get(&self) -> Option<Appearance> {
        *self.0.lock().unwrap()
    }

    pub fn set(&self, next: Appearance) -> bool {
        let mut slot = self.0.lock().unwrap();
        let changed = *slot != Some(next);
        *slot = Some(next);
        changed
    }
}

const LIGHT_TINT: Color = Color(250, 250, 252, 140);

impl Backdrop {
    fn chain(self) -> &'static [Backdrop] {
        match self {
            Backdrop::Mica => &[Backdrop::Mica, Backdrop::Acrylic, Backdrop::Blur],
            Backdrop::Acrylic => &[Backdrop::Acrylic, Backdrop::Mica, Backdrop::Blur],
            Backdrop::Blur => &[Backdrop::Blur, Backdrop::Acrylic],
            Backdrop::None => &[],
        }
    }

    fn effect(self) -> Option<Effect> {
        match self {
            Backdrop::Mica => Some(Effect::Mica),
            Backdrop::Acrylic => Some(Effect::Acrylic),
            Backdrop::Blur => Some(Effect::Blur),
            Backdrop::None => None,
        }
    }
}

impl From<Theme> for Mode {
    fn from(theme: Theme) -> Self {
        match theme {
            Theme::Light => Mode::Light,
            _ => Mode::Dark,
        }
    }
}

pub fn resolve(window: &WebviewWindow, preferred: Backdrop) -> Appearance {
    let mode = window.theme().map(Mode::from).unwrap_or(Mode::Dark);

    Appearance {
        backdrop: apply(window, preferred, mode),
        mode,
    }
}

fn apply(window: &WebviewWindow, preferred: Backdrop, mode: Mode) -> Backdrop {
    if !transparency_enabled() {
        let _ = window.set_effects(None);
        return Backdrop::None;
    }

    for candidate in preferred.chain() {
        let Some(effect) = candidate.effect() else {
            continue;
        };

        let mut builder = EffectsBuilder::new().effect(effect);

        if mode == Mode::Light {
            builder = builder.color(LIGHT_TINT);
        }

        if window.set_effects(builder.build()).is_ok() {
            round_corners(window);
            return *candidate;
        }
    }

    let _ = window.set_effects(None);
    Backdrop::None
}

#[cfg(windows)]
fn transparency_enabled() -> bool {
    use windows::Win32::System::Registry::{HKEY_CURRENT_USER, RRF_RT_REG_DWORD, RegGetValueW};
    use windows::core::w;

    let mut value: u32 = 1;
    let mut size = size_of::<u32>() as u32;

    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            w!(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"),
            w!("EnableTransparency"),
            RRF_RT_REG_DWORD,
            None,
            Some(&mut value as *mut u32 as *mut _),
            Some(&mut size),
        )
    };

    if status.is_ok() { value != 0 } else { true }
}

#[cfg(not(windows))]
fn transparency_enabled() -> bool {
    true
}

#[cfg(windows)]
fn round_corners(window: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{
        DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND, DwmSetWindowAttribute,
    };

    let Ok(handle) = window.hwnd() else {
        return;
    };

    let preference = DWMWCP_ROUND;

    unsafe {
        let _ = DwmSetWindowAttribute(
            HWND(handle.0 as _),
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &raw const preference as *const _,
            size_of_val(&preference) as u32,
        );
    }
}

#[cfg(not(windows))]
fn round_corners(_window: &WebviewWindow) {}
