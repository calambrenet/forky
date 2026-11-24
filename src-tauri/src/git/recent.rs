use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;

static RECENT_LOCK: Mutex<()> = Mutex::new(());

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

fn normalize_path(path: &str) -> String {
    fs::canonicalize(path)
        .unwrap_or_else(|_| Path::new(path).to_path_buf())
        .to_string_lossy()
        .trim_end_matches(['/', '\\'])
        .to_string()
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

/// Añade o actualiza un repositorio en la lista de recientes de forma atómica.
/// Mantiene un máximo de 5 entradas ordenadas por última apertura.
pub fn add(app_handle: &tauri::AppHandle, path: &str, name: &str) -> Vec<RecentRepo> {
    let _guard = RECENT_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut repos = load(app_handle);

    let normalized_new = normalize_path(path);
    repos.retain(|r| normalize_path(&r.path) != normalized_new);

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    repos.insert(
        0,
        RecentRepo {
            path: path.trim_end_matches(['/', '\\']).to_string(),
            name: name.to_string(),
            last_opened: now,
        },
    );

    repos.truncate(5);

    if let Some(file_path) = recent_repos_file(app_handle) {
        if let Some(parent) = file_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(&repos) {
            let tmp_path = file_path.with_extension("json.tmp");
            if fs::write(&tmp_path, json).is_ok() {
                let _ = fs::rename(&tmp_path, &file_path);
            }
        }
    }

    repos
}
