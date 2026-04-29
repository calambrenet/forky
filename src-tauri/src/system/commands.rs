use std::process::Command;
use tauri_plugin_dialog::DialogExt;

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
    match Command::new("git").arg("--version").output() {
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

/// Opens a terminal emulator in the specified directory
#[tauri::command]
pub fn open_in_terminal(path: String) -> Result<(), String> {
    // Pre-compute the shell command for xterm-style terminals
    let shell_cmd = format!("cd '{}' && exec $SHELL", path);

    // List of common terminal emulators to try (in order of preference)
    let terminals: Vec<(&str, Vec<&str>)> = vec![
        // Modern terminals
        ("kitty", vec!["--directory", &path]),
        ("alacritty", vec!["--working-directory", &path]),
        ("wezterm", vec!["start", "--cwd", &path]),
        // GNOME
        ("gnome-terminal", vec!["--working-directory", &path]),
        ("kgx", vec!["--working-directory", &path]), // GNOME Console
        // KDE
        ("konsole", vec!["--workdir", &path]),
        // XFCE
        ("xfce4-terminal", vec!["--working-directory", &path]),
        // Other popular terminals
        ("tilix", vec!["--working-directory", &path]),
        ("terminator", vec!["--working-directory", &path]),
        ("mate-terminal", vec!["--working-directory", &path]),
        // Fallback
        ("xterm", vec!["-e", &shell_cmd]),
        ("x-terminal-emulator", vec!["-e", &shell_cmd]),
    ];

    for (terminal, args) in terminals.iter() {
        // Check if terminal exists
        if let Ok(output) = Command::new("which").arg(terminal).output() {
            if output.status.success() {
                // Terminal found, try to spawn it
                match Command::new(terminal).args(args.clone()).spawn() {
                    Ok(_) => return Ok(()),
                    Err(e) => {
                        // Log error but continue to next terminal
                        eprintln!("Failed to spawn {}: {}", terminal, e);
                        continue;
                    }
                }
            }
        }
    }

    Err("No terminal emulator found. Please install a terminal like gnome-terminal, konsole, kitty, or alacritty.".to_string())
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

/// Linux / other: detects system theme via GNOME settings, GTK theme, XDG portal, or env vars.
#[cfg(not(target_os = "macos"))]
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

    app.dialog()
        .file()
        .set_title("Select Git Repository")
        .pick_folder(move |folder_path| {
            let result = folder_path.map(|p| p.to_string());
            let _ = tx.send(result);
        });

    match rx.recv() {
        Ok(Some(path)) => Ok(Some(path)),
        Ok(None) => Ok(None),
        Err(_) => Err("Dialog was cancelled or failed".to_string()),
    }
}
