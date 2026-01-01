use chrono::{DateTime, TimeZone, Utc};
use git2::{BranchType, Repository, StatusOptions};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommitInfo {
    pub id: String,
    pub short_id: String,
    pub message: String,
    pub author: String,
    pub author_email: String,
    pub date: String,
    pub parent_ids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BranchInfo {
    pub name: String,
    pub is_head: bool,
    pub is_remote: bool,
    pub upstream: Option<String>,
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BranchHead {
    pub name: String,
    pub commit_sha: String,
    pub is_head: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TagInfo {
    pub name: String,
    pub commit_sha: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StashInfo {
    pub index: usize,
    pub id: String,
    pub message: String,
    pub branch: String,
    pub timestamp: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileStatus {
    pub path: String,
    pub status: String,
    pub staged: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RepositoryInfo {
    pub path: String,
    pub name: String,
    pub current_branch: Option<String>,
    pub is_bare: bool,
    pub is_empty: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiffInfo {
    pub file_path: String,
    pub old_content: Option<String>,
    pub new_content: Option<String>,
    pub hunks: Vec<DiffHunk>,
    pub is_binary: bool,
    pub binary_type: Option<String>, // "image", "other"
    pub file_size: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiffHunk {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiffLine {
    pub content: String,
    pub line_type: String, // "add", "delete", "context"
    pub old_line_no: Option<u32>,
    pub new_line_no: Option<u32>,
}

// Git Flow types
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitFlowConfig {
    pub initialized: bool,
    pub master_branch: String,
    pub develop_branch: String,
    pub feature_prefix: String,
    pub release_prefix: String,
    pub hotfix_prefix: String,
    pub version_tag_prefix: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum GitFlowBranchType {
    Feature,
    Release,
    Hotfix,
    Master,
    Develop,
    Other,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CurrentBranchFlowInfo {
    pub branch_type: GitFlowBranchType,
    pub name: String, // nombre sin prefijo (ej: "my-feature" de "feature/my-feature")
}

pub fn open_repository(path: &str) -> Result<Repository, String> {
    Repository::open(path).map_err(|e| e.message().to_string())
}

pub fn get_repository_info(repo: &Repository) -> Result<RepositoryInfo, String> {
    let path = repo.path().parent().unwrap_or(repo.path());
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    let current_branch = repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(|s| s.to_string()));

    Ok(RepositoryInfo {
        path: path.to_string_lossy().to_string(),
        name,
        current_branch,
        is_bare: repo.is_bare(),
        is_empty: repo.is_empty().unwrap_or(true),
    })
}

/// Helper function to calculate ahead/behind counts for a branch relative to its upstream
fn calculate_ahead_behind(
    repo: &Repository,
    local_branch: &git2::Branch,
    upstream_branch: &git2::Branch,
) -> (Option<u32>, Option<u32>) {
    let local_oid = match local_branch.get().peel_to_commit() {
        Ok(commit) => commit.id(),
        Err(_) => return (None, None),
    };

    let upstream_oid = match upstream_branch.get().peel_to_commit() {
        Ok(commit) => commit.id(),
        Err(_) => return (None, None),
    };

    match repo.graph_ahead_behind(local_oid, upstream_oid) {
        Ok((ahead, behind)) => (Some(ahead as u32), Some(behind as u32)),
        Err(_) => (None, None),
    }
}

pub fn get_branches(repo: &Repository) -> Result<Vec<BranchInfo>, String> {
    let mut branches = Vec::new();

    // Local branches
    if let Ok(local_branches) = repo.branches(Some(BranchType::Local)) {
        for branch in local_branches.flatten() {
            let (branch, _) = branch;
            if let Ok(name) = branch.name() {
                let name = name.unwrap_or("").to_string();
                let is_head = branch.is_head();

                // Get upstream and calculate ahead/behind
                let (upstream, ahead, behind) = match branch.upstream() {
                    Ok(upstream_branch) => {
                        let upstream_name =
                            upstream_branch.name().ok().flatten().map(|s| s.to_string());

                        let (ahead, behind) =
                            calculate_ahead_behind(repo, &branch, &upstream_branch);
                        (upstream_name, ahead, behind)
                    }
                    Err(_) => (None, None, None),
                };

                branches.push(BranchInfo {
                    name,
                    is_head,
                    is_remote: false,
                    upstream,
                    ahead,
                    behind,
                });
            }
        }
    }

    // Remote branches (no ahead/behind needed)
    if let Ok(remote_branches) = repo.branches(Some(BranchType::Remote)) {
        for branch in remote_branches.flatten() {
            let (branch, _) = branch;
            if let Ok(name) = branch.name() {
                let name = name.unwrap_or("").to_string();
                branches.push(BranchInfo {
                    name,
                    is_head: false,
                    is_remote: true,
                    upstream: None,
                    ahead: None,
                    behind: None,
                });
            }
        }
    }

    Ok(branches)
}

pub fn get_branch_heads(repo: &Repository) -> Result<Vec<BranchHead>, String> {
    let mut heads = Vec::new();

    // Local branches
    if let Ok(local_branches) = repo.branches(Some(BranchType::Local)) {
        for branch in local_branches.flatten() {
            let (branch, _) = branch;
            if let Ok(name) = branch.name() {
                if let Some(name) = name {
                    if let Ok(reference) = branch.get().peel_to_commit() {
                        heads.push(BranchHead {
                            name: name.to_string(),
                            commit_sha: reference.id().to_string(),
                            is_head: branch.is_head(),
                        });
                    }
                }
            }
        }
    }

    Ok(heads)
}

pub fn get_commits(repo: &Repository, limit: usize) -> Result<Vec<CommitInfo>, String> {
    let mut revwalk = repo.revwalk().map_err(|e| e.message().to_string())?;

    // Push all local branches to include all commits in the graph
    let mut has_branches = false;
    if let Ok(local_branches) = repo.branches(Some(BranchType::Local)) {
        for branch in local_branches.flatten() {
            let (branch, _) = branch;
            if let Ok(reference) = branch.get().peel_to_commit() {
                let _ = revwalk.push(reference.id());
                has_branches = true;
            }
        }
    }

    // Fallback to HEAD if no branches were pushed
    if !has_branches {
        revwalk.push_head().map_err(|e| e.message().to_string())?;
    }

    // Sort by topological order with time
    revwalk
        .set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME)
        .map_err(|e| e.message().to_string())?;

    let commits: Vec<CommitInfo> = revwalk
        .take(limit)
        .filter_map(|oid| oid.ok())
        .filter_map(|oid| repo.find_commit(oid).ok())
        .map(|commit| {
            let time = commit.time();
            let datetime: DateTime<Utc> = Utc.timestamp_opt(time.seconds(), 0).unwrap();

            CommitInfo {
                id: commit.id().to_string(),
                short_id: commit.id().to_string()[..7].to_string(),
                message: commit.message().unwrap_or("").trim().to_string(),
                author: commit.author().name().unwrap_or("Unknown").to_string(),
                author_email: commit.author().email().unwrap_or("").to_string(),
                date: datetime.format("%Y-%m-%d %H:%M:%S").to_string(),
                parent_ids: commit.parent_ids().map(|id| id.to_string()).collect(),
            }
        })
        .collect();

    Ok(commits)
}

pub fn get_file_status(repo: &Repository) -> Result<Vec<FileStatus>, String> {
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| e.message().to_string())?;
    let mut files = Vec::new();

    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let status = entry.status();

        let (status_str, staged) = if status.is_index_new() {
            ("new".to_string(), true)
        } else if status.is_index_modified() {
            ("modified".to_string(), true)
        } else if status.is_index_deleted() {
            ("deleted".to_string(), true)
        } else if status.is_wt_new() {
            ("untracked".to_string(), false)
        } else if status.is_wt_modified() {
            ("modified".to_string(), false)
        } else if status.is_wt_deleted() {
            ("deleted".to_string(), false)
        } else {
            ("unknown".to_string(), false)
        };

        files.push(FileStatus {
            path,
            status: status_str,
            staged,
        });
    }

    Ok(files)
}

pub fn get_tags(repo: &Repository) -> Result<Vec<TagInfo>, String> {
    let tags = repo.tag_names(None).map_err(|e| e.message().to_string())?;
    let mut result = Vec::new();

    for tag_name in tags.iter().flatten() {
        // Try to resolve the tag to a commit
        let refname = format!("refs/tags/{}", tag_name);
        if let Ok(reference) = repo.find_reference(&refname) {
            // Peel to commit to handle both lightweight and annotated tags
            if let Ok(commit) = reference.peel_to_commit() {
                result.push(TagInfo {
                    name: tag_name.to_string(),
                    commit_sha: commit.id().to_string(),
                });
            }
        }
    }

    Ok(result)
}

pub fn get_remotes(repo: &Repository) -> Result<Vec<String>, String> {
    let remotes = repo.remotes().map_err(|e| e.message().to_string())?;
    Ok(remotes.iter().filter_map(|r| r.map(String::from)).collect())
}

/// Get diff for a file in the working directory (unstaged changes)
pub fn get_working_diff(
    repo: &Repository,
    file_path: &str,
    staged: bool,
) -> Result<DiffInfo, String> {
    use git2::DiffOptions;

    let mut diff_opts = DiffOptions::new();
    diff_opts.pathspec(file_path);
    diff_opts.context_lines(3);

    let diff = if staged {
        // Staged changes: compare HEAD to index
        let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());

        repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut diff_opts))
            .map_err(|e| e.message().to_string())?
    } else {
        // Unstaged changes: compare index to working directory
        repo.diff_index_to_workdir(None, Some(&mut diff_opts))
            .map_err(|e| e.message().to_string())?
    };

    parse_diff(&diff, file_path)
}

/// Get diff for a file in a specific commit
pub fn get_commit_diff(
    repo: &Repository,
    commit_id: &str,
    file_path: &str,
) -> Result<DiffInfo, String> {
    use git2::{DiffOptions, Oid};

    let oid = Oid::from_str(commit_id).map_err(|e| e.message().to_string())?;
    let commit = repo.find_commit(oid).map_err(|e| e.message().to_string())?;
    let commit_tree = commit.tree().map_err(|e| e.message().to_string())?;

    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());

    let mut diff_opts = DiffOptions::new();
    diff_opts.pathspec(file_path);
    diff_opts.context_lines(3);

    let diff = repo
        .diff_tree_to_tree(
            parent_tree.as_ref(),
            Some(&commit_tree),
            Some(&mut diff_opts),
        )
        .map_err(|e| e.message().to_string())?;

    parse_diff(&diff, file_path)
}

/// Get files changed in a specific commit
pub fn get_commit_files(repo: &Repository, commit_id: &str) -> Result<Vec<FileStatus>, String> {
    use git2::{DiffOptions, Oid};

    let oid = Oid::from_str(commit_id).map_err(|e| e.message().to_string())?;
    let commit = repo.find_commit(oid).map_err(|e| e.message().to_string())?;
    let commit_tree = commit.tree().map_err(|e| e.message().to_string())?;

    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());

    let mut diff_opts = DiffOptions::new();

    let diff = repo
        .diff_tree_to_tree(
            parent_tree.as_ref(),
            Some(&commit_tree),
            Some(&mut diff_opts),
        )
        .map_err(|e| e.message().to_string())?;

    let mut files = Vec::new();

    diff.foreach(
        &mut |delta, _| {
            let path = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();

            let status = match delta.status() {
                git2::Delta::Added => "new",
                git2::Delta::Deleted => "deleted",
                git2::Delta::Modified => "modified",
                git2::Delta::Renamed => "renamed",
                git2::Delta::Copied => "copied",
                _ => "unknown",
            };

            files.push(FileStatus {
                path,
                status: status.to_string(),
                staged: false,
            });

            true
        },
        None,
        None,
        None,
    )
    .map_err(|e| e.message().to_string())?;

    Ok(files)
}

/// Check if a file is binary based on content
fn is_binary_content(content: &[u8]) -> bool {
    // Check for null bytes in the first 8000 bytes (git's approach)
    let check_len = std::cmp::min(content.len(), 8000);
    content[..check_len].contains(&0)
}

/// Get the binary type based on file extension
fn get_binary_type(file_path: &str) -> Option<String> {
    let lower = file_path.to_lowercase();
    if lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".gif")
        || lower.ends_with(".bmp")
        || lower.ends_with(".webp")
        || lower.ends_with(".svg")
        || lower.ends_with(".ico")
    {
        Some("image".to_string())
    } else if lower.ends_with(".pdf") {
        Some("pdf".to_string())
    } else {
        Some("other".to_string())
    }
}

/// Parse a git2 Diff into our DiffInfo structure
fn parse_diff(diff: &git2::Diff, file_path: &str) -> Result<DiffInfo, String> {
    use std::cell::RefCell;

    let hunks: RefCell<Vec<DiffHunk>> = RefCell::new(Vec::new());
    let is_binary: RefCell<bool> = RefCell::new(false);

    diff.foreach(
        &mut |delta, _| {
            // Check if the file is binary
            if delta.flags().is_binary() {
                *is_binary.borrow_mut() = true;
            }
            true
        },
        Some(&mut |_, _binary| {
            *is_binary.borrow_mut() = true;
            true
        }),
        Some(&mut |_, hunk| {
            let diff_hunk = DiffHunk {
                old_start: hunk.old_start(),
                old_lines: hunk.old_lines(),
                new_start: hunk.new_start(),
                new_lines: hunk.new_lines(),
                lines: Vec::new(),
            };
            hunks.borrow_mut().push(diff_hunk);
            true
        }),
        Some(&mut |_, _hunk, line| {
            let mut hunks_mut = hunks.borrow_mut();
            if let Some(current_hunk) = hunks_mut.last_mut() {
                let line_type = match line.origin() {
                    '+' => "add",
                    '-' => "delete",
                    ' ' => "context",
                    _ => "context",
                };

                let content = String::from_utf8_lossy(line.content()).to_string();

                current_hunk.lines.push(DiffLine {
                    content,
                    line_type: line_type.to_string(),
                    old_line_no: line.old_lineno(),
                    new_line_no: line.new_lineno(),
                });
            }
            true
        }),
    )
    .map_err(|e| e.message().to_string())?;

    let binary = *is_binary.borrow();
    let binary_type = if binary {
        get_binary_type(file_path)
    } else {
        None
    };

    Ok(DiffInfo {
        file_path: file_path.to_string(),
        old_content: None,
        new_content: None,
        hunks: hunks.into_inner(),
        is_binary: binary,
        binary_type,
        file_size: None,
    })
}

/// Read content of an untracked file and create diff info showing all lines as additions
pub fn get_untracked_file_diff(repo: &Repository, file_path: &str) -> Result<DiffInfo, String> {
    let workdir = repo.workdir().ok_or("No working directory")?;
    let full_path = workdir.join(file_path);

    // Read the file
    let content = std::fs::read(&full_path).map_err(|e| e.to_string())?;
    let file_size = content.len() as u64;

    // Check if binary
    if is_binary_content(&content) {
        return Ok(DiffInfo {
            file_path: file_path.to_string(),
            old_content: None,
            new_content: None,
            hunks: Vec::new(),
            is_binary: true,
            binary_type: get_binary_type(file_path),
            file_size: Some(file_size),
        });
    }

    // Convert to string and create diff lines
    let text = String::from_utf8_lossy(&content);
    let lines: Vec<&str> = text.lines().collect();

    let diff_lines: Vec<DiffLine> = lines
        .iter()
        .enumerate()
        .map(|(i, line)| DiffLine {
            content: format!("{}\n", line),
            line_type: "add".to_string(),
            old_line_no: None,
            new_line_no: Some((i + 1) as u32),
        })
        .collect();

    let hunk = DiffHunk {
        old_start: 0,
        old_lines: 0,
        new_start: 1,
        new_lines: lines.len() as u32,
        lines: diff_lines,
    };

    Ok(DiffInfo {
        file_path: file_path.to_string(),
        old_content: None,
        new_content: Some(text.to_string()),
        hunks: vec![hunk],
        is_binary: false,
        binary_type: None,
        file_size: Some(file_size),
    })
}

/// Get diff for a deleted file from the index, showing all lines as deletions
pub fn get_deleted_file_diff(repo: &Repository, file_path: &str) -> Result<DiffInfo, String> {
    // Get the file content from HEAD
    let head = repo.head().map_err(|e| e.message().to_string())?;
    let tree = head.peel_to_tree().map_err(|e| e.message().to_string())?;

    let entry = tree
        .get_path(std::path::Path::new(file_path))
        .map_err(|e| e.message().to_string())?;

    let blob = repo
        .find_blob(entry.id())
        .map_err(|e| e.message().to_string())?;
    let content = blob.content();
    let file_size = content.len() as u64;

    // Check if binary
    if blob.is_binary() || is_binary_content(content) {
        return Ok(DiffInfo {
            file_path: file_path.to_string(),
            old_content: None,
            new_content: None,
            hunks: Vec::new(),
            is_binary: true,
            binary_type: get_binary_type(file_path),
            file_size: Some(file_size),
        });
    }

    // Convert to string and create diff lines
    let text = String::from_utf8_lossy(content);
    let lines: Vec<&str> = text.lines().collect();

    let diff_lines: Vec<DiffLine> = lines
        .iter()
        .enumerate()
        .map(|(i, line)| DiffLine {
            content: format!("{}\n", line),
            line_type: "delete".to_string(),
            old_line_no: Some((i + 1) as u32),
            new_line_no: None,
        })
        .collect();

    let hunk = DiffHunk {
        old_start: 1,
        old_lines: lines.len() as u32,
        new_start: 0,
        new_lines: 0,
        lines: diff_lines,
    };

    Ok(DiffInfo {
        file_path: file_path.to_string(),
        old_content: Some(text.to_string()),
        new_content: None,
        hunks: vec![hunk],
        is_binary: false,
        binary_type: None,
        file_size: Some(file_size),
    })
}

/// Stage a file
pub fn stage_file(repo: &Repository, file_path: &str) -> Result<(), String> {
    let mut index = repo.index().map_err(|e| e.message().to_string())?;

    // Check if file exists or was deleted
    let workdir = repo.workdir().ok_or("No working directory")?;
    let full_path = workdir.join(file_path);

    if full_path.exists() {
        index
            .add_path(std::path::Path::new(file_path))
            .map_err(|e| e.message().to_string())?;
    } else {
        // File was deleted, remove from index
        index
            .remove_path(std::path::Path::new(file_path))
            .map_err(|e| e.message().to_string())?;
    }

    index.write().map_err(|e| e.message().to_string())?;
    Ok(())
}

/// Unstage a file
pub fn unstage_file(repo: &Repository, file_path: &str) -> Result<(), String> {
    let head = repo.head().map_err(|e| e.message().to_string())?;
    let head_commit = head.peel_to_commit().map_err(|e| e.message().to_string())?;

    repo.reset_default(
        Some(&head_commit.as_object()),
        &[std::path::Path::new(file_path)],
    )
    .map_err(|e| e.message().to_string())?;

    Ok(())
}

/// Discard changes in a file (restore from HEAD or delete if untracked)
pub fn discard_file(repo_path: &str, file_path: &str, is_untracked: bool) -> Result<(), String> {
    use std::process::Command;

    if is_untracked {
        // For untracked files, simply delete them
        let full_path = std::path::Path::new(repo_path).join(file_path);
        if full_path.is_dir() {
            std::fs::remove_dir_all(&full_path)
                .map_err(|e| format!("Failed to remove directory: {}", e))?;
        } else {
            std::fs::remove_file(&full_path)
                .map_err(|e| format!("Failed to remove file: {}", e))?;
        }
    } else {
        // For tracked files, use git checkout to restore from HEAD
        let output = Command::new("git")
            .arg("-C")
            .arg(repo_path)
            .arg("checkout")
            .arg("HEAD")
            .arg("--")
            .arg(file_path)
            .output()
            .map_err(|e| format!("Failed to execute git checkout: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to discard changes: {}", stderr.trim()));
        }
    }

    Ok(())
}

// ============================================================================
// Hunk Operations (Stage/Unstage/Discard individual hunks)
// ============================================================================

/// Structure to receive hunk data from frontend
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HunkData {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<HunkLineData>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HunkLineData {
    pub content: String,
    pub line_type: String, // "add", "delete", "context"
}

/// Generate a unified diff patch from hunk data
fn generate_patch(file_path: &str, hunk: &HunkData) -> String {
    let mut patch = String::new();

    // Header
    patch.push_str(&format!("diff --git a/{} b/{}\n", file_path, file_path));
    patch.push_str(&format!("--- a/{}\n", file_path));
    patch.push_str(&format!("+++ b/{}\n", file_path));

    // Hunk header
    patch.push_str(&format!(
        "@@ -{},{} +{},{} @@\n",
        hunk.old_start, hunk.old_lines, hunk.new_start, hunk.new_lines
    ));

    // Lines - content might already have newline, so we need to handle both cases
    for line in &hunk.lines {
        let prefix = match line.line_type.as_str() {
            "add" => "+",
            "delete" => "-",
            "context" => " ",
            _ => " ",
        };

        // Remove trailing newline/carriage return if present, then add our own
        let content = line.content.trim_end_matches(|c| c == '\n' || c == '\r');
        patch.push_str(&format!("{}{}\n", prefix, content));
    }

    patch
}

/// Stage a single hunk from unstaged changes
pub fn stage_hunk(repo_path: &str, file_path: &str, hunk: HunkData) -> Result<(), String> {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let patch = generate_patch(file_path, &hunk);

    // Debug: print the generated patch
    eprintln!("=== STAGE HUNK PATCH ===");
    eprintln!("repo_path: {}", repo_path);
    eprintln!("file_path: {}", file_path);
    eprintln!("patch:\n{}", patch);
    eprintln!("=== END PATCH ===");

    // Use git apply --cached to stage the hunk
    let mut child = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("apply")
        .arg("--cached")
        .arg("--unidiff-zero")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to execute git apply: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(patch.as_bytes())
            .map_err(|e| format!("Failed to write patch to stdin: {}", e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for git apply: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        eprintln!("git apply stderr: {}", stderr);
        return Err(format!("Failed to stage hunk: {}", stderr.trim()));
    }

    eprintln!("Stage hunk successful!");
    Ok(())
}

/// Unstage a single hunk from staged changes
pub fn unstage_hunk(repo_path: &str, file_path: &str, hunk: HunkData) -> Result<(), String> {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let patch = generate_patch(file_path, &hunk);

    // Use git apply --cached -R to unstage the hunk (reverse apply to index)
    let mut child = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("apply")
        .arg("--cached")
        .arg("--reverse")
        .arg("--unidiff-zero")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to execute git apply: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(patch.as_bytes())
            .map_err(|e| format!("Failed to write patch to stdin: {}", e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for git apply: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to unstage hunk: {}", stderr.trim()));
    }

    Ok(())
}

/// Discard a single hunk from unstaged changes (restore from index or HEAD)
pub fn discard_hunk(repo_path: &str, file_path: &str, hunk: HunkData) -> Result<(), String> {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let patch = generate_patch(file_path, &hunk);

    // Use git apply -R to discard the hunk from working directory
    let mut child = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("apply")
        .arg("--reverse")
        .arg("--unidiff-zero")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to execute git apply: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(patch.as_bytes())
            .map_err(|e| format!("Failed to write patch to stdin: {}", e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for git apply: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to discard hunk: {}", stderr.trim()));
    }

    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitOperationResult {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires_ssh_verification: Option<SshHostVerification>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires_credential: Option<CredentialRequest>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflicting_files: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SshHostVerification {
    pub host: String,
    pub key_type: String,
    pub fingerprint: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CredentialRequest {
    pub credential_type: String, // "username", "password", "passphrase"
    pub prompt: String,
    pub host: Option<String>,
}

/// Detect the type of error from stderr
fn detect_error_type(stderr: &str) -> Option<String> {
    let lower = stderr.to_lowercase();

    if lower.contains("host key verification failed") {
        return Some("ssh_host_verification_failed".to_string());
    }
    if lower.contains("permission denied") || lower.contains("publickey") {
        return Some("authentication_failed".to_string());
    }
    if lower.contains("could not read from remote")
        || lower.contains("no se pudo leer del repositorio remoto")
    {
        return Some("remote_access_failed".to_string());
    }
    if lower.contains("connection refused") || lower.contains("conexión rechazada") {
        return Some("connection_refused".to_string());
    }
    if lower.contains("connection timed out") || lower.contains("tiempo de espera agotado") {
        return Some("connection_timeout".to_string());
    }
    if lower.contains("could not resolve host") || lower.contains("no se pudo resolver") {
        return Some("host_not_found".to_string());
    }
    // Detect checkout conflicts (local changes would be overwritten)
    if lower.contains("would be overwritten by checkout")
        || lower.contains("serían sobrescritos por checkout")
        || lower.contains("serán sobrescritos por checkout")
    {
        return Some("checkout_would_overwrite".to_string());
    }
    // Detect divergent branches (need to specify merge or rebase)
    if lower.contains("divergent branches")
        || lower.contains("need to specify how to reconcile")
        || lower.contains("ramas divergentes")
    {
        return Some("divergent_branches".to_string());
    }
    if lower.contains("fatal:") {
        return Some("git_error".to_string());
    }
    None
}

/// Extract list of conflicting files from git checkout error output
fn extract_conflicting_files(stderr: &str) -> Vec<String> {
    let mut files = Vec::new();
    let mut in_file_list = false;

    for line in stderr.lines() {
        let trimmed = line.trim();

        // Start capturing after "would be overwritten" line
        if trimmed.contains("would be overwritten")
            || trimmed.contains("serían sobrescritos")
            || trimmed.contains("serán sobrescritos")
        {
            in_file_list = true;
            continue;
        }

        // Stop at "Please commit" or "Aborting" lines
        if trimmed.starts_with("Please")
            || trimmed.starts_with("Por favor")
            || trimmed.contains("Aborting")
            || trimmed.contains("Abortando")
        {
            break;
        }

        // Capture file names (non-empty lines that don't start with error)
        if in_file_list && !trimmed.is_empty() && !trimmed.starts_with("error") {
            files.push(trimmed.to_string());
        }
    }

    files
}

/// Parse credential prompt request from output
fn parse_credential_request(output: &str) -> Option<CredentialRequest> {
    let lower = output.to_lowercase();

    // Check for username prompts
    if lower.contains("username for") || lower.contains("usuario para") {
        // Try to extract host
        let host = if let Some(start) = output.find('\'') {
            let rest = &output[start + 1..];
            rest.find('\'').map(|end| rest[..end].to_string())
        } else {
            None
        };

        return Some(CredentialRequest {
            credential_type: "username".to_string(),
            prompt: output.trim().to_string(),
            host,
        });
    }

    // Check for password prompts
    if lower.contains("password for") || lower.contains("contraseña para") {
        let host = if let Some(start) = output.find('\'') {
            let rest = &output[start + 1..];
            rest.find('\'').map(|end| rest[..end].to_string())
        } else {
            None
        };

        return Some(CredentialRequest {
            credential_type: "password".to_string(),
            prompt: output.trim().to_string(),
            host,
        });
    }

    // Check for passphrase prompts (SSH key)
    if lower.contains("enter passphrase") || lower.contains("introduzca la contraseña") {
        return Some(CredentialRequest {
            credential_type: "passphrase".to_string(),
            prompt: output.trim().to_string(),
            host: None,
        });
    }

    None
}

/// Create a git operation result for errors
fn create_error_result(stderr: &str, stdout: &str) -> GitOperationResult {
    // Check for SSH host verification
    if let Some(ssh_verification) = parse_ssh_host_verification(stderr) {
        return GitOperationResult {
            success: false,
            message: "SSH host verification required".to_string(),
            requires_ssh_verification: Some(ssh_verification),
            requires_credential: None,
            error_type: Some("ssh_host_verification".to_string()),
            conflicting_files: None,
        };
    }

    // Check for credential request
    let combined = format!("{}\n{}", stdout, stderr);
    if let Some(credential) = parse_credential_request(&combined) {
        return GitOperationResult {
            success: false,
            message: credential.prompt.clone(),
            requires_ssh_verification: None,
            requires_credential: Some(credential),
            error_type: Some("credential_required".to_string()),
            conflicting_files: None,
        };
    }

    // Detect error type
    let error_type = detect_error_type(stderr);

    // If it's a checkout conflict, extract the conflicting files
    let conflicting_files = if error_type.as_deref() == Some("checkout_would_overwrite") {
        let files = extract_conflicting_files(stderr);
        if files.is_empty() {
            None
        } else {
            Some(files)
        }
    } else {
        None
    };

    GitOperationResult {
        success: false,
        message: stderr.trim().to_string(),
        requires_ssh_verification: None,
        requires_credential: None,
        error_type,
        conflicting_files,
    }
}

/// Create a git operation result for success
fn create_success_result(message: String) -> GitOperationResult {
    GitOperationResult {
        success: true,
        message,
        requires_ssh_verification: None,
        requires_credential: None,
        error_type: None,
        conflicting_files: None,
    }
}

/// Parse SSH host verification prompt from stderr
fn parse_ssh_host_verification(stderr: &str) -> Option<SshHostVerification> {
    // Look for patterns like:
    // "The authenticity of host 'bitbucket.org (185.166.143.49)' can't be established."
    // "ED25519 key fingerprint is SHA256:ybgmFkzwOSotHTHLJgHO0QN8L0xErw6vd0VhFA9m3SM."

    if !stderr.contains("authenticity of host") || !stderr.contains("can't be established") {
        return None;
    }

    // Extract host
    let host = if let Some(start) = stderr.find("host '") {
        let after_host = &stderr[start + 6..];
        if let Some(end) = after_host.find('\'') {
            // Handle "host 'hostname (ip)'" format
            let host_part = &after_host[..end];
            if let Some(space_pos) = host_part.find(' ') {
                host_part[..space_pos].to_string()
            } else {
                host_part.to_string()
            }
        } else {
            return None;
        }
    } else {
        return None;
    };

    // Extract key type and fingerprint
    // Look for lines like "ED25519 key fingerprint is SHA256:..."
    let mut key_type = String::new();
    let mut fingerprint = String::new();

    for line in stderr.lines() {
        if line.contains("key fingerprint") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 {
                key_type = parts[0].to_string();
                // Find "SHA256:" or similar
                for part in &parts {
                    if part.starts_with("SHA256:") || part.starts_with("MD5:") {
                        fingerprint = part.trim_end_matches('.').to_string();
                        break;
                    }
                }
            }
            break;
        }
    }

    if !host.is_empty() && !fingerprint.is_empty() {
        Some(SshHostVerification {
            host,
            key_type,
            fingerprint,
        })
    } else {
        None
    }
}

/// Add a host to SSH known_hosts using ssh-keyscan
pub fn add_ssh_known_host(host: &str) -> Result<GitOperationResult, String> {
    use std::fs::OpenOptions;
    use std::io::Write;
    use std::process::Command;

    // Run ssh-keyscan to get the host key
    let output = Command::new("ssh-keyscan")
        .arg("-t")
        .arg("ed25519,rsa,ecdsa")
        .arg(host)
        .output()
        .map_err(|e| format!("Failed to execute ssh-keyscan: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Ok(GitOperationResult {
            success: false,
            message: format!("Failed to scan host keys: {}", stderr),
            requires_ssh_verification: None,
            requires_credential: None,
            error_type: Some("ssh_keyscan_failed".to_string()),
            conflicting_files: None,
        });
    }

    let host_keys = String::from_utf8_lossy(&output.stdout);
    if host_keys.trim().is_empty() {
        return Ok(GitOperationResult {
            success: false,
            message: "No host keys found for this host".to_string(),
            requires_ssh_verification: None,
            requires_credential: None,
            error_type: Some("no_host_keys".to_string()),
            conflicting_files: None,
        });
    }

    // Get the path to known_hosts
    let home = std::env::var("HOME").map_err(|_| "Could not determine home directory")?;
    let ssh_dir = format!("{}/.ssh", home);
    let known_hosts_path = format!("{}/known_hosts", ssh_dir);

    // Create .ssh directory if it doesn't exist
    std::fs::create_dir_all(&ssh_dir)
        .map_err(|e| format!("Failed to create .ssh directory: {}", e))?;

    // Append to known_hosts
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&known_hosts_path)
        .map_err(|e| format!("Failed to open known_hosts: {}", e))?;

    file.write_all(host_keys.as_bytes())
        .map_err(|e| format!("Failed to write to known_hosts: {}", e))?;

    Ok(create_success_result(format!(
        "Host '{}' added to known hosts",
        host
    )))
}

/// Execute git pull using the git command line (handles authentication properly)
pub fn git_pull(repo_path: &str) -> Result<GitOperationResult, String> {
    use std::process::Command;

    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("pull")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env(
            "GIT_SSH_COMMAND",
            "ssh -o BatchMode=yes -o StrictHostKeyChecking=ask",
        )
        .output()
        .map_err(|e| format!("Failed to execute git pull: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        let message =
            if stdout.contains("Already up to date") || stdout.contains("Ya está actualizado") {
                "Already up to date".to_string()
            } else {
                stdout.trim().to_string()
            };
        Ok(create_success_result(message))
    } else {
        Ok(create_error_result(&stderr, &stdout))
    }
}

/// Execute git push using the git command line (handles authentication properly)
pub fn git_push(repo_path: &str) -> Result<GitOperationResult, String> {
    use std::process::Command;

    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("push")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env(
            "GIT_SSH_COMMAND",
            "ssh -o BatchMode=yes -o StrictHostKeyChecking=ask",
        )
        .output()
        .map_err(|e| format!("Failed to execute git push: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // Git push outputs to stderr even on success
    if output.status.success() {
        let message =
            if stderr.contains("Everything up-to-date") || stderr.contains("Todo actualizado") {
                "Everything up-to-date".to_string()
            } else if stdout.is_empty() && stderr.is_empty() {
                "Push completed successfully".to_string()
            } else {
                format!("{}{}", stdout, stderr).trim().to_string()
            };
        Ok(create_success_result(message))
    } else {
        Ok(create_error_result(&stderr, &stdout))
    }
}

/// Execute git fetch using the git command line
pub fn git_fetch(repo_path: &str) -> Result<GitOperationResult, String> {
    use std::process::Command;

    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("fetch")
        .arg("--all")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env(
            "GIT_SSH_COMMAND",
            "ssh -o BatchMode=yes -o StrictHostKeyChecking=ask",
        )
        .output()
        .map_err(|e| format!("Failed to execute git fetch: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        let message = if stdout.is_empty() && stderr.is_empty() {
            "Fetch completed".to_string()
        } else {
            format!("{}{}", stdout, stderr).trim().to_string()
        };
        Ok(create_success_result(message))
    } else {
        Ok(create_error_result(&stderr, &stdout))
    }
}

// ============================================================================
// Git Operations with Options
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FetchOptions {
    pub remote: Option<String>,
    pub all: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PullOptions {
    pub remote: String,
    pub branch: String,
    pub rebase: bool,
    pub autostash: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PushOptions {
    pub branch: String,
    pub remote: String,
    pub remote_branch: String,
    pub push_tags: bool,
    pub force_with_lease: bool,
}

/// Execute git fetch with options
pub fn git_fetch_with_options(
    repo_path: &str,
    options: FetchOptions,
) -> Result<GitOperationResult, String> {
    use std::process::Command;

    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo_path).arg("fetch");
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd.env(
        "GIT_SSH_COMMAND",
        "ssh -o BatchMode=yes -o StrictHostKeyChecking=ask",
    );

    if options.all {
        cmd.arg("--all");
    } else if let Some(remote) = &options.remote {
        cmd.arg(remote);
    } else {
        cmd.arg("origin");
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute git fetch: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        let message = if stdout.is_empty() && stderr.is_empty() {
            "Fetch completed".to_string()
        } else {
            format!("{}{}", stdout, stderr).trim().to_string()
        };
        Ok(create_success_result(message))
    } else {
        Ok(create_error_result(&stderr, &stdout))
    }
}

/// Execute git pull with options
pub fn git_pull_with_options(
    repo_path: &str,
    options: PullOptions,
) -> Result<GitOperationResult, String> {
    use std::process::Command;

    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo_path).arg("pull");
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd.env(
        "GIT_SSH_COMMAND",
        "ssh -o BatchMode=yes -o StrictHostKeyChecking=ask",
    );

    if options.rebase {
        cmd.arg("--rebase");
    } else {
        // Explicitly tell git to merge (not rebase) when divergent branches exist
        cmd.arg("--no-rebase");
    }

    if options.autostash {
        cmd.arg("--autostash");
    }

    // Add remote and branch
    cmd.arg(&options.remote);
    cmd.arg(&options.branch);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute git pull: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        let message =
            if stdout.contains("Already up to date") || stdout.contains("Ya está actualizado") {
                "Already up to date".to_string()
            } else {
                stdout.trim().to_string()
            };
        Ok(create_success_result(message))
    } else {
        Ok(create_error_result(&stderr, &stdout))
    }
}

/// Execute git push with options
pub fn git_push_with_options(
    repo_path: &str,
    options: PushOptions,
) -> Result<GitOperationResult, String> {
    use std::process::Command;

    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo_path).arg("push");
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd.env(
        "GIT_SSH_COMMAND",
        "ssh -o BatchMode=yes -o StrictHostKeyChecking=ask",
    );

    if options.force_with_lease {
        cmd.arg("--force-with-lease");
    }

    if options.push_tags {
        cmd.arg("--tags");
    }

    // Add remote
    cmd.arg(&options.remote);

    // Add branch:remote_branch refspec
    let refspec = format!("{}:{}", options.branch, options.remote_branch);
    cmd.arg(&refspec);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute git push: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // Git push outputs to stderr even on success
    if output.status.success() {
        let message =
            if stderr.contains("Everything up-to-date") || stderr.contains("Todo actualizado") {
                "Everything up-to-date".to_string()
            } else if stdout.is_empty() && stderr.is_empty() {
                "Push completed successfully".to_string()
            } else {
                format!("{}{}", stdout, stderr).trim().to_string()
            };
        Ok(create_success_result(message))
    } else {
        Ok(create_error_result(&stderr, &stdout))
    }
}

/// Get separated unstaged and staged files
pub fn get_file_status_separated(
    repo: &Repository,
) -> Result<(Vec<FileStatus>, Vec<FileStatus>), String> {
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| e.message().to_string())?;
    let mut unstaged = Vec::new();
    let mut staged = Vec::new();

    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let status = entry.status();

        // Check for staged changes (index changes)
        if status.is_index_new() {
            staged.push(FileStatus {
                path: path.clone(),
                status: "new".to_string(),
                staged: true,
            });
        } else if status.is_index_modified() {
            staged.push(FileStatus {
                path: path.clone(),
                status: "modified".to_string(),
                staged: true,
            });
        } else if status.is_index_deleted() {
            staged.push(FileStatus {
                path: path.clone(),
                status: "deleted".to_string(),
                staged: true,
            });
        } else if status.is_index_renamed() {
            staged.push(FileStatus {
                path: path.clone(),
                status: "renamed".to_string(),
                staged: true,
            });
        }

        // Check for unstaged changes (working tree changes)
        if status.is_wt_new() {
            unstaged.push(FileStatus {
                path: path.clone(),
                status: "untracked".to_string(),
                staged: false,
            });
        } else if status.is_wt_modified() {
            unstaged.push(FileStatus {
                path: path.clone(),
                status: "modified".to_string(),
                staged: false,
            });
        } else if status.is_wt_deleted() {
            unstaged.push(FileStatus {
                path: path.clone(),
                status: "deleted".to_string(),
                staged: false,
            });
        } else if status.is_wt_renamed() {
            unstaged.push(FileStatus {
                path: path.clone(),
                status: "renamed".to_string(),
                staged: false,
            });
        }
    }

    Ok((unstaged, staged))
}

/// Commit message with subject and body separated
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommitMessage {
    pub subject: String,
    pub body: String,
}

/// Get the last commit message (subject and body)
pub fn get_last_commit_message(repo: &Repository) -> Result<CommitMessage, String> {
    let head = repo.head().map_err(|e| e.message().to_string())?;
    let commit = head.peel_to_commit().map_err(|e| e.message().to_string())?;
    let message = commit.message().unwrap_or("");

    // Split into subject (first line) and body (rest)
    let parts: Vec<&str> = message.splitn(2, '\n').collect();
    let subject = parts[0].trim().to_string();
    let body = parts
        .get(1)
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    Ok(CommitMessage { subject, body })
}

/// Execute git checkout to switch branches
pub fn git_checkout(repo_path: &str, branch_name: &str) -> Result<GitOperationResult, String> {
    use std::process::Command;

    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("checkout")
        .arg(branch_name)
        .output()
        .map_err(|e| format!("Failed to execute git checkout: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        // Git checkout success messages often go to stderr
        let message = if stderr.contains("Switched to branch") || stderr.contains("Cambiado a rama")
        {
            stderr.trim().to_string()
        } else if !stdout.is_empty() {
            stdout.trim().to_string()
        } else {
            format!("Switched to branch '{}'", branch_name)
        };
        Ok(create_success_result(message))
    } else {
        // Common errors: uncommitted changes, branch doesn't exist
        Ok(create_error_result(&stderr, &stdout))
    }
}

/// Execute git checkout with automatic stash/pop for handling uncommitted changes
/// This function:
/// 1. Stashes current changes (including untracked files)
/// 2. Checks out the target branch
/// 3. Optionally pops the stash to restore changes
pub fn git_checkout_with_stash(
    repo_path: &str,
    branch_name: &str,
    restore_changes: bool,
) -> Result<GitOperationResult, String> {
    use std::process::Command;

    // Step 1: Stash all changes including untracked files
    let stash_output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("stash")
        .arg("push")
        .arg("-u")
        .arg("-m")
        .arg(format!("Auto-stash before switching to {}", branch_name))
        .output()
        .map_err(|e| format!("Failed to execute git stash: {}", e))?;

    if !stash_output.status.success() {
        let stderr = String::from_utf8_lossy(&stash_output.stderr).to_string();
        return Ok(GitOperationResult {
            success: false,
            message: format!("Failed to stash changes: {}", stderr.trim()),
            requires_ssh_verification: None,
            requires_credential: None,
            error_type: Some("stash_failed".to_string()),
            conflicting_files: None,
        });
    }

    // Step 2: Checkout the target branch
    let checkout_output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("checkout")
        .arg(branch_name)
        .output()
        .map_err(|e| format!("Failed to execute git checkout: {}", e))?;

    if !checkout_output.status.success() {
        let stderr = String::from_utf8_lossy(&checkout_output.stderr).to_string();

        // Checkout failed, try to restore the stash
        let _ = Command::new("git")
            .arg("-C")
            .arg(repo_path)
            .arg("stash")
            .arg("pop")
            .output();

        return Ok(GitOperationResult {
            success: false,
            message: format!("Checkout failed (stash restored): {}", stderr.trim()),
            requires_ssh_verification: None,
            requires_credential: None,
            error_type: Some("checkout_failed".to_string()),
            conflicting_files: None,
        });
    }

    // Step 3: Optionally pop the stash to restore changes
    if restore_changes {
        let pop_output = Command::new("git")
            .arg("-C")
            .arg(repo_path)
            .arg("stash")
            .arg("pop")
            .output()
            .map_err(|e| format!("Failed to execute git stash pop: {}", e))?;

        if !pop_output.status.success() {
            let stderr = String::from_utf8_lossy(&pop_output.stderr).to_string();
            // Checkout succeeded but pop failed - likely conflicts
            return Ok(GitOperationResult {
                success: true,
                message: format!(
                    "Switched to '{}' but failed to restore changes. Your changes are in stash. Error: {}",
                    branch_name,
                    stderr.trim()
                ),
                requires_ssh_verification: None,
                requires_credential: None,
                error_type: Some("stash_pop_conflict".to_string()),
                conflicting_files: None,
            });
        }

        Ok(GitOperationResult {
            success: true,
            message: format!("Switched to '{}' and restored changes", branch_name),
            requires_ssh_verification: None,
            requires_credential: None,
            error_type: None,
            conflicting_files: None,
        })
    } else {
        Ok(GitOperationResult {
            success: true,
            message: format!("Switched to '{}' (changes saved in stash)", branch_name),
            requires_ssh_verification: None,
            requires_credential: None,
            error_type: None,
            conflicting_files: None,
        })
    }
}

/// Create a local branch that tracks a remote branch and switch to it
pub fn git_checkout_track(
    repo_path: &str,
    local_branch: &str,
    remote_branch: &str,
) -> Result<GitOperationResult, String> {
    use std::process::Command;

    // git checkout -b <local_branch> --track <remote_branch>
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("checkout")
        .arg("-b")
        .arg(local_branch)
        .arg("--track")
        .arg(remote_branch)
        .output()
        .map_err(|e| format!("Failed to execute git checkout: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        let message = if stderr.contains("Switched to") || stderr.contains("Cambiado a") {
            stderr.trim().to_string()
        } else if !stdout.is_empty() {
            stdout.trim().to_string()
        } else {
            format!(
                "Branch '{}' set up to track remote branch '{}'",
                local_branch, remote_branch
            )
        };
        Ok(create_success_result(message))
    } else {
        Ok(create_error_result(&stderr, &stdout))
    }
}

/// Execute git commit with message and optional amend
pub fn git_commit(
    repo_path: &str,
    message: &str,
    amend: bool,
) -> Result<GitOperationResult, String> {
    use std::process::Command;

    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo_path).arg("commit");
    cmd.arg("-m").arg(message);

    if amend {
        cmd.arg("--amend");
    }

    cmd.env("GIT_TERMINAL_PROMPT", "0");

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute git commit: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        // Parse commit info from output
        let message = if stdout.contains("create mode") || stdout.contains("delete mode") {
            // Get first line which usually contains the commit summary
            stdout
                .lines()
                .next()
                .unwrap_or("Commit created")
                .to_string()
        } else if !stdout.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            "Commit created successfully".to_string()
        };
        Ok(create_success_result(message))
    } else {
        Ok(create_error_result(&stderr, &stdout))
    }
}

/// Add a new remote to the repository
pub fn git_add_remote(
    repo_path: &str,
    name: &str,
    url: &str,
) -> Result<GitOperationResult, String> {
    use std::process::Command;

    let mut cmd = Command::new("git");
    cmd.arg("-C")
        .arg(repo_path)
        .arg("remote")
        .arg("add")
        .arg(name)
        .arg(url);

    cmd.env("GIT_TERMINAL_PROMPT", "0");

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute git remote add: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(create_success_result(format!(
            "Remote '{}' added successfully",
            name
        )))
    } else {
        Ok(create_error_result(&stderr, &stdout))
    }
}

/// Test connection to a remote URL using git ls-remote
pub fn git_test_remote_connection(url: &str) -> Result<GitOperationResult, String> {
    use std::process::Command;

    let mut cmd = Command::new("git");
    cmd.arg("ls-remote")
        .arg("--exit-code")
        .arg("--heads")
        .arg(url);

    cmd.env("GIT_TERMINAL_PROMPT", "0");

    // Set a timeout-like behavior by limiting refs
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to test connection: {}", e))?;

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(create_success_result("Connection successful".to_string()))
    } else {
        // Check for common errors
        if stderr.contains("Host key verification failed") {
            Ok(create_error_result(
                "SSH host key verification failed. Add the host to known_hosts first.",
                &stderr,
            ))
        } else if stderr.contains("Permission denied") || stderr.contains("Authentication failed") {
            Ok(create_error_result(
                "Authentication failed. Check your credentials.",
                &stderr,
            ))
        } else if stderr.contains("Could not resolve host") {
            Ok(create_error_result(
                "Could not resolve host. Check the URL.",
                &stderr,
            ))
        } else if stderr.contains("Connection refused") {
            Ok(create_error_result(
                "Connection refused. Check if the server is accessible.",
                &stderr,
            ))
        } else {
            Ok(create_error_result("Could not connect to remote", &stderr))
        }
    }
}

/// Create a new branch at a specific starting point
pub fn git_create_branch(
    repo_path: &str,
    branch_name: &str,
    start_point: &str,
    checkout: bool,
) -> Result<GitOperationResult, String> {
    use std::process::Command;

    if checkout {
        // git checkout -b <branch_name> <start_point>
        let output = Command::new("git")
            .arg("-C")
            .arg(repo_path)
            .arg("checkout")
            .arg("-b")
            .arg(branch_name)
            .arg(start_point)
            .output()
            .map_err(|e| format!("Failed to execute git checkout -b: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if output.status.success() {
            let message = if stderr.contains("Switched to") || stderr.contains("Cambiado a") {
                stderr.trim().to_string()
            } else if !stdout.is_empty() {
                stdout.trim().to_string()
            } else {
                format!("Switched to a new branch '{}'", branch_name)
            };
            Ok(create_success_result(message))
        } else {
            Ok(create_error_result(&stderr, &stdout))
        }
    } else {
        // git branch <branch_name> <start_point>
        let output = Command::new("git")
            .arg("-C")
            .arg(repo_path)
            .arg("branch")
            .arg(branch_name)
            .arg(start_point)
            .output()
            .map_err(|e| format!("Failed to execute git branch: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if output.status.success() {
            Ok(create_success_result(format!(
                "Branch '{}' created",
                branch_name
            )))
        } else {
            Ok(create_error_result(&stderr, &stdout))
        }
    }
}

/// Creates a new tag at the specified commit/branch
/// If message is provided, creates an annotated tag; otherwise creates a lightweight tag
/// If push_to_remotes is true, pushes the tag to all remotes
pub fn git_create_tag(
    repo_path: &str,
    tag_name: &str,
    start_point: &str,
    message: Option<&str>,
    push_to_remotes: bool,
) -> Result<GitOperationResult, String> {
    use std::process::Command;

    // Create the tag
    let output = if let Some(msg) = message {
        if msg.trim().is_empty() {
            // Lightweight tag
            Command::new("git")
                .arg("-C")
                .arg(repo_path)
                .arg("tag")
                .arg(tag_name)
                .arg(start_point)
                .output()
                .map_err(|e| format!("Failed to execute git tag: {}", e))?
        } else {
            // Annotated tag with message
            Command::new("git")
                .arg("-C")
                .arg(repo_path)
                .arg("tag")
                .arg("-a")
                .arg(tag_name)
                .arg(start_point)
                .arg("-m")
                .arg(msg)
                .output()
                .map_err(|e| format!("Failed to execute git tag -a: {}", e))?
        }
    } else {
        // Lightweight tag
        Command::new("git")
            .arg("-C")
            .arg(repo_path)
            .arg("tag")
            .arg(tag_name)
            .arg(start_point)
            .output()
            .map_err(|e| format!("Failed to execute git tag: {}", e))?
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Ok(create_error_result(&stderr, &stdout));
    }

    // If push_to_remotes is true, push the tag to all remotes
    if push_to_remotes {
        let push_output = Command::new("git")
            .arg("-C")
            .arg(repo_path)
            .arg("push")
            .arg("--tags")
            .output()
            .map_err(|e| format!("Failed to execute git push --tags: {}", e))?;

        let _push_stdout = String::from_utf8_lossy(&push_output.stdout).to_string();
        let push_stderr = String::from_utf8_lossy(&push_output.stderr).to_string();

        if push_output.status.success() {
            Ok(create_success_result(format!(
                "Tag '{}' created and pushed",
                tag_name
            )))
        } else {
            // Tag was created but push failed
            Ok(GitOperationResult {
                success: false,
                message: format!(
                    "Tag '{}' created but push failed: {}",
                    tag_name,
                    push_stderr.trim()
                ),
                requires_ssh_verification: None,
                requires_credential: None,
                error_type: Some("push_failed".to_string()),
                conflicting_files: None,
            })
        }
    } else {
        Ok(create_success_result(format!("Tag '{}' created", tag_name)))
    }
}

/// Renames a local branch
/// If rename_remote is true and the branch has an upstream, also renames the remote branch
pub fn git_rename_branch(
    repo_path: &str,
    old_name: &str,
    new_name: &str,
    rename_remote: bool,
    remote_name: Option<&str>,
) -> Result<GitOperationResult, String> {
    use std::process::Command;

    // Rename local branch: git branch -m old_name new_name
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("branch")
        .arg("-m")
        .arg(old_name)
        .arg(new_name)
        .output()
        .map_err(|e| format!("Failed to execute git branch -m: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Ok(create_error_result(&stderr, &stdout));
    }

    // If rename_remote is true and we have a remote name, also rename on remote
    if rename_remote {
        if let Some(remote) = remote_name {
            // Push the new branch name to remote
            let push_output = Command::new("git")
                .arg("-C")
                .arg(repo_path)
                .arg("push")
                .arg(remote)
                .arg(new_name)
                .output()
                .map_err(|e| format!("Failed to push new branch: {}", e))?;

            if !push_output.status.success() {
                let push_stderr = String::from_utf8_lossy(&push_output.stderr).to_string();
                return Ok(GitOperationResult {
                    success: false,
                    message: format!(
                        "Local branch renamed but failed to push to remote: {}",
                        push_stderr.trim()
                    ),
                    requires_ssh_verification: None,
                    requires_credential: None,
                    error_type: Some("push_failed".to_string()),
                    conflicting_files: None,
                });
            }

            // Delete the old branch from remote
            let delete_output = Command::new("git")
                .arg("-C")
                .arg(repo_path)
                .arg("push")
                .arg(remote)
                .arg("--delete")
                .arg(old_name)
                .output()
                .map_err(|e| format!("Failed to delete old remote branch: {}", e))?;

            if !delete_output.status.success() {
                let delete_stderr = String::from_utf8_lossy(&delete_output.stderr).to_string();
                return Ok(GitOperationResult {
                    success: false,
                    message: format!(
                        "Branch renamed and pushed, but failed to delete old remote branch: {}",
                        delete_stderr.trim()
                    ),
                    requires_ssh_verification: None,
                    requires_credential: None,
                    error_type: Some("delete_remote_failed".to_string()),
                    conflicting_files: None,
                });
            }

            // Set upstream for the new branch
            let upstream_output = Command::new("git")
                .arg("-C")
                .arg(repo_path)
                .arg("branch")
                .arg("-u")
                .arg(format!("{}/{}", remote, new_name))
                .arg(new_name)
                .output()
                .map_err(|e| format!("Failed to set upstream: {}", e))?;

            if upstream_output.status.success() {
                Ok(create_success_result(format!(
                    "Branch renamed from '{}' to '{}' (local and remote)",
                    old_name, new_name
                )))
            } else {
                // Upstream setting failed but main operation succeeded
                Ok(create_success_result(format!(
                    "Branch renamed from '{}' to '{}' (upstream may need manual setup)",
                    old_name, new_name
                )))
            }
        } else {
            Ok(create_success_result(format!(
                "Branch renamed from '{}' to '{}'",
                old_name, new_name
            )))
        }
    } else {
        Ok(create_success_result(format!(
            "Branch renamed from '{}' to '{}'",
            old_name, new_name
        )))
    }
}

/// Deletes a local branch
/// If force is true, uses -D (force delete), otherwise uses -d (safe delete)
/// If delete_remote is true and remote_name is provided, also deletes the remote branch
pub fn git_delete_branch(
    repo_path: &str,
    branch_name: &str,
    force: bool,
    delete_remote: bool,
    remote_name: Option<&str>,
) -> Result<GitOperationResult, String> {
    use std::process::Command;

    // Delete local branch: git branch -d/-D branch_name
    let delete_flag = if force { "-D" } else { "-d" };
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("branch")
        .arg(delete_flag)
        .arg(branch_name)
        .output()
        .map_err(|e| format!("Failed to execute git branch {}: {}", delete_flag, e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        // Check if it's an unmerged branch error
        if stderr.contains("not fully merged") {
            return Ok(GitOperationResult {
                success: false,
                message: format!(
                    "Branch '{}' is not fully merged. Use force delete to remove it anyway.",
                    branch_name
                ),
                requires_ssh_verification: None,
                requires_credential: None,
                error_type: Some("not_merged".to_string()),
                conflicting_files: None,
            });
        }
        return Ok(create_error_result(&stderr, &stdout));
    }

    // If delete_remote is true and we have a remote name, also delete on remote
    if delete_remote {
        if let Some(remote) = remote_name {
            let push_output = Command::new("git")
                .arg("-C")
                .arg(repo_path)
                .arg("push")
                .arg(remote)
                .arg("--delete")
                .arg(branch_name)
                .output()
                .map_err(|e| format!("Failed to delete remote branch: {}", e))?;

            if !push_output.status.success() {
                let push_stderr = String::from_utf8_lossy(&push_output.stderr).to_string();
                return Ok(GitOperationResult {
                    success: false,
                    message: format!(
                        "Local branch deleted but failed to delete remote branch: {}",
                        push_stderr.trim()
                    ),
                    requires_ssh_verification: None,
                    requires_credential: None,
                    error_type: Some("delete_remote_failed".to_string()),
                    conflicting_files: None,
                });
            }

            Ok(create_success_result(format!(
                "Branch '{}' deleted (local and remote)",
                branch_name
            )))
        } else {
            Ok(create_success_result(format!(
                "Branch '{}' deleted",
                branch_name
            )))
        }
    } else {
        Ok(create_success_result(format!(
            "Branch '{}' deleted",
            branch_name
        )))
    }
}

// ============================================================================
// Stash Operations
// ============================================================================

pub fn get_stashes(repo_path: &str) -> Result<Vec<StashInfo>, String> {
    use std::process::Command;

    // Use git stash list with custom format to get structured data
    // Format: index|ref|message|timestamp
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("stash")
        .arg("list")
        .arg("--format=%gd|%gs|%ct")
        .output()
        .map_err(|e| format!("Failed to list stashes: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to list stashes: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut stashes = Vec::new();

    for (index, line) in stdout.lines().enumerate() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() >= 3 {
            let id = parts[0].to_string(); // e.g., "stash@{0}"
            let message = parts[1].to_string(); // e.g., "WIP on main: abc1234 commit message"
            let timestamp: i64 = parts[2].parse().unwrap_or(0);

            // Extract branch name from message (format: "WIP on branch: ..." or "On branch: ...")
            let branch = extract_branch_from_stash_message(&message);

            stashes.push(StashInfo {
                index,
                id,
                message,
                branch,
                timestamp,
            });
        }
    }

    Ok(stashes)
}

fn extract_branch_from_stash_message(message: &str) -> String {
    // Stash messages typically look like:
    // "WIP on main: abc1234 commit message"
    // "On main: custom message"
    // "index on main: abc1234 commit message"
    if let Some(rest) = message.strip_prefix("WIP on ") {
        if let Some(colon_pos) = rest.find(':') {
            return rest[..colon_pos].to_string();
        }
    }
    if let Some(rest) = message.strip_prefix("On ") {
        if let Some(colon_pos) = rest.find(':') {
            return rest[..colon_pos].to_string();
        }
    }
    if let Some(rest) = message.strip_prefix("index on ") {
        if let Some(colon_pos) = rest.find(':') {
            return rest[..colon_pos].to_string();
        }
    }
    String::new()
}

pub fn git_stash_save(
    repo_path: &str,
    message: Option<&str>,
    include_untracked: bool,
    keep_index: bool,
) -> Result<GitOperationResult, String> {
    use std::process::Command;

    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo_path).arg("stash").arg("push");

    if include_untracked {
        cmd.arg("-u");
    }

    if keep_index {
        cmd.arg("--keep-index");
    }

    if let Some(msg) = message {
        if !msg.trim().is_empty() {
            cmd.arg("-m").arg(msg);
        }
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to save stash: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        // Check if there are no changes to stash
        if stderr.contains("No local changes to save")
            || stdout.contains("No local changes to save")
        {
            return Ok(GitOperationResult {
                success: false,
                message: "No local changes to save".to_string(),
                requires_ssh_verification: None,
                requires_credential: None,
                error_type: Some("no_changes".to_string()),
                conflicting_files: None,
            });
        }
        return Ok(create_error_result(&stderr, &stdout));
    }

    Ok(create_success_result(
        "Stash saved successfully".to_string(),
    ))
}

pub fn git_stash_apply(repo_path: &str, stash_index: usize) -> Result<GitOperationResult, String> {
    use std::process::Command;

    let stash_ref = format!("stash@{{{}}}", stash_index);

    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("stash")
        .arg("apply")
        .arg(&stash_ref)
        .output()
        .map_err(|e| format!("Failed to apply stash: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        // Check for conflicts
        if stderr.contains("CONFLICT") || stdout.contains("CONFLICT") {
            return Ok(GitOperationResult {
                success: false,
                message: format!(
                    "Stash applied with conflicts. Resolve conflicts and commit.\n{}",
                    stderr.trim()
                ),
                requires_ssh_verification: None,
                requires_credential: None,
                error_type: Some("conflicts".to_string()),
                conflicting_files: None,
            });
        }
        return Ok(create_error_result(&stderr, &stdout));
    }

    Ok(create_success_result(
        "Stash applied successfully".to_string(),
    ))
}

pub fn git_stash_pop(repo_path: &str, stash_index: usize) -> Result<GitOperationResult, String> {
    use std::process::Command;

    let stash_ref = format!("stash@{{{}}}", stash_index);

    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("stash")
        .arg("pop")
        .arg(&stash_ref)
        .output()
        .map_err(|e| format!("Failed to pop stash: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        // Check for conflicts
        if stderr.contains("CONFLICT") || stdout.contains("CONFLICT") {
            return Ok(GitOperationResult {
                success: false,
                message: format!("Stash popped with conflicts. Resolve conflicts and commit. The stash was not dropped.\n{}", stderr.trim()),
                requires_ssh_verification: None,
                requires_credential: None,
                error_type: Some("conflicts".to_string()),
                conflicting_files: None,
            });
        }
        return Ok(create_error_result(&stderr, &stdout));
    }

    Ok(create_success_result(
        "Stash popped successfully".to_string(),
    ))
}

pub fn git_stash_drop(repo_path: &str, stash_index: usize) -> Result<GitOperationResult, String> {
    use std::process::Command;

    let stash_ref = format!("stash@{{{}}}", stash_index);

    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("stash")
        .arg("drop")
        .arg(&stash_ref)
        .output()
        .map_err(|e| format!("Failed to drop stash: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Ok(create_error_result(&stderr, &stdout));
    }

    Ok(create_success_result(format!(
        "Stash {} dropped",
        stash_ref
    )))
}

// ============================================================================
// Image Content Functions
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImageContent {
    pub base64: String,
    pub mime_type: String,
    pub file_size: u64,
}

/// Get MIME type from file extension
fn get_mime_type(file_path: &str) -> String {
    let lower = file_path.to_lowercase();
    if lower.ends_with(".png") {
        "image/png".to_string()
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg".to_string()
    } else if lower.ends_with(".gif") {
        "image/gif".to_string()
    } else if lower.ends_with(".bmp") {
        "image/bmp".to_string()
    } else if lower.ends_with(".webp") {
        "image/webp".to_string()
    } else if lower.ends_with(".svg") {
        "image/svg+xml".to_string()
    } else if lower.ends_with(".ico") {
        "image/x-icon".to_string()
    } else {
        "application/octet-stream".to_string()
    }
}

/// Get current image content from working directory as base64
pub fn get_image_content(repo: &Repository, file_path: &str) -> Result<ImageContent, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let workdir = repo.workdir().ok_or("No working directory")?;
    let full_path = workdir.join(file_path);

    if !full_path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    let content = std::fs::read(&full_path).map_err(|e| format!("Failed to read file: {}", e))?;

    let file_size = content.len() as u64;
    let base64_content = STANDARD.encode(&content);
    let mime_type = get_mime_type(file_path);

    Ok(ImageContent {
        base64: base64_content,
        mime_type,
        file_size,
    })
}

/// Get image content from HEAD commit as base64
pub fn get_image_from_head(repo: &Repository, file_path: &str) -> Result<ImageContent, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let head = repo.head().map_err(|e| e.message().to_string())?;
    let tree = head.peel_to_tree().map_err(|e| e.message().to_string())?;

    let entry = tree
        .get_path(std::path::Path::new(file_path))
        .map_err(|e| format!("File not found in HEAD: {}", e.message()))?;

    let blob = repo
        .find_blob(entry.id())
        .map_err(|e| format!("Failed to get blob: {}", e.message()))?;

    let content = blob.content();
    let file_size = content.len() as u64;
    let base64_content = STANDARD.encode(content);
    let mime_type = get_mime_type(file_path);

    Ok(ImageContent {
        base64: base64_content,
        mime_type,
        file_size,
    })
}

/// Get image content from index (staged) as base64
pub fn get_image_from_index(repo: &Repository, file_path: &str) -> Result<ImageContent, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let index = repo.index().map_err(|e| e.message().to_string())?;

    let entry = index
        .get_path(std::path::Path::new(file_path), 0)
        .ok_or_else(|| format!("File not found in index: {}", file_path))?;

    let blob = repo
        .find_blob(entry.id)
        .map_err(|e| format!("Failed to get blob: {}", e.message()))?;

    let content = blob.content();
    let file_size = content.len() as u64;
    let base64_content = STANDARD.encode(content);
    let mime_type = get_mime_type(file_path);

    Ok(ImageContent {
        base64: base64_content,
        mime_type,
        file_size,
    })
}

// ============================================================================
// Merge Functions
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MergePreview {
    pub source_branch: String,
    pub target_branch: String,
    pub commits_ahead: usize,
    pub can_fast_forward: bool,
    pub has_conflicts: bool,
    pub conflicting_files: Vec<String>,
}

/// Get a preview of what a merge would look like without actually performing it
pub fn get_merge_preview(repo_path: &str, source_branch: &str) -> Result<MergePreview, String> {
    use std::process::Command;

    // Get current branch name
    let head_output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("rev-parse")
        .arg("--abbrev-ref")
        .arg("HEAD")
        .output()
        .map_err(|e| format!("Failed to get current branch: {}", e))?;

    let target_branch = String::from_utf8_lossy(&head_output.stdout)
        .trim()
        .to_string();

    // Get merge base (common ancestor)
    let merge_base_output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("merge-base")
        .arg("HEAD")
        .arg(source_branch)
        .output()
        .map_err(|e| format!("Failed to find merge base: {}", e))?;

    if !merge_base_output.status.success() {
        return Err(format!(
            "Cannot find common ancestor between HEAD and '{}'. Are they related?",
            source_branch
        ));
    }

    let merge_base = String::from_utf8_lossy(&merge_base_output.stdout)
        .trim()
        .to_string();

    // Count commits ahead (commits in source_branch not in HEAD)
    let ahead_output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("rev-list")
        .arg("--count")
        .arg(format!("{}..{}", merge_base, source_branch))
        .output()
        .map_err(|e| format!("Failed to count commits: {}", e))?;

    let commits_ahead: usize = String::from_utf8_lossy(&ahead_output.stdout)
        .trim()
        .parse()
        .unwrap_or(0);

    // Check if can fast-forward (HEAD is at merge base)
    let head_sha_output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("rev-parse")
        .arg("HEAD")
        .output()
        .map_err(|e| format!("Failed to get HEAD: {}", e))?;

    let head_sha = String::from_utf8_lossy(&head_sha_output.stdout)
        .trim()
        .to_string();
    let can_fast_forward = head_sha == merge_base;

    // Check for conflicts using git merge-tree (doesn't modify working directory)
    let source_sha_output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("rev-parse")
        .arg(source_branch)
        .output()
        .map_err(|e| format!("Failed to get source branch SHA: {}", e))?;

    let source_sha = String::from_utf8_lossy(&source_sha_output.stdout)
        .trim()
        .to_string();

    // Use git merge-tree to detect conflicts without modifying working tree
    let merge_tree_output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("merge-tree")
        .arg(&merge_base)
        .arg(&head_sha)
        .arg(&source_sha)
        .output()
        .map_err(|e| format!("Failed to run merge-tree: {}", e))?;

    let merge_tree_result = String::from_utf8_lossy(&merge_tree_output.stdout).to_string();

    // Parse conflicts from merge-tree output
    let mut conflicting_files = Vec::new();
    let has_conflicts = merge_tree_result.contains("<<<<<<<")
        || merge_tree_result.contains("changed in both")
        || merge_tree_result.contains("added in both");

    if has_conflicts {
        // Extract file paths from merge-tree output
        // When there's a conflict, merge-tree outputs markers followed by file info
        let mut in_conflict_section = false;
        for line in merge_tree_result.lines() {
            if line.contains("changed in both") || line.contains("added in both") {
                in_conflict_section = true;
                continue;
            }
            if in_conflict_section && line.starts_with("  ") {
                // Lines with file info have format: "  base   100644 <sha> <path>"
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 4 {
                    let path = parts[3..].join(" ");
                    if !path.is_empty() && !conflicting_files.contains(&path) {
                        conflicting_files.push(path);
                    }
                }
            }
            if line.is_empty() {
                in_conflict_section = false;
            }
        }
    }

    Ok(MergePreview {
        source_branch: source_branch.to_string(),
        target_branch,
        commits_ahead,
        can_fast_forward,
        has_conflicts,
        conflicting_files,
    })
}

/// Perform a git merge operation
pub fn git_merge(
    repo_path: &str,
    source_branch: &str,
    merge_type: &str,
) -> Result<GitOperationResult, String> {
    use std::process::Command;

    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo_path).arg("merge");

    match merge_type {
        "no-ff" => {
            cmd.arg("--no-ff");
        }
        "squash" => {
            cmd.arg("--squash");
        }
        // "default" - no extra flags, allows fast-forward
        _ => {}
    }

    cmd.arg(source_branch);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute merge: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        // Check for conflicts
        if stdout.contains("CONFLICT")
            || stderr.contains("CONFLICT")
            || stdout.contains("Automatic merge failed")
            || stderr.contains("Automatic merge failed")
        {
            // Extract conflicting files
            let mut conflicting_files = extract_conflicting_files(&stdout);
            conflicting_files.extend(extract_conflicting_files(&stderr));

            return Ok(GitOperationResult {
                success: false,
                message: format!(
                    "Merge conflicts detected. Resolve conflicts and commit.\n{}{}",
                    stdout.trim(),
                    if stderr.is_empty() {
                        String::new()
                    } else {
                        format!("\n{}", stderr.trim())
                    }
                ),
                requires_ssh_verification: None,
                requires_credential: None,
                error_type: Some("merge_conflicts".to_string()),
                conflicting_files: Some(conflicting_files),
            });
        }

        return Ok(create_error_result(&stderr, &stdout));
    }

    // For squash merges, remind user to commit
    if merge_type == "squash" {
        return Ok(GitOperationResult {
            success: true,
            message: format!(
                "Squash merge completed. Changes are staged but not committed.\n{}",
                stdout.trim()
            ),
            requires_ssh_verification: None,
            requires_credential: None,
            error_type: None,
            conflicting_files: None,
        });
    }

    Ok(create_success_result(format!(
        "Merge completed successfully.\n{}",
        stdout.trim()
    )))
}

/// Abort an in-progress merge
pub fn git_merge_abort(repo_path: &str) -> Result<GitOperationResult, String> {
    use std::process::Command;

    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("merge")
        .arg("--abort")
        .output()
        .map_err(|e| format!("Failed to abort merge: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        if stderr.contains("no merge to abort") || stderr.contains("There is no merge to abort") {
            return Ok(GitOperationResult {
                success: false,
                message: "No merge in progress to abort.".to_string(),
                requires_ssh_verification: None,
                requires_credential: None,
                error_type: Some("no_merge_in_progress".to_string()),
                conflicting_files: None,
            });
        }
        return Ok(create_error_result(&stderr, &stdout));
    }

    Ok(create_success_result(
        "Merge aborted successfully.".to_string(),
    ))
}

// ============================================================================
// REBASE OPERATIONS
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RebasePreview {
    pub source_branch: String,
    pub target_branch: String,
    pub commits_to_rebase: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RebaseOptions {
    pub preserve_merges: bool,
    pub autostash: bool,
}

/// Get a preview of the rebase operation
pub fn get_rebase_preview(repo_path: &str, target_branch: &str) -> Result<RebasePreview, String> {
    use std::process::Command;

    // Get current branch name
    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to get current branch: {}", e))?;

    if !output.status.success() {
        return Err("Failed to get current branch".to_string());
    }

    let source_branch = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // Get merge base
    let output = Command::new("git")
        .args(["merge-base", "HEAD", target_branch])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to get merge base: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to find common ancestor with '{}'",
            target_branch
        ));
    }

    let merge_base = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // Count commits to rebase (commits in current branch that are not in target)
    let output = Command::new("git")
        .args(["rev-list", "--count", &format!("{}..HEAD", merge_base)])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to count commits: {}", e))?;

    let commits_to_rebase = if output.status.success() {
        String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse::<usize>()
            .unwrap_or(0)
    } else {
        0
    };

    Ok(RebasePreview {
        source_branch,
        target_branch: target_branch.to_string(),
        commits_to_rebase,
    })
}

/// Execute a rebase operation
pub fn git_rebase(
    repo_path: &str,
    target_branch: &str,
    options: RebaseOptions,
) -> Result<GitOperationResult, String> {
    use std::process::Command;

    let mut args = vec!["rebase".to_string()];

    if options.preserve_merges {
        args.push("--rebase-merges".to_string());
    }

    if options.autostash {
        args.push("--autostash".to_string());
    }

    args.push(target_branch.to_string());

    let output = Command::new("git")
        .args(&args)
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to execute git rebase: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        // Check for conflicts
        if stderr.contains("CONFLICT")
            || stderr.contains("conflict")
            || stdout.contains("CONFLICT")
            || stdout.contains("could not apply")
        {
            // Get list of conflicting files
            let status_output = Command::new("git")
                .args(["diff", "--name-only", "--diff-filter=U"])
                .current_dir(repo_path)
                .output();

            let conflicting_files = if let Ok(status) = status_output {
                String::from_utf8_lossy(&status.stdout)
                    .lines()
                    .map(|s| s.to_string())
                    .collect()
            } else {
                vec![]
            };

            return Ok(GitOperationResult {
                success: false,
                message: format!("Rebase conflicts detected. Please resolve conflicts and run 'git rebase --continue'."),
                requires_ssh_verification: None,
                requires_credential: None,
                error_type: Some("rebase_conflicts".to_string()),
                conflicting_files: Some(conflicting_files),
            });
        }

        return Ok(create_error_result(&stderr, &stdout));
    }

    // Check if rebase resulted in "Already up to date" or similar
    if stdout.contains("is up to date") || stdout.contains("Already applied") {
        return Ok(GitOperationResult {
            success: true,
            message: "Already up to date, nothing to rebase.".to_string(),
            requires_ssh_verification: None,
            requires_credential: None,
            error_type: None,
            conflicting_files: None,
        });
    }

    Ok(create_success_result(format!(
        "Rebase onto '{}' completed successfully.",
        target_branch
    )))
}

/// Abort a rebase in progress
pub fn git_rebase_abort(repo_path: &str) -> Result<GitOperationResult, String> {
    use std::process::Command;

    let output = Command::new("git")
        .args(["rebase", "--abort"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to execute git rebase --abort: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        // Check if there's no rebase in progress
        if stderr.contains("No rebase in progress") || stderr.contains("no rebase in progress") {
            return Ok(GitOperationResult {
                success: false,
                message: "No rebase in progress to abort.".to_string(),
                requires_ssh_verification: None,
                requires_credential: None,
                error_type: Some("no_rebase_in_progress".to_string()),
                conflicting_files: None,
            });
        }
        return Ok(create_error_result(&stderr, &stdout));
    }

    Ok(create_success_result(
        "Rebase aborted successfully.".to_string(),
    ))
}

/// Continue a rebase after resolving conflicts
pub fn git_rebase_continue(repo_path: &str) -> Result<GitOperationResult, String> {
    use std::process::Command;

    let output = Command::new("git")
        .args(["rebase", "--continue"])
        .current_dir(repo_path)
        .env("GIT_EDITOR", "true") // Skip editor for commit messages
        .output()
        .map_err(|e| format!("Failed to execute git rebase --continue: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        // Check if there are still conflicts
        if stderr.contains("CONFLICT") || stderr.contains("conflict") {
            return Ok(GitOperationResult {
                success: false,
                message: "There are still unresolved conflicts.".to_string(),
                requires_ssh_verification: None,
                requires_credential: None,
                error_type: Some("rebase_conflicts".to_string()),
                conflicting_files: None,
            });
        }

        // Check if there's no rebase in progress
        if stderr.contains("No rebase in progress") || stderr.contains("no rebase in progress") {
            return Ok(GitOperationResult {
                success: false,
                message: "No rebase in progress.".to_string(),
                requires_ssh_verification: None,
                requires_credential: None,
                error_type: Some("no_rebase_in_progress".to_string()),
                conflicting_files: None,
            });
        }

        return Ok(create_error_result(&stderr, &stdout));
    }

    Ok(create_success_result(
        "Rebase continued successfully.".to_string(),
    ))
}

/// Interactive rebase action type
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum RebaseAction {
    Pick,
    Reword,
    Edit,
    Squash,
    Fixup,
    Drop,
}

impl RebaseAction {
    pub fn to_git_command(&self) -> &'static str {
        match self {
            RebaseAction::Pick => "pick",
            RebaseAction::Reword => "reword",
            RebaseAction::Edit => "edit",
            RebaseAction::Squash => "squash",
            RebaseAction::Fixup => "fixup",
            RebaseAction::Drop => "drop",
        }
    }
}

/// A commit entry for interactive rebase
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InteractiveRebaseEntry {
    pub action: RebaseAction,
    pub commit_id: String,
    pub short_id: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

/// Get commits for interactive rebase between current branch and target
pub fn get_interactive_rebase_commits(
    repo_path: &str,
    target_branch: &str,
) -> Result<Vec<InteractiveRebaseEntry>, String> {
    use std::process::Command;

    // Get merge base between HEAD and target
    let merge_base_output = Command::new("git")
        .args(["merge-base", "HEAD", target_branch])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to get merge base: {}", e))?;

    if !merge_base_output.status.success() {
        return Err("Failed to find merge base between current branch and target".to_string());
    }

    let merge_base = String::from_utf8_lossy(&merge_base_output.stdout)
        .trim()
        .to_string();

    // Get commits between merge base and HEAD in reverse order (oldest first, like git rebase -i shows)
    let log_output = Command::new("git")
        .args([
            "log",
            "--reverse",
            "--format=%H|%h|%s|%an|%aI",
            &format!("{}..HEAD", merge_base),
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to get commits: {}", e))?;

    if !log_output.status.success() {
        let stderr = String::from_utf8_lossy(&log_output.stderr);
        return Err(format!("Failed to get commits: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&log_output.stdout);
    let mut entries = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.splitn(5, '|').collect();
        if parts.len() >= 5 {
            entries.push(InteractiveRebaseEntry {
                action: RebaseAction::Pick,
                commit_id: parts[0].to_string(),
                short_id: parts[1].to_string(),
                message: parts[2].to_string(),
                author: parts[3].to_string(),
                date: parts[4].to_string(),
            });
        }
    }

    Ok(entries)
}

/// Execute interactive rebase with custom action sequence
pub fn git_interactive_rebase(
    repo_path: &str,
    target_branch: &str,
    entries: Vec<InteractiveRebaseEntry>,
    autostash: bool,
) -> Result<GitOperationResult, String> {
    use std::fs;
    use std::process::Command;

    // Create temporary file with rebase todo list
    let todo_content: String = entries
        .iter()
        .map(|entry| {
            format!(
                "{} {} {}",
                entry.action.to_git_command(),
                entry.short_id,
                entry.message
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    // Create temp file for the todo list
    let temp_dir = std::env::temp_dir();
    let todo_file = temp_dir.join(format!("forky_rebase_todo_{}", std::process::id()));

    fs::write(&todo_file, &todo_content)
        .map_err(|e| format!("Failed to write rebase todo file: {}", e))?;

    // Create a script that will replace the todo file
    let script_file = temp_dir.join(format!("forky_rebase_editor_{}", std::process::id()));

    #[cfg(unix)]
    {
        let script_content = format!("#!/bin/sh\ncp \"{}\" \"$1\"\n", todo_file.to_string_lossy());
        fs::write(&script_file, &script_content)
            .map_err(|e| format!("Failed to write editor script: {}", e))?;

        // Make script executable
        Command::new("chmod")
            .args(["+x", script_file.to_str().unwrap()])
            .output()
            .map_err(|e| format!("Failed to make script executable: {}", e))?;
    }

    #[cfg(windows)]
    {
        let script_file = temp_dir.join(format!("forky_rebase_editor_{}.cmd", std::process::id()));
        let script_content = format!(
            "@echo off\ncopy /Y \"{}\" \"%~1\"\n",
            todo_file.to_string_lossy().replace("/", "\\")
        );
        fs::write(&script_file, &script_content)
            .map_err(|e| format!("Failed to write editor script: {}", e))?;
    }

    // Build rebase command
    let mut args = vec!["rebase", "-i"];
    if autostash {
        args.push("--autostash");
    }
    args.push(target_branch);

    // Execute rebase with custom GIT_SEQUENCE_EDITOR
    let output = Command::new("git")
        .args(&args)
        .current_dir(repo_path)
        .env("GIT_SEQUENCE_EDITOR", script_file.to_str().unwrap())
        .env("GIT_EDITOR", "true") // Skip editor for commit messages
        .output()
        .map_err(|e| format!("Failed to execute git rebase: {}", e))?;

    // Cleanup temp files
    let _ = fs::remove_file(&todo_file);
    let _ = fs::remove_file(&script_file);

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        // Check for conflicts
        if stderr.contains("CONFLICT")
            || stderr.contains("conflict")
            || stdout.contains("CONFLICT")
            || stdout.contains("conflict")
        {
            // Get conflicting files
            let status_output = Command::new("git")
                .args(["diff", "--name-only", "--diff-filter=U"])
                .current_dir(repo_path)
                .output();

            let conflicting_files = if let Ok(status) = status_output {
                String::from_utf8_lossy(&status.stdout)
                    .lines()
                    .map(|s| s.to_string())
                    .collect()
            } else {
                vec![]
            };

            return Ok(GitOperationResult {
                success: false,
                message: "Rebase conflicts detected. Please resolve conflicts and run 'git rebase --continue'.".to_string(),
                requires_ssh_verification: None,
                requires_credential: None,
                error_type: Some("rebase_conflicts".to_string()),
                conflicting_files: Some(conflicting_files),
            });
        }

        return Ok(create_error_result(&stderr, &stdout));
    }

    // Check if rebase resulted in "Already up to date" or similar
    if stdout.contains("is up to date") || stdout.contains("Already applied") {
        return Ok(GitOperationResult {
            success: true,
            message: "Already up to date, nothing to rebase.".to_string(),
            requires_ssh_verification: None,
            requires_credential: None,
            error_type: None,
            conflicting_files: None,
        });
    }

    Ok(create_success_result(format!(
        "Interactive rebase onto '{}' completed successfully.",
        target_branch
    )))
}

// ==================== Git Flow Functions ====================

/// Get Git Flow configuration from the repository
pub fn get_gitflow_config(repo: &Repository) -> Result<GitFlowConfig, String> {
    let config = repo
        .config()
        .map_err(|e| format!("Failed to read config: {}", e))?;

    // Check if git flow is initialized by looking for gitflow.branch.master
    let initialized = config.get_string("gitflow.branch.master").is_ok();

    if !initialized {
        return Ok(GitFlowConfig {
            initialized: false,
            master_branch: "master".to_string(),
            develop_branch: "develop".to_string(),
            feature_prefix: "feature/".to_string(),
            release_prefix: "release/".to_string(),
            hotfix_prefix: "hotfix/".to_string(),
            version_tag_prefix: "".to_string(),
        });
    }

    // Read git flow configuration
    let master_branch = config
        .get_string("gitflow.branch.master")
        .unwrap_or_else(|_| "master".to_string());

    let develop_branch = config
        .get_string("gitflow.branch.develop")
        .unwrap_or_else(|_| "develop".to_string());

    let feature_prefix = config
        .get_string("gitflow.prefix.feature")
        .unwrap_or_else(|_| "feature/".to_string());

    let release_prefix = config
        .get_string("gitflow.prefix.release")
        .unwrap_or_else(|_| "release/".to_string());

    let hotfix_prefix = config
        .get_string("gitflow.prefix.hotfix")
        .unwrap_or_else(|_| "hotfix/".to_string());

    let version_tag_prefix = config
        .get_string("gitflow.prefix.versiontag")
        .unwrap_or_else(|_| "".to_string());

    Ok(GitFlowConfig {
        initialized: true,
        master_branch,
        develop_branch,
        feature_prefix,
        release_prefix,
        hotfix_prefix,
        version_tag_prefix,
    })
}

/// Get current branch flow info (type and name without prefix)
pub fn get_current_branch_flow_info(repo: &Repository) -> Result<CurrentBranchFlowInfo, String> {
    let head = repo
        .head()
        .map_err(|e| format!("Failed to get HEAD: {}", e))?;
    let branch_name = head.shorthand().unwrap_or("").to_string();

    let config = get_gitflow_config(repo)?;

    // Check if current branch matches any git flow branch type
    if branch_name == config.master_branch {
        return Ok(CurrentBranchFlowInfo {
            branch_type: GitFlowBranchType::Master,
            name: branch_name,
        });
    }

    if branch_name == config.develop_branch {
        return Ok(CurrentBranchFlowInfo {
            branch_type: GitFlowBranchType::Develop,
            name: branch_name,
        });
    }

    if branch_name.starts_with(&config.feature_prefix) {
        let name = branch_name[config.feature_prefix.len()..].to_string();
        return Ok(CurrentBranchFlowInfo {
            branch_type: GitFlowBranchType::Feature,
            name,
        });
    }

    if branch_name.starts_with(&config.release_prefix) {
        let name = branch_name[config.release_prefix.len()..].to_string();
        return Ok(CurrentBranchFlowInfo {
            branch_type: GitFlowBranchType::Release,
            name,
        });
    }

    if branch_name.starts_with(&config.hotfix_prefix) {
        let name = branch_name[config.hotfix_prefix.len()..].to_string();
        return Ok(CurrentBranchFlowInfo {
            branch_type: GitFlowBranchType::Hotfix,
            name,
        });
    }

    Ok(CurrentBranchFlowInfo {
        branch_type: GitFlowBranchType::Other,
        name: branch_name,
    })
}

/// Initialize Git Flow in a repository
pub fn git_flow_init(
    repo_path: &str,
    master_branch: &str,
    develop_branch: &str,
    feature_prefix: &str,
    release_prefix: &str,
    hotfix_prefix: &str,
    version_tag_prefix: &str,
) -> Result<GitOperationResult, String> {
    let repo = open_repository(repo_path)?;

    // Get mutable config
    let mut config = repo
        .config()
        .map_err(|e| format!("Failed to get config: {}", e))?;

    // Set git flow configuration values
    config
        .set_str("gitflow.branch.master", master_branch)
        .map_err(|e| format!("Failed to set gitflow.branch.master: {}", e))?;

    config
        .set_str("gitflow.branch.develop", develop_branch)
        .map_err(|e| format!("Failed to set gitflow.branch.develop: {}", e))?;

    config
        .set_str("gitflow.prefix.feature", feature_prefix)
        .map_err(|e| format!("Failed to set gitflow.prefix.feature: {}", e))?;

    config
        .set_str("gitflow.prefix.release", release_prefix)
        .map_err(|e| format!("Failed to set gitflow.prefix.release: {}", e))?;

    config
        .set_str("gitflow.prefix.hotfix", hotfix_prefix)
        .map_err(|e| format!("Failed to set gitflow.prefix.hotfix: {}", e))?;

    config
        .set_str("gitflow.prefix.versiontag", version_tag_prefix)
        .map_err(|e| format!("Failed to set gitflow.prefix.versiontag: {}", e))?;

    // Check if develop branch exists, create it if not
    let develop_exists = repo
        .find_branch(develop_branch, git2::BranchType::Local)
        .is_ok();

    if !develop_exists {
        // Create develop branch from master/main
        let master_ref = repo
            .find_branch(master_branch, git2::BranchType::Local)
            .map_err(|_| format!("Production branch '{}' not found", master_branch))?;

        let master_commit = master_ref
            .get()
            .peel_to_commit()
            .map_err(|e| format!("Failed to get commit from master branch: {}", e))?;

        repo.branch(develop_branch, &master_commit, false)
            .map_err(|e| format!("Failed to create develop branch: {}", e))?;
    }

    Ok(create_success_result(format!(
        "Git Flow initialized with production branch '{}' and development branch '{}'",
        master_branch, develop_branch
    )))
}

/// Start a git flow branch (feature, release, or hotfix)
/// If custom_base is provided and not empty, it will be used instead of the default base branch
pub fn git_flow_start(
    repo_path: &str,
    flow_type: &str,
    name: &str,
    custom_base: Option<&str>,
) -> Result<GitOperationResult, String> {
    let repo = open_repository(repo_path)?;
    let config = get_gitflow_config(&repo)?;

    let (prefix, default_base) = match flow_type {
        "feature" => (config.feature_prefix, config.develop_branch),
        "release" => (config.release_prefix, config.develop_branch),
        "hotfix" => (config.hotfix_prefix, config.master_branch),
        _ => {
            return Ok(create_error_result(
                &format!("Unknown flow type: {}", flow_type),
                "",
            ))
        }
    };

    // Use custom base if provided and not empty, otherwise use default
    let base_branch = match custom_base {
        Some(b) if !b.is_empty() => b.to_string(),
        _ => default_base,
    };

    let branch_name = format!("{}{}", prefix, name);

    // Create and checkout the new branch from base
    let output = std::process::Command::new("git")
        .args(["checkout", "-b", &branch_name, &base_branch])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Ok(create_error_result(&stderr, &stdout));
    }

    Ok(create_success_result(format!(
        "Started {} '{}' from '{}'",
        flow_type, name, base_branch
    )))
}

/// Finish a git flow branch (feature, release, or hotfix)
pub fn git_flow_finish(
    repo_path: &str,
    flow_type: &str,
    name: &str,
    delete_branch: bool,
) -> Result<GitOperationResult, String> {
    let repo = open_repository(repo_path)?;
    let config = get_gitflow_config(&repo)?;

    let (prefix, target_branches, create_tag) = match flow_type {
        "feature" => (
            config.feature_prefix.clone(),
            vec![config.develop_branch.clone()],
            false,
        ),
        "release" => (
            config.release_prefix.clone(),
            vec![config.master_branch.clone(), config.develop_branch.clone()],
            true,
        ),
        "hotfix" => (
            config.hotfix_prefix.clone(),
            vec![config.master_branch.clone(), config.develop_branch.clone()],
            true,
        ),
        _ => {
            return Ok(create_error_result(
                &format!("Unknown flow type: {}", flow_type),
                "",
            ))
        }
    };

    let branch_name = format!("{}{}", prefix, name);
    let mut messages = Vec::new();

    // Merge into each target branch
    for target in &target_branches {
        // Checkout target branch
        let output = std::process::Command::new("git")
            .args(["checkout", target])
            .current_dir(repo_path)
            .output()
            .map_err(|e| format!("Failed to execute git checkout: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Ok(create_error_result(
                &format!("Failed to checkout '{}': {}", target, stderr),
                "",
            ));
        }

        // Merge with --no-ff
        let merge_message = format!("Merge {} '{}' into {}", flow_type, name, target);
        let output = std::process::Command::new("git")
            .args(["merge", "--no-ff", "-m", &merge_message, &branch_name])
            .current_dir(repo_path)
            .output()
            .map_err(|e| format!("Failed to execute git merge: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();

            // Check for merge conflicts
            if stderr.contains("CONFLICT") || stderr.contains("Automatic merge failed") {
                return Ok(GitOperationResult {
                    success: false,
                    message: format!("Merge conflict while merging into '{}'. Please resolve conflicts manually.", target),
                    requires_ssh_verification: None,
                    requires_credential: None,
                    error_type: Some("merge_conflict".to_string()),
                    conflicting_files: None,
                });
            }

            return Ok(create_error_result(
                &format!("Failed to merge into '{}': {}", target, stderr),
                "",
            ));
        }

        messages.push(format!("Merged into '{}'", target));
    }

    // Create tag for release/hotfix (on master branch)
    if create_tag {
        // Make sure we're on master for tagging
        let _ = std::process::Command::new("git")
            .args(["checkout", &config.master_branch])
            .current_dir(repo_path)
            .output();

        let tag_message = format!(
            "{} {}",
            if flow_type == "release" {
                "Release"
            } else {
                "Hotfix"
            },
            name
        );
        let output = std::process::Command::new("git")
            .args(["tag", "-a", name, "-m", &tag_message])
            .current_dir(repo_path)
            .output()
            .map_err(|e| format!("Failed to create tag: {}", e))?;

        if output.status.success() {
            messages.push(format!("Created tag '{}'", name));
        } else {
            // Tag might already exist, not a fatal error
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            if !stderr.contains("already exists") {
                messages.push(format!("Warning: Could not create tag: {}", stderr));
            }
        }
    }

    // Delete branch if requested
    if delete_branch {
        let output = std::process::Command::new("git")
            .args(["branch", "-d", &branch_name])
            .current_dir(repo_path)
            .output()
            .map_err(|e| format!("Failed to delete branch: {}", e))?;

        if output.status.success() {
            messages.push(format!("Deleted branch '{}'", branch_name));
        } else {
            // Try force delete if normal delete fails
            let output = std::process::Command::new("git")
                .args(["branch", "-D", &branch_name])
                .current_dir(repo_path)
                .output();

            if let Ok(output) = output {
                if output.status.success() {
                    messages.push(format!("Deleted branch '{}' (force)", branch_name));
                }
            }
        }
    }

    // Checkout back to develop
    let _ = std::process::Command::new("git")
        .args(["checkout", &config.develop_branch])
        .current_dir(repo_path)
        .output();

    Ok(create_success_result(messages.join(". ")))
}

/// Fast-forward a local branch to match its remote tracking branch
/// Uses `git fetch remote branch:branch` for non-checked-out branches
/// Uses `git merge --ff-only` for the currently checked-out branch
pub fn git_fast_forward(
    repo_path: &str,
    branch: &str,
    remote: &str,
) -> Result<GitOperationResult, String> {
    let repo = open_repository(repo_path)?;

    // Check if the branch is currently checked out
    let head = repo.head().map_err(|e| e.to_string())?;
    let current_branch = head.shorthand().map(|s| s.to_string()).unwrap_or_default();

    let is_current_branch = current_branch == branch;

    if is_current_branch {
        // For the current branch, use git merge --ff-only
        let remote_ref = format!("{}/{}", remote, branch);

        // First fetch the remote branch
        let fetch_output = std::process::Command::new("git")
            .args(["fetch", remote, branch])
            .current_dir(repo_path)
            .output()
            .map_err(|e| format!("Failed to execute git fetch: {}", e))?;

        if !fetch_output.status.success() {
            let stderr = String::from_utf8_lossy(&fetch_output.stderr).to_string();
            return Ok(create_error_result(&stderr, ""));
        }

        // Then merge with --ff-only
        let merge_output = std::process::Command::new("git")
            .args(["merge", "--ff-only", &remote_ref])
            .current_dir(repo_path)
            .output()
            .map_err(|e| format!("Failed to execute git merge: {}", e))?;

        let stdout = String::from_utf8_lossy(&merge_output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&merge_output.stderr).to_string();

        if !merge_output.status.success() {
            // Check if it's because it can't be fast-forwarded
            if stderr.contains("Not possible to fast-forward") || stderr.contains("fatal") {
                return Ok(GitOperationResult {
                    success: false,
                    message: format!(
                        "Cannot fast-forward '{}': branches have diverged or are up to date",
                        branch
                    ),
                    requires_ssh_verification: None,
                    requires_credential: None,
                    error_type: Some("fast_forward_failed".to_string()),
                    conflicting_files: None,
                });
            }
            return Ok(create_error_result(&stderr, &stdout));
        }

        Ok(create_success_result(format!(
            "Fast-forwarded '{}' from '{}/{}'",
            branch, remote, branch
        )))
    } else {
        // For non-current branches, use git fetch remote branch:branch
        let refspec = format!("{}:{}", branch, branch);

        let output = std::process::Command::new("git")
            .args(["fetch", remote, &refspec])
            .current_dir(repo_path)
            .output()
            .map_err(|e| format!("Failed to execute git fetch: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !output.status.success() {
            // Check for non-fast-forward error
            if stderr.contains("non-fast-forward") {
                return Ok(GitOperationResult {
                    success: false,
                    message: format!(
                        "Cannot fast-forward '{}': local branch has commits not in remote",
                        branch
                    ),
                    requires_ssh_verification: None,
                    requires_credential: None,
                    error_type: Some("fast_forward_failed".to_string()),
                    conflicting_files: None,
                });
            }
            return Ok(create_error_result(&stderr, &stdout));
        }

        Ok(create_success_result(format!(
            "Fast-forwarded '{}' from '{}/{}'",
            branch, remote, branch
        )))
    }
}
