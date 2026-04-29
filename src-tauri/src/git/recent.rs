use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecentRepo {
    pub path: String,
    pub name: String,
    pub last_opened: i64,
}

fn recent_repos_file(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    app_handle
        .path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("recent_repos.json"))
}

/// Carga la lista de repositorios recientes desde disco.
/// Devuelve un Vec vacío si el archivo no existe o no se puede leer.
pub fn load(app_handle: &tauri::AppHandle) -> Vec<RecentRepo> {
    let path = match recent_repos_file(app_handle) {
        Some(p) => p,
        None => return vec![],
    };
    if !path.exists() {
        return vec![];
    }
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };
    serde_json::from_str(&content).unwrap_or_default()
}

/// Añade o actualiza un repositorio en la lista de recientes.
/// Mantiene un máximo de 5 entradas ordenadas por última apertura.
/// Devuelve la lista actualizada.
pub fn add(app_handle: &tauri::AppHandle, path: &str, name: &str) -> Vec<RecentRepo> {
    let mut repos = load(app_handle);

    // Eliminar entrada existente para este path
    repos.retain(|r| r.path != path);

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    repos.insert(
        0,
        RecentRepo {
            path: path.to_string(),
            name: name.to_string(),
            last_opened: now,
        },
    );

    repos.truncate(5);

    // Persistir en disco
    if let Some(file_path) = recent_repos_file(app_handle) {
        if let Some(parent) = file_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(&repos) {
            let _ = fs::write(file_path, json);
        }
    }

    repos
}
