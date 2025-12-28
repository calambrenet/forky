pub mod commands;

use notify_debouncer_mini::{
    new_debouncer, notify::RecommendedWatcher, DebouncedEventKind, Debouncer,
};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// Event payload sent to frontend when files change
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChangeEvent {
    pub repo_path: String,
    pub timestamp: u64,
}

/// Event payload sent to frontend when branch changes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchChangeEvent {
    pub repo_path: String,
    pub timestamp: u64,
}

/// State for the file watcher
pub struct WatcherState {
    pub debouncer: Mutex<Option<Debouncer<RecommendedWatcher>>>,
    pub watched_path: Mutex<Option<String>>,
}

impl Default for WatcherState {
    fn default() -> Self {
        Self {
            debouncer: Mutex::new(None),
            watched_path: Mutex::new(None),
        }
    }
}

/// Paths to ignore when watching for changes
const IGNORED_PATHS: &[&str] = &[
    ".git/objects",
    ".git/logs",
    ".git/hooks",
    ".git/refs",
    "node_modules",
    "target",
    ".next",
    "dist",
    "build",
    "__pycache__",
    ".turbo",
];

/// Check if a path should be ignored
fn should_ignore_path(path: &Path) -> bool {
    let path_str = path.to_string_lossy();
    IGNORED_PATHS
        .iter()
        .any(|ignored| path_str.contains(ignored))
}

/// Check if a path is the .git/HEAD file (indicates branch change)
fn is_git_head_file(path: &Path) -> bool {
    path.ends_with(".git/HEAD") || path.ends_with(".git\\HEAD")
}

/// Start watching a repository path for file changes
pub fn start_watching(app_handle: AppHandle, repo_path: String) -> Result<(), String> {
    let watcher_state = app_handle.state::<WatcherState>();

    // Stop any existing watcher first
    stop_watching_internal(&watcher_state)?;

    let app_handle_clone = app_handle.clone();
    let repo_path_clone = repo_path.clone();

    // Create debouncer with 500ms delay
    let debouncer = new_debouncer(
        Duration::from_millis(500),
        move |result: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
            match result {
                Ok(events) => {
                    let timestamp = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();

                    // Check for branch changes (.git/HEAD)
                    let has_branch_change = events
                        .iter()
                        .any(|e| e.kind == DebouncedEventKind::Any && is_git_head_file(&e.path));

                    if has_branch_change {
                        let branch_event = BranchChangeEvent {
                            repo_path: repo_path_clone.clone(),
                            timestamp,
                        };

                        if let Err(e) = app_handle_clone.emit("repo-branch-changed", branch_event) {
                            eprintln!("Failed to emit branch change event: {}", e);
                        }
                    }

                    // Filter out ignored paths for file changes
                    let relevant_events: Vec<_> = events
                        .iter()
                        .filter(|e| {
                            e.kind == DebouncedEventKind::Any
                                && !should_ignore_path(&e.path)
                                && !is_git_head_file(&e.path)
                        })
                        .collect();

                    if !relevant_events.is_empty() {
                        let event = FileChangeEvent {
                            repo_path: repo_path_clone.clone(),
                            timestamp,
                        };

                        // Emit event to frontend
                        if let Err(e) = app_handle_clone.emit("repo-files-changed", event) {
                            eprintln!("Failed to emit file change event: {}", e);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("File watcher error: {:?}", e);
                }
            }
        },
    )
    .map_err(|e| format!("Failed to create debouncer: {}", e))?;

    // Store the debouncer and path
    {
        let mut debouncer_guard = watcher_state
            .debouncer
            .lock()
            .map_err(|e| format!("Failed to lock debouncer: {}", e))?;
        *debouncer_guard = Some(debouncer);
    }

    {
        let mut path_guard = watcher_state
            .watched_path
            .lock()
            .map_err(|e| format!("Failed to lock watched_path: {}", e))?;
        *path_guard = Some(repo_path.clone());
    }

    // Start watching the repository path
    {
        let mut debouncer_guard = watcher_state
            .debouncer
            .lock()
            .map_err(|e| format!("Failed to lock debouncer: {}", e))?;

        if let Some(ref mut debouncer) = *debouncer_guard {
            debouncer
                .watcher()
                .watch(Path::new(&repo_path), notify::RecursiveMode::Recursive)
                .map_err(|e| format!("Failed to watch path: {}", e))?;
        }
    }

    Ok(())
}

/// Stop the file watcher
pub fn stop_watching(app_handle: &AppHandle) -> Result<(), String> {
    let watcher_state = app_handle.state::<WatcherState>();
    stop_watching_internal(&watcher_state)
}

fn stop_watching_internal(watcher_state: &WatcherState) -> Result<(), String> {
    let mut debouncer_guard = watcher_state
        .debouncer
        .lock()
        .map_err(|e| format!("Failed to lock debouncer: {}", e))?;

    // Drop the debouncer to stop watching
    *debouncer_guard = None;

    let mut path_guard = watcher_state
        .watched_path
        .lock()
        .map_err(|e| format!("Failed to lock watched_path: {}", e))?;
    *path_guard = None;

    Ok(())
}

/// Get the currently watched path
pub fn get_watched_path(app_handle: &AppHandle) -> Option<String> {
    let watcher_state = app_handle.state::<WatcherState>();
    let guard = watcher_state.watched_path.lock().ok()?;
    guard.clone()
}
