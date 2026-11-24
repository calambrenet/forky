mod git;
mod system;
mod watcher;

use git::commands as git_commands;
#[cfg(not(target_os = "linux"))]
use std::sync::Mutex;
use system::commands as system_commands;
#[cfg(not(target_os = "linux"))]
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};
use watcher::commands as watcher_commands;
use watcher::WatcherState;

/// Keeps the menu item index -> repo path mapping in memory so clicking "Open Recent"
/// cannot open the wrong repo if `recent_repos.json` changed since menu construction.
#[cfg(not(target_os = "linux"))]
#[derive(Default)]
pub(crate) struct RecentMenuPaths(Mutex<Vec<String>>);

/// Reconstruye el menú nativo de la aplicación con la lista de repositorios recientes.
/// Se llama al inicio (desde setup) y cada vez que se abre un repositorio.
#[cfg(not(target_os = "linux"))]
pub(crate) fn rebuild_app_menu(
    app: &tauri::AppHandle,
    recent_repos: &[git::recent::RecentRepo],
) {
    let Ok(open_repo) = MenuItem::with_id(
        app,
        "open_repository",
        "Open Repository...",
        true,
        Some("CmdOrCtrl+O"),
    ) else {
        return;
    };

    // Submenú "Open Recent"
    let recent_items: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = if recent_repos.is_empty()
    {
        let Ok(empty) = MenuItem::with_id(
            app,
            "recent_empty",
            "No Recent Repositories",
            false,
            None::<&str>,
        ) else {
            return;
        };
        vec![Box::new(empty)]
    } else {
        let mut items: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = vec![];
        for (i, repo) in recent_repos.iter().enumerate() {
            let id = format!("recent_{}", i);
            let Ok(item) = MenuItem::with_id(app, id, &repo.name, true, None::<&str>) else {
                return;
            };
            items.push(Box::new(item));
        }
        items
    };

    let item_refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        recent_items.iter().map(|b| b.as_ref()).collect();

    let Ok(open_recent) = Submenu::with_items(app, "Open Recent", true, &item_refs) else {
        return;
    };

    // macOS app menu (uses MenuItem for About so `about_forky` emits `menu-about` to frontend)
    #[cfg(target_os = "macos")]
    let app_menu = {
        let (
            Ok(about),
            Ok(sep1),
            Ok(services),
            Ok(sep2),
            Ok(hide),
            Ok(hide_others),
            Ok(show_all),
            Ok(sep3),
            Ok(quit),
        ) = (
            MenuItem::with_id(app, "about_forky", "About Forky", true, None::<&str>),
            PredefinedMenuItem::separator(app),
            PredefinedMenuItem::services(app, Some("Services")),
            PredefinedMenuItem::separator(app),
            PredefinedMenuItem::hide(app, Some("Hide Forky")),
            PredefinedMenuItem::hide_others(app, Some("Hide Others")),
            PredefinedMenuItem::show_all(app, Some("Show All")),
            PredefinedMenuItem::separator(app),
            PredefinedMenuItem::quit(app, Some("Quit Forky")),
        )
        else {
            return;
        };
        let Ok(menu) = Submenu::with_items(
            app,
            "Forky",
            true,
            &[
                &about,
                &sep1,
                &services,
                &sep2,
                &hide,
                &hide_others,
                &show_all,
                &sep3,
                &quit,
            ],
        ) else {
            return;
        };
        menu
    };

    let file_menu = {
        let (Ok(sep), Ok(close_win)) = (
            PredefinedMenuItem::separator(app),
            PredefinedMenuItem::close_window(app, Some("Close Window")),
        ) else {
            return;
        };
        let Ok(menu) = Submenu::with_items(
            app,
            "File",
            true,
            &[&open_repo, &open_recent, &sep, &close_win],
        ) else {
            return;
        };
        menu
    };

    let edit_menu = {
        let (Ok(undo), Ok(redo), Ok(sep), Ok(cut), Ok(copy), Ok(paste), Ok(select_all)) = (
            PredefinedMenuItem::undo(app, Some("Undo")),
            PredefinedMenuItem::redo(app, Some("Redo")),
            PredefinedMenuItem::separator(app),
            PredefinedMenuItem::cut(app, Some("Cut")),
            PredefinedMenuItem::copy(app, Some("Copy")),
            PredefinedMenuItem::paste(app, Some("Paste")),
            PredefinedMenuItem::select_all(app, Some("Select All")),
        ) else {
            return;
        };
        let Ok(menu) = Submenu::with_items(
            app,
            "Edit",
            true,
            &[&undo, &redo, &sep, &cut, &copy, &paste, &select_all],
        ) else {
            return;
        };
        menu
    };

    let window_menu = {
        let (Ok(minimize), Ok(maximize), Ok(sep), Ok(fullscreen)) = (
            PredefinedMenuItem::minimize(app, Some("Minimize")),
            PredefinedMenuItem::maximize(app, Some("Zoom")),
            PredefinedMenuItem::separator(app),
            PredefinedMenuItem::fullscreen(app, Some("Enter Full Screen")),
        ) else {
            return;
        };
        let Ok(menu) = Submenu::with_items(
            app,
            "Window",
            true,
            &[&minimize, &maximize, &sep, &fullscreen],
        ) else {
            return;
        };
        menu
    };

    #[cfg(target_os = "macos")]
    let menu_result = Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &window_menu]);
    #[cfg(not(target_os = "macos"))]
    let menu_result = Menu::with_items(app, &[&file_menu, &edit_menu, &window_menu]);

    if let Ok(menu) = menu_result {
        if let Ok(mut paths) = app.state::<RecentMenuPaths>().0.lock() {
            *paths = recent_repos.iter().map(|r| r.path.clone()).collect();
        }
        let _ = app.set_menu(menu);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_decorum::init())
        .manage(WatcherState::default());

    #[cfg(not(target_os = "linux"))]
    let builder = builder.manage(RecentMenuPaths::default());

    builder
        .setup(|app| {
            // Cargar repositorios recientes del disco y construir menú nativo
            #[cfg(not(target_os = "linux"))]
            {
                let recent_repos = git::recent::load(app.handle());
                rebuild_app_menu(app.handle(), &recent_repos);
            }

            // Posición de los traffic lights en macOS
            #[cfg(target_os = "macos")]
            {
                use tauri_plugin_decorum::WebviewWindowExt;
                if let Some(main_window) = app.get_webview_window("main") {
                    let _ = main_window.set_traffic_lights_inset(12.0, 50.0);

                    let window_clone = main_window.clone();
                    main_window.on_window_event(move |event| {
                        if let tauri::WindowEvent::Resized(_) = event {
                            let _ = window_clone.set_traffic_lights_inset(12.0, 50.0);
                        }
                    });
                }
            }

            // En Linux, ventana sin decoraciones con titlebar personalizado
            #[cfg(target_os = "linux")]
            {
                if let Some(main_window) = app.get_webview_window("main") {
                    let _ = main_window.set_decorations(false);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            git_commands::open_repository,
            git_commands::get_recent_repos,
            git_commands::get_branches,
            git_commands::get_branch_heads,
            git_commands::get_repository_snapshot,
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
            git_commands::stage_files,
            git_commands::unstage_file,
            git_commands::unstage_files,
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
            git_commands::git_get_global_identity,
            git_commands::git_set_global_identity,
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
            let id = event.id().as_ref();
            if id == "open_repository" {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("menu-open-repository", ());
                }
            } else if id == "about_forky" {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("menu-about", ());
                }
            } else if let Some(index_str) = id.strip_prefix("recent_") {
                #[cfg(not(target_os = "linux"))]
                if let Ok(index) = index_str.parse::<usize>() {
                    let path_opt = app
                        .state::<RecentMenuPaths>()
                        .0
                        .lock()
                        .ok()
                        .and_then(|paths| paths.get(index).cloned());
                    if let Some(path) = path_opt {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("menu-open-recent-repo", path);
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
