use std::process::Command;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn apply_no_window(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SystemTheme {
    pub theme: String,  // "light" or "dark"
    pub source: String, // where we got the theme from
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct GitStatus {
    pub installed: bool,
    pub version: Option<String>,
}

/// Checks if Git is installed on the system
#[tauri::command]
pub fn check_git_installed() -> GitStatus {
    let mut cmd = Command::new("git");
    cmd.arg("--version");
    apply_no_window(&mut cmd);

    match cmd.output() {
        Ok(output) => {
            if output.status.success() {
                let version_output = String::from_utf8_lossy(&output.stdout);
                // Parse version from "git version X.Y.Z"
                let version = version_output
                    .trim()
                    .strip_prefix("git version ")
                    .map(|v| v.to_string())
                    .or_else(|| Some(version_output.trim().to_string()));

                GitStatus {
                    installed: true,
                    version,
                }
            } else {
                GitStatus {
                    installed: false,
                    version: None,
                }
            }
        }
        Err(_) => GitStatus {
            installed: false,
            version: None,
        },
    }
}

#[cfg(target_os = "linux")]
fn find_in_path(binary: &str) -> Option<std::path::PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(binary);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// Opens a terminal emulator in the specified directory
#[tauri::command]
pub fn open_in_terminal(path: String) -> Result<(), String> {
    let target_dir = std::path::Path::new(&path);
    if !target_dir.is_dir() {
        return Err(format!("Directory does not exist: {}", path));
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", "Terminal", &path])
            .spawn()
            .map_err(|e| format!("Failed to open Terminal: {}", e))?;
        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        let mut wt = Command::new("wt");
        wt.args(["-d", &path]);
        if wt.spawn().is_ok() {
            return Ok(());
        }

        Command::new("cmd")
            .args(["/C", "start", "cmd"])
            .current_dir(target_dir)
            .spawn()
            .map_err(|e| format!("Failed to open terminal: {}", e))?;
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        let terminals: &[(&str, &[&str])] = &[
            ("kitty", &["--directory"]),
            ("alacritty", &["--working-directory"]),
            ("wezterm", &["start", "--cwd"]),
            ("gnome-terminal", &["--working-directory"]),
            ("kgx", &["--working-directory"]),
            ("konsole", &["--workdir"]),
            ("xfce4-terminal", &["--working-directory"]),
            ("tilix", &["--working-directory"]),
            ("terminator", &["--working-directory"]),
            ("mate-terminal", &["--working-directory"]),
            ("xterm", &[]),
            ("x-terminal-emulator", &[]),
        ];

        for (terminal, flag_args) in terminals {
            if let Some(bin_path) = find_in_path(terminal) {
                let mut cmd = Command::new(bin_path);
                cmd.current_dir(target_dir);
                if !flag_args.is_empty() {
                    cmd.args(*flag_args).arg(&path);
                }
                match cmd.spawn() {
                    Ok(_) => return Ok(()),
                    Err(e) => {
                        eprintln!("Failed to spawn {}: {}", terminal, e);
                    }
                }
            }
        }

        Err("No terminal emulator found. Please install a terminal like gnome-terminal, konsole, kitty, or alacritty.".to_string())
    }
}

/// Detects the system theme on macOS using the defaults system
#[cfg(target_os = "macos")]
fn get_macos_theme() -> SystemTheme {
    // `defaults read -g AppleInterfaceStyle` returns "Dark" in dark mode
    // and exits with code 1 (key not found) in light mode
    if let Ok(output) = Command::new("defaults")
        .args(["read", "-g", "AppleInterfaceStyle"])
        .output()
    {
        let is_dark = output.status.success()
            && String::from_utf8_lossy(&output.stdout)
                .trim()
                .eq_ignore_ascii_case("dark");
        return SystemTheme {
            theme: if is_dark { "dark" } else { "light" }.to_string(),
            source: "macos-defaults".to_string(),
        };
    }
    // If the command itself fails to run, fall back to light
    SystemTheme {
        theme: "light".to_string(),
        source: "macos-default".to_string(),
    }
}

/// macOS: detects system theme via `defaults read -g AppleInterfaceStyle`.
/// Returns "dark" if dark mode, "light" otherwise.
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn get_system_theme() -> Result<SystemTheme, String> {
    Ok(get_macos_theme())
}

/// Windows: detects system theme via registry `AppsUseLightTheme`.
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn get_system_theme() -> Result<SystemTheme, String> {
    let mut cmd = Command::new("reg");
    cmd.args([
        "query",
        r"HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
        "/v",
        "AppsUseLightTheme",
    ]);
    apply_no_window(&mut cmd);

    if let Ok(output) = cmd.output() {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            // 0x0 = dark, 0x1 = light
            let theme = if stdout.contains("0x0") { "dark" } else { "light" };
            return Ok(SystemTheme {
                theme: theme.to_string(),
                source: "windows-registry".to_string(),
            });
        }
    }

    Ok(SystemTheme {
        theme: "light".to_string(),
        source: "default".to_string(),
    })
}

/// Linux / other: detects system theme via GNOME settings, GTK theme, XDG portal, or env vars.
#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
#[tauri::command]
pub fn get_system_theme() -> Result<SystemTheme, String> {
    // Try GNOME color-scheme first (GNOME 42+, Ubuntu, Pop!_OS…)
    if let Ok(output) = Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", "color-scheme"])
        .output()
    {
        if output.status.success() {
            let result = String::from_utf8_lossy(&output.stdout);
            let theme = if result.contains("dark") { "dark" } else { "light" };
            return Ok(SystemTheme {
                theme: theme.to_string(),
                source: "gnome-color-scheme".to_string(),
            });
        }
    }

    // GTK theme name fallback
    if let Ok(output) = Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", "gtk-theme"])
        .output()
    {
        if output.status.success() {
            let result = String::from_utf8_lossy(&output.stdout).to_lowercase();
            let theme = if result.contains("dark") { "dark" } else { "light" };
            return Ok(SystemTheme {
                theme: theme.to_string(),
                source: "gtk-theme".to_string(),
            });
        }
    }

    // XDG portal (Flatpak / portal-aware apps)
    if let Ok(output) = Command::new("dbus-send")
        .args([
            "--session",
            "--print-reply=literal",
            "--dest=org.freedesktop.portal.Desktop",
            "/org/freedesktop/portal/desktop",
            "org.freedesktop.portal.Settings.Read",
            "string:org.freedesktop.appearance",
            "string:color-scheme",
        ])
        .output()
    {
        if output.status.success() {
            let result = String::from_utf8_lossy(&output.stdout);
            // uint32 1 = dark, uint32 0 = no preference, uint32 2 = light
            let theme = if result.contains("uint32 1") { "dark" } else { "light" };
            return Ok(SystemTheme {
                theme: theme.to_string(),
                source: "xdg-portal".to_string(),
            });
        }
    }

    // GTK_THEME env var as last resort
    if let Ok(gtk_theme) = std::env::var("GTK_THEME") {
        let theme = if gtk_theme.to_lowercase().contains("dark") { "dark" } else { "light" };
        return Ok(SystemTheme {
            theme: theme.to_string(),
            source: "env-gtk-theme".to_string(),
        });
    }

    Ok(SystemTheme {
        theme: "light".to_string(),
        source: "default".to_string(),
    })
}

/// Opens a folder picker dialog with proper parent window on macOS
#[tauri::command]
pub async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();

    let mut dialog = app.dialog().file().set_title("Select Git Repository");
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }

    dialog.pick_folder(move |folder_path| {
        let result = folder_path.map(|p| p.to_string());
        let _ = tx.send(result);
    });

    match tauri::async_runtime::spawn_blocking(move || rx.recv()).await {
        Ok(Ok(Some(path))) => Ok(Some(path)),
        Ok(Ok(None)) => Ok(None),
        _ => Err("Dialog was cancelled or failed".to_string()),
    }
}
