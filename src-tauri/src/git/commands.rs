use crate::git::repository::{
    self, BranchHead, BranchInfo, CommitInfo, CommitMessage, DiffInfo, FetchOptions, FileStatus,
    GitIdentity, GitOperationResult, HunkData, ImageContent, InteractiveRebaseEntry, PullOptions,
    PushOptions, RepositoryInfo, StashInfo, TagInfo,
};
use crate::git::validation::open_validated_repo;

#[tauri::command]
pub fn open_repository(path: String) -> Result<RepositoryInfo, String> {
    let repo = repository::open_repository(&path)?;
    let info = repository::get_repository_info(&repo)?;
    Ok(info)
}

#[tauri::command]
pub fn get_branches(repo_path: String) -> Result<Vec<BranchInfo>, String> {
    let repo = open_validated_repo(&repo_path)?;
    repository::get_branches(&repo)
}

#[tauri::command]
pub fn get_branch_heads(repo_path: String) -> Result<Vec<BranchHead>, String> {
    let repo = open_validated_repo(&repo_path)?;
    repository::get_branch_heads(&repo)
}

#[tauri::command]
pub fn get_commits(
    repo_path: String,
    limit: Option<usize>,
) -> Result<Vec<CommitInfo>, String> {
    let repo = open_validated_repo(&repo_path)?;
    repository::get_commits(&repo, limit.unwrap_or(100))
}

#[tauri::command]
pub fn get_file_status(repo_path: String) -> Result<Vec<FileStatus>, String> {
    let repo = open_validated_repo(&repo_path)?;
    repository::get_file_status(&repo)
}

#[tauri::command]
pub fn get_tags(repo_path: String) -> Result<Vec<TagInfo>, String> {
    let repo = open_validated_repo(&repo_path)?;
    repository::get_tags(&repo)
}

#[tauri::command]
pub fn get_remotes(repo_path: String) -> Result<Vec<String>, String> {
    let repo = open_validated_repo(&repo_path)?;
    repository::get_remotes(&repo)
}

#[tauri::command]
pub fn get_repository_info(repo_path: String) -> Result<RepositoryInfo, String> {
    let repo = open_validated_repo(&repo_path)?;
    repository::get_repository_info(&repo)
}

#[derive(serde::Serialize)]
pub struct FileStatusSeparated {
    pub unstaged: Vec<FileStatus>,
    pub staged: Vec<FileStatus>,
}

#[tauri::command]
pub fn get_file_status_separated(
    repo_path: String,
) -> Result<FileStatusSeparated, String> {
    let repo = open_validated_repo(&repo_path)?;
    let (unstaged, staged) = repository::get_file_status_separated(&repo)?;
    Ok(FileStatusSeparated { unstaged, staged })
}

#[tauri::command]
pub fn get_working_diff(
    repo_path: String,
    file_path: String,
    staged: bool,
    file_status: String,
) -> Result<DiffInfo, String> {
    let repo = open_validated_repo(&repo_path)?;

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
    repo_path: String,
    commit_id: String,
    file_path: String,
) -> Result<DiffInfo, String> {
    let repo = open_validated_repo(&repo_path)?;
    repository::get_commit_diff(&repo, &commit_id, &file_path)
}

#[tauri::command]
pub fn get_commit_files(
    repo_path: String,
    commit_id: String,
) -> Result<Vec<FileStatus>, String> {
    let repo = open_validated_repo(&repo_path)?;
    repository::get_commit_files(&repo, &commit_id)
}

#[tauri::command]
pub fn stage_file(repo_path: String, file_path: String) -> Result<(), String> {
    let repo = open_validated_repo(&repo_path)?;
    repository::stage_file(&repo, &file_path)
}

#[tauri::command]
pub fn unstage_file(repo_path: String, file_path: String) -> Result<(), String> {
    let repo = open_validated_repo(&repo_path)?;
    repository::unstage_file(&repo, &file_path)
}

#[tauri::command]
pub fn discard_file(
    repo_path: String,
    file_path: String,
    is_untracked: bool,
) -> Result<(), String> {
    repository::discard_file(&repo_path, &file_path, is_untracked)
}

#[tauri::command]
pub fn git_pull(repo_path: String) -> Result<GitOperationResult, String> {
    repository::git_pull(&repo_path)
}

#[tauri::command]
pub fn git_push(repo_path: String) -> Result<GitOperationResult, String> {
    repository::git_push(&repo_path)
}

#[tauri::command]
pub fn git_fetch(repo_path: String) -> Result<GitOperationResult, String> {
    repository::git_fetch(&repo_path)
}

#[tauri::command]
pub fn git_fetch_with_options(
    repo_path: String,
    remote: Option<String>,
    all: bool,
) -> Result<GitOperationResult, String> {
    repository::git_fetch_with_options(&repo_path, FetchOptions { remote, all })
}

#[tauri::command]
pub fn git_pull_with_options(
    repo_path: String,
    remote: String,
    branch: String,
    rebase: bool,
    autostash: bool,
) -> Result<GitOperationResult, String> {
    repository::git_pull_with_options(
        &repo_path,
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
    repo_path: String,
    branch: String,
    remote: String,
    remote_branch: String,
    push_tags: bool,
    force_with_lease: bool,
) -> Result<GitOperationResult, String> {
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
}

#[tauri::command]
pub fn add_ssh_known_host(host: String) -> Result<GitOperationResult, String> {
    repository::add_ssh_known_host(&host)
}

#[tauri::command]
pub fn git_commit(
    repo_path: String,
    message: String,
    amend: bool,
) -> Result<GitOperationResult, String> {
    repository::git_commit(&repo_path, &message, amend)
}

#[tauri::command]
pub fn get_last_commit_message(repo_path: String) -> Result<CommitMessage, String> {
    let repo = open_validated_repo(&repo_path)?;
    repository::get_last_commit_message(&repo)
}

#[tauri::command]
pub fn git_add_remote(
    repo_path: String,
    name: String,
    url: String,
) -> Result<GitOperationResult, String> {
    repository::git_add_remote(&repo_path, &name, &url)
}

#[tauri::command]
pub fn git_test_remote_connection(url: String) -> Result<GitOperationResult, String> {
    repository::git_test_remote_connection(&url)
}

#[tauri::command]
pub fn git_checkout(
    repo_path: String,
    branch_name: String,
) -> Result<GitOperationResult, String> {
    repository::git_checkout(&repo_path, &branch_name)
}

#[tauri::command]
pub fn git_checkout_with_stash(
    repo_path: String,
    branch_name: String,
    restore_changes: bool,
) -> Result<GitOperationResult, String> {
    repository::git_checkout_with_stash(&repo_path, &branch_name, restore_changes)
}

#[tauri::command]
pub fn git_checkout_track(
    repo_path: String,
    local_branch: String,
    remote_branch: String,
) -> Result<GitOperationResult, String> {
    repository::git_checkout_track(&repo_path, &local_branch, &remote_branch)
}

#[tauri::command]
pub fn git_create_branch(
    repo_path: String,
    branch_name: String,
    start_point: String,
    checkout: bool,
) -> Result<GitOperationResult, String> {
    repository::git_create_branch(&repo_path, &branch_name, &start_point, checkout)
}

#[tauri::command]
pub fn git_create_tag(
    repo_path: String,
    tag_name: String,
    start_point: String,
    message: Option<String>,
    push_to_remotes: bool,
) -> Result<GitOperationResult, String> {
    repository::git_create_tag(
        &repo_path,
        &tag_name,
        &start_point,
        message.as_deref(),
        push_to_remotes,
    )
}

#[tauri::command]
pub fn git_rename_branch(
    repo_path: String,
    old_name: String,
    new_name: String,
    rename_remote: bool,
    remote_name: Option<String>,
) -> Result<GitOperationResult, String> {
    repository::git_rename_branch(
        &repo_path,
        &old_name,
        &new_name,
        rename_remote,
        remote_name.as_deref(),
    )
}

#[tauri::command]
pub fn git_delete_branch(
    repo_path: String,
    branch_name: String,
    force: bool,
    delete_remote: bool,
    remote_name: Option<String>,
) -> Result<GitOperationResult, String> {
    repository::git_delete_branch(
        &repo_path,
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
pub fn get_stashes(repo_path: String) -> Result<Vec<StashInfo>, String> {
    repository::get_stashes(&repo_path)
}

#[tauri::command]
pub fn git_stash_save(
    repo_path: String,
    message: Option<String>,
    include_untracked: bool,
    keep_index: bool,
) -> Result<GitOperationResult, String> {
    repository::git_stash_save(&repo_path, message.as_deref(), include_untracked, keep_index)
}

#[tauri::command]
pub fn git_stash_apply(
    repo_path: String,
    stash_index: usize,
) -> Result<GitOperationResult, String> {
    repository::git_stash_apply(&repo_path, stash_index)
}

#[tauri::command]
pub fn git_stash_pop(
    repo_path: String,
    stash_index: usize,
) -> Result<GitOperationResult, String> {
    repository::git_stash_pop(&repo_path, stash_index)
}

#[tauri::command]
pub fn git_stash_drop(
    repo_path: String,
    stash_index: usize,
) -> Result<GitOperationResult, String> {
    repository::git_stash_drop(&repo_path, stash_index)
}

// ============================================================================
// Image Content Commands
// ============================================================================

#[tauri::command]
pub fn get_image_content(
    repo_path: String,
    file_path: String,
) -> Result<ImageContent, String> {
    let repo = open_validated_repo(&repo_path)?;
    repository::get_image_content(&repo, &file_path)
}

#[tauri::command]
pub fn get_image_from_head(
    repo_path: String,
    file_path: String,
) -> Result<ImageContent, String> {
    let repo = open_validated_repo(&repo_path)?;
    repository::get_image_from_head(&repo, &file_path)
}

#[tauri::command]
pub fn get_image_from_index(
    repo_path: String,
    file_path: String,
) -> Result<ImageContent, String> {
    let repo = open_validated_repo(&repo_path)?;
    repository::get_image_from_index(&repo, &file_path)
}

// ============================================================================
// Hunk Operations Commands
// ============================================================================

#[tauri::command]
pub fn stage_hunk(
    repo_path: String,
    file_path: String,
    hunk: HunkData,
) -> Result<(), String> {
    repository::stage_hunk(&repo_path, &file_path, hunk)
}

#[tauri::command]
pub fn unstage_hunk(
    repo_path: String,
    file_path: String,
    hunk: HunkData,
) -> Result<(), String> {
    repository::unstage_hunk(&repo_path, &file_path, hunk)
}

#[tauri::command]
pub fn discard_hunk(
    repo_path: String,
    file_path: String,
    hunk: HunkData,
) -> Result<(), String> {
    repository::discard_hunk(&repo_path, &file_path, hunk)
}

// ============================================================================
// Merge Commands
// ============================================================================

#[tauri::command]
pub fn get_merge_preview(
    repo_path: String,
    source_branch: String,
) -> Result<repository::MergePreview, String> {
    repository::get_merge_preview(&repo_path, &source_branch)
}

#[tauri::command]
pub fn git_merge(
    repo_path: String,
    source_branch: String,
    merge_type: String,
) -> Result<repository::GitOperationResult, String> {
    repository::git_merge(&repo_path, &source_branch, &merge_type)
}

#[tauri::command]
pub fn git_merge_abort(repo_path: String) -> Result<repository::GitOperationResult, String> {
    repository::git_merge_abort(&repo_path)
}

// ============================================================================
// REBASE COMMANDS
// ============================================================================

#[tauri::command]
pub fn get_rebase_preview(
    repo_path: String,
    target_branch: String,
) -> Result<repository::RebasePreview, String> {
    repository::get_rebase_preview(&repo_path, &target_branch)
}

#[tauri::command]
pub fn git_rebase(
    repo_path: String,
    target_branch: String,
    preserve_merges: bool,
    autostash: bool,
) -> Result<repository::GitOperationResult, String> {
    let options = repository::RebaseOptions {
        preserve_merges,
        autostash,
    };
    repository::git_rebase(&repo_path, &target_branch, options)
}

#[tauri::command]
pub fn git_rebase_abort(repo_path: String) -> Result<repository::GitOperationResult, String> {
    repository::git_rebase_abort(&repo_path)
}

#[tauri::command]
pub fn git_rebase_continue(
    repo_path: String,
) -> Result<repository::GitOperationResult, String> {
    repository::git_rebase_continue(&repo_path)
}

#[tauri::command]
pub fn get_interactive_rebase_commits(
    repo_path: String,
    target_branch: String,
) -> Result<Vec<InteractiveRebaseEntry>, String> {
    repository::get_interactive_rebase_commits(&repo_path, &target_branch)
}

#[tauri::command]
pub fn git_interactive_rebase(
    repo_path: String,
    target_branch: String,
    entries: Vec<InteractiveRebaseEntry>,
    autostash: bool,
) -> Result<repository::GitOperationResult, String> {
    repository::git_interactive_rebase(&repo_path, &target_branch, entries, autostash)
}

// ==================== Git Flow Commands ====================

#[tauri::command]
pub fn get_gitflow_config(repo_path: String) -> Result<repository::GitFlowConfig, String> {
    let repo = open_validated_repo(&repo_path)?;
    repository::get_gitflow_config(&repo)
}

#[tauri::command]
pub fn get_current_branch_flow_info(
    repo_path: String,
) -> Result<repository::CurrentBranchFlowInfo, String> {
    let repo = open_validated_repo(&repo_path)?;
    repository::get_current_branch_flow_info(&repo)
}

#[tauri::command]
pub fn git_flow_init(
    repo_path: String,
    master_branch: String,
    develop_branch: String,
    feature_prefix: String,
    release_prefix: String,
    hotfix_prefix: String,
    version_tag_prefix: String,
) -> Result<repository::GitOperationResult, String> {
    repository::git_flow_init(
        &repo_path,
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
    repo_path: String,
    flow_type: String,
    name: String,
    base_branch: Option<String>,
) -> Result<repository::GitOperationResult, String> {
    repository::git_flow_start(&repo_path, &flow_type, &name, base_branch.as_deref())
}

#[tauri::command]
pub fn git_flow_finish(
    repo_path: String,
    flow_type: String,
    name: String,
    delete_branch: bool,
) -> Result<repository::GitOperationResult, String> {
    repository::git_flow_finish(&repo_path, &flow_type, &name, delete_branch)
}

// ==================== Global Git Identity Commands ====================

#[tauri::command]
pub fn git_get_global_identity() -> Result<GitIdentity, String> {
    repository::git_get_global_identity()
}

#[tauri::command]
pub fn git_set_global_identity(
    name: String,
    email: String,
) -> Result<GitOperationResult, String> {
    repository::git_set_global_identity(&name, &email)
}

#[tauri::command]
pub fn git_fast_forward(
    repo_path: String,
    branch: String,
    remote: String,
) -> Result<repository::GitOperationResult, String> {
    repository::git_fast_forward(&repo_path, &branch, &remote)
}
