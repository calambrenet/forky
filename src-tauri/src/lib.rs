mod git;
mod system;
mod watcher;

use git::commands::{self as git_commands, AppState};
use system::commands as system_commands;
use watcher::commands as watcher_commands;
use watcher::WatcherState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_decorum::init())
        .setup(|app| {
            // Set traffic light position on macOS
            #[cfg(target_os = "macos")]
            {
                use tauri_plugin_decorum::WebviewWindowExt;
                let main_window = app.get_webview_window("main").unwrap();
                main_window.set_traffic_lights_inset(12.0, 50.0).unwrap();
            }

            // On Linux, use frameless window with custom titlebar and transparency for rounded corners
            #[cfg(target_os = "linux")]
            {
                use tauri::WebviewWindow;
                let main_window: WebviewWindow = app.get_webview_window("main").unwrap();
                main_window.set_decorations(false).unwrap();
                // Enable transparency for rounded corners to work properly
                let _ = main_window.set_background_color(Some(tauri::Color::TRANSPARENT));
            }

            Ok(())
        })
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
            git_commands::discard_file,
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
            git_commands::git_checkout_with_stash,
            git_commands::git_checkout_track,
            git_commands::git_create_branch,
            git_commands::git_create_tag,
            git_commands::git_rename_branch,
            git_commands::git_delete_branch,
            git_commands::get_stashes,
            git_commands::git_stash_save,
            git_commands::git_stash_apply,
            git_commands::git_stash_pop,
            git_commands::git_stash_drop,
            git_commands::git_checkout_with_stash,
            git_commands::get_image_content,
            git_commands::get_image_from_head,
            git_commands::get_image_from_index,
            git_commands::stage_hunk,
            git_commands::unstage_hunk,
            git_commands::discard_hunk,
            git_commands::get_merge_preview,
            git_commands::git_merge,
            git_commands::git_merge_abort,
            git_commands::get_rebase_preview,
            git_commands::git_rebase,
            git_commands::git_rebase_abort,
            git_commands::git_rebase_continue,
            git_commands::get_interactive_rebase_commits,
            git_commands::git_interactive_rebase,
            system_commands::get_system_theme,
            system_commands::open_in_terminal,
            system_commands::check_git_installed,
            system_commands::pick_folder,
            watcher_commands::start_file_watcher,
            watcher_commands::stop_file_watcher,
            watcher_commands::get_watched_repo_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
