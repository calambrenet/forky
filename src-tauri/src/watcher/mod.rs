pub mod commands;

use notify_debouncer_mini::{
    new_debouncer, notify::RecommendedWatcher, notify::Watcher, DebouncedEventKind, Debouncer,
};
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// Event payload sent to frontend when files change
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChangeEvent {
    pub repo_path: String,
    pub timestamp: u64,
}

/// Event payload sent to frontend when branch changes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchChangeEvent {
    pub repo_path: String,
    pub timestamp: u64,
}

struct ActiveWatcher {
    _debouncer: Debouncer<RecommendedWatcher>,
    path: String,
}

/// State for the file watcher (single mutex prevents debouncer/path desync)
#[derive(Default)]
pub struct WatcherState {
    active: Mutex<Option<ActiveWatcher>>,
}

const IGNORED_COMPONENTS: &[&str] = &[
    "node_modules",
    "target",
    ".next",
    "dist",
    "build",
    "__pycache__",
    ".turbo",
];

const IGNORED_GIT_ENTRIES: &[&str] = &["objects", "logs", "hooks", "index.lock"];

fn relative_components<'a>(repo_root: &Path, path: &'a Path) -> Vec<&'a std::ffi::OsStr> {
    let rel = path.strip_prefix(repo_root).unwrap_or(path);
    rel.components()
        .filter_map(|c| match c {
            Component::Normal(s) => Some(s),
            _ => None,
        })
        .collect()
}

/// Check if a path relative to `repo_root` should be ignored (component-based, cross-platform)
pub(crate) fn should_ignore_path(repo_root: &Path, path: &Path) -> bool {
    let comps = relative_components(repo_root, path);
    if comps.is_empty() {
        return false;
    }

    for (idx, comp) in comps.iter().enumerate() {
        let Some(name) = comp.to_str() else {
            continue;
        };
        if IGNORED_COMPONENTS.contains(&name) {
            return true;
        }
        if name == ".git" {
            if let Some(next) = comps.get(idx + 1).and_then(|c| c.to_str()) {
                if IGNORED_GIT_ENTRIES.contains(&next) {
                    return true;
                }
            }
        }
    }

    false
}

/// Check if a path is the `.git/HEAD` file (branch checkout)
fn is_git_head_file(repo_root: &Path, path: &Path) -> bool {
    let comps = relative_components(repo_root, path);
    matches!(
        comps.as_slice(),
        [a, b] if a.to_str() == Some(".git") && b.to_str() == Some("HEAD")
    )
}

/// Check if a path is a git ref change that affects ahead/behind counts.
fn is_git_ref_change(repo_root: &Path, path: &Path) -> bool {
    let comps = relative_components(repo_root, path);
    let names: Vec<&str> = comps.iter().filter_map(|c| c.to_str()).collect();
    matches!(
        names.as_slice(),
        [".git", "refs", "remotes" | "heads", ..] | [".git", "FETCH_HEAD" | "packed-refs"]
    )
}

fn is_relevant_kind(kind: DebouncedEventKind) -> bool {
    matches!(
        kind,
        DebouncedEventKind::Any | DebouncedEventKind::AnyContinuous
    )
}

const MAX_SELECTIVE_WATCH_DEPTH: usize = 2;
const MAX_PROBE_ENTRIES: usize = 64;

/// Returns true if `dir` contains an ignored directory (e.g. `node_modules`, `target`)
/// within `remaining_depth` levels so we can watch selectively instead of blindly recursing.
fn contains_ignored_subdir(dir: &Path, remaining_depth: usize) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };

    for entry in entries.take(MAX_PROBE_ENTRIES).flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() || file_type.is_symlink() {
            continue;
        }
        let name = entry.file_name();
        let Some(name_str) = name.to_str() else {
            continue;
        };
        if name_str == ".git" {
            continue;
        }
        if IGNORED_COMPONENTS.contains(&name_str) {
            return true;
        }
        if remaining_depth > 1 && contains_ignored_subdir(&entry.path(), remaining_depth - 1) {
            return true;
        }
    }

    false
}

fn collect_subdir_watches(
    dir: &Path,
    depth: usize,
    targets: &mut Vec<(PathBuf, notify::RecursiveMode)>,
) {
    if depth >= MAX_SELECTIVE_WATCH_DEPTH || !contains_ignored_subdir(dir, MAX_SELECTIVE_WATCH_DEPTH - depth) {
        targets.push((dir.to_path_buf(), notify::RecursiveMode::Recursive));
        return;
    }

    targets.push((dir.to_path_buf(), notify::RecursiveMode::NonRecursive));
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() || file_type.is_symlink() {
            continue;
        }
        let name = entry.file_name();
        let Some(name_str) = name.to_str() else {
            continue;
        };
        if name_str == ".git" || IGNORED_COMPONENTS.contains(&name_str) {
            continue;
        }
        collect_subdir_watches(&entry.path(), depth + 1, targets);
    }
}

/// Build the selective list of `(path, mode)` watches for a repository root,
/// omitting `node_modules`, `target`, build outputs, `.git/objects`, and `.git/logs`.
pub(crate) fn collect_watch_targets(repo_root: &Path) -> Vec<(PathBuf, notify::RecursiveMode)> {
    let mut targets = vec![(repo_root.to_path_buf(), notify::RecursiveMode::NonRecursive)];

    let git_dir = repo_root.join(".git");
    if git_dir.is_dir() {
        targets.push((git_dir.clone(), notify::RecursiveMode::NonRecursive));
        let git_refs = git_dir.join("refs");
        if git_refs.is_dir() {
            targets.push((git_refs, notify::RecursiveMode::Recursive));
        }
    }

    if let Ok(entries) = std::fs::read_dir(repo_root) {
        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if !file_type.is_dir() || file_type.is_symlink() {
                continue;
            }
            let name = entry.file_name();
            let Some(name_str) = name.to_str() else {
                continue;
            };
            if name_str == ".git" || IGNORED_COMPONENTS.contains(&name_str) {
                continue;
            }
            collect_subdir_watches(&entry.path(), 0, &mut targets);
        }
    }

    targets
}

fn register_repo_watches(watcher: &mut dyn Watcher, repo_root: &Path) -> Result<(), String> {
    let targets = collect_watch_targets(repo_root);
    for (idx, (path, mode)) in targets.into_iter().enumerate() {
        if let Err(e) = watcher.watch(&path, mode) {
            if idx == 0 {
                return Err(format!("Failed to watch path: {}", e));
            }
            eprintln!("Warning: failed to watch {:?}: {}", path, e);
        }
    }
    Ok(())
}

/// Start watching a repository path for file changes
pub fn start_watching(app_handle: AppHandle, repo_path: String) -> Result<(), String> {
    let watcher_state = app_handle.state::<WatcherState>();
    let mut guard = watcher_state
        .active
        .lock()
        .map_err(|e| format!("Failed to lock watcher state: {}", e))?;

    // Drop any existing watcher atomically under the single lock
    *guard = None;

    let app_handle_clone = app_handle.clone();
    let repo_path_clone = repo_path.clone();
    // Canonicalize so strip_prefix matches real OS paths emitted by FSEvents/ReadDirectoryChangesW
    let repo_root =
        std::fs::canonicalize(&repo_path).unwrap_or_else(|_| PathBuf::from(&repo_path));
    let watch_target = repo_root.clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(500),
        move |result: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
            match result {
                Ok(events) => {
                    let timestamp = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();

                    let has_branch_change = events.iter().any(|e| {
                        is_relevant_kind(e.kind)
                            && (is_git_head_file(&repo_root, &e.path)
                                || is_git_ref_change(&repo_root, &e.path))
                    });

                    if has_branch_change {
                        let branch_event = BranchChangeEvent {
                            repo_path: repo_path_clone.clone(),
                            timestamp,
                        };

                        if let Err(e) = app_handle_clone.emit("repo-branch-changed", branch_event) {
                            eprintln!("Failed to emit branch change event: {}", e);
                        }
                    }

                    let has_file_changes = events.iter().any(|e| {
                        is_relevant_kind(e.kind)
                            && !should_ignore_path(&repo_root, &e.path)
                            && !is_git_head_file(&repo_root, &e.path)
                            && !is_git_ref_change(&repo_root, &e.path)
                    });

                    if has_file_changes {
                        let event = FileChangeEvent {
                            repo_path: repo_path_clone.clone(),
                            timestamp,
                        };

                        if let Err(e) = app_handle_clone.emit("repo-files-changed", event) {
                            eprintln!("Failed to emit file change event: {}", e);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("File watcher error: {:?}", e);
                }
            }
        },
    )
    .map_err(|e| format!("Failed to create debouncer: {}", e))?;

    // Start selective watching BEFORE storing so an error never leaves stale state
    register_repo_watches(debouncer.watcher(), &watch_target)?;

    *guard = Some(ActiveWatcher {
        _debouncer: debouncer,
        path: repo_path,
    });

    Ok(())
}

/// Stop the file watcher
pub fn stop_watching(app_handle: &AppHandle) -> Result<(), String> {
    let watcher_state = app_handle.state::<WatcherState>();
    let mut guard = watcher_state
        .active
        .lock()
        .map_err(|e| format!("Failed to lock watcher state: {}", e))?;
    *guard = None;
    Ok(())
}

/// Get the currently watched path
pub fn get_watched_path(app_handle: &AppHandle) -> Option<String> {
    let watcher_state = app_handle.state::<WatcherState>();
    let guard = watcher_state.active.lock().ok()?;
    guard.as_ref().map(|w| w.path.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_ignore_path_matches_components_not_substrings() {
        let root = Path::new("/Users/dev/builds/my-app");
        // Repo living under "builds/" and files containing "build"/"dist" must NOT be ignored
        assert!(!should_ignore_path(
            root,
            Path::new("/Users/dev/builds/my-app/src/buildConfig.ts")
        ));
        assert!(!should_ignore_path(
            root,
            Path::new("/Users/dev/builds/my-app/src/distance.rs")
        ));
        // Actual ignored directories and transient git internals MUST be ignored
        assert!(should_ignore_path(
            root,
            Path::new("/Users/dev/builds/my-app/build/output.js")
        ));
        assert!(should_ignore_path(
            root,
            Path::new("/Users/dev/builds/my-app/node_modules/pkg/index.js")
        ));
        assert!(should_ignore_path(
            root,
            Path::new("/Users/dev/builds/my-app/.git/objects/ab/1234")
        ));
        assert!(should_ignore_path(
            root,
            Path::new("/Users/dev/builds/my-app/.git/index.lock")
        ));
        assert!(!should_ignore_path(
            root,
            Path::new("/Users/dev/builds/my-app/.git/HEAD")
        ));
    }

    #[test]
    fn collect_watch_targets_omits_node_modules_target_and_git_objects() {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "forky_watcher_test_{}_{}",
            std::process::id(),
            nanos
        ));
        std::fs::create_dir_all(root.join(".git/objects")).unwrap();
        std::fs::create_dir_all(root.join(".git/logs")).unwrap();
        std::fs::create_dir_all(root.join(".git/refs/heads")).unwrap();
        std::fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        std::fs::create_dir_all(root.join("target/debug")).unwrap();
        std::fs::create_dir_all(root.join("src/components")).unwrap();
        std::fs::create_dir_all(root.join("src-tauri/target/debug")).unwrap();
        std::fs::create_dir_all(root.join("src-tauri/src")).unwrap();

        let targets = collect_watch_targets(&root);

        assert!(targets.contains(&(root.clone(), notify::RecursiveMode::NonRecursive)));
        assert!(targets.contains(&(root.join(".git"), notify::RecursiveMode::NonRecursive)));
        assert!(targets.contains(&(root.join(".git/refs"), notify::RecursiveMode::Recursive)));
        assert!(targets.contains(&(root.join("src"), notify::RecursiveMode::Recursive)));
        assert!(targets.contains(&(root.join("src-tauri"), notify::RecursiveMode::NonRecursive)));
        assert!(targets.contains(&(root.join("src-tauri/src"), notify::RecursiveMode::Recursive)));

        // Never watch node_modules, target, nested target, or .git/objects / .git/logs
        assert!(!targets.iter().any(|(p, _)| p.ends_with("node_modules")));
        assert!(!targets.iter().any(|(p, _)| p.ends_with("target")));
        assert!(!targets.iter().any(|(p, _)| p.ends_with("objects")));
        assert!(!targets.iter().any(|(p, _)| p.ends_with("logs")));

        let _ = std::fs::remove_dir_all(&root);
    }
}
