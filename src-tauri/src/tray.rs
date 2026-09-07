use crate::settings::{self, CloseBehaviour};
use crate::window;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

pub const MENU: &str = "tray";
const TRAY_ID: &str = "artemis";
const NAVIGATE: &str = "tray:navigate";
const WIDTH: f64 = 216.0;
const HEIGHT: f64 = 262.0;
const OFFSET: f64 = 10.0;
const MARGIN: f64 = 8.0;

pub fn setup(handle: &AppHandle) -> tauri::Result<()> {
    let icon = handle
        .default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::AssetNotFound(String::from("tray icon")))?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip("Artemis")
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            let TrayIconEvent::Click {
                button,
                button_state: MouseButtonState::Up,
                position,
                ..
            } = event
            else {
                return;
            };

            let handle = tray.app_handle().clone();

            match button {
                MouseButton::Left => show_main(&handle),
                MouseButton::Right => popup(&handle, position),
                MouseButton::Middle => {}
            }
        })
        .build(handle)?;

    WebviewWindowBuilder::new(handle, MENU, WebviewUrl::App("index.html".into()))
        .title("Artemis")
        .inner_size(WIDTH, HEIGHT)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .visible(false)
        .focused(false)
        .build()?;

    Ok(())
}

fn popup(handle: &AppHandle, at: PhysicalPosition<f64>) {
    let Some(menu) = handle.get_webview_window(MENU) else {
        return;
    };

    let scale = menu.scale_factor().unwrap_or(1.0);
    let width = WIDTH * scale;
    let height = HEIGHT * scale;
    let offset = OFFSET * scale;
    let margin = MARGIN * scale;

    let mut x = at.x + offset;
    let mut y = at.y - height - offset;

    let monitor = menu
        .monitor_from_point(at.x, at.y)
        .ok()
        .flatten()
        .or_else(|| menu.primary_monitor().ok().flatten());

    if let Some(monitor) = monitor {
        let origin = monitor.position();
        let size = monitor.size();
        let left = f64::from(origin.x) + margin;
        let top = f64::from(origin.y) + margin;
        let right = f64::from(origin.x) + f64::from(size.width) - width - margin;

        if x > right {
            x = at.x - width - offset;
        }

        x = x.clamp(left, right.max(left));

        if y < top {
            y = at.y + offset;
        }
    }

    let _ = menu.set_position(PhysicalPosition::new(x.round(), y.round()));
    let _ = menu.show();
    let _ = menu.set_focus();
}

fn dismiss(handle: &AppHandle) {
    if let Some(menu) = handle.get_webview_window(MENU) {
        let _ = menu.hide();
    }
}

pub fn show_main(handle: &AppHandle) {
    let Some(main) = handle.get_webview_window(window::MAIN) else {
        return;
    };

    if main.is_minimized().unwrap_or(false) {
        let _ = main.unminimize();
    }

    let _ = main.show();
    let _ = main.set_focus();
}

pub fn handle_event(handle: &AppHandle, window: &tauri::Window, event: &WindowEvent) {
    match (window.label(), event) {
        (MENU, WindowEvent::Focused(false)) => dismiss(handle),
        (label, WindowEvent::CloseRequested { api, .. }) if label == window::MAIN => {
            match settings::load(handle).close_behaviour {
                CloseBehaviour::Quit => handle.exit(0),
                CloseBehaviour::Tray => {
                    api.prevent_close();
                    let _ = window.hide();
                }
                CloseBehaviour::Taskbar => {
                    api.prevent_close();
                    let _ = window.minimize();
                }
            }
        }
        _ => {}
    }
}

#[tauri::command]
pub fn tray_action(handle: AppHandle, target: String) {
    dismiss(&handle);

    if target == "quit" {
        handle.exit(0);
        return;
    }

    show_main(&handle);
    let _ = handle.emit_to(window::MAIN, NAVIGATE, target);
}

#[tauri::command]
pub fn startup_hidden(state: tauri::State<'_, Hidden>) -> bool {
    state.0
}

pub struct Hidden(pub bool);
