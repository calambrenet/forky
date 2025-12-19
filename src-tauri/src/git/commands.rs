use crate::git::repository::{
    self, BranchHead, BranchInfo, CommitInfo, CommitMessage, DiffInfo, FileStatus,
    GitOperationResult, RepositoryInfo, TagInfo, FetchOptions, PullOptions, PushOptions,
};
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub current_repo_path: Mutex<Option<String>>,
}

#[tauri::command]
pub fn open_repository(path: String, state: State<AppState>) -> Result<RepositoryInfo, String> {
    let repo = repository::open_repository(&path)?;
    let info = repository::get_repository_info(&repo)?;

    let mut repo_path = state.current_repo_path.lock().unwrap();
    *repo_path = Some(path);

    Ok(info)
}

#[tauri::command]
pub fn get_branches(state: State<AppState>) -> Result<Vec<BranchInfo>, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let repo = repository::open_repository(path)?;
    repository::get_branches(&repo)
}

#[tauri::command]
pub fn get_branch_heads(state: State<AppState>) -> Result<Vec<BranchHead>, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let repo = repository::open_repository(path)?;
    repository::get_branch_heads(&repo)
}

#[tauri::command]
pub fn get_commits(limit: Option<usize>, state: State<AppState>) -> Result<Vec<CommitInfo>, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let repo = repository::open_repository(path)?;
    repository::get_commits(&repo, limit.unwrap_or(100))
}

#[tauri::command]
pub fn get_file_status(state: State<AppState>) -> Result<Vec<FileStatus>, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let repo = repository::open_repository(path)?;
    repository::get_file_status(&repo)
}

#[tauri::command]
pub fn get_tags(state: State<AppState>) -> Result<Vec<TagInfo>, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let repo = repository::open_repository(path)?;
    repository::get_tags(&repo)
}

#[tauri::command]
pub fn get_remotes(state: State<AppState>) -> Result<Vec<String>, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let repo = repository::open_repository(path)?;
    repository::get_remotes(&repo)
}

#[tauri::command]
pub fn get_repository_info(state: State<AppState>) -> Result<RepositoryInfo, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let repo = repository::open_repository(path)?;
    repository::get_repository_info(&repo)
}

#[derive(serde::Serialize)]
pub struct FileStatusSeparated {
    pub unstaged: Vec<FileStatus>,
    pub staged: Vec<FileStatus>,
}

#[tauri::command]
pub fn get_file_status_separated(state: State<AppState>) -> Result<FileStatusSeparated, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let repo = repository::open_repository(path)?;
    let (unstaged, staged) = repository::get_file_status_separated(&repo)?;
    Ok(FileStatusSeparated { unstaged, staged })
}

#[tauri::command]
pub fn get_working_diff(file_path: String, staged: bool, file_status: String, state: State<AppState>) -> Result<DiffInfo, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let repo = repository::open_repository(path)?;

    // Handle untracked files - read the file content directly
    if file_status == "untracked" {
        return repository::get_untracked_file_diff(&repo, &file_path);
    }

    // Handle deleted files - get content from HEAD
    if file_status == "deleted" && !staged {
        return repository::get_deleted_file_diff(&repo, &file_path);
    }

    // Normal diff for modified files
    let diff = repository::get_working_diff(&repo, &file_path, staged)?;

    // If no hunks and status indicates a new or deleted file, try special handling
    if diff.hunks.is_empty() {
        if file_status == "new" {
            // Staged new file
            return repository::get_untracked_file_diff(&repo, &file_path);
        }
    }

    Ok(diff)
}

#[tauri::command]
pub fn get_commit_diff(commit_id: String, file_path: String, state: State<AppState>) -> Result<DiffInfo, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let repo = repository::open_repository(path)?;
    repository::get_commit_diff(&repo, &commit_id, &file_path)
}

#[tauri::command]
pub fn get_commit_files(commit_id: String, state: State<AppState>) -> Result<Vec<FileStatus>, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let repo = repository::open_repository(path)?;
    repository::get_commit_files(&repo, &commit_id)
}

#[tauri::command]
pub fn stage_file(file_path: String, state: State<AppState>) -> Result<(), String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let repo = repository::open_repository(path)?;
    repository::stage_file(&repo, &file_path)
}

#[tauri::command]
pub fn unstage_file(file_path: String, state: State<AppState>) -> Result<(), String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let repo = repository::open_repository(path)?;
    repository::unstage_file(&repo, &file_path)
}

#[tauri::command]
pub fn git_pull(state: State<AppState>) -> Result<GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_pull(path)
}

#[tauri::command]
pub fn git_push(state: State<AppState>) -> Result<GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_push(path)
}

#[tauri::command]
pub fn git_fetch(state: State<AppState>) -> Result<GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_fetch(path)
}

#[tauri::command]
pub fn git_fetch_with_options(
    remote: Option<String>,
    all: bool,
    state: State<AppState>,
) -> Result<GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_fetch_with_options(path, FetchOptions { remote, all })
}

#[tauri::command]
pub fn git_pull_with_options(
    remote: String,
    branch: String,
    rebase: bool,
    autostash: bool,
    state: State<AppState>,
) -> Result<GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_pull_with_options(path, PullOptions {
        remote,
        branch,
        rebase,
        autostash,
    })
}

#[tauri::command]
pub fn git_push_with_options(
    branch: String,
    remote: String,
    remote_branch: String,
    push_tags: bool,
    force_with_lease: bool,
    state: State<AppState>,
) -> Result<GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_push_with_options(path, PushOptions {
        branch,
        remote,
        remote_branch,
        push_tags,
        force_with_lease,
    })
}

#[tauri::command]
pub fn add_ssh_known_host(host: String) -> Result<GitOperationResult, String> {
    repository::add_ssh_known_host(&host)
}

#[tauri::command]
pub fn git_commit(
    message: String,
    amend: bool,
    state: State<AppState>,
) -> Result<GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_commit(path, &message, amend)
}

#[tauri::command]
pub fn get_last_commit_message(state: State<AppState>) -> Result<CommitMessage, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let repo = repository::open_repository(path)?;
    repository::get_last_commit_message(&repo)
}
