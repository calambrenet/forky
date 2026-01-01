use crate::git::repository::{
    self, BranchHead, BranchInfo, CommitInfo, CommitMessage, DiffInfo, FetchOptions, FileStatus,
    GitOperationResult, HunkData, ImageContent, InteractiveRebaseEntry, PullOptions, PushOptions,
    RepositoryInfo, StashInfo, TagInfo,
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
pub fn get_commits(
    limit: Option<usize>,
    state: State<AppState>,
) -> Result<Vec<CommitInfo>, String> {
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
pub fn get_working_diff(
    file_path: String,
    staged: bool,
    file_status: String,
    state: State<AppState>,
) -> Result<DiffInfo, String> {
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
pub fn get_commit_diff(
    commit_id: String,
    file_path: String,
    state: State<AppState>,
) -> Result<DiffInfo, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let repo = repository::open_repository(path)?;
    repository::get_commit_diff(&repo, &commit_id, &file_path)
}

#[tauri::command]
pub fn get_commit_files(
    commit_id: String,
    state: State<AppState>,
) -> Result<Vec<FileStatus>, String> {
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
pub fn discard_file(
    file_path: String,
    is_untracked: bool,
    state: State<AppState>,
) -> Result<(), String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::discard_file(path, &file_path, is_untracked)
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
    repository::git_pull_with_options(
        path,
        PullOptions {
            remote,
            branch,
            rebase,
            autostash,
        },
    )
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
    repository::git_push_with_options(
        path,
        PushOptions {
            branch,
            remote,
            remote_branch,
            push_tags,
            force_with_lease,
        },
    )
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

#[tauri::command]
pub fn git_add_remote(
    name: String,
    url: String,
    state: State<AppState>,
) -> Result<GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_add_remote(path, &name, &url)
}

#[tauri::command]
pub fn git_test_remote_connection(url: String) -> Result<GitOperationResult, String> {
    repository::git_test_remote_connection(&url)
}

#[tauri::command]
pub fn git_checkout(
    branch_name: String,
    state: State<AppState>,
) -> Result<GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_checkout(path, &branch_name)
}

#[tauri::command]
pub fn git_checkout_with_stash(
    branch_name: String,
    restore_changes: bool,
    state: State<AppState>,
) -> Result<GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_checkout_with_stash(path, &branch_name, restore_changes)
}

#[tauri::command]
pub fn git_checkout_track(
    local_branch: String,
    remote_branch: String,
    state: State<AppState>,
) -> Result<GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_checkout_track(path, &local_branch, &remote_branch)
}

#[tauri::command]
pub fn git_create_branch(
    branch_name: String,
    start_point: String,
    checkout: bool,
    state: State<AppState>,
) -> Result<GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_create_branch(path, &branch_name, &start_point, checkout)
}

#[tauri::command]
pub fn git_create_tag(
    tag_name: String,
    start_point: String,
    message: Option<String>,
    push_to_remotes: bool,
    state: State<AppState>,
) -> Result<GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_create_tag(
        path,
        &tag_name,
        &start_point,
        message.as_deref(),
        push_to_remotes,
    )
}

#[tauri::command]
pub fn git_rename_branch(
    old_name: String,
    new_name: String,
    rename_remote: bool,
    remote_name: Option<String>,
    state: State<AppState>,
) -> Result<GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_rename_branch(
        path,
        &old_name,
        &new_name,
        rename_remote,
        remote_name.as_deref(),
    )
}

#[tauri::command]
pub fn git_delete_branch(
    branch_name: String,
    force: bool,
    delete_remote: bool,
    remote_name: Option<String>,
    state: State<AppState>,
) -> Result<GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_delete_branch(
        path,
        &branch_name,
        force,
        delete_remote,
        remote_name.as_deref(),
    )
}

// ============================================================================
// Stash Commands
// ============================================================================

#[tauri::command]
pub fn get_stashes(state: State<AppState>) -> Result<Vec<StashInfo>, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::get_stashes(path)
}

#[tauri::command]
pub fn git_stash_save(
    message: Option<String>,
    include_untracked: bool,
    keep_index: bool,
    state: State<AppState>,
) -> Result<GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_stash_save(path, message.as_deref(), include_untracked, keep_index)
}

#[tauri::command]
pub fn git_stash_apply(
    stash_index: usize,
    state: State<AppState>,
) -> Result<GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_stash_apply(path, stash_index)
}

#[tauri::command]
pub fn git_stash_pop(
    stash_index: usize,
    state: State<AppState>,
) -> Result<GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_stash_pop(path, stash_index)
}

#[tauri::command]
pub fn git_stash_drop(
    stash_index: usize,
    state: State<AppState>,
) -> Result<GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_stash_drop(path, stash_index)
}

// ============================================================================
// Image Content Commands
// ============================================================================

#[tauri::command]
pub fn get_image_content(
    file_path: String,
    state: State<AppState>,
) -> Result<ImageContent, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let repo = repository::open_repository(path)?;
    repository::get_image_content(&repo, &file_path)
}

#[tauri::command]
pub fn get_image_from_head(
    file_path: String,
    state: State<AppState>,
) -> Result<ImageContent, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let repo = repository::open_repository(path)?;
    repository::get_image_from_head(&repo, &file_path)
}

#[tauri::command]
pub fn get_image_from_index(
    file_path: String,
    state: State<AppState>,
) -> Result<ImageContent, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let repo = repository::open_repository(path)?;
    repository::get_image_from_index(&repo, &file_path)
}

// ============================================================================
// Hunk Operations Commands
// ============================================================================

#[tauri::command]
pub fn stage_hunk(file_path: String, hunk: HunkData, state: State<AppState>) -> Result<(), String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::stage_hunk(path, &file_path, hunk)
}

#[tauri::command]
pub fn unstage_hunk(
    file_path: String,
    hunk: HunkData,
    state: State<AppState>,
) -> Result<(), String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::unstage_hunk(path, &file_path, hunk)
}

#[tauri::command]
pub fn discard_hunk(
    file_path: String,
    hunk: HunkData,
    state: State<AppState>,
) -> Result<(), String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::discard_hunk(path, &file_path, hunk)
}

// ============================================================================
// Merge Commands
// ============================================================================

#[tauri::command]
pub fn get_merge_preview(
    source_branch: String,
    state: State<AppState>,
) -> Result<repository::MergePreview, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::get_merge_preview(path, &source_branch)
}

#[tauri::command]
pub fn git_merge(
    source_branch: String,
    merge_type: String,
    state: State<AppState>,
) -> Result<repository::GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_merge(path, &source_branch, &merge_type)
}

#[tauri::command]
pub fn git_merge_abort(state: State<AppState>) -> Result<repository::GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_merge_abort(path)
}

// ============================================================================
// REBASE COMMANDS
// ============================================================================

#[tauri::command]
pub fn get_rebase_preview(
    target_branch: String,
    state: State<AppState>,
) -> Result<repository::RebasePreview, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::get_rebase_preview(path, &target_branch)
}

#[tauri::command]
pub fn git_rebase(
    target_branch: String,
    preserve_merges: bool,
    autostash: bool,
    state: State<AppState>,
) -> Result<repository::GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let options = repository::RebaseOptions {
        preserve_merges,
        autostash,
    };
    repository::git_rebase(path, &target_branch, options)
}

#[tauri::command]
pub fn git_rebase_abort(state: State<AppState>) -> Result<repository::GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_rebase_abort(path)
}

#[tauri::command]
pub fn git_rebase_continue(
    state: State<AppState>,
) -> Result<repository::GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_rebase_continue(path)
}

#[tauri::command]
pub fn get_interactive_rebase_commits(
    target_branch: String,
    state: State<AppState>,
) -> Result<Vec<InteractiveRebaseEntry>, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::get_interactive_rebase_commits(path, &target_branch)
}

#[tauri::command]
pub fn git_interactive_rebase(
    target_branch: String,
    entries: Vec<InteractiveRebaseEntry>,
    autostash: bool,
    state: State<AppState>,
) -> Result<repository::GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_interactive_rebase(path, &target_branch, entries, autostash)
}

// ==================== Git Flow Commands ====================

#[tauri::command]
pub fn get_gitflow_config(state: State<AppState>) -> Result<repository::GitFlowConfig, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let repo = repository::open_repository(path)?;
    repository::get_gitflow_config(&repo)
}

#[tauri::command]
pub fn get_current_branch_flow_info(
    state: State<AppState>,
) -> Result<repository::CurrentBranchFlowInfo, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    let repo = repository::open_repository(path)?;
    repository::get_current_branch_flow_info(&repo)
}

#[tauri::command]
pub fn git_flow_init(
    master_branch: String,
    develop_branch: String,
    feature_prefix: String,
    release_prefix: String,
    hotfix_prefix: String,
    version_tag_prefix: String,
    state: State<AppState>,
) -> Result<repository::GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_flow_init(
        path,
        &master_branch,
        &develop_branch,
        &feature_prefix,
        &release_prefix,
        &hotfix_prefix,
        &version_tag_prefix,
    )
}

#[tauri::command]
pub fn git_flow_start(
    flow_type: String,
    name: String,
    base_branch: Option<String>,
    state: State<AppState>,
) -> Result<repository::GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_flow_start(path, &flow_type, &name, base_branch.as_deref())
}

#[tauri::command]
pub fn git_flow_finish(
    flow_type: String,
    name: String,
    delete_branch: bool,
    state: State<AppState>,
) -> Result<repository::GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_flow_finish(path, &flow_type, &name, delete_branch)
}

#[tauri::command]
pub fn git_fast_forward(
    branch: String,
    remote: String,
    state: State<AppState>,
) -> Result<repository::GitOperationResult, String> {
    let repo_path = state.current_repo_path.lock().unwrap();
    let path = repo_path.as_ref().ok_or("No repository opened")?;
    repository::git_fast_forward(path, &branch, &remote)
}
