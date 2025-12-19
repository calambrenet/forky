use std::process::Command;

#[derive(Debug, Clone, serde::Serialize)]
pub struct SystemTheme {
    pub theme: String, // "light" or "dark"
    pub source: String, // where we got the theme from
}

/// Detects the system theme on Linux by checking GNOME settings
#[tauri::command]
pub fn get_system_theme() -> Result<SystemTheme, String> {
    // Try GNOME settings first (works on GNOME, Ubuntu, Pop!_OS, etc.)
    if let Ok(output) = Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", "color-scheme"])
        .output()
    {
        if output.status.success() {
            let result = String::from_utf8_lossy(&output.stdout);
            let theme = if result.contains("dark") {
                "dark"
            } else {
                "light"
            };
            return Ok(SystemTheme {
                theme: theme.to_string(),
                source: "gnome-color-scheme".to_string(),
            });
        }
    }

    // Try GTK theme setting (fallback for other desktops)
    if let Ok(output) = Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", "gtk-theme"])
        .output()
    {
        if output.status.success() {
            let result = String::from_utf8_lossy(&output.stdout).to_lowercase();
            let theme = if result.contains("dark") {
                "dark"
            } else {
                "light"
            };
            return Ok(SystemTheme {
                theme: theme.to_string(),
                source: "gtk-theme".to_string(),
            });
        }
    }

    // Try reading XDG portal settings (for Flatpak/portal-aware apps)
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
            // The output contains "uint32 1" for dark, "uint32 0" for no preference, "uint32 2" for light
            let theme = if result.contains("uint32 1") {
                "dark"
            } else {
                "light"
            };
            return Ok(SystemTheme {
                theme: theme.to_string(),
                source: "xdg-portal".to_string(),
            });
        }
    }

    // Check environment variable as last resort
    if let Ok(gtk_theme) = std::env::var("GTK_THEME") {
        let theme = if gtk_theme.to_lowercase().contains("dark") {
            "dark"
        } else {
            "light"
        };
        return Ok(SystemTheme {
            theme: theme.to_string(),
            source: "env-gtk-theme".to_string(),
        });
    }

    // Default to light if we can't detect
    Ok(SystemTheme {
        theme: "light".to_string(),
        source: "default".to_string(),
    })
}
