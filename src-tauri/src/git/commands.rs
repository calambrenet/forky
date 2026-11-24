use crate::git::repository::{
    self, BranchHead, BranchInfo, CommitInfo, CommitMessage, DiffInfo, FetchOptions, FileStatus,
    GitIdentity, GitOperationResult, HunkData, ImageContent, InteractiveRebaseEntry, PullOptions,
    PushOptions, RepositoryInfo, RepositorySnapshot, StashInfo, TagInfo,
};

async fn run_blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("Background task failed: {}", e))?
}

#[tauri::command]
pub async fn open_repository(
    path: String,
    record_recent: Option<bool>,
    app_handle: tauri::AppHandle,
) -> Result<RepositoryInfo, String> {
    let info = run_blocking(move || {
        let repo = repository::open_repository(&path)?;
        repository::get_repository_info(&repo)
    })
    .await?;

    if record_recent.unwrap_or(true) {
        let updated = crate::git::recent::add(&app_handle, &info.path, &info.name);
        #[cfg(not(target_os = "linux"))]
        crate::rebuild_app_menu(&app_handle, &updated);
    }

    Ok(info)
}

#[tauri::command]
pub async fn get_recent_repos(
    app_handle: tauri::AppHandle,
) -> Result<Vec<crate::git::recent::RecentRepo>, String> {
    run_blocking(move || Ok(crate::git::recent::load(&app_handle))).await
}

#[tauri::command]
pub async fn get_branches(repo_path: String) -> Result<Vec<BranchInfo>, String> {
    run_blocking(move || {
        let repo = repository::open_repository(&repo_path)?;
        repository::get_branches(&repo)
    })
    .await
}

#[tauri::command]
pub async fn get_branch_heads(repo_path: String) -> Result<Vec<BranchHead>, String> {
    run_blocking(move || {
        let repo = repository::open_repository(&repo_path)?;
        repository::get_branch_heads(&repo)
    })
    .await
}

#[tauri::command]
pub async fn get_repository_snapshot(repo_path: String) -> Result<RepositorySnapshot, String> {
    run_blocking(move || repository::get_repository_snapshot(&repo_path)).await
}

#[tauri::command]
pub async fn get_commits(
    repo_path: String,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<CommitInfo>, String> {
    run_blocking(move || {
        let repo = repository::open_repository(&repo_path)?;
        repository::get_commits(&repo, limit.unwrap_or(100), offset.unwrap_or(0))
    })
    .await
}

#[tauri::command]
pub async fn get_file_status(repo_path: String) -> Result<Vec<FileStatus>, String> {
    run_blocking(move || {
        let repo = repository::open_repository(&repo_path)?;
        repository::get_file_status(&repo)
    })
    .await
}

#[tauri::command]
pub async fn get_tags(repo_path: String) -> Result<Vec<TagInfo>, String> {
    run_blocking(move || {
        let repo = repository::open_repository(&repo_path)?;
        repository::get_tags(&repo)
    })
    .await
}

#[tauri::command]
pub async fn get_remotes(repo_path: String) -> Result<Vec<String>, String> {
    run_blocking(move || {
        let repo = repository::open_repository(&repo_path)?;
        repository::get_remotes(&repo)
    })
    .await
}

#[tauri::command]
pub async fn get_repository_info(repo_path: String) -> Result<RepositoryInfo, String> {
    run_blocking(move || {
        let repo = repository::open_repository(&repo_path)?;
        repository::get_repository_info(&repo)
    })
    .await
}

#[derive(serde::Serialize)]
pub struct FileStatusSeparated {
    pub unstaged: Vec<FileStatus>,
    pub staged: Vec<FileStatus>,
}

#[tauri::command]
pub async fn get_file_status_separated(repo_path: String) -> Result<FileStatusSeparated, String> {
    run_blocking(move || {
        let repo = repository::open_repository(&repo_path)?;
        let (unstaged, staged) = repository::get_file_status_separated(&repo)?;
        Ok(FileStatusSeparated { unstaged, staged })
    })
    .await
}

#[tauri::command]
pub async fn get_working_diff(
    repo_path: String,
    file_path: String,
    staged: bool,
    file_status: String,
) -> Result<DiffInfo, String> {
    run_blocking(move || {
        let repo = repository::open_repository(&repo_path)?;

        if file_status == "untracked" {
            return repository::get_untracked_file_diff(&repo, &file_path);
        }

        if file_status == "deleted" && !staged {
            return repository::get_deleted_file_diff(&repo, &file_path);
        }

        let diff = repository::get_working_diff(&repo, &file_path, staged)?;

        if diff.hunks.is_empty() && file_status == "new" {
            return repository::get_staged_new_file_diff(&repo, &file_path);
        }

        Ok(diff)
    })
    .await
}

#[tauri::command]
pub async fn get_commit_diff(
    repo_path: String,
    commit_id: String,
    file_path: String,
) -> Result<DiffInfo, String> {
    run_blocking(move || {
        let repo = repository::open_repository(&repo_path)?;
        repository::get_commit_diff(&repo, &commit_id, &file_path)
    })
    .await
}

#[tauri::command]
pub async fn get_commit_files(
    repo_path: String,
    commit_id: String,
) -> Result<Vec<FileStatus>, String> {
    run_blocking(move || {
        let repo = repository::open_repository(&repo_path)?;
        repository::get_commit_files(&repo, &commit_id)
    })
    .await
}

#[tauri::command]
pub async fn stage_file(repo_path: String, file_path: String) -> Result<(), String> {
    run_blocking(move || {
        let repo = repository::open_repository(&repo_path)?;
        repository::stage_file(&repo, &file_path)
    })
    .await
}

#[tauri::command]
pub async fn stage_files(repo_path: String, file_paths: Vec<String>) -> Result<(), String> {
    run_blocking(move || {
        let repo = repository::open_repository(&repo_path)?;
        repository::stage_files(&repo, &file_paths)
    })
    .await
}

#[tauri::command]
pub async fn unstage_file(repo_path: String, file_path: String) -> Result<(), String> {
    run_blocking(move || {
        let repo = repository::open_repository(&repo_path)?;
        repository::unstage_file(&repo, &file_path)
    })
    .await
}

#[tauri::command]
pub async fn unstage_files(repo_path: String, file_paths: Vec<String>) -> Result<(), String> {
    run_blocking(move || {
        let repo = repository::open_repository(&repo_path)?;
        repository::unstage_files(&repo, &file_paths)
    })
    .await
}

#[tauri::command]
pub async fn discard_file(
    repo_path: String,
    file_path: String,
    is_untracked: bool,
) -> Result<(), String> {
    run_blocking(move || repository::discard_file(&repo_path, &file_path, is_untracked)).await
}

#[tauri::command]
pub async fn git_pull(repo_path: String) -> Result<GitOperationResult, String> {
    run_blocking(move || repository::git_pull(&repo_path)).await
}

#[tauri::command]
pub async fn git_push(repo_path: String) -> Result<GitOperationResult, String> {
    run_blocking(move || repository::git_push(&repo_path)).await
}

#[tauri::command]
pub async fn git_fetch(repo_path: String) -> Result<GitOperationResult, String> {
    run_blocking(move || repository::git_fetch(&repo_path)).await
}

#[tauri::command]
pub async fn git_fetch_with_options(
    repo_path: String,
    remote: Option<String>,
    all: bool,
) -> Result<GitOperationResult, String> {
    run_blocking(move || {
        repository::git_fetch_with_options(&repo_path, FetchOptions { remote, all })
    })
    .await
}

#[tauri::command]
pub async fn git_pull_with_options(
    repo_path: String,
    remote: String,
    branch: String,
    rebase: bool,
    autostash: bool,
) -> Result<GitOperationResult, String> {
    run_blocking(move || {
        repository::git_pull_with_options(
            &repo_path,
            PullOptions {
                remote,
                branch,
                rebase,
                autostash,
            },
        )
    })
    .await
}

#[tauri::command]
pub async fn git_push_with_options(
    repo_path: String,
    branch: String,
    remote: String,
    remote_branch: String,
    push_tags: bool,
    force_with_lease: bool,
) -> Result<GitOperationResult, String> {
    run_blocking(move || {
        repository::git_push_with_options(
            &repo_path,
            PushOptions {
                branch,
                remote,
                remote_branch,
                push_tags,
                force_with_lease,
            },
        )
    })
    .await
}

#[tauri::command]
pub async fn add_ssh_known_host(
    host: String,
    expected_fingerprint: Option<String>,
) -> Result<GitOperationResult, String> {
    run_blocking(move || repository::add_ssh_known_host(&host, expected_fingerprint.as_deref()))
        .await
}

#[tauri::command]
pub async fn git_commit(
    repo_path: String,
    message: String,
    amend: bool,
) -> Result<GitOperationResult, String> {
    run_blocking(move || repository::git_commit(&repo_path, &message, amend)).await
}

#[tauri::command]
pub async fn get_last_commit_message(repo_path: String) -> Result<CommitMessage, String> {
    run_blocking(move || {
        let repo = repository::open_repository(&repo_path)?;
        repository::get_last_commit_message(&repo)
    })
    .await
}

#[tauri::command]
pub async fn git_add_remote(
    repo_path: String,
    name: String,
    url: String,
) -> Result<GitOperationResult, String> {
    run_blocking(move || repository::git_add_remote(&repo_path, &name, &url)).await
}

#[tauri::command]
pub async fn git_test_remote_connection(url: String) -> Result<GitOperationResult, String> {
    run_blocking(move || repository::git_test_remote_connection(&url)).await
}

#[tauri::command]
pub async fn git_checkout(
    repo_path: String,
    branch_name: String,
) -> Result<GitOperationResult, String> {
    run_blocking(move || repository::git_checkout(&repo_path, &branch_name)).await
}

#[tauri::command]
pub async fn git_checkout_with_stash(
    repo_path: String,
    branch_name: String,
    restore_changes: bool,
) -> Result<GitOperationResult, String> {
    run_blocking(move || {
        repository::git_checkout_with_stash(&repo_path, &branch_name, restore_changes)
    })
    .await
}

#[tauri::command]
pub async fn git_checkout_track(
    repo_path: String,
    local_branch: String,
    remote_branch: String,
) -> Result<GitOperationResult, String> {
    run_blocking(move || {
        repository::git_checkout_track(&repo_path, &local_branch, &remote_branch)
    })
    .await
}

#[tauri::command]
pub async fn git_create_branch(
    repo_path: String,
    branch_name: String,
    start_point: String,
    checkout: bool,
) -> Result<GitOperationResult, String> {
    run_blocking(move || {
        repository::git_create_branch(&repo_path, &branch_name, &start_point, checkout)
    })
    .await
}

#[tauri::command]
pub async fn git_create_tag(
    repo_path: String,
    tag_name: String,
    start_point: String,
    message: Option<String>,
    push_to_remotes: bool,
) -> Result<GitOperationResult, String> {
    run_blocking(move || {
        repository::git_create_tag(
            &repo_path,
            &tag_name,
            &start_point,
            message.as_deref(),
            push_to_remotes,
        )
    })
    .await
}

#[tauri::command]
pub async fn git_rename_branch(
    repo_path: String,
    old_name: String,
    new_name: String,
    rename_remote: bool,
    remote_name: Option<String>,
) -> Result<GitOperationResult, String> {
    run_blocking(move || {
        repository::git_rename_branch(
            &repo_path,
            &old_name,
            &new_name,
            rename_remote,
            remote_name.as_deref(),
        )
    })
    .await
}

#[tauri::command]
pub async fn git_delete_branch(
    repo_path: String,
    branch_name: String,
    force: bool,
    delete_remote: bool,
    remote_name: Option<String>,
) -> Result<GitOperationResult, String> {
    run_blocking(move || {
        repository::git_delete_branch(
            &repo_path,
            &branch_name,
            force,
            delete_remote,
            remote_name.as_deref(),
        )
    })
    .await
}

// ============================================================================
// Stash Commands
// ============================================================================

#[tauri::command]
pub async fn get_stashes(repo_path: String) -> Result<Vec<StashInfo>, String> {
    run_blocking(move || repository::get_stashes(&repo_path)).await
}

#[tauri::command]
pub async fn git_stash_save(
    repo_path: String,
    message: Option<String>,
    include_untracked: bool,
    keep_index: bool,
) -> Result<GitOperationResult, String> {
    run_blocking(move || {
        repository::git_stash_save(&repo_path, message.as_deref(), include_untracked, keep_index)
    })
    .await
}

#[tauri::command]
pub async fn git_stash_apply(
    repo_path: String,
    stash_index: usize,
) -> Result<GitOperationResult, String> {
    run_blocking(move || repository::git_stash_apply(&repo_path, stash_index)).await
}

#[tauri::command]
pub async fn git_stash_pop(
    repo_path: String,
    stash_index: usize,
) -> Result<GitOperationResult, String> {
    run_blocking(move || repository::git_stash_pop(&repo_path, stash_index)).await
}

#[tauri::command]
pub async fn git_stash_drop(
    repo_path: String,
    stash_index: usize,
) -> Result<GitOperationResult, String> {
    run_blocking(move || repository::git_stash_drop(&repo_path, stash_index)).await
}

// ============================================================================
// Image Content Commands
// ============================================================================

#[tauri::command]
pub async fn get_image_content(
    repo_path: String,
    file_path: String,
) -> Result<ImageContent, String> {
    run_blocking(move || {
        let repo = repository::open_repository(&repo_path)?;
        repository::get_image_content(&repo, &file_path)
    })
    .await
}

#[tauri::command]
pub async fn get_image_from_head(
    repo_path: String,
    file_path: String,
) -> Result<ImageContent, String> {
    run_blocking(move || {
        let repo = repository::open_repository(&repo_path)?;
        repository::get_image_from_head(&repo, &file_path)
    })
    .await
}

#[tauri::command]
pub async fn get_image_from_index(
    repo_path: String,
    file_path: String,
) -> Result<ImageContent, String> {
    run_blocking(move || {
        let repo = repository::open_repository(&repo_path)?;
        repository::get_image_from_index(&repo, &file_path)
    })
    .await
}

// ============================================================================
// Hunk Operations Commands
// ============================================================================

#[tauri::command]
pub async fn stage_hunk(repo_path: String, file_path: String, hunk: HunkData) -> Result<(), String> {
    run_blocking(move || repository::stage_hunk(&repo_path, &file_path, hunk)).await
}

#[tauri::command]
pub async fn unstage_hunk(
    repo_path: String,
    file_path: String,
    hunk: HunkData,
) -> Result<(), String> {
    run_blocking(move || repository::unstage_hunk(&repo_path, &file_path, hunk)).await
}

#[tauri::command]
pub async fn discard_hunk(
    repo_path: String,
    file_path: String,
    hunk: HunkData,
) -> Result<(), String> {
    run_blocking(move || repository::discard_hunk(&repo_path, &file_path, hunk)).await
}

// ============================================================================
// Merge Commands
// ============================================================================

#[tauri::command]
pub async fn get_merge_preview(
    repo_path: String,
    source_branch: String,
) -> Result<repository::MergePreview, String> {
    run_blocking(move || repository::get_merge_preview(&repo_path, &source_branch)).await
}

#[tauri::command]
pub async fn git_merge(
    repo_path: String,
    source_branch: String,
    merge_type: String,
) -> Result<repository::GitOperationResult, String> {
    run_blocking(move || repository::git_merge(&repo_path, &source_branch, &merge_type)).await
}

#[tauri::command]
pub async fn git_merge_abort(repo_path: String) -> Result<repository::GitOperationResult, String> {
    run_blocking(move || repository::git_merge_abort(&repo_path)).await
}

// ============================================================================
// REBASE COMMANDS
// ============================================================================

#[tauri::command]
pub async fn get_rebase_preview(
    repo_path: String,
    target_branch: String,
) -> Result<repository::RebasePreview, String> {
    run_blocking(move || repository::get_rebase_preview(&repo_path, &target_branch)).await
}

#[tauri::command]
pub async fn git_rebase(
    repo_path: String,
    target_branch: String,
    preserve_merges: bool,
    autostash: bool,
) -> Result<repository::GitOperationResult, String> {
    run_blocking(move || {
        let options = repository::RebaseOptions {
            preserve_merges,
            autostash,
        };
        repository::git_rebase(&repo_path, &target_branch, options)
    })
    .await
}

#[tauri::command]
pub async fn git_rebase_abort(repo_path: String) -> Result<repository::GitOperationResult, String> {
    run_blocking(move || repository::git_rebase_abort(&repo_path)).await
}

#[tauri::command]
pub async fn git_rebase_continue(
    repo_path: String,
) -> Result<repository::GitOperationResult, String> {
    run_blocking(move || repository::git_rebase_continue(&repo_path)).await
}

#[tauri::command]
pub async fn get_interactive_rebase_commits(
    repo_path: String,
    target_branch: String,
) -> Result<Vec<InteractiveRebaseEntry>, String> {
    run_blocking(move || repository::get_interactive_rebase_commits(&repo_path, &target_branch))
        .await
}

#[tauri::command]
pub async fn git_interactive_rebase(
    repo_path: String,
    target_branch: String,
    entries: Vec<InteractiveRebaseEntry>,
    autostash: bool,
) -> Result<repository::GitOperationResult, String> {
    run_blocking(move || {
        repository::git_interactive_rebase(&repo_path, &target_branch, entries, autostash)
    })
    .await
}

// ==================== Git Flow Commands ====================

#[tauri::command]
pub async fn get_gitflow_config(repo_path: String) -> Result<repository::GitFlowConfig, String> {
    run_blocking(move || {
        let repo = repository::open_repository(&repo_path)?;
        repository::get_gitflow_config(&repo)
    })
    .await
}

#[tauri::command]
pub async fn get_current_branch_flow_info(
    repo_path: String,
) -> Result<repository::CurrentBranchFlowInfo, String> {
    run_blocking(move || {
        let repo = repository::open_repository(&repo_path)?;
        repository::get_current_branch_flow_info(&repo)
    })
    .await
}

#[tauri::command]
pub async fn git_flow_init(
    repo_path: String,
    master_branch: String,
    develop_branch: String,
    feature_prefix: String,
    release_prefix: String,
    hotfix_prefix: String,
    version_tag_prefix: String,
) -> Result<repository::GitOperationResult, String> {
    run_blocking(move || {
        repository::git_flow_init(
            &repo_path,
            &master_branch,
            &develop_branch,
            &feature_prefix,
            &release_prefix,
            &hotfix_prefix,
            &version_tag_prefix,
        )
    })
    .await
}

#[tauri::command]
pub async fn git_flow_start(
    repo_path: String,
    flow_type: String,
    name: String,
    base_branch: Option<String>,
) -> Result<repository::GitOperationResult, String> {
    run_blocking(move || {
        repository::git_flow_start(&repo_path, &flow_type, &name, base_branch.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn git_flow_finish(
    repo_path: String,
    flow_type: String,
    name: String,
    delete_branch: bool,
) -> Result<repository::GitOperationResult, String> {
    run_blocking(move || repository::git_flow_finish(&repo_path, &flow_type, &name, delete_branch))
        .await
}

// ==================== Global Git Identity Commands ====================

#[tauri::command]
pub async fn git_get_global_identity() -> Result<GitIdentity, String> {
    run_blocking(repository::git_get_global_identity).await
}

#[tauri::command]
pub async fn git_set_global_identity(
    name: String,
    email: String,
) -> Result<GitOperationResult, String> {
    run_blocking(move || repository::git_set_global_identity(&name, &email)).await
}

#[tauri::command]
pub async fn git_fast_forward(
    repo_path: String,
    branch: String,
    remote: String,
) -> Result<repository::GitOperationResult, String> {
    run_blocking(move || repository::git_fast_forward(&repo_path, &branch, &remote)).await
}
