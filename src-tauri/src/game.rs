use crate::error::Result;
use crate::legendary;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use sysinfo::{ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const EVENT: &str = "game:changed";
const FAILED: &str = "game:failed";
const LOG_LINES: usize = 200;
const POLL: Duration = Duration::from_millis(1500);
const GRACE: u32 = 80;
const ARGS_FILE: &str = "launch.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchArgs {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub value: String,
}

fn args_path(handle: &AppHandle) -> Option<std::path::PathBuf> {
    let dir = legendary::config_dir(handle).ok()?;
    Some(dir.join(ARGS_FILE))
}

fn args_all(handle: &AppHandle) -> HashMap<String, LaunchArgs> {
    args_path(handle)
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn args_write(handle: &AppHandle, table: &HashMap<String, LaunchArgs>) {
    let Some(path) = args_path(handle) else {
        return;
    };

    if let Ok(raw) = serde_json::to_string_pretty(table) {
        let _ = std::fs::write(path, raw);
    }
}

fn split(value: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut quoted = false;

    for glyph in value.chars() {
        match glyph {
            '"' => quoted = !quoted,
            character if character.is_whitespace() && !quoted => {
                if !current.is_empty() {
                    parts.push(std::mem::take(&mut current));
                }
            }
            character => current.push(character),
        }
    }

    if !current.is_empty() {
        parts.push(current);
    }

    parts
}

#[tauri::command]
pub async fn launch_args_get(handle: AppHandle, app_name: String) -> Result<LaunchArgs> {
    Ok(args_all(&handle).remove(&app_name).unwrap_or_default())
}

#[tauri::command]
pub async fn launch_args_set(
    handle: AppHandle,
    app_name: String,
    args: LaunchArgs,
) -> Result<()> {
    let mut table = args_all(&handle);
    table.insert(app_name, args);
    args_write(&handle, &table);
    Ok(())
}

pub fn args_clear(handle: &AppHandle, app_name: &str) {
    let mut table = args_all(handle);

    if table.remove(app_name).is_some() {
        args_write(handle, &table);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
    Launching,
    Running,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub app_name: String,
    pub stage: Stage,
}

#[derive(Default)]
pub struct Games {
    sessions: Mutex<HashMap<String, Stage>>,
    children: Mutex<HashMap<String, CommandChild>>,
}

impl Games {
    fn snapshot(&self) -> Vec<Session> {
        let sessions = self.sessions.lock().unwrap();

        sessions
            .iter()
            .map(|(app_name, stage)| Session {
                app_name: app_name.clone(),
                stage: *stage,
            })
            .collect()
    }
}

fn publish(handle: &AppHandle) {
    let snapshot = handle.state::<Games>().snapshot();
    let _ = handle.emit(EVENT, snapshot);
}

fn install_path(handle: &AppHandle, app_name: &str) -> Option<String> {
    let dir = legendary::config_dir(handle).ok()?;
    let raw = std::fs::read_to_string(dir.join("installed.json")).ok()?;
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;

    value
        .get(app_name)?
        .get("install_path")?
        .as_str()
        .map(|path| path.to_lowercase())
}

fn running(system: &mut System, root: &str) -> Vec<sysinfo::Pid> {
    system.refresh_processes(ProcessesToUpdate::All, true);

    system
        .processes()
        .iter()
        .filter_map(|(pid, process)| {
            let exe = process.exe()?.to_string_lossy().to_lowercase();
            exe.starts_with(root).then_some(*pid)
        })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Failure {
    app_name: String,
    reason: String,
    outdated: bool,
}

fn reason_of(lines: &[String]) -> String {
    lines
        .iter()
        .rev()
        .find(|line| line.contains("ERROR"))
        .or_else(|| lines.last())
        .map(|line| line.rsplit("ERROR:").next().unwrap_or(line).trim().to_owned())
        .filter(|line| !line.is_empty())
        .unwrap_or_else(|| String::from("Legendary exited before the game started"))
}

fn fail(handle: &AppHandle, app_name: &str, lines: &[String]) {
    {
        let games = handle.state::<Games>();
        let mut sessions = games.sessions.lock().unwrap();

        if sessions.get(app_name) != Some(&Stage::Launching) {
            return;
        }

        sessions.remove(app_name);
        games.children.lock().unwrap().remove(app_name);
    }

    let reason = reason_of(lines);
    let outdated = reason.to_ascii_lowercase().contains("out of date");

    publish(handle);

    let _ = handle.emit(
        FAILED,
        Failure {
            app_name: app_name.to_owned(),
            reason,
            outdated,
        },
    );
}

fn observe(
    handle: AppHandle,
    app_name: String,
    mut stream: tauri::async_runtime::Receiver<CommandEvent>,
) {
    tauri::async_runtime::spawn(async move {
        let mut lines: Vec<String> = Vec::new();

        while let Some(event) = stream.recv().await {
            match event {
                CommandEvent::Stdout(raw) | CommandEvent::Stderr(raw) => {
                    for line in String::from_utf8_lossy(&raw).lines() {
                        let line = line.trim();

                        if !line.is_empty() {
                            lines.push(line.to_owned());
                        }
                    }

                    if lines.len() > LOG_LINES {
                        let excess = lines.len() - LOG_LINES;
                        lines.drain(..excess);
                    }
                }
                CommandEvent::Terminated(status) => {
                    if status.code.unwrap_or(0) != 0 {
                        fail(&handle, &app_name, &lines);
                    }

                    break;
                }
                _ => {}
            }
        }
    });
}

fn watch(handle: AppHandle, app_name: String, root: String) {
    tauri::async_runtime::spawn_blocking(move || {
        let mut system = System::new();
        let mut seen = false;
        let mut waited = 0;

        loop {
            std::thread::sleep(POLL);

            let live = !running(&mut system, &root).is_empty();

            if live && !seen {
                seen = true;

                handle
                    .state::<Games>()
                    .sessions
                    .lock()
                    .unwrap()
                    .insert(app_name.clone(), Stage::Running);

                publish(&handle);
                continue;
            }

            if !live && seen {
                crate::credentials::poke();
                break;
            }

            if !live && !seen {
                let abandoned = !handle
                    .state::<Games>()
                    .sessions
                    .lock()
                    .unwrap()
                    .contains_key(&app_name);

                waited += 1;

                if abandoned || waited >= GRACE {
                    break;
                }
            }
        }

        {
            let games = handle.state::<Games>();
            games.sessions.lock().unwrap().remove(&app_name);
            games.children.lock().unwrap().remove(&app_name);
        }

        publish(&handle);
    });
}

fn launch_arguments(handle: &AppHandle, app_name: &str) -> Vec<String> {
    let mut args = vec!["-y".to_owned(), "launch".to_owned(), app_name.to_owned()];

    if let Some(extra) = args_all(handle).get(app_name) {
        if extra.enabled {
            args.extend(split(&extra.value));
        }
    }

    args
}

#[tauri::command]
pub async fn game_launch(handle: AppHandle, app_name: String) -> Result<()> {
    {
        let games = handle.state::<Games>();
        let mut sessions = games.sessions.lock().unwrap();

        if sessions.contains_key(&app_name) {
            return Ok(());
        }

        sessions.insert(app_name.clone(), Stage::Launching);
    }

    let release = || {
        let games = handle.state::<Games>();
        games.sessions.lock().unwrap().remove(&app_name);
    };

    let dir = match legendary::config_dir(&handle) {
        Ok(dir) => dir,
        Err(error) => {
            release();
            return Err(error);
        }
    };

    let spawned = handle
        .shell()
        .sidecar("legendary")
        .and_then(|command| {
            command
                .env("LEGENDARY_CONFIG_PATH", dir.to_string_lossy().to_string())
                .args(launch_arguments(&handle, &app_name))
                .spawn()
        });

    let (stream, child) = match spawned {
        Ok(pair) => pair,
        Err(error) => {
            release();
            return Err(error.into());
        }
    };

    {
        let games = handle.state::<Games>();
        games.children.lock().unwrap().insert(app_name.clone(), child);
    }

    observe(handle.clone(), app_name.clone(), stream);

    publish(&handle);
    crate::credentials::poke();

    let Some(root) = install_path(&handle, &app_name) else {
        let games = handle.state::<Games>();
        games.sessions.lock().unwrap().remove(&app_name);
        games.children.lock().unwrap().remove(&app_name);
        publish(&handle);
        return Ok(());
    };

    watch(handle.clone(), app_name, root);
    Ok(())
}

#[tauri::command]
pub async fn game_stop(handle: AppHandle, app_name: String) -> Result<()> {
    let child = {
        let games = handle.state::<Games>();
        let child = games.children.lock().unwrap().remove(&app_name);
        child
    };

    if let Some(child) = child {
        let _ = child.kill();
    }

    if let Some(root) = install_path(&handle, &app_name) {
        let handle = handle.clone();
        let app_name = app_name.clone();

        tauri::async_runtime::spawn_blocking(move || {
            let mut system = System::new();

            for pid in running(&mut system, &root) {
                if let Some(process) = system.process(pid) {
                    process.kill();
                }
            }

            handle
                .state::<Games>()
                .sessions
                .lock()
                .unwrap()
                .remove(&app_name);

            publish(&handle);
        });
    } else {
        handle
            .state::<Games>()
            .sessions
            .lock()
            .unwrap()
            .remove(&app_name);

        publish(&handle);
    }

    Ok(())
}

#[tauri::command]
pub async fn game_list(handle: AppHandle) -> Result<Vec<Session>> {
    Ok(handle.state::<Games>().snapshot())
}
