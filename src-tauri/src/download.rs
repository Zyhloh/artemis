use crate::error::{Error, Result};
use crate::legendary;
use crate::process;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const EVENT: &str = "download:changed";
const STORE: &str = "downloads.json";
const FAILURE_LOG: &str = "last-failure.log";
const RECENT_LINES: usize = 80;
const DONE_MARKER: &str = "Finished installation process";
const ERROR_MARKERS: [&str; 3] = ["ERROR: ", "CRITICAL: ", "! Failure: "];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Install,
    Verify,
    Import,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
    Preparing,
    Downloading,
    Paused,
    Done,
    Failed,
}

impl Stage {
    fn settled(self) -> bool {
        matches!(self, Stage::Done | Stage::Failed)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub app_name: String,
    pub title: String,
    pub path: String,
    pub tags: Vec<String>,
    pub kind: Kind,
    pub fresh: bool,
    pub missing: u32,
    pub mismatched: u32,
    pub stage: Stage,
    pub percent: f64,
    pub downloaded: f64,
    pub written: f64,
    pub speed: f64,
    pub disk_write: f64,
    pub disk_read: f64,
    pub eta: String,
    pub message: Option<String>,
}

impl Job {
    fn new(
        app_name: String,
        title: String,
        path: String,
        tags: Vec<String>,
        kind: Kind,
        fresh: bool,
    ) -> Self {
        Self {
            app_name,
            title,
            path,
            tags,
            kind,
            fresh,
            missing: 0,
            mismatched: 0,
            stage: Stage::Preparing,
            percent: 0.0,
            downloaded: 0.0,
            written: 0.0,
            speed: 0.0,
            disk_write: 0.0,
            disk_read: 0.0,
            eta: String::new(),
            message: None,
        }
    }

    fn idle(&mut self) {
        self.speed = 0.0;
        self.disk_write = 0.0;
        self.disk_read = 0.0;
        self.eta = String::new();
    }
}

#[derive(Default)]
pub struct Queue {
    jobs: Mutex<HashMap<String, Job>>,
    children: Mutex<HashMap<String, CommandChild>>,
    roots: Mutex<HashMap<String, u32>>,
    failures: Mutex<HashMap<String, String>>,
}

impl Queue {
    fn snapshot(&self) -> Vec<Job> {
        let jobs = self.jobs.lock().unwrap();
        let mut list: Vec<Job> = jobs.values().cloned().collect();
        list.sort_by(|left, right| left.title.cmp(&right.title));
        list
    }
}

fn store_path(handle: &AppHandle) -> Result<PathBuf> {
    Ok(legendary::config_dir(handle)?.join(STORE))
}

fn persist(handle: &AppHandle, jobs: &[Job]) {
    let Ok(path) = store_path(handle) else {
        return;
    };

    let keep: Vec<&Job> = jobs.iter().filter(|job| !job.stage.settled()).collect();

    if let Ok(raw) = serde_json::to_string_pretty(&keep) {
        let _ = std::fs::write(path, raw);
    }
}

fn publish(handle: &AppHandle) {
    let snapshot = handle.state::<Queue>().snapshot();
    persist(handle, &snapshot);
    let _ = handle.emit(EVENT, snapshot);
}

fn number(text: &str) -> f64 {
    text.trim().parse::<f64>().unwrap_or(0.0)
}

fn between(line: &str, start: &str, end: &str) -> Option<String> {
    let tail = line.split(start).nth(1)?;

    let value = match end.is_empty() {
        true => tail,
        false => tail.split(end).next()?,
    };

    Some(value.to_owned())
}

fn tail(line: &str, marker: &str) -> Option<String> {
    let last = line.rsplit(marker).next()?;
    (line.contains(marker)).then(|| last.to_owned())
}

fn absorb(job: &mut Job, line: &str) {
    if line.contains("Verification progress:") {
        job.stage = Stage::Downloading;

        if let Some(chunk) = tail(line, "Verification progress: ") {
            let counts = chunk.split(" (").next().unwrap_or_default();
            let mut parts = counts.split('/');

            let done = number(parts.next().unwrap_or_default());
            let total = number(parts.next().unwrap_or_default());

            if total > 0.0 {
                job.percent = (done / total * 100.0).clamp(0.0, 100.0);
            }

            if let Some(value) = between(&chunk, "[", " MiB/s]") {
                job.speed = number(&value);
            }
        }
    }

    job.missing += line.matches("File is missing").count() as u32;
    job.mismatched += line.matches("does not match").count() as u32;

    if let Some(value) = between(line, "= Progress: ", "%") {
        job.percent = number(&value);
        job.stage = Stage::Downloading;
    }

    if let Some(value) = between(line, ", ETA: ", "") {
        job.eta = value.trim().to_owned();
    }

    if let Some(value) = between(line, "- Downloaded: ", " MiB") {
        job.downloaded = number(&value);
    }

    if let Some(value) = between(line, ", Written: ", " MiB") {
        job.written = number(&value);
    }

    if line.contains("+ Download") {
        if let Some(value) = between(line, "- ", " MiB/s (raw)") {
            job.speed = number(&value);
        }
    }

    if line.contains("+ Disk") {
        if let Some(value) = between(line, "- ", " MiB/s (write)") {
            job.disk_write = number(&value);
        }

        if let Some(value) = between(line, ") / ", " MiB/s (read)") {
            job.disk_read = number(&value);
        }
    }
}

fn arguments(job: &Job) -> Vec<String> {
    if job.kind == Kind::Verify {
        return vec!["verify".to_owned(), job.app_name.clone()];
    }

    if job.kind == Kind::Import {
        return vec![
            "-y".to_owned(),
            "import".to_owned(),
            "--with-dlcs".to_owned(),
            job.app_name.clone(),
            job.path.clone(),
        ];
    }

    let target = Path::new(&job.path);

    let base = target
        .parent()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_default();

    let folder = target
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| job.title.clone());

    let mut args = vec![
        "-y".to_owned(),
        "install".to_owned(),
        job.app_name.clone(),
        "--base-path".to_owned(),
        base,
        "--game-folder".to_owned(),
        folder,
    ];

    match job.tags.is_empty() {
        true => args.push("--skip-sdl".to_owned()),
        false => {
            for tag in &job.tags {
                args.push("--install-tag".to_owned());
                args.push(tag.clone());
            }
        }
    }

    args
}

fn launch(handle: &AppHandle, job: Job) -> Result<()> {
    let dir = legendary::config_dir(handle)?;
    let args = arguments(&job);
    let app_name = job.app_name.clone();

    let (mut stream, child) = handle
        .shell()
        .sidecar("legendary")?
        .env("LEGENDARY_CONFIG_PATH", dir.to_string_lossy().to_string())
        .args(args)
        .set_raw_out(true)
        .spawn()?;

    {
        let queue = handle.state::<Queue>();
        let pid = child.pid();

        queue.jobs.lock().unwrap().insert(app_name.clone(), job);
        queue.children.lock().unwrap().insert(app_name.clone(), child);
        queue.roots.lock().unwrap().insert(app_name.clone(), pid);
        queue.failures.lock().unwrap().remove(&app_name);
    }

    publish(handle);

    let sink = handle.clone();

    tauri::async_runtime::spawn(async move {
        let mut completed = false;
        let mut buffer = String::new();
        let mut recent: VecDeque<String> = VecDeque::new();
        let mut last = std::time::Instant::now();

        while let Some(event) = stream.recv().await {
            match event {
                CommandEvent::Stdout(raw) | CommandEvent::Stderr(raw) => {
                    buffer.push_str(&String::from_utf8_lossy(&raw));

                    let mut segments: Vec<String> = buffer
                        .split(|glyph: char| matches!(glyph as u32, 0x0d | 0x0a))
                        .map(str::to_owned)
                        .collect();

                    buffer = segments.pop().unwrap_or_default();

                    if buffer.len() > 8192 {
                        buffer.clear();
                    }

                    let mut moved = false;
                    let queue = sink.state::<Queue>();

                    for segment in segments {
                        if segment.trim().is_empty() {
                            continue;
                        }

                        if recent.len() == RECENT_LINES {
                            recent.pop_front();
                        }

                        recent.push_back(segment.clone());

                        if segment.contains(DONE_MARKER) {
                            completed = true;
                        }

                        if let Some(reason) = ERROR_MARKERS
                            .iter()
                            .find_map(|marker| between(&segment, marker, ""))
                        {
                            if !reason.contains("File is missing")
                                && !reason.contains("cannot proceed")
                            {
                                queue
                                    .failures
                                    .lock()
                                    .unwrap()
                                    .insert(app_name.clone(), reason.trim().to_owned());
                            }
                        }

                        let mut jobs = queue.jobs.lock().unwrap();

                        if let Some(job) = jobs.get_mut(&app_name) {
                            absorb(job, &segment);
                            moved = true;
                        }
                    }

                    if moved && last.elapsed() >= std::time::Duration::from_millis(350) {
                        last = std::time::Instant::now();
                        publish(&sink);
                    }
                }
                CommandEvent::Terminated(status) => {
                    let mut repair: Option<Job> = None;

                    {
                        let queue = sink.state::<Queue>();
                        queue.children.lock().unwrap().remove(&app_name);
                        queue.roots.lock().unwrap().remove(&app_name);

                        let reason = queue.failures.lock().unwrap().remove(&app_name);
                        let mut jobs = queue.jobs.lock().unwrap();

                        if let Some(job) = jobs.get_mut(&app_name) {
                            if job.stage != Stage::Paused {
                                if job.kind == Kind::Import {
                                    let ok = status.code == Some(0);
                                    let gaps = job.missing + job.mismatched;

                                    job.stage = match ok {
                                        true => Stage::Done,
                                        false => Stage::Failed,
                                    };

                                    job.percent = 100.0;
                                    job.message = match (ok, gaps) {
                                        (true, 0) => Some("Import complete".to_owned()),
                                        (true, count) => Some(format!(
                                            "Imported - fetching {count} missing file(s)"
                                        )),
                                        (false, _) => Some(reason.unwrap_or_else(|| {
                                            "That folder is not a valid install".to_owned()
                                        })),
                                    };

                                    if ok && gaps > 0 {
                                        repair = Some(Job::new(
                                            job.app_name.clone(),
                                            job.title.clone(),
                                            job.path.clone(),
                                            Vec::new(),
                                            Kind::Install,
                                            false,
                                        ));
                                    }
                                } else if job.kind == Kind::Verify {
                                    job.stage = Stage::Done;
                                    job.percent = 100.0;

                                    job.message = Some(match (job.mismatched, job.missing) {
                                        (0, 0) => "All files verified".to_owned(),
                                        (0, missing) => format!(
                                            "Verified - {missing} optional file(s) not installed"
                                        ),
                                        (bad, 0) => {
                                            format!("{bad} file(s) failed the hash check")
                                        }
                                        (bad, missing) => format!(
                                            "{bad} damaged, {missing} optional file(s) not installed"
                                        ),
                                    });
                                } else {
                                    let ok = completed || status.code == Some(0);

                                    job.stage = match ok {
                                        true => Stage::Done,
                                        false => Stage::Failed,
                                    };

                                    if ok {
                                        job.percent = 100.0;
                                        job.message = None;
                                    } else {
                                        record_failure(&sink, &app_name, &recent);
                                        job.message = Some(reason.unwrap_or_else(|| {
                                            "The download stopped unexpectedly".to_owned()
                                        }));
                                    }
                                }
                            }

                            job.idle();
                        }
                    }

                    publish(&sink);

                    if let Some(job) = repair {
                        let _ = launch(&sink, job);
                    }

                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

fn settle(path: &str, title: &str) -> String {
    let target = Path::new(path);

    match target.file_name() {
        Some(_) => path.to_owned(),
        None => target
            .join(crate::library::sanitise(title))
            .to_string_lossy()
            .into_owned(),
    }
}

fn record_failure(handle: &AppHandle, app_name: &str, lines: &VecDeque<String>) {
    let Ok(dir) = legendary::config_dir(handle) else {
        return;
    };

    let body = lines.iter().cloned().collect::<Vec<_>>().join("\n");
    let _ = std::fs::write(dir.join(FAILURE_LOG), format!("{app_name}\n{body}\n"));
}

fn installed(handle: &AppHandle, app_name: &str) -> bool {
    let Ok(dir) = legendary::config_dir(handle) else {
        return false;
    };

    let Ok(raw) = std::fs::read_to_string(dir.join("installed.json")) else {
        return false;
    };

    serde_json::from_str::<serde_json::Value>(&raw)
        .ok()
        .and_then(|value| value.get(app_name).cloned())
        .is_some()
}

#[tauri::command]
pub async fn download_start(
    handle: AppHandle,
    app_name: String,
    title: String,
    path: String,
    tags: Vec<String>,
) -> Result<()> {
    {
        let queue = handle.state::<Queue>();
        let jobs = queue.jobs.lock().unwrap();

        if let Some(existing) = jobs.get(&app_name) {
            if !existing.stage.settled() {
                return Ok(());
            }
        }
    }

    let fresh = !installed(&handle, &app_name);
    let path = settle(&path, &title);

    launch(
        &handle,
        Job::new(app_name, title, path, tags, Kind::Install, fresh),
    )
}

#[tauri::command]
pub async fn download_verify(
    handle: AppHandle,
    app_name: String,
    title: String,
) -> Result<()> {
    {
        let queue = handle.state::<Queue>();
        let jobs = queue.jobs.lock().unwrap();

        if let Some(existing) = jobs.get(&app_name) {
            if !existing.stage.settled() {
                return Ok(());
            }
        }
    }

    launch(
        &handle,
        Job::new(app_name, title, String::new(), Vec::new(), Kind::Verify, false),
    )
}

#[tauri::command]
pub async fn download_import(
    handle: AppHandle,
    app_name: String,
    title: String,
    path: String,
) -> Result<()> {
    {
        let queue = handle.state::<Queue>();
        let jobs = queue.jobs.lock().unwrap();

        if let Some(existing) = jobs.get(&app_name) {
            if !existing.stage.settled() {
                return Ok(());
            }
        }
    }

    launch(
        &handle,
        Job::new(app_name, title, path, Vec::new(), Kind::Import, false),
    )
}

#[tauri::command]
pub async fn download_pause(handle: AppHandle, app_name: String) -> Result<()> {
    let root = {
        let queue = handle.state::<Queue>();

        if let Some(job) = queue.jobs.lock().unwrap().get_mut(&app_name) {
            job.stage = Stage::Paused;
            job.idle();
        }

        let root = queue.roots.lock().unwrap().get(&app_name).copied();
        root
    };

    if let Some(root) = root {
        tauri::async_runtime::spawn_blocking(move || process::suspend(root))
            .await
            .ok();
    }

    publish(&handle);
    Ok(())
}

#[tauri::command]
pub async fn download_resume(handle: AppHandle, app_name: String) -> Result<()> {
    let suspended = {
        let queue = handle.state::<Queue>();
        let live = queue.children.lock().unwrap().contains_key(&app_name);
        let root = queue.roots.lock().unwrap().get(&app_name).copied();

        match live {
            true => root,
            false => None,
        }
    };

    if let Some(root) = suspended {
        tauri::async_runtime::spawn_blocking(move || process::resume(root))
            .await
            .ok();

        if let Some(job) = handle.state::<Queue>().jobs.lock().unwrap().get_mut(&app_name) {
            job.stage = Stage::Downloading;
        }

        publish(&handle);
        return Ok(());
    }

    let job = {
        let queue = handle.state::<Queue>();
        let jobs = queue.jobs.lock().unwrap();
        jobs.get(&app_name).cloned()
    };

    let Some(job) = job else {
        return Err(Error::Sidecar(
            "that download is no longer queued".to_owned(),
        ));
    };

    let restart = job.kind != Kind::Install;

    launch(
        &handle,
        Job {
            stage: Stage::Preparing,
            message: None,
            percent: if restart { 0.0 } else { job.percent },
            missing: if restart { 0 } else { job.missing },
            mismatched: if restart { 0 } else { job.mismatched },
            ..job
        },
    )
}

fn discard(path: &str) {
    let target = Path::new(path);

    let deep = target.components().count() > 2;
    let named = target.file_name().is_some();

    if deep && named && target.is_dir() {
        let _ = std::fs::remove_dir_all(target);
    }
}

#[tauri::command]
pub async fn download_cancel(handle: AppHandle, app_name: String) -> Result<()> {
    let (root, job) = {
        let queue = handle.state::<Queue>();
        let job = queue.jobs.lock().unwrap().remove(&app_name);
        queue.children.lock().unwrap().remove(&app_name);
        let root = queue.roots.lock().unwrap().remove(&app_name);
        (root, job)
    };

    if let Some(root) = root {
        tauri::async_runtime::spawn_blocking(move || process::terminate(root))
            .await
            .ok();
    }

    if let Ok(dir) = legendary::config_dir(&handle) {
        let tmp = dir.join("tmp");
        let _ = std::fs::remove_file(tmp.join(format!("{app_name}.resume")));
        let _ = std::fs::remove_file(tmp.join(format!("{app_name}_sdmeta.json")));
    }

    if let Some(job) = job {
        if job.fresh && job.kind == Kind::Install {
            let _ = legendary::run(&handle, &["-y", "uninstall", &job.app_name]).await;
            discard(&job.path);
        }
    }

    publish(&handle);
    Ok(())
}

#[tauri::command]
pub async fn download_clear(handle: AppHandle, app_name: String) -> Result<()> {
    handle
        .state::<Queue>()
        .jobs
        .lock()
        .unwrap()
        .remove(&app_name);

    publish(&handle);
    Ok(())
}

#[tauri::command]
pub async fn download_list(handle: AppHandle) -> Result<Vec<Job>> {
    Ok(handle.state::<Queue>().snapshot())
}

pub fn restore(handle: &AppHandle) {
    let Ok(path) = store_path(handle) else {
        return;
    };

    let Ok(raw) = std::fs::read_to_string(path) else {
        return;
    };

    let Ok(saved) = serde_json::from_str::<Vec<Job>>(&raw) else {
        return;
    };

    let queue = handle.state::<Queue>();
    let mut jobs = queue.jobs.lock().unwrap();

    for mut job in saved {
        job.stage = Stage::Paused;
        job.idle();
        jobs.insert(job.app_name.clone(), job);
    }
}
