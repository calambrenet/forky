mod git;
mod system;
mod watcher;

use git::commands::{self as git_commands, AppState};
use system::commands as system_commands;
use watcher::commands as watcher_commands;
use watcher::WatcherState;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            current_repo_path: Mutex::new(None),
        })
        .manage(WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            git_commands::open_repository,
            git_commands::get_branches,
            git_commands::get_branch_heads,
            git_commands::get_commits,
            git_commands::get_file_status,
            git_commands::get_file_status_separated,
            git_commands::get_tags,
            git_commands::get_remotes,
            git_commands::get_repository_info,
            git_commands::get_working_diff,
            git_commands::get_commit_diff,
            git_commands::get_commit_files,
            git_commands::stage_file,
            git_commands::unstage_file,
            git_commands::git_pull,
            git_commands::git_push,
            git_commands::git_fetch,
            git_commands::git_fetch_with_options,
            git_commands::git_pull_with_options,
            git_commands::git_push_with_options,
            git_commands::add_ssh_known_host,
            git_commands::git_commit,
            git_commands::get_last_commit_message,
            git_commands::git_add_remote,
            git_commands::git_test_remote_connection,
            git_commands::git_checkout,
            git_commands::git_checkout_track,
            git_commands::git_create_branch,
            git_commands::git_create_tag,
            system_commands::get_system_theme,
            system_commands::open_in_terminal,
            watcher_commands::start_file_watcher,
            watcher_commands::stop_file_watcher,
            watcher_commands::get_watched_repo_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
