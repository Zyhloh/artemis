mod accounts;
mod appearance;
mod commands;
mod config;
mod credentials;
mod download;
mod elevate;
mod game;
mod error;
mod legendary;
mod locker;
mod paths;
mod process;
mod profile;
mod settings;
mod startup;
mod tray;
mod update;
mod shop;
mod shortcut;
mod stream;
mod library;
mod window;

use appearance::{Appearance, Backdrop, Current};
use tauri_plugin_deep_link::DeepLinkExt;
use config::Config;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow, WindowEvent};

const APPEARANCE_EVENT: &str = "appearance:changed";

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let silent = argv.iter().any(|arg| launch_target(arg).is_some());

            if !silent {
                tray::show_main(app);
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Current::default())
        .manage(download::Queue::default())
        .manage(game::Games::default())
        .manage(Pending::default())
        .manage(shop::Shop::default())
        .manage(library::Library::default())
        .manage(update::Updates::default())
        .manage(profile::Profiles::default())
        .manage(locker::Lockers::default())
        .manage(stream::Streams::default())
        .setup(|app| {
            let handle = app.handle();
            let preferred = Config::load(handle)
                .map(|config| config.appearance.backdrop)
                .unwrap_or(Backdrop::Acrylic);

            app.manage(Preference(preferred));
            app.manage(tray::Hidden(startup::requested_hidden()));

            if let Err(cause) = tray::setup(handle) {
                println!("[tray] unavailable: {cause}");
            }

            let _ = handle.deep_link().register_all();

            {
                let owner = handle.clone();

                handle.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        deep_link(&owner, url.as_str());
                    }
                });
            }

            if let Ok(Some(urls)) = handle.deep_link().get_current() {
                for url in urls {
                    deep_link(handle, url.as_str());
                }
            }

            download::restore(handle);
            credentials::start(handle.clone());
            shop::start(handle.clone());
            profile::start(handle.clone());
            locker::start(handle);
            update::start(handle.clone());

            if let Some(main) = handle.get_webview_window(window::MAIN) {
                let resolved = appearance::resolve(&main, preferred);
                app.state::<Current>().set(resolved);
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            tray::handle_event(window.app_handle(), window, event);

            if window.label() != window::MAIN {
                return;
            }

            if let WindowEvent::ThemeChanged(_) | WindowEvent::Focused(true) = event {
                refresh(window.app_handle(), window);
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::get_config,
            commands::app::get_app_info,
            commands::app::get_appearance,
            settings::settings_get,
            settings::settings_update,
            tray::tray_action,
            update::update_status,
            update::update_check,
            update::update_install,
            tray::startup_hidden,
            settings::settings_set_install_root,
            shortcut::shortcut_create,
            stream::stream_open,
            stream::stream_send,
            stream::stream_close,
            shop::shop_snapshot,
            profile::profile_wallet,
            profile::profile_document,
            locker::locker_roster,
            locker::locker_remember,
            launch_pending,
            accounts::accounts_list,
            accounts::accounts_add,
            accounts::accounts_switch,
            accounts::accounts_remove,
            accounts::accounts_set_launcher,
            library::library_list,
            library::library_refresh,
            library::library_authenticate,
            library::library_account,
            library::library_sign_out,
            library::library_import,
            library::library_updates,
            library::library_verify,
            library::library_uninstall,
            library::library_reveal,
            library::install_default_path,
            library::install_prepare_path,
            library::install_probe_path,
            library::install_manifest,
            library::install_space,
            elevate::app_is_elevated,
            elevate::install_grant_path,
            download::download_start,
            download::download_verify,
            download::download_import,
            download::download_pause,
            download::download_resume,
            download::download_cancel,
            download::download_clear,
            download::download_clear_history,
            download::download_list,
            game::game_launch,
            game::game_stop,
            game::game_list,
            game::launch_args_get,
            game::launch_args_set,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start Artemis");
}

const LAUNCH_PREFIX: &str = "artemis://launch/";

fn launch_target(url: &str) -> Option<String> {
    let trimmed = url.trim();

    let rest = trimmed
        .strip_prefix(LAUNCH_PREFIX)
        .or_else(|| trimmed.strip_prefix("artemis:launch/"))?;

    let app_name = rest.trim_end_matches('/').trim().to_owned();

    (!app_name.is_empty()).then_some(app_name)
}

#[derive(Default)]
struct Pending(std::sync::Mutex<Option<String>>);

const LAUNCH_EVENT: &str = "launch:request";

#[tauri::command]
fn launch_pending(state: tauri::State<'_, Pending>) -> Option<String> {
    state.0.lock().ok().and_then(|mut slot| slot.take())
}

fn deep_link(handle: &AppHandle, url: &str) {
    let raw = url.to_owned();
    let owner = handle.clone();

    tauri::async_runtime::spawn(async move {
        let Some(app_name) = launch_target(&raw) else {
            return;
        };

        if let Ok(mut slot) = owner.state::<Pending>().0.lock() {
            slot.replace(app_name.clone());
        }

        let _ = owner.emit_to(window::MAIN, LAUNCH_EVENT, app_name);
    });
}

struct Preference(Backdrop);

fn refresh(handle: &AppHandle, window: &tauri::Window) {
    let Some(main) = handle.get_webview_window(window.label()) else {
        return;
    };

    let preferred = handle
        .try_state::<Preference>()
        .map(|state| state.0)
        .unwrap_or(Backdrop::Acrylic);

    let resolved = appearance::resolve(&main, preferred);

    if handle.state::<Current>().set(resolved) {
        announce(&main, resolved);
    }
}

fn announce(window: &WebviewWindow, resolved: Appearance) {
    let _ = window.emit(APPEARANCE_EVENT, resolved);
}
