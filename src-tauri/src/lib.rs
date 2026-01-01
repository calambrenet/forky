mod git;
mod system;
mod watcher;

use git::commands::{self as git_commands, AppState};
use std::sync::Mutex;
use system::commands as system_commands;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};
use watcher::commands as watcher_commands;
use watcher::WatcherState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_decorum::init())
        .setup(|app| {
            // Create custom menu
            let open_repo = MenuItem::with_id(
                app,
                "open_repository",
                "Open Repository...",
                true,
                Some("CmdOrCtrl+O"),
            )?;

            // macOS app menu (required as first menu on macOS)
            #[cfg(target_os = "macos")]
            let about_forky =
                MenuItem::with_id(app, "about_forky", "About Forky", true, None::<&str>)?;

            #[cfg(target_os = "macos")]
            let app_menu = Submenu::with_items(
                app,
                "Forky",
                true,
                &[
                    &about_forky,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, Some("Services"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, Some("Hide Forky"))?,
                    &PredefinedMenuItem::hide_others(app, Some("Hide Others"))?,
                    &PredefinedMenuItem::show_all(app, Some("Show All"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, Some("Quit Forky"))?,
                ],
            )?;

            let file_menu = Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &open_repo,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, Some("Close Window"))?,
                ],
            )?;

            let edit_menu = Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, Some("Undo"))?,
                    &PredefinedMenuItem::redo(app, Some("Redo"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, Some("Cut"))?,
                    &PredefinedMenuItem::copy(app, Some("Copy"))?,
                    &PredefinedMenuItem::paste(app, Some("Paste"))?,
                    &PredefinedMenuItem::select_all(app, Some("Select All"))?,
                ],
            )?;

            let window_menu = Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, Some("Minimize"))?,
                    &PredefinedMenuItem::maximize(app, Some("Zoom"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::fullscreen(app, Some("Enter Full Screen"))?,
                ],
            )?;

            #[cfg(target_os = "macos")]
            let menu = Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &window_menu])?;

            #[cfg(not(target_os = "macos"))]
            let menu = Menu::with_items(app, &[&file_menu, &edit_menu, &window_menu])?;

            app.set_menu(menu)?;
            // Set traffic light position on macOS
            #[cfg(target_os = "macos")]
            {
                use tauri_plugin_decorum::WebviewWindowExt;
                let main_window = app.get_webview_window("main").unwrap();
                main_window.set_traffic_lights_inset(12.0, 50.0).unwrap();

                // Reposition traffic lights on window resize
                let window_clone = main_window.clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Resized(_) = event {
                        let _ = window_clone.set_traffic_lights_inset(12.0, 50.0);
                    }
                });
            }

            // On Linux, use frameless window with custom titlebar
            #[cfg(target_os = "linux")]
            {
                use tauri::WebviewWindow;
                let main_window: WebviewWindow = app.get_webview_window("main").unwrap();
                main_window.set_decorations(false).unwrap();
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
            git_commands::get_gitflow_config,
            git_commands::get_current_branch_flow_info,
            git_commands::git_flow_init,
            git_commands::git_flow_start,
            git_commands::git_flow_finish,
            git_commands::git_fast_forward,
            system_commands::get_system_theme,
            system_commands::open_in_terminal,
            system_commands::check_git_installed,
            system_commands::pick_folder,
            watcher_commands::start_file_watcher,
            watcher_commands::stop_file_watcher,
            watcher_commands::get_watched_repo_path,
        ])
        .on_menu_event(|app, event| {
            if event.id() == "open_repository" {
                // Emit event to frontend to open the folder picker
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("menu-open-repository", ());
                }
            } else if event.id() == "about_forky" {
                // Emit event to frontend to open the About modal
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("menu-about", ());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
