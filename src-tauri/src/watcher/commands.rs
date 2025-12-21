use tauri::AppHandle;

use super::{start_watching, stop_watching, get_watched_path};

/// Start watching a repository for file changes
#[tauri::command]
pub fn start_file_watcher(app_handle: AppHandle, path: String) -> Result<(), String> {
    start_watching(app_handle, path)
}

/// Stop the file watcher
#[tauri::command]
pub fn stop_file_watcher(app_handle: AppHandle) -> Result<(), String> {
    stop_watching(&app_handle)
}

/// Get the currently watched repository path
#[tauri::command]
pub fn get_watched_repo_path(app_handle: AppHandle) -> Option<String> {
    get_watched_path(&app_handle)
}
