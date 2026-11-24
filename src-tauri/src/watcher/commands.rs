use tauri::AppHandle;

use super::{get_watched_path, start_watching, stop_watching};

/// Start watching a repository for file changes
#[tauri::command]
pub async fn start_file_watcher(app_handle: AppHandle, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || start_watching(app_handle, path))
        .await
        .map_err(|e| format!("Background task failed: {}", e))?
}

/// Stop the file watcher
#[tauri::command]
pub async fn stop_file_watcher(app_handle: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || stop_watching(&app_handle))
        .await
        .map_err(|e| format!("Background task failed: {}", e))?
}

/// Get the currently watched repository path
#[tauri::command]
pub fn get_watched_repo_path(app_handle: AppHandle) -> Option<String> {
    get_watched_path(&app_handle)
}
