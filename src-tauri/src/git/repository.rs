use chrono::{DateTime, TimeZone, Utc};
use git2::{BranchType, ErrorCode, Oid, Repository, StatusOptions};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};

pub const MAX_DIFF_BYTES: u64 = 1_500_000;
pub const MAX_DIFF_LINES: usize = 10_000;
pub const MAX_IMAGE_BYTES: u64 = 15 * 1024 * 1024;
const AHEAD_BEHIND_CACHE_MAX_ENTRIES: usize = 4_096;

type AheadBehindCache = HashMap<(Oid, Oid), (u32, u32)>;

static AHEAD_BEHIND_CACHE: OnceLock<Mutex<AheadBehindCache>> = OnceLock::new();

fn ahead_behind_cache() -> &'static Mutex<AheadBehindCache> {
    AHEAD_BEHIND_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn apply_no_window(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Base git CLI command: English output (`LC_ALL=C`), never hangs on prompts, no Windows console flash.
fn git_cmd(repo_path: Option<&str>) -> Command {
    let mut cmd = Command::new("git");
    if let Some(path) = repo_path {
        cmd.arg("-C").arg(path);
    }
    cmd.env("LC_ALL", "C").env("GIT_TERMINAL_PROMPT", "0");
    apply_no_window(&mut cmd);
    cmd
}

/// Network git CLI command: always non-interactive (`BatchMode=yes`, `SSH_ASKPASS_REQUIRE=never`)
/// so OpenSSH never opens `/dev/tty` and hangs the process. Preserves user `GIT_SSH_COMMAND` if set.
fn git_network_cmd(repo_path: Option<&str>) -> Command {
    let mut cmd = git_cmd(repo_path);
    cmd.env("SSH_ASKPASS_REQUIRE", "never");
    if std::env::var_os("GIT_SSH_COMMAND").is_none() {
        cmd.env(
            "GIT_SSH_COMMAND",
            "ssh -o BatchMode=yes -o KbdInteractiveAuthentication=no -o StrictHostKeyChecking=ask",
        );
    }
    cmd
}

/// Extract SSH host (or `[host]:port`) from an SSH git URL (`git@host:repo` or `ssh://user@host:port/repo`).
pub(crate) fn extract_ssh_host_from_url(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if let Some(rest) = trimmed.strip_prefix("ssh://") {
        let authority = rest.split('/').next()?;
        let host_port = authority.rsplit_once('@').map(|(_, h)| h).unwrap_or(authority);
        if host_port.is_empty() {
            return None;
        }
        if let Some((h, p)) = host_port.rsplit_once(':') {
            if !h.is_empty() && !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()) {
                return Some(format!("[{}]:{}", h.trim_matches(['[', ']']), p));
            }
        }
        return Some(host_port.trim_matches(['[', ']']).to_string());
    }
    // SCP-like syntax: [user@]host:path (exclude http://, https://, file://, Windows C:\)
    if !trimmed.contains("://") {
        if let Some((left, _right)) = trimmed.split_once(':') {
            if left.len() > 1 {
                let host = left.rsplit_once('@').map(|(_, h)| h).unwrap_or(left);
                if !host.is_empty() && !host.contains('/') && !host.contains('\\') {
                    return Some(host.to_string());
                }
            }
        }
    }
    None
}

/// Probe an unknown SSH host via `ssh-keyscan` + `ssh-keygen -lf -` to obtain `(key_type, fingerprint)`.
fn scan_ssh_host_fingerprint(host: &str) -> Option<(String, String)> {
    use std::io::Write;
    use std::process::Stdio;

    let (scan_host, port) = parse_ssh_host_port(host.trim());
    validate_non_flag(scan_host, "SSH host").ok()?;

    let mut keyscan = Command::new("ssh-keyscan");
    keyscan.args(["-T", "5", "-t", "ed25519,rsa,ecdsa"]);
    if let Some(p) = port {
        keyscan.arg("-p").arg(p);
    }
    keyscan.arg("--").arg(scan_host);
    apply_no_window(&mut keyscan);

    let scan_out = keyscan.output().ok()?;
    if !scan_out.status.success() || scan_out.stdout.is_empty() {
        return None;
    }

    let mut keygen = Command::new("ssh-keygen");
    keygen
        .args(["-lf", "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_no_window(&mut keygen);

    let mut child = keygen.spawn().ok()?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(&scan_out.stdout);
    }
    let fp_out = child.wait_with_output().ok()?;
    if !fp_out.status.success() {
        return None;
    }

    // ssh-keygen -lf output: "<bits> SHA256:<hash> <host> (<KEYTYPE>)"
    for line in String::from_utf8_lossy(&fp_out.stdout).lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if let Some(fp) = parts
            .iter()
            .find(|p| p.starts_with("SHA256:") || p.starts_with("MD5:"))
        {
            let key_type = line
                .rsplit_once('(')
                .and_then(|(_, rest)| rest.strip_suffix(')'))
                .unwrap_or("SSH")
                .to_string();
            return Some((key_type, (*fp).to_string()));
        }
    }
    None
}

/// When `BatchMode=yes` fails with `Host key verification failed` (without a changed-key warning),
/// probe the remote SSH host so the UI can still show `SshHostVerificationModal` without hanging `/dev/tty`.
fn maybe_probe_ssh_verification(
    mut res: GitOperationResult,
    repo_path: Option<&str>,
    remote_or_url: Option<&str>,
) -> GitOperationResult {
    if res.success
        || res.requires_ssh_verification.is_some()
        || !res.message.contains("Host key verification failed")
        || res.message.contains("REMOTE HOST IDENTIFICATION HAS CHANGED")
    {
        return res;
    }

    let candidate_url: Option<String> = if let Some(val) = remote_or_url {
        if extract_ssh_host_from_url(val).is_some() {
            Some(val.to_string())
        } else if let Some(rp) = repo_path {
            open_repository(rp)
                .ok()
                .and_then(|repo| repo.find_remote(val).ok().and_then(|r| r.url().map(String::from)))
        } else {
            None
        }
    } else if let Some(rp) = repo_path {
        open_repository(rp).ok().and_then(|repo| {
            repo.find_remote("origin")
                .ok()
                .and_then(|r| r.url().map(String::from))
                .or_else(|| {
                    repo.remotes().ok().and_then(|remotes| {
                        remotes
                            .iter()
                            .flatten()
                            .find_map(|name| repo.find_remote(name).ok().and_then(|r| r.url().map(String::from)))
                    })
                })
        })
    } else {
        None
    };

    if let Some(host) = candidate_url.as_deref().and_then(extract_ssh_host_from_url) {
        if let Some((key_type, fingerprint)) = scan_ssh_host_fingerprint(&host) {
            res.message = "SSH host verification required".to_string();
            res.error_type = Some("ssh_host_verification".to_string());
            res.requires_ssh_verification = Some(SshHostVerification {
                host,
                key_type,
                fingerprint,
            });
        }
    }

    res
}

/// Validate a commit hash / short_id contains only ASCII hex digits (prevents rebase-todo command injection).
pub(crate) fn validate_commit_hex_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 64 || !id.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(format!("Invalid commit id: '{}'", id));
    }
    Ok(())
}

/// Reject empty, NUL-containing, or flag-like (`-...`) CLI arguments to prevent option injection.
pub(crate) fn validate_non_flag(value: &str, field: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("Invalid {}: cannot be empty", field));
    }
    if trimmed.starts_with('-') || value.contains('\0') {
        return Err(format!("Invalid {}: must not start with '-'", field));
    }
    Ok(())
}

/// Validate a Git branch or tag ref name using libgit2 rules plus flag rejection.
pub(crate) fn validate_git_ref(name: &str, field: &str) -> Result<(), String> {
    validate_non_flag(name, field)?;
    let valid = git2::Branch::name_is_valid(name).unwrap_or(false);
    if !valid {
        return Err(format!("Invalid {}: '{}'", field, name));
    }
    Ok(())
}

/// Resolve a relative file path safely inside `repo_root`, rejecting absolute paths and `..` traversal.
pub(crate) fn resolve_repo_path(repo_root: &Path, rel_path: &str) -> Result<PathBuf, String> {
    if rel_path.is_empty() || rel_path.contains('\0') {
        return Err("Invalid file path".to_string());
    }
    let rel = Path::new(rel_path);
    for comp in rel.components() {
        match comp {
            Component::Prefix(_) | Component::RootDir | Component::ParentDir => {
                return Err(format!("Path escapes repository root: '{}'", rel_path));
            }
            Component::CurDir | Component::Normal(_) => {}
        }
    }

    let joined = repo_root.join(rel);
    if let Ok(canon_root) = repo_root.canonicalize() {
        // Canonicalize the deepest existing ancestor to catch symlink escapes outside repo_root.
        let mut check = joined.as_path();
        while !check.exists() {
            match check.parent() {
                Some(parent) if !parent.as_os_str().is_empty() => check = parent,
                _ => break,
            }
        }
        if let Ok(canon_check) = check.canonicalize() {
            if !canon_check.starts_with(&canon_root) {
                return Err(format!("Path escapes repository root: '{}'", rel_path));
            }
        }
    }

    Ok(joined)
}

fn get_unmerged_files(repo_path: &str) -> Vec<String> {
    match git_cmd(Some(repo_path))
        .args(["diff", "--name-only", "--diff-filter=U"])
        .output()
    {
        Ok(output) if output.status.success() => String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter(|l| !l.trim().is_empty())
            .map(|s| s.to_string())
            .collect(),
        _ => Vec::new(),
    }
}

fn top_stash_oid(repo_path: &str) -> Option<String> {
    let output = git_cmd(Some(repo_path))
        .args(["rev-parse", "-q", "--verify", "refs/stash"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let oid = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if oid.is_empty() {
        None
    } else {
        Some(oid)
    }
}

/// Quote a file path for unified diff headers if it contains quotes, control chars, or non-ASCII.
fn quote_git_path(prefix: &str, file_path: &str) -> String {
    let full = format!("{}{}", prefix, file_path);
    let needs_quoting = file_path
        .bytes()
        .any(|b| b < 0x20 || b == 0x7f || b == b'"' || b == b'\\' || b >= 0x80);
    if !needs_quoting {
        return full;
    }
    let mut out = String::with_capacity(full.len() + 8);
    out.push('"');
    for b in full.bytes() {
        match b {
            b'"' => out.push_str("\\\""),
            b'\\' => out.push_str("\\\\"),
            b'\t' => out.push_str("\\t"),
            b'\n' => out.push_str("\\n"),
            b'\r' => out.push_str("\\r"),
            0x00..=0x1f | 0x7f..=0xff => out.push_str(&format!("\\{:03o}", b)),
            _ => out.push(b as char),
        }
    }
    out.push('"');
    out
}

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
pub struct RepositorySnapshot {
    pub branches: Vec<BranchInfo>,
    pub branch_heads: Vec<BranchHead>,
    pub tags: Vec<TagInfo>,
    pub remotes: Vec<String>,
    pub stashes: Vec<StashInfo>,
    pub unstaged: Vec<FileStatus>,
    pub staged: Vec<FileStatus>,
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
    #[serde(default)]
    pub is_truncated: bool,
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
    let path = repo.workdir().unwrap_or_else(|| repo.path());
    let normalized = path
        .to_string_lossy()
        .trim_end_matches(['/', '\\'])
        .to_string();
    let display_path = if normalized.is_empty() {
        path.to_string_lossy().to_string()
    } else {
        normalized
    };
    let name = Path::new(&display_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    let current_branch = match repo.head() {
        Ok(head) => {
            if repo.head_detached().unwrap_or(false) {
                head.target()
                    .map(|oid| format!("HEAD ({})", &oid.to_string()[..7]))
            } else {
                head.shorthand().map(|s| s.to_string())
            }
        }
        Err(e) if e.code() == ErrorCode::UnbornBranch => repo
            .find_reference("HEAD")
            .ok()
            .and_then(|r| {
                r.symbolic_target()
                    .map(|t| t.strip_prefix("refs/heads/").unwrap_or(t).to_string())
            }),
        Err(_) => None,
    };

    Ok(RepositoryInfo {
        path: display_path,
        name,
        current_branch,
        is_bare: repo.is_bare(),
        is_empty: repo.is_empty().unwrap_or(true),
    })
}

/// Helper function to calculate ahead/behind counts between two commit OIDs
/// with an O(1) fast-path when equal and a bounded static cache keyed by `(local_oid, upstream_oid)`.
pub(crate) fn calculate_ahead_behind_oids(
    repo: &Repository,
    local_oid: Oid,
    upstream_oid: Oid,
) -> (Option<u32>, Option<u32>) {
    if local_oid == upstream_oid {
        return (Some(0), Some(0));
    }

    if let Ok(cache) = ahead_behind_cache().lock() {
        if let Some(&(ahead, behind)) = cache.get(&(local_oid, upstream_oid)) {
            return (Some(ahead), Some(behind));
        }
    }

    match repo.graph_ahead_behind(local_oid, upstream_oid) {
        Ok((ahead, behind)) => {
            let ahead = ahead as u32;
            let behind = behind as u32;
            if let Ok(mut cache) = ahead_behind_cache().lock() {
                if cache.len() >= AHEAD_BEHIND_CACHE_MAX_ENTRIES {
                    cache.clear();
                }
                cache.insert((local_oid, upstream_oid), (ahead, behind));
            }
            (Some(ahead), Some(behind))
        }
        Err(_) => (None, None),
    }
}

/// Helper function to calculate ahead/behind counts for a branch relative to its upstream
fn calculate_ahead_behind(
    repo: &Repository,
    local_oid: Option<Oid>,
    upstream_branch: &git2::Branch,
) -> (Option<u32>, Option<u32>) {
    let Some(local_oid) = local_oid else {
        return (None, None);
    };

    let upstream_oid = match upstream_branch.get().peel_to_commit() {
        Ok(commit) => commit.id(),
        Err(_) => return (None, None),
    };

    calculate_ahead_behind_oids(repo, local_oid, upstream_oid)
}

/// Compute both `BranchInfo` (local + remote) and `BranchHead` (local) in a single pass.
pub fn get_branches_and_heads(
    repo: &Repository,
) -> Result<(Vec<BranchInfo>, Vec<BranchHead>), String> {
    let mut branches = Vec::new();
    let mut heads = Vec::new();

    // Local branches
    if let Ok(local_branches) = repo.branches(Some(BranchType::Local)) {
        for branch in local_branches.flatten() {
            let (branch, _) = branch;
            if let Ok(name_opt) = branch.name() {
                let name = name_opt.unwrap_or("").to_string();
                let is_head = branch.is_head();
                let local_oid = branch.get().peel_to_commit().ok().map(|c| c.id());

                if let (Some(non_empty_name), Some(oid)) = (name_opt, local_oid) {
                    heads.push(BranchHead {
                        name: non_empty_name.to_string(),
                        commit_sha: oid.to_string(),
                        is_head,
                    });
                }

                // Get upstream and calculate ahead/behind
                let (upstream, ahead, behind) = match branch.upstream() {
                    Ok(upstream_branch) => {
                        let upstream_name =
                            upstream_branch.name().ok().flatten().map(|s| s.to_string());
                        let (ahead, behind) =
                            calculate_ahead_behind(repo, local_oid, &upstream_branch);
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

    Ok((branches, heads))
}

pub fn get_branches(repo: &Repository) -> Result<Vec<BranchInfo>, String> {
    let (branches, _) = get_branches_and_heads(repo)?;
    Ok(branches)
}

pub fn get_branch_heads(repo: &Repository) -> Result<Vec<BranchHead>, String> {
    let mut heads = Vec::new();

    // Local branches
    if let Ok(local_branches) = repo.branches(Some(BranchType::Local)) {
        for branch in local_branches.flatten() {
            let (branch, _) = branch;
            if let Ok(Some(name)) = branch.name() {
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

    Ok(heads)
}

/// Fetch all sidebar/status metadata for a repository in a single `git2::Repository` open.
pub fn get_repository_snapshot(repo_path: &str) -> Result<RepositorySnapshot, String> {
    let mut repo = open_repository(repo_path)?;
    let (branches, branch_heads) = get_branches_and_heads(&repo)?;
    let tags = get_tags(&repo)?;
    let remotes = get_remotes(&repo)?;
    let (unstaged, staged) = get_file_status_separated(&repo)?;
    let stashes = get_stashes_from_repo(&mut repo)?;

    Ok(RepositorySnapshot {
        branches,
        branch_heads,
        tags,
        remotes,
        stashes,
        unstaged,
        staged,
    })
}

pub fn get_commits(
    repo: &Repository,
    limit: usize,
    offset: usize,
) -> Result<Vec<CommitInfo>, String> {
    if repo.is_empty().unwrap_or(false) {
        return Ok(Vec::new());
    }

    let mut revwalk = repo.revwalk().map_err(|e| e.message().to_string())?;

    // Push all local branches and always push HEAD (covers detached HEAD commits)
    let mut pushed_any = false;
    if let Ok(local_branches) = repo.branches(Some(BranchType::Local)) {
        for branch in local_branches.flatten() {
            let (branch, _) = branch;
            if let Ok(reference) = branch.get().peel_to_commit() {
                if revwalk.push(reference.id()).is_ok() {
                    pushed_any = true;
                }
            }
        }
    }

    if revwalk.push_head().is_ok() {
        pushed_any = true;
    }

    if !pushed_any {
        return Ok(Vec::new());
    }

    // Sort by topological order with time
    revwalk
        .set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME)
        .map_err(|e| e.message().to_string())?;

    let commits: Vec<CommitInfo> = revwalk
        .skip(offset)
        .take(limit)
        .filter_map(|oid| oid.ok())
        .filter_map(|oid| repo.find_commit(oid).ok())
        .map(|commit| {
            let time = commit.time();
            let datetime: DateTime<Utc> = Utc
                .timestamp_opt(time.seconds(), 0)
                .single()
                .unwrap_or(DateTime::UNIX_EPOCH);
            let id = commit.id().to_string();

            CommitInfo {
                short_id: id.chars().take(7).collect(),
                id,
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
        let path = String::from_utf8_lossy(entry.path_bytes()).to_string();
        let status = entry.status();

        let (status_str, staged) = if status.is_conflicted() {
            ("conflicted".to_string(), false)
        } else if status.is_index_new() {
            ("new".to_string(), true)
        } else if status.is_index_modified() || status.is_index_typechange() {
            ("modified".to_string(), true)
        } else if status.is_index_deleted() {
            ("deleted".to_string(), true)
        } else if status.is_wt_new() {
            ("untracked".to_string(), false)
        } else if status.is_wt_modified() || status.is_wt_typechange() {
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
    let references = repo
        .references_glob("refs/tags/*")
        .map_err(|e| e.message().to_string())?;
    let mut result = Vec::new();

    for reference in references.flatten() {
        let Some(tag_name) = reference
            .name()
            .and_then(|n| n.strip_prefix("refs/tags/"))
        else {
            continue;
        };

        // Peel to commit to handle both lightweight and annotated tags
        if let Ok(commit) = reference.peel_to_commit() {
            result.push(TagInfo {
                name: tag_name.to_string(),
                commit_sha: commit.id().to_string(),
            });
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
    diff_opts.disable_pathspec_match(true);
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
    diff_opts.disable_pathspec_match(true);
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

/// Parse a git2 Diff into our DiffInfo structure, enforcing `MAX_DIFF_BYTES` and `MAX_DIFF_LINES`.
fn parse_diff(diff: &git2::Diff, file_path: &str) -> Result<DiffInfo, String> {
    use std::cell::RefCell;

    let hunks: RefCell<Vec<DiffHunk>> = RefCell::new(Vec::new());
    let is_binary: RefCell<bool> = RefCell::new(false);
    let is_truncated: RefCell<bool> = RefCell::new(false);
    let file_size: RefCell<Option<u64>> = RefCell::new(None);
    let total_lines: RefCell<usize> = RefCell::new(0);

    let foreach_res = diff.foreach(
        &mut |delta, _| {
            let size = delta.new_file().size().max(delta.old_file().size());
            if size > 0 {
                *file_size.borrow_mut() = Some(size);
            }
            if delta.flags().is_binary() {
                *is_binary.borrow_mut() = true;
                return true;
            }
            if size > MAX_DIFF_BYTES {
                *is_truncated.borrow_mut() = true;
                return false;
            }
            true
        },
        Some(&mut |_, _binary| {
            *is_binary.borrow_mut() = true;
            true
        }),
        Some(&mut |_, hunk| {
            if *is_truncated.borrow() {
                return false;
            }
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
            let mut count = total_lines.borrow_mut();
            if *count >= MAX_DIFF_LINES {
                *is_truncated.borrow_mut() = true;
                return false;
            }
            *count += 1;
            drop(count);

            let mut hunks_mut = hunks.borrow_mut();
            if let Some(current_hunk) = hunks_mut.last_mut() {
                let line_type = match line.origin() {
                    '+' => "add",
                    '-' => "delete",
                    ' ' => "context",
                    '>' | '<' | '=' => "no_newline",
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
    );

    if let Err(e) = foreach_res {
        // Returning `false` from a libgit2 foreach callback stops iteration with ErrorCode::User
        if !(e.code() == ErrorCode::User && *is_truncated.borrow()) {
            return Err(e.message().to_string());
        }
    }

    let binary = is_binary.into_inner();
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
        file_size: file_size.into_inner(),
        is_truncated: is_truncated.into_inner(),
    })
}

fn truncated_diff_info(file_path: &str, file_size: u64) -> DiffInfo {
    DiffInfo {
        file_path: file_path.to_string(),
        old_content: None,
        new_content: None,
        hunks: Vec::new(),
        is_binary: false,
        binary_type: None,
        file_size: Some(file_size),
        is_truncated: true,
    }
}

fn binary_diff_info(file_path: &str, file_size: u64) -> DiffInfo {
    DiffInfo {
        file_path: file_path.to_string(),
        old_content: None,
        new_content: None,
        hunks: Vec::new(),
        is_binary: true,
        binary_type: get_binary_type(file_path),
        file_size: Some(file_size),
        is_truncated: false,
    }
}

/// Build a whole-file `DiffInfo` (all additions or all deletions) from raw bytes,
/// enforcing `MAX_DIFF_BYTES` and `MAX_DIFF_LINES`.
pub(crate) fn diff_from_bytes(
    file_path: &str,
    content: &[u8],
    is_addition: bool,
    known_binary: bool,
) -> DiffInfo {
    let file_size = content.len() as u64;

    if known_binary || is_binary_content(content) {
        return binary_diff_info(file_path, file_size);
    }

    if file_size > MAX_DIFF_BYTES {
        return truncated_diff_info(file_path, file_size);
    }

    let text = String::from_utf8_lossy(content);
    let line_type = if is_addition { "add" } else { "delete" };

    let mut diff_lines = Vec::new();
    let mut is_truncated = false;
    for (i, line) in text.lines().enumerate() {
        if i >= MAX_DIFF_LINES {
            is_truncated = true;
            break;
        }
        let line_no = Some((i + 1) as u32);
        diff_lines.push(DiffLine {
            content: format!("{}\n", line),
            line_type: line_type.to_string(),
            old_line_no: if is_addition { None } else { line_no },
            new_line_no: if is_addition { line_no } else { None },
        });
    }

    let count = diff_lines.len() as u32;
    let hunk = DiffHunk {
        old_start: if is_addition { 0 } else { 1 },
        old_lines: if is_addition { 0 } else { count },
        new_start: if is_addition { 1 } else { 0 },
        new_lines: if is_addition { count } else { 0 },
        lines: diff_lines,
    };

    DiffInfo {
        file_path: file_path.to_string(),
        old_content: None,
        new_content: None,
        hunks: vec![hunk],
        is_binary: false,
        binary_type: None,
        file_size: Some(file_size),
        is_truncated,
    }
}

/// Read content of an untracked file and create diff info showing all lines as additions.
/// Probes only the first 8 KB for binary detection and avoids loading files larger than `MAX_DIFF_BYTES`.
pub fn get_untracked_file_diff(repo: &Repository, file_path: &str) -> Result<DiffInfo, String> {
    let workdir = repo.workdir().ok_or("No working directory")?;
    let full_path = resolve_repo_path(workdir, file_path)?;
    let file_size = std::fs::metadata(&full_path)
        .map_err(|e| e.to_string())?
        .len();

    let mut file = std::fs::File::open(&full_path).map_err(|e| e.to_string())?;
    let mut probe = Vec::with_capacity(file_size.min(8_000) as usize);
    (&mut file)
        .take(8_000)
        .read_to_end(&mut probe)
        .map_err(|e| e.to_string())?;

    if is_binary_content(&probe) {
        return Ok(binary_diff_info(file_path, file_size));
    }

    if file_size > MAX_DIFF_BYTES {
        return Ok(truncated_diff_info(file_path, file_size));
    }

    if file_size > probe.len() as u64 {
        probe.reserve((file_size as usize).saturating_sub(probe.len()));
        file.read_to_end(&mut probe).map_err(|e| e.to_string())?;
    }

    Ok(diff_from_bytes(file_path, &probe, true, false))
}

/// Get diff for a newly staged file directly from the index blob (fallback to working dir).
pub fn get_staged_new_file_diff(repo: &Repository, file_path: &str) -> Result<DiffInfo, String> {
    if let Ok(index) = repo.index() {
        if let Some(entry) = index.get_path(Path::new(file_path), 0) {
            if let Ok(blob) = repo.find_blob(entry.id) {
                let blob_size = blob.size() as u64;
                if blob.is_binary() {
                    return Ok(binary_diff_info(file_path, blob_size));
                }
                if blob_size > MAX_DIFF_BYTES {
                    return Ok(truncated_diff_info(file_path, blob_size));
                }
                return Ok(diff_from_bytes(file_path, blob.content(), true, false));
            }
        }
    }
    get_untracked_file_diff(repo, file_path)
}

/// Get diff for a deleted file from the index (falling back to HEAD), showing all lines as deletions
pub fn get_deleted_file_diff(repo: &Repository, file_path: &str) -> Result<DiffInfo, String> {
    let blob_id = repo
        .index()
        .ok()
        .and_then(|idx| idx.get_path(Path::new(file_path), 0).map(|e| e.id))
        .or_else(|| {
            repo.head()
                .ok()
                .and_then(|h| h.peel_to_tree().ok())
                .and_then(|t| t.get_path(Path::new(file_path)).ok().map(|e| e.id()))
        })
        .ok_or_else(|| format!("Deleted file '{}' not found in index or HEAD", file_path))?;

    let blob = repo
        .find_blob(blob_id)
        .map_err(|e| e.message().to_string())?;
    let blob_size = blob.size() as u64;
    if blob.is_binary() {
        return Ok(binary_diff_info(file_path, blob_size));
    }
    if blob_size > MAX_DIFF_BYTES {
        return Ok(truncated_diff_info(file_path, blob_size));
    }
    Ok(diff_from_bytes(file_path, blob.content(), false, false))
}

/// Stage multiple files in a single index write
pub fn stage_files(repo: &Repository, file_paths: &[String]) -> Result<(), String> {
    if file_paths.is_empty() {
        return Ok(());
    }
    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    let workdir = repo.workdir().ok_or("No working directory")?;

    for file_path in file_paths {
        let full_path = resolve_repo_path(workdir, file_path)?;
        if full_path.symlink_metadata().is_ok() {
            index
                .add_path(Path::new(file_path))
                .map_err(|e| e.message().to_string())?;
        } else {
            index
                .remove_path(Path::new(file_path))
                .map_err(|e| e.message().to_string())?;
        }
    }

    index.write().map_err(|e| e.message().to_string())?;
    Ok(())
}

/// Stage a single file
pub fn stage_file(repo: &Repository, file_path: &str) -> Result<(), String> {
    stage_files(repo, &[file_path.to_string()])
}

/// Unstage multiple files in a single reset/index write (supports unborn branch)
pub fn unstage_files(repo: &Repository, file_paths: &[String]) -> Result<(), String> {
    if file_paths.is_empty() {
        return Ok(());
    }
    match repo.head() {
        Ok(head) => {
            let head_commit = head.peel_to_commit().map_err(|e| e.message().to_string())?;
            let paths: Vec<&Path> = file_paths.iter().map(Path::new).collect();
            repo.reset_default(Some(head_commit.as_object()), paths)
                .map_err(|e| e.message().to_string())?;
        }
        Err(e) if e.code() == ErrorCode::UnbornBranch => {
            let mut index = repo.index().map_err(|e| e.message().to_string())?;
            for file_path in file_paths {
                index
                    .remove_path(Path::new(file_path))
                    .map_err(|e| e.message().to_string())?;
            }
            index.write().map_err(|e| e.message().to_string())?;
        }
        Err(e) => return Err(e.message().to_string()),
    }

    Ok(())
}

/// Unstage a single file
pub fn unstage_file(repo: &Repository, file_path: &str) -> Result<(), String> {
    unstage_files(repo, &[file_path.to_string()])
}

/// Discard unstaged changes in a file (restore from index without wiping staged changes, or delete if untracked)
pub fn discard_file(repo_path: &str, file_path: &str, is_untracked: bool) -> Result<(), String> {
    let full_path = resolve_repo_path(Path::new(repo_path), file_path)?;

    if is_untracked {
        if full_path.is_dir() && !full_path.is_symlink() {
            std::fs::remove_dir_all(&full_path)
                .map_err(|e| format!("Failed to remove directory: {}", e))?;
        } else {
            std::fs::remove_file(&full_path)
                .map_err(|e| format!("Failed to remove file: {}", e))?;
        }
    } else {
        // Restore working tree from index so staged changes remain intact
        let output = git_cmd(Some(repo_path))
            .arg("checkout")
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
    pub line_type: String, // "add", "delete", "context", "no_newline"
}

/// Generate a unified diff patch from hunk data preserving CRLF, no-EOF-newline markers, and path quoting
pub(crate) fn generate_patch(file_path: &str, hunk: &HunkData) -> String {
    let mut patch = String::new();

    let a_path = quote_git_path("a/", file_path);
    let b_path = quote_git_path("b/", file_path);
    patch.push_str(&format!("diff --git {} {}\n", a_path, b_path));

    // Emit new/deleted file headers so `git apply` removes or adds index entries cleanly instead of 0-byte blobs
    if hunk.old_start == 0 && hunk.old_lines == 0 {
        patch.push_str("new file mode 100644\n");
        patch.push_str("--- /dev/null\n");
        patch.push_str(&format!("+++ {}\n", b_path));
    } else if hunk.new_start == 0 && hunk.new_lines == 0 {
        patch.push_str("deleted file mode 100644\n");
        patch.push_str(&format!("--- {}\n", a_path));
        patch.push_str("+++ /dev/null\n");
    } else {
        patch.push_str(&format!("--- {}\n", a_path));
        patch.push_str(&format!("+++ {}\n", b_path));
    }

    patch.push_str(&format!(
        "@@ -{},{} +{},{} @@\n",
        hunk.old_start, hunk.old_lines, hunk.new_start, hunk.new_lines
    ));

    for line in &hunk.lines {
        if line.line_type == "no_newline" {
            let trimmed = line.content.trim_end_matches(['\n', '\r']);
            if trimmed.starts_with('\\') {
                patch.push_str(trimmed);
            } else {
                patch.push_str("\\ No newline at end of file");
            }
            patch.push('\n');
            continue;
        }

        let prefix = match line.line_type.as_str() {
            "add" => "+",
            "delete" => "-",
            "context" => " ",
            _ => " ",
        };

        // Preserve CRLF vs LF endings so `git apply` matches Windows line endings accurately
        let has_crlf = line.content.ends_with("\r\n");
        let body = if has_crlf {
            &line.content[..line.content.len() - 2]
        } else {
            line.content.strip_suffix('\n').unwrap_or(&line.content)
        };
        patch.push_str(prefix);
        patch.push_str(body);
        if has_crlf {
            patch.push_str("\r\n");
        } else {
            patch.push('\n');
        }
    }

    patch
}

fn apply_hunk_patch(
    repo_path: &str,
    file_path: &str,
    hunk: &HunkData,
    extra_args: &[&str],
    action_label: &str,
) -> Result<(), String> {
    use std::io::Write;
    use std::process::Stdio;

    resolve_repo_path(Path::new(repo_path), file_path)?;
    let patch = generate_patch(file_path, hunk);
    let has_context = hunk.lines.iter().any(|l| l.line_type == "context");

    let mut cmd = git_cmd(Some(repo_path));
    cmd.arg("apply").args(extra_args);
    if !has_context {
        cmd.arg("--unidiff-zero");
    }

    let mut child = cmd
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
        return Err(format!("Failed to {}: {}", action_label, stderr.trim()));
    }

    Ok(())
}

/// Stage a single hunk from unstaged changes
pub fn stage_hunk(repo_path: &str, file_path: &str, hunk: HunkData) -> Result<(), String> {
    apply_hunk_patch(repo_path, file_path, &hunk, &["--cached"], "stage hunk")
}

/// Unstage a single hunk from staged changes
pub fn unstage_hunk(repo_path: &str, file_path: &str, hunk: HunkData) -> Result<(), String> {
    apply_hunk_patch(
        repo_path,
        file_path,
        &hunk,
        &["--cached", "--reverse"],
        "unstage hunk",
    )
}

/// Discard a single hunk from unstaged changes (restore from index)
pub fn discard_hunk(repo_path: &str, file_path: &str, hunk: HunkData) -> Result<(), String> {
    apply_hunk_patch(repo_path, file_path, &hunk, &["--reverse"], "discard hunk")
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
    // Detect missing Git identity (user.name / user.email not configured)
    if lower.contains("author identity unknown")
        || lower.contains("identidad del autor desconocido")
        || lower.contains("please tell me who you are")
        || lower.contains("empty ident name")
        || lower.contains("no es posible auto-detectar")
        || lower.contains("unable to auto-detect")
    {
        return Some("missing_identity".to_string());
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

    // Prefer stderr, falling back to stdout when git reports errors there (e.g. "nothing to commit")
    let primary = if stderr.trim().is_empty() {
        stdout.trim()
    } else {
        stderr.trim()
    };

    // Detect error type
    let error_type = detect_error_type(primary);

    // If it's a checkout conflict, extract the conflicting files
    let conflicting_files = if error_type.as_deref() == Some("checkout_would_overwrite") {
        let files = extract_conflicting_files(primary);
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
        message: primary.to_string(),
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

/// Parse optional `[host]:port` into `(host, Option<port>)` for ssh-keyscan.
fn parse_ssh_host_port(raw_host: &str) -> (&str, Option<&str>) {
    if let Some(rest) = raw_host.strip_prefix('[') {
        if let Some((host_part, port_part)) = rest.split_once("]:") {
            if !host_part.is_empty() && !port_part.is_empty() && port_part.chars().all(|c| c.is_ascii_digit()) {
                return (host_part, Some(port_part));
            }
        }
    }
    (raw_host, None)
}

/// Add a host to SSH known_hosts using ssh-keyscan, verifying fingerprint when provided.
pub fn add_ssh_known_host(
    host: &str,
    expected_fingerprint: Option<&str>,
) -> Result<GitOperationResult, String> {
    use std::fs::OpenOptions;
    use std::io::{Read, Seek, SeekFrom, Write};
    use std::process::Stdio;

    let (scan_host, port) = parse_ssh_host_port(host.trim());
    validate_non_flag(scan_host, "SSH host")?;

    let mut keyscan = Command::new("ssh-keyscan");
    keyscan.arg("-t").arg("ed25519,rsa,ecdsa");
    if let Some(p) = port {
        keyscan.arg("-p").arg(p);
    }
    keyscan.arg("--").arg(scan_host);
    apply_no_window(&mut keyscan);

    let output = keyscan
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

    // Verify scanned keys contain the exact fingerprint the user approved (MITM protection)
    if let Some(expected_fp) = expected_fingerprint.filter(|fp| !fp.trim().is_empty()) {
        let mut keygen_cmd = Command::new("ssh-keygen");
        keygen_cmd
            .args(["-lf", "-"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        apply_no_window(&mut keygen_cmd);

        let mut child = keygen_cmd
            .spawn()
            .map_err(|e| format!("Failed to verify SSH fingerprint via ssh-keygen: {}", e))?;
        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(host_keys.as_bytes());
        }
        let fp_output = child
            .wait_with_output()
            .map_err(|e| format!("Failed to read ssh-keygen output: {}", e))?;

        let fp_stdout = String::from_utf8_lossy(&fp_output.stdout);
        let expected_clean = expected_fp.trim().trim_end_matches('.');
        let matched = fp_output.status.success()
            && fp_stdout
                .lines()
                .any(|line| line.split_whitespace().any(|tok| tok == expected_clean));

        if !matched {
            return Ok(GitOperationResult {
                success: false,
                message: format!(
                    "SSH host key fingerprint mismatch for '{}'. Refusing to add unverified keys.",
                    host
                ),
                requires_ssh_verification: None,
                requires_credential: None,
                error_type: Some("ssh_fingerprint_mismatch".to_string()),
                conflicting_files: None,
            });
        }
    }

    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .ok_or("Could not determine home directory")?;
    let ssh_dir = PathBuf::from(home).join(".ssh");
    let known_hosts_path = ssh_dir.join("known_hosts");

    std::fs::create_dir_all(&ssh_dir)
        .map_err(|e| format!("Failed to create .ssh directory: {}", e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&ssh_dir, std::fs::Permissions::from_mode(0o700));
    }

    let mut file = OpenOptions::new()
        .create(true)
        .read(true)
        .append(true)
        .open(&known_hosts_path)
        .map_err(|e| format!("Failed to open known_hosts: {}", e))?;

    // Ensure leading newline if existing known_hosts does not end with one
    if let Ok(meta) = file.metadata() {
        if meta.len() > 0 && file.seek(SeekFrom::End(-1)).is_ok() {
            let mut last_byte = [0u8; 1];
            if file.read_exact(&mut last_byte).is_ok() && last_byte[0] != b'\n' {
                let _ = file.write_all(b"\n");
            }
        }
    }

    file.write_all(host_keys.as_bytes())
        .map_err(|e| format!("Failed to write to known_hosts: {}", e))?;

    Ok(create_success_result(format!(
        "Host '{}' added to known hosts",
        host
    )))
}

/// Execute git pull using the git command line (handles authentication properly)
pub fn git_pull(repo_path: &str) -> Result<GitOperationResult, String> {
    let output = git_network_cmd(Some(repo_path))
        .arg("pull")
        .output()
        .map_err(|e| format!("Failed to execute git pull: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        let message = if stdout.contains("Already up to date") {
            "Already up to date".to_string()
        } else {
            stdout.trim().to_string()
        };
        Ok(create_success_result(message))
    } else {
        Ok(maybe_probe_ssh_verification(
            create_error_result(&stderr, &stdout),
            Some(repo_path),
            None,
        ))
    }
}

/// Execute git push using the git command line (handles authentication properly)
pub fn git_push(repo_path: &str) -> Result<GitOperationResult, String> {
    let output = git_network_cmd(Some(repo_path))
        .arg("push")
        .output()
        .map_err(|e| format!("Failed to execute git push: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // Git push outputs to stderr even on success
    if output.status.success() {
        let message = if stderr.contains("Everything up-to-date") {
            "Everything up-to-date".to_string()
        } else if stdout.is_empty() && stderr.is_empty() {
            "Push completed successfully".to_string()
        } else {
            format!("{}{}", stdout, stderr).trim().to_string()
        };
        Ok(create_success_result(message))
    } else {
        Ok(maybe_probe_ssh_verification(
            create_error_result(&stderr, &stdout),
            Some(repo_path),
            None,
        ))
    }
}

/// Execute git fetch using the git command line
pub fn git_fetch(repo_path: &str) -> Result<GitOperationResult, String> {
    let output = git_network_cmd(Some(repo_path))
        .arg("fetch")
        .arg("--all")
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
        Ok(maybe_probe_ssh_verification(
            create_error_result(&stderr, &stdout),
            Some(repo_path),
            None,
        ))
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
    let mut cmd = git_network_cmd(Some(repo_path));
    cmd.arg("fetch");

    let remote_hint = if options.all {
        cmd.arg("--all");
        None
    } else if let Some(remote) = &options.remote {
        validate_non_flag(remote, "remote")?;
        cmd.arg("--").arg(remote);
        Some(remote.as_str())
    } else {
        cmd.arg("--").arg("origin");
        Some("origin")
    };

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
        Ok(maybe_probe_ssh_verification(
            create_error_result(&stderr, &stdout),
            Some(repo_path),
            remote_hint,
        ))
    }
}

/// Execute git pull with options
pub fn git_pull_with_options(
    repo_path: &str,
    options: PullOptions,
) -> Result<GitOperationResult, String> {
    validate_non_flag(&options.remote, "remote")?;
    validate_non_flag(&options.branch, "branch")?;

    let mut cmd = git_network_cmd(Some(repo_path));
    cmd.arg("pull");

    if options.rebase {
        cmd.arg("--rebase");
    } else {
        cmd.arg("--no-rebase");
    }

    if options.autostash {
        cmd.arg("--autostash");
    }

    cmd.arg("--").arg(&options.remote).arg(&options.branch);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute git pull: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        let message = if stdout.contains("Already up to date") {
            "Already up to date".to_string()
        } else {
            stdout.trim().to_string()
        };
        Ok(create_success_result(message))
    } else {
        Ok(maybe_probe_ssh_verification(
            create_error_result(&stderr, &stdout),
            Some(repo_path),
            Some(&options.remote),
        ))
    }
}

/// Execute git push with options
pub fn git_push_with_options(
    repo_path: &str,
    options: PushOptions,
) -> Result<GitOperationResult, String> {
    validate_non_flag(&options.remote, "remote")?;
    validate_non_flag(&options.branch, "branch")?;
    validate_non_flag(&options.remote_branch, "remote branch")?;

    let mut cmd = git_network_cmd(Some(repo_path));
    cmd.arg("push");

    if options.force_with_lease {
        cmd.arg("--force-with-lease");
    }

    if options.push_tags {
        cmd.arg("--tags");
    }

    let refspec = format!("{}:{}", options.branch, options.remote_branch);
    cmd.arg("--").arg(&options.remote).arg(&refspec);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute git push: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        let message = if stderr.contains("Everything up-to-date") {
            "Everything up-to-date".to_string()
        } else if stdout.is_empty() && stderr.is_empty() {
            "Push completed successfully".to_string()
        } else {
            format!("{}{}", stdout, stderr).trim().to_string()
        };
        Ok(create_success_result(message))
    } else {
        Ok(maybe_probe_ssh_verification(
            create_error_result(&stderr, &stdout),
            Some(repo_path),
            Some(&options.remote),
        ))
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
        let path = String::from_utf8_lossy(entry.path_bytes()).to_string();
        let status = entry.status();

        if status.is_conflicted() {
            unstaged.push(FileStatus {
                path,
                status: "conflicted".to_string(),
                staged: false,
            });
            continue;
        }

        // Check for staged changes (index changes)
        if status.is_index_new() {
            staged.push(FileStatus {
                path: path.clone(),
                status: "new".to_string(),
                staged: true,
            });
        } else if status.is_index_modified() || status.is_index_typechange() {
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
                path,
                status: "untracked".to_string(),
                staged: false,
            });
        } else if status.is_wt_modified() || status.is_wt_typechange() {
            unstaged.push(FileStatus {
                path,
                status: "modified".to_string(),
                staged: false,
            });
        } else if status.is_wt_deleted() {
            unstaged.push(FileStatus {
                path,
                status: "deleted".to_string(),
                staged: false,
            });
        } else if status.is_wt_renamed() {
            unstaged.push(FileStatus {
                path,
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
    validate_non_flag(branch_name, "branch name")?;

    let output = git_cmd(Some(repo_path))
        .arg("checkout")
        .arg(branch_name)
        .arg("--")
        .output()
        .map_err(|e| format!("Failed to execute git checkout: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        let message = if stderr.contains("Switched to branch") {
            stderr.trim().to_string()
        } else if !stdout.is_empty() {
            stdout.trim().to_string()
        } else {
            format!("Switched to branch '{}'", branch_name)
        };
        Ok(create_success_result(message))
    } else {
        Ok(create_error_result(&stderr, &stdout))
    }
}

/// Execute git checkout with automatic stash/pop for handling uncommitted changes
pub fn git_checkout_with_stash(
    repo_path: &str,
    branch_name: &str,
    restore_changes: bool,
) -> Result<GitOperationResult, String> {
    validate_non_flag(branch_name, "branch name")?;

    // Record top stash OID before pushing so we never pop an unrelated older stash
    let before_stash = top_stash_oid(repo_path);

    let stash_output = git_cmd(Some(repo_path))
        .args([
            "stash",
            "push",
            "-u",
            "-m",
            &format!("Auto-stash before switching to {}", branch_name),
        ])
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

    let after_stash = top_stash_oid(repo_path);
    let created_stash = after_stash.is_some() && after_stash != before_stash;

    // Step 2: Checkout the target branch
    let checkout_output = git_cmd(Some(repo_path))
        .arg("checkout")
        .arg(branch_name)
        .arg("--")
        .output()
        .map_err(|e| format!("Failed to execute git checkout: {}", e))?;

    if !checkout_output.status.success() {
        let stderr = String::from_utf8_lossy(&checkout_output.stderr).to_string();

        let rollback_note = if created_stash {
            match git_cmd(Some(repo_path)).args(["stash", "pop"]).output() {
                Ok(pop) if pop.status.success() => "stash restored",
                _ => "failed to restore stash — your changes remain in stash@{0}",
            }
        } else {
            "no stash created"
        };

        return Ok(GitOperationResult {
            success: false,
            message: format!("Checkout failed ({}): {}", rollback_note, stderr.trim()),
            requires_ssh_verification: None,
            requires_credential: None,
            error_type: Some("checkout_failed".to_string()),
            conflicting_files: None,
        });
    }

    // Step 3: Optionally pop the stash only if we actually created one
    if restore_changes && created_stash {
        let pop_output = git_cmd(Some(repo_path))
            .args(["stash", "pop"])
            .output()
            .map_err(|e| format!("Failed to execute git stash pop: {}", e))?;

        if !pop_output.status.success() {
            let stderr = String::from_utf8_lossy(&pop_output.stderr).to_string();
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

        Ok(create_success_result(format!(
            "Switched to '{}' and restored changes",
            branch_name
        )))
    } else if created_stash {
        Ok(create_success_result(format!(
            "Switched to '{}' (changes saved in stash)",
            branch_name
        )))
    } else {
        Ok(create_success_result(format!(
            "Switched to '{}'",
            branch_name
        )))
    }
}

/// Create a local branch that tracks a remote branch and switch to it
pub fn git_checkout_track(
    repo_path: &str,
    local_branch: &str,
    remote_branch: &str,
) -> Result<GitOperationResult, String> {
    validate_git_ref(local_branch, "local branch")?;
    validate_non_flag(remote_branch, "remote branch")?;

    let output = git_cmd(Some(repo_path))
        .args(["checkout", "-b", local_branch, "--track", remote_branch])
        .output()
        .map_err(|e| format!("Failed to execute git checkout: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        let message = if stderr.contains("Switched to") {
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
    let mut cmd = git_cmd(Some(repo_path));
    cmd.arg("commit").arg("-m").arg(message);

    if amend {
        cmd.arg("--amend");
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute git commit: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        let message = if stdout.contains("create mode") || stdout.contains("delete mode") {
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
    validate_non_flag(name, "remote name")?;
    validate_non_flag(url, "remote URL")?;

    let output = git_cmd(Some(repo_path))
        .args(["remote", "add", "--", name, url])
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
    validate_non_flag(url, "remote URL")?;

    let output = git_network_cmd(None)
        .args(["ls-remote", "--exit-code", "--heads", "--", url])
        .output()
        .map_err(|e| format!("Failed to test connection: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(create_success_result("Connection successful".to_string()))
    } else {
        // Parse SSH verification/credentials from real stderr first (probing host if BatchMode suppressed fingerprint)
        let mut res = maybe_probe_ssh_verification(
            create_error_result(&stderr, &stdout),
            None,
            Some(url),
        );
        if res.requires_ssh_verification.is_some() || res.requires_credential.is_some() {
            return Ok(res);
        }
        res.message = if stderr.contains("Host key verification failed") {
            "SSH host key verification failed. Add the host to known_hosts first.".to_string()
        } else if stderr.contains("Permission denied") || stderr.contains("Authentication failed") {
            "Authentication failed. Check your credentials.".to_string()
        } else if stderr.contains("Could not resolve host") {
            "Could not resolve host. Check the URL.".to_string()
        } else if stderr.contains("Connection refused") {
            "Connection refused. Check if the server is accessible.".to_string()
        } else if res.message.is_empty() {
            "Could not connect to remote".to_string()
        } else {
            res.message
        };
        Ok(res)
    }
}

/// Create a new branch at a specific starting point
pub fn git_create_branch(
    repo_path: &str,
    branch_name: &str,
    start_point: &str,
    checkout: bool,
) -> Result<GitOperationResult, String> {
    validate_git_ref(branch_name, "branch name")?;
    validate_non_flag(start_point, "start point")?;

    if checkout {
        let output = git_cmd(Some(repo_path))
            .args(["checkout", "-b", branch_name, start_point, "--"])
            .output()
            .map_err(|e| format!("Failed to execute git checkout -b: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if output.status.success() {
            let message = if stderr.contains("Switched to") {
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
        let output = git_cmd(Some(repo_path))
            .args(["branch", "--", branch_name, start_point])
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
pub fn git_create_tag(
    repo_path: &str,
    tag_name: &str,
    start_point: &str,
    message: Option<&str>,
    push_to_remotes: bool,
) -> Result<GitOperationResult, String> {
    validate_git_ref(tag_name, "tag name")?;
    validate_non_flag(start_point, "start point")?;

    let mut cmd = git_cmd(Some(repo_path));
    cmd.arg("tag");
    if let Some(msg) = message.filter(|m| !m.trim().is_empty()) {
        cmd.arg("-a").arg("-m").arg(msg);
    }
    cmd.arg("--").arg(tag_name).arg(start_point);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute git tag: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Ok(create_error_result(&stderr, &stdout));
    }

    // Push only the newly created tag to every configured remote (no hardcoded "origin")
    if push_to_remotes {
        let remotes = get_remotes(&open_repository(repo_path)?)?;
        if remotes.is_empty() {
            return Ok(create_success_result(format!(
                "Tag '{}' created (no remotes configured)",
                tag_name
            )));
        }

        let tag_ref = format!("refs/tags/{}", tag_name);
        let mut failures: Vec<String> = Vec::new();

        for remote in &remotes {
            validate_non_flag(remote, "remote")?;
            let push_output = git_network_cmd(Some(repo_path))
                .args(["push", "--", remote, &tag_ref])
                .output()
                .map_err(|e| format!("Failed to execute git push tag to '{}': {}", remote, e))?;

            if !push_output.status.success() {
                let push_stdout = String::from_utf8_lossy(&push_output.stdout).to_string();
                let push_stderr = String::from_utf8_lossy(&push_output.stderr).to_string();
                let res = maybe_probe_ssh_verification(
                    create_error_result(&push_stderr, &push_stdout),
                    Some(repo_path),
                    Some(remote),
                );
                if res.requires_ssh_verification.is_some() || res.requires_credential.is_some() {
                    return Ok(res);
                }
                failures.push(format!("{}: {}", remote, res.message));
            }
        }

        if failures.is_empty() {
            Ok(create_success_result(format!(
                "Tag '{}' created and pushed to {}",
                tag_name,
                remotes.join(", ")
            )))
        } else {
            Ok(GitOperationResult {
                success: false,
                message: format!(
                    "Tag '{}' created but push failed ({})",
                    tag_name,
                    failures.join("; ")
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

/// Renames a local branch (and optionally the remote branch)
pub fn git_rename_branch(
    repo_path: &str,
    old_name: &str,
    new_name: &str,
    rename_remote: bool,
    remote_name: Option<&str>,
) -> Result<GitOperationResult, String> {
    validate_non_flag(old_name, "old branch name")?;
    validate_git_ref(new_name, "new branch name")?;

    let output = git_cmd(Some(repo_path))
        .args(["branch", "-m", "--", old_name, new_name])
        .output()
        .map_err(|e| format!("Failed to execute git branch -m: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Ok(create_error_result(&stderr, &stdout));
    }

    if rename_remote {
        if let Some(remote) = remote_name {
            validate_non_flag(remote, "remote")?;

            let push_output = git_network_cmd(Some(repo_path))
                .args(["push", "--", remote, new_name])
                .output()
                .map_err(|e| format!("Failed to push new branch: {}", e))?;

            if !push_output.status.success() {
                let push_stderr = String::from_utf8_lossy(&push_output.stderr).to_string();
                let push_stdout = String::from_utf8_lossy(&push_output.stdout).to_string();
                let mut res = create_error_result(&push_stderr, &push_stdout);
                if res.requires_ssh_verification.is_none() && res.requires_credential.is_none() {
                    res.message = format!(
                        "Local branch renamed but failed to push to remote: {}",
                        res.message
                    );
                    res.error_type = Some("push_failed".to_string());
                }
                return Ok(res);
            }

            let delete_output = git_network_cmd(Some(repo_path))
                .args(["push", "--delete", "--", remote, old_name])
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

            let upstream_output = git_cmd(Some(repo_path))
                .args(["branch", "-u", &format!("{}/{}", remote, new_name), "--", new_name])
                .output()
                .map_err(|e| format!("Failed to set upstream: {}", e))?;

            if upstream_output.status.success() {
                Ok(create_success_result(format!(
                    "Branch renamed from '{}' to '{}' (local and remote)",
                    old_name, new_name
                )))
            } else {
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

/// Deletes a local branch (and optionally the remote branch)
pub fn git_delete_branch(
    repo_path: &str,
    branch_name: &str,
    force: bool,
    delete_remote: bool,
    remote_name: Option<&str>,
) -> Result<GitOperationResult, String> {
    validate_non_flag(branch_name, "branch name")?;

    let delete_flag = if force { "-D" } else { "-d" };
    let output = git_cmd(Some(repo_path))
        .args(["branch", delete_flag, "--", branch_name])
        .output()
        .map_err(|e| format!("Failed to execute git branch {}: {}", delete_flag, e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
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

    if delete_remote {
        if let Some(remote) = remote_name {
            validate_non_flag(remote, "remote")?;
            let push_output = git_network_cmd(Some(repo_path))
                .args(["push", "--delete", "--", remote, branch_name])
                .output()
                .map_err(|e| format!("Failed to delete remote branch: {}", e))?;

            if !push_output.status.success() {
                let push_stderr = String::from_utf8_lossy(&push_output.stderr).to_string();
                let push_stdout = String::from_utf8_lossy(&push_output.stdout).to_string();
                let mut res = create_error_result(&push_stderr, &push_stdout);
                if res.requires_ssh_verification.is_none() && res.requires_credential.is_none() {
                    res.message = format!(
                        "Local branch deleted but failed to delete remote branch: {}",
                        res.message
                    );
                    res.error_type = Some("delete_remote_failed".to_string());
                }
                return Ok(res);
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

fn get_stashes_from_repo(repo: &mut Repository) -> Result<Vec<StashInfo>, String> {
    let mut raw_stashes: Vec<(usize, String, Oid)> = Vec::new();
    repo.stash_foreach(|index, message, oid| {
        raw_stashes.push((index, message.to_string(), *oid));
        true
    })
    .map_err(|e| format!("Failed to list stashes: {}", e.message()))?;

    let stashes = raw_stashes
        .into_iter()
        .map(|(index, message, oid)| {
            let timestamp = repo
                .find_commit(oid)
                .map(|c| c.time().seconds())
                .unwrap_or(0);
            let branch = extract_branch_from_stash_message(&message);
            StashInfo {
                index,
                id: format!("stash@{{{}}}", index),
                message,
                branch,
                timestamp,
            }
        })
        .collect();

    Ok(stashes)
}

pub fn get_stashes(repo_path: &str) -> Result<Vec<StashInfo>, String> {
    let mut repo = open_repository(repo_path)?;
    get_stashes_from_repo(&mut repo)
}

fn extract_branch_from_stash_message(message: &str) -> String {
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
    let before_stash = top_stash_oid(repo_path);

    let mut cmd = git_cmd(Some(repo_path));
    cmd.args(["stash", "push"]);

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

    if stderr.contains("No local changes to save") || stdout.contains("No local changes to save") {
        return Ok(GitOperationResult {
            success: false,
            message: "No local changes to save".to_string(),
            requires_ssh_verification: None,
            requires_credential: None,
            error_type: Some("no_changes".to_string()),
            conflicting_files: None,
        });
    }

    if !output.status.success() {
        return Ok(create_error_result(&stderr, &stdout));
    }

    let after_stash = top_stash_oid(repo_path);
    if after_stash == before_stash {
        return Ok(GitOperationResult {
            success: false,
            message: "No local changes to save".to_string(),
            requires_ssh_verification: None,
            requires_credential: None,
            error_type: Some("no_changes".to_string()),
            conflicting_files: None,
        });
    }

    Ok(create_success_result(
        "Stash saved successfully".to_string(),
    ))
}

pub fn git_stash_apply(repo_path: &str, stash_index: usize) -> Result<GitOperationResult, String> {
    let stash_ref = format!("stash@{{{}}}", stash_index);

    let output = git_cmd(Some(repo_path))
        .args(["stash", "apply", &stash_ref])
        .output()
        .map_err(|e| format!("Failed to apply stash: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        if stderr.contains("CONFLICT") || stdout.contains("CONFLICT") {
            return Ok(GitOperationResult {
                success: false,
                message: format!(
                    "Stash applied with conflicts. Resolve conflicts and commit.\n{}",
                    if stderr.trim().is_empty() { stdout.trim() } else { stderr.trim() }
                ),
                requires_ssh_verification: None,
                requires_credential: None,
                error_type: Some("conflicts".to_string()),
                conflicting_files: Some(get_unmerged_files(repo_path)),
            });
        }
        return Ok(create_error_result(&stderr, &stdout));
    }

    Ok(create_success_result(
        "Stash applied successfully".to_string(),
    ))
}

pub fn git_stash_pop(repo_path: &str, stash_index: usize) -> Result<GitOperationResult, String> {
    let stash_ref = format!("stash@{{{}}}", stash_index);

    let output = git_cmd(Some(repo_path))
        .args(["stash", "pop", &stash_ref])
        .output()
        .map_err(|e| format!("Failed to pop stash: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        if stderr.contains("CONFLICT") || stdout.contains("CONFLICT") {
            return Ok(GitOperationResult {
                success: false,
                message: format!(
                    "Stash popped with conflicts. Resolve conflicts and commit. The stash was not dropped.\n{}",
                    if stderr.trim().is_empty() { stdout.trim() } else { stderr.trim() }
                ),
                requires_ssh_verification: None,
                requires_credential: None,
                error_type: Some("conflicts".to_string()),
                conflicting_files: Some(get_unmerged_files(repo_path)),
            });
        }
        return Ok(create_error_result(&stderr, &stdout));
    }

    Ok(create_success_result(
        "Stash popped successfully".to_string(),
    ))
}

pub fn git_stash_drop(repo_path: &str, stash_index: usize) -> Result<GitOperationResult, String> {
    let stash_ref = format!("stash@{{{}}}", stash_index);

    let output = git_cmd(Some(repo_path))
        .args(["stash", "drop", &stash_ref])
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

fn check_image_size_limit(file_size: u64) -> Result<(), String> {
    if file_size > MAX_IMAGE_BYTES {
        return Err(format!(
            "Image exceeds maximum preview size ({} MB)",
            MAX_IMAGE_BYTES / (1024 * 1024)
        ));
    }
    Ok(())
}

/// Get current image content from working directory as base64
pub fn get_image_content(repo: &Repository, file_path: &str) -> Result<ImageContent, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let workdir = repo.workdir().ok_or("No working directory")?;
    let full_path = resolve_repo_path(workdir, file_path)?;

    let metadata = std::fs::metadata(&full_path)
        .map_err(|_| format!("File does not exist: {}", file_path))?;
    check_image_size_limit(metadata.len())?;

    let content = std::fs::read(&full_path).map_err(|e| format!("Failed to read file: {}", e))?;

    let file_size = content.len() as u64;
    check_image_size_limit(file_size)?;
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

    let file_size = blob.size() as u64;
    check_image_size_limit(file_size)?;
    let content = blob.content();
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

    let file_size = blob.size() as u64;
    check_image_size_limit(file_size)?;
    let content = blob.content();
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

/// Get a preview of what a merge would look like without modifying the working tree (in-process via git2)
pub fn get_merge_preview(repo_path: &str, source_branch: &str) -> Result<MergePreview, String> {
    validate_non_flag(source_branch, "source branch")?;

    let repo = open_repository(repo_path)?;
    let head = repo
        .head()
        .map_err(|e| format!("Failed to get current branch: {}", e.message()))?;
    let target_branch = head.shorthand().unwrap_or("HEAD").to_string();
    let head_commit = head
        .peel_to_commit()
        .map_err(|e| format!("Failed to resolve HEAD commit: {}", e.message()))?;

    let source_commit = repo
        .revparse_single(source_branch)
        .and_then(|o| o.peel_to_commit())
        .map_err(|e| format!("Failed to resolve '{}': {}", source_branch, e.message()))?;

    let merge_base_oid = repo
        .merge_base(head_commit.id(), source_commit.id())
        .map_err(|_| {
            format!(
                "Cannot find common ancestor between HEAD and '{}'. Are they related?",
                source_branch
            )
        })?;

    let (commits_ahead, _) = repo
        .graph_ahead_behind(source_commit.id(), head_commit.id())
        .map_err(|e| format!("Failed to count commits: {}", e.message()))?;

    let can_fast_forward = head_commit.id() == merge_base_oid;

    let base_tree = repo
        .find_commit(merge_base_oid)
        .and_then(|c| c.tree())
        .map_err(|e| format!("Failed to get merge base tree: {}", e.message()))?;
    let our_tree = head_commit
        .tree()
        .map_err(|e| format!("Failed to get HEAD tree: {}", e.message()))?;
    let their_tree = source_commit
        .tree()
        .map_err(|e| format!("Failed to get source tree: {}", e.message()))?;

    let merge_index = repo
        .merge_trees(&base_tree, &our_tree, &their_tree, None)
        .map_err(|e| format!("Failed to simulate merge: {}", e.message()))?;

    let mut seen = std::collections::HashSet::new();
    let mut conflicting_files = Vec::new();
    let has_conflicts = merge_index.has_conflicts();

    if has_conflicts {
        if let Ok(conflicts) = merge_index.conflicts() {
            for conflict in conflicts.flatten() {
                let path_bytes = conflict
                    .our
                    .as_ref()
                    .or(conflict.their.as_ref())
                    .or(conflict.ancestor.as_ref())
                    .map(|entry| entry.path.as_slice());
                if let Some(bytes) = path_bytes {
                    let path = String::from_utf8_lossy(bytes).to_string();
                    if !path.is_empty() && seen.insert(path.clone()) {
                        conflicting_files.push(path);
                    }
                }
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
    validate_non_flag(source_branch, "source branch")?;

    let mut cmd = git_cmd(Some(repo_path));
    cmd.arg("merge");

    match merge_type {
        "no-ff" => {
            cmd.arg("--no-ff");
        }
        "squash" => {
            cmd.arg("--squash");
        }
        _ => {}
    }

    cmd.arg("--").arg(source_branch);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute merge: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        if stdout.contains("CONFLICT")
            || stderr.contains("CONFLICT")
            || stdout.contains("Automatic merge failed")
            || stderr.contains("Automatic merge failed")
        {
            let conflicting_files = get_unmerged_files(repo_path);

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

    if merge_type == "squash" {
        return Ok(create_success_result(format!(
            "Squash merge completed. Changes are staged but not committed.\n{}",
            stdout.trim()
        )));
    }

    Ok(create_success_result(format!(
        "Merge completed successfully.\n{}",
        stdout.trim()
    )))
}

/// Abort an in-progress merge
pub fn git_merge_abort(repo_path: &str) -> Result<GitOperationResult, String> {
    let output = git_cmd(Some(repo_path))
        .args(["merge", "--abort"])
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

/// Get a preview of the rebase operation (in-process via git2)
pub fn get_rebase_preview(repo_path: &str, target_branch: &str) -> Result<RebasePreview, String> {
    validate_non_flag(target_branch, "target branch")?;

    let repo = open_repository(repo_path)?;
    let head = repo
        .head()
        .map_err(|e| format!("Failed to get current branch: {}", e.message()))?;
    let source_branch = head.shorthand().unwrap_or("HEAD").to_string();
    let head_commit = head
        .peel_to_commit()
        .map_err(|e| format!("Failed to resolve HEAD: {}", e.message()))?;

    let target_commit = repo
        .revparse_single(target_branch)
        .and_then(|o| o.peel_to_commit())
        .map_err(|_| format!("Failed to find common ancestor with '{}'", target_branch))?;

    let (commits_to_rebase, _) = repo
        .graph_ahead_behind(head_commit.id(), target_commit.id())
        .map_err(|_| format!("Failed to find common ancestor with '{}'", target_branch))?;

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
    validate_non_flag(target_branch, "target branch")?;

    let mut cmd = git_cmd(Some(repo_path));
    cmd.arg("rebase");

    if options.preserve_merges {
        cmd.arg("--rebase-merges");
    }

    if options.autostash {
        cmd.arg("--autostash");
    }

    cmd.arg("--").arg(target_branch);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute git rebase: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        if stderr.contains("CONFLICT")
            || stderr.contains("conflict")
            || stdout.contains("CONFLICT")
            || stdout.contains("could not apply")
        {
            let conflicting_files = get_unmerged_files(repo_path);

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

    if stdout.contains("is up to date") || stdout.contains("Already applied") {
        return Ok(create_success_result(
            "Already up to date, nothing to rebase.".to_string(),
        ));
    }

    Ok(create_success_result(format!(
        "Rebase onto '{}' completed successfully.",
        target_branch
    )))
}

/// Abort a rebase in progress
pub fn git_rebase_abort(repo_path: &str) -> Result<GitOperationResult, String> {
    let output = git_cmd(Some(repo_path))
        .args(["rebase", "--abort"])
        .output()
        .map_err(|e| format!("Failed to execute git rebase --abort: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
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
    let output = git_cmd(Some(repo_path))
        .args(["rebase", "--continue"])
        .env("GIT_EDITOR", "true")
        .output()
        .map_err(|e| format!("Failed to execute git rebase --continue: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        if stderr.contains("CONFLICT")
            || stderr.contains("conflict")
            || stdout.contains("CONFLICT")
            || stdout.contains("conflict")
        {
            return Ok(GitOperationResult {
                success: false,
                message: "There are still unresolved conflicts.".to_string(),
                requires_ssh_verification: None,
                requires_credential: None,
                error_type: Some("rebase_conflicts".to_string()),
                conflicting_files: Some(get_unmerged_files(repo_path)),
            });
        }

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
    validate_non_flag(target_branch, "target branch")?;

    let merge_base_output = git_cmd(Some(repo_path))
        .args(["merge-base", "HEAD", target_branch])
        .output()
        .map_err(|e| format!("Failed to get merge base: {}", e))?;

    if !merge_base_output.status.success() {
        return Err("Failed to find merge base between current branch and target".to_string());
    }

    let merge_base = String::from_utf8_lossy(&merge_base_output.stdout)
        .trim()
        .to_string();

    // Use ASCII unit separator (%x1f) so '|' in subjects/authors never corrupts fields
    let log_output = git_cmd(Some(repo_path))
        .args([
            "log",
            "--reverse",
            "--format=%H%x1f%h%x1f%s%x1f%an%x1f%aI",
            &format!("{}..HEAD", merge_base),
        ])
        .output()
        .map_err(|e| format!("Failed to get commits: {}", e))?;

    if !log_output.status.success() {
        let stderr = String::from_utf8_lossy(&log_output.stderr);
        return Err(format!("Failed to get commits: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&log_output.stdout);
    let mut entries = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.splitn(5, '\x1f').collect();
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

struct TempFileGuard(PathBuf);
impl Drop for TempFileGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

/// Execute interactive rebase with custom action sequence
pub fn git_interactive_rebase(
    repo_path: &str,
    target_branch: &str,
    entries: Vec<InteractiveRebaseEntry>,
    autostash: bool,
) -> Result<GitOperationResult, String> {
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    validate_non_flag(target_branch, "target branch")?;

    // Validate every commit short_id is strict ASCII hex so newline/exec directives cannot be injected
    for entry in &entries {
        validate_commit_hex_id(&entry.short_id)?;
    }

    let todo_content: String = entries
        .iter()
        .map(|entry| {
            // Strip newlines so commit subjects cannot inject extra todo commands
            let clean_msg: String = entry
                .message
                .chars()
                .map(|c| if c == '\n' || c == '\r' { ' ' } else { c })
                .collect();
            format!(
                "{} {} {}",
                entry.action.to_git_command(),
                entry.short_id,
                clean_msg.trim()
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temp_dir = std::env::temp_dir();
    let todo_file = temp_dir.join(format!("forky_rebase_todo_{}_{}", std::process::id(), nonce));
    let _todo_guard = TempFileGuard(todo_file.clone());

    fs::write(&todo_file, &todo_content)
        .map_err(|e| format!("Failed to write rebase todo file: {}", e))?;

    #[cfg(windows)]
    let script_file = temp_dir.join(format!(
        "forky_rebase_editor_{}_{}.cmd",
        std::process::id(),
        nonce
    ));
    #[cfg(not(windows))]
    let script_file = temp_dir.join(format!(
        "forky_rebase_editor_{}_{}.sh",
        std::process::id(),
        nonce
    ));
    let _script_guard = TempFileGuard(script_file.clone());

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        // Single-quote escape for POSIX /bin/sh
        let escaped_todo = todo_file.to_string_lossy().replace('\'', "'\\''");
        let script_content = format!("#!/bin/sh\ncp '{}' \"$1\"\n", escaped_todo);
        fs::write(&script_file, &script_content)
            .map_err(|e| format!("Failed to write editor script: {}", e))?;
        fs::set_permissions(&script_file, fs::Permissions::from_mode(0o700))
            .map_err(|e| format!("Failed to make script executable: {}", e))?;
    }

    #[cfg(windows)]
    {
        let script_content = format!(
            "@echo off\ncopy /Y \"{}\" \"%~1\" >nul\n",
            todo_file.to_string_lossy().replace('/', "\\")
        );
        fs::write(&script_file, &script_content)
            .map_err(|e| format!("Failed to write editor script: {}", e))?;
    }

    // Quote script path so spaces in temp_dir work when git runs `sh -c "$GIT_SEQUENCE_EDITOR <file>"`
    let seq_editor = format!(
        "\"{}\"",
        script_file.to_string_lossy().replace('\\', "/")
    );

    let mut cmd = git_cmd(Some(repo_path));
    cmd.args(["rebase", "-i"]);
    if autostash {
        cmd.arg("--autostash");
    }
    cmd.arg("--")
        .arg(target_branch)
        .env("GIT_SEQUENCE_EDITOR", &seq_editor)
        .env("GIT_EDITOR", "true");

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute git rebase: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        if stderr.contains("CONFLICT")
            || stderr.contains("conflict")
            || stdout.contains("CONFLICT")
            || stdout.contains("conflict")
        {
            let conflicting_files = get_unmerged_files(repo_path);

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

    // Detect if rebase paused (e.g. `edit` action) instead of reporting completed
    if let Ok(repo) = open_repository(repo_path) {
        let git_dir = repo.path();
        if git_dir.join("rebase-merge").exists() || git_dir.join("rebase-apply").exists() {
            return Ok(GitOperationResult {
                success: false,
                message: "Interactive rebase is paused for editing. Finish your edits and run 'git rebase --continue' (or '--abort') from the terminal.".to_string(),
                requires_ssh_verification: None,
                requires_credential: None,
                error_type: Some("rebase_paused".to_string()),
                conflicting_files: None,
            });
        }
    }

    if stdout.contains("is up to date") || stdout.contains("Already applied") {
        return Ok(create_success_result(
            "Already up to date, nothing to rebase.".to_string(),
        ));
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
    let branch_name = match repo.head() {
        Ok(head) => head.shorthand().unwrap_or("").to_string(),
        Err(e) if e.code() == ErrorCode::UnbornBranch => repo
            .find_reference("HEAD")
            .ok()
            .and_then(|r| {
                r.symbolic_target()
                    .map(|t| t.strip_prefix("refs/heads/").unwrap_or(t).to_string())
            })
            .unwrap_or_default(),
        Err(e) => return Err(format!("Failed to get HEAD: {}", e)),
    };

    let config = get_gitflow_config(repo)?;

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

    if !config.feature_prefix.is_empty() && branch_name.starts_with(&config.feature_prefix) {
        let name = branch_name[config.feature_prefix.len()..].to_string();
        return Ok(CurrentBranchFlowInfo {
            branch_type: GitFlowBranchType::Feature,
            name,
        });
    }

    if !config.release_prefix.is_empty() && branch_name.starts_with(&config.release_prefix) {
        let name = branch_name[config.release_prefix.len()..].to_string();
        return Ok(CurrentBranchFlowInfo {
            branch_type: GitFlowBranchType::Release,
            name,
        });
    }

    if !config.hotfix_prefix.is_empty() && branch_name.starts_with(&config.hotfix_prefix) {
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
    validate_git_ref(&branch_name, "branch name")?;
    validate_non_flag(&base_branch, "base branch")?;

    let output = git_cmd(Some(repo_path))
        .args(["checkout", "-b", &branch_name, &base_branch, "--"])
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
    validate_non_flag(&branch_name, "branch name")?;
    let mut messages = Vec::new();

    for target in &target_branches {
        validate_non_flag(target, "target branch")?;
        let output = git_cmd(Some(repo_path))
            .args(["checkout", target, "--"])
            .output()
            .map_err(|e| format!("Failed to execute git checkout: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Ok(create_error_result(
                &format!("Failed to checkout '{}': {}", target, stderr),
                "",
            ));
        }

        let merge_message = format!("Merge {} '{}' into {}", flow_type, name, target);
        let output = git_cmd(Some(repo_path))
            .args(["merge", "--no-ff", "-m", &merge_message, "--", &branch_name])
            .output()
            .map_err(|e| format!("Failed to execute git merge: {}", e))?;

        if !output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();

            if stdout.contains("CONFLICT")
                || stderr.contains("CONFLICT")
                || stdout.contains("Automatic merge failed")
                || stderr.contains("Automatic merge failed")
            {
                return Ok(GitOperationResult {
                    success: false,
                    message: format!("Merge conflict while merging into '{}'. Please resolve conflicts manually.", target),
                    requires_ssh_verification: None,
                    requires_credential: None,
                    error_type: Some("merge_conflict".to_string()),
                    conflicting_files: Some(get_unmerged_files(repo_path)),
                });
            }

            return Ok(create_error_result(
                &format!("Failed to merge into '{}': {}", target, if stderr.trim().is_empty() { stdout.trim() } else { stderr.trim() }),
                "",
            ));
        }

        messages.push(format!("Merged into '{}'", target));
    }

    // Create tag for release/hotfix (on master branch) respecting version_tag_prefix
    if create_tag {
        let master_co = git_cmd(Some(repo_path))
            .args(["checkout", &config.master_branch, "--"])
            .output()
            .map_err(|e| format!("Failed to checkout '{}': {}", config.master_branch, e))?;

        if !master_co.status.success() {
            let stderr = String::from_utf8_lossy(&master_co.stderr);
            return Ok(create_error_result(
                &format!(
                    "Merged successfully but failed to checkout '{}' for tagging: {}",
                    config.master_branch,
                    stderr.trim()
                ),
                "",
            ));
        }

        let tag_name = format!("{}{}", config.version_tag_prefix, name);
        validate_git_ref(&tag_name, "tag name")?;
        let tag_message = format!(
            "{} {}",
            if flow_type == "release" {
                "Release"
            } else {
                "Hotfix"
            },
            name
        );
        let output = git_cmd(Some(repo_path))
            .args(["tag", "-a", "-m", &tag_message, "--", &tag_name])
            .output()
            .map_err(|e| format!("Failed to create tag: {}", e))?;

        if output.status.success() {
            messages.push(format!("Created tag '{}'", tag_name));
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            if !stderr.contains("already exists") {
                messages.push(format!("Warning: Could not create tag: {}", stderr.trim()));
            }
        }
    }

    // Safe delete only (never silently force-delete with -D)
    if delete_branch {
        let output = git_cmd(Some(repo_path))
            .args(["branch", "-d", "--", &branch_name])
            .output()
            .map_err(|e| format!("Failed to delete branch: {}", e))?;

        if output.status.success() {
            messages.push(format!("Deleted branch '{}'", branch_name));
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            messages.push(format!(
                "Warning: Could not safely delete branch '{}': {}",
                branch_name,
                stderr.trim()
            ));
        }
    }

    let _ = git_cmd(Some(repo_path))
        .args(["checkout", &config.develop_branch, "--"])
        .output();

    Ok(create_success_result(messages.join(". ")))
}

// ============================================================================
// Global Git Identity
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitIdentity {
    pub name: Option<String>,
    pub email: Option<String>,
}

/// Read a single global git config entry. Returns None if it is unset.
fn read_global_config(key: &str) -> Option<String> {
    let output = git_cmd(None)
        .args(["config", "--global", "--get", key])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

/// Read the global git identity (user.name / user.email) in-process via git2,
/// falling back to the git CLI only if opening the global config fails.
pub fn git_get_global_identity() -> Result<GitIdentity, String> {
    if let Ok(mut global_cfg) =
        git2::Config::open_default().and_then(|c| c.open_level(git2::ConfigLevel::Global))
    {
        if let Ok(snapshot) = global_cfg.snapshot() {
            let read_key = |key: &str| {
                snapshot
                    .get_string(key)
                    .ok()
                    .map(|v| v.trim().to_string())
                    .filter(|v| !v.is_empty())
            };
            return Ok(GitIdentity {
                name: read_key("user.name"),
                email: read_key("user.email"),
            });
        }
    }

    Ok(GitIdentity {
        name: read_global_config("user.name"),
        email: read_global_config("user.email"),
    })
}

/// Write user.name and user.email at the global level
pub fn git_set_global_identity(name: &str, email: &str) -> Result<GitOperationResult, String> {
    let name = name.trim();
    let email = email.trim();

    if name.is_empty() {
        return Ok(create_error_result("Name cannot be empty", ""));
    }
    if email.is_empty() {
        return Ok(create_error_result("Email cannot be empty", ""));
    }

    let set_name = git_cmd(None)
        .args(["config", "--global", "--", "user.name", name])
        .output()
        .map_err(|e| format!("Failed to set user.name: {}", e))?;

    if !set_name.status.success() {
        let stderr = String::from_utf8_lossy(&set_name.stderr).to_string();
        let stdout = String::from_utf8_lossy(&set_name.stdout).to_string();
        return Ok(create_error_result(&stderr, &stdout));
    }

    let set_email = git_cmd(None)
        .args(["config", "--global", "--", "user.email", email])
        .output()
        .map_err(|e| format!("Failed to set user.email: {}", e))?;

    if !set_email.status.success() {
        let stderr = String::from_utf8_lossy(&set_email.stderr).to_string();
        let stdout = String::from_utf8_lossy(&set_email.stdout).to_string();
        return Ok(create_error_result(&stderr, &stdout));
    }

    Ok(create_success_result(
        "Global Git identity updated".to_string(),
    ))
}

/// Fast-forward a local branch to match its remote tracking branch
pub fn git_fast_forward(
    repo_path: &str,
    branch: &str,
    remote: &str,
) -> Result<GitOperationResult, String> {
    validate_non_flag(branch, "branch")?;
    validate_non_flag(remote, "remote")?;

    let repo = open_repository(repo_path)?;

    let head = repo.head().map_err(|e| e.to_string())?;
    let current_branch = head
        .shorthand()
        .map(|s| s.to_string())
        .unwrap_or_default();

    let is_current_branch = current_branch == branch;

    if is_current_branch {
        let remote_ref = format!("{}/{}", remote, branch);

        let fetch_output = git_network_cmd(Some(repo_path))
            .args(["fetch", "--", remote, branch])
            .output()
            .map_err(|e| format!("Failed to execute git fetch: {}", e))?;

        if !fetch_output.status.success() {
            let stdout = String::from_utf8_lossy(&fetch_output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&fetch_output.stderr).to_string();
            return Ok(create_error_result(&stderr, &stdout));
        }

        let merge_output = git_cmd(Some(repo_path))
            .args(["merge", "--ff-only", "--", &remote_ref])
            .output()
            .map_err(|e| format!("Failed to execute git merge: {}", e))?;

        let stdout = String::from_utf8_lossy(&merge_output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&merge_output.stderr).to_string();

        if !merge_output.status.success() {
            if stderr.contains("Not possible to fast-forward")
                || stderr.contains("diverging branches")
            {
                return Ok(GitOperationResult {
                    success: false,
                    message: format!(
                        "Cannot fast-forward '{}': branches have diverged",
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
        // Update both local branch and remote-tracking ref so ahead/behind stays accurate
        let local_refspec = format!("refs/heads/{}:refs/heads/{}", branch, branch);
        let remote_refspec = format!("refs/heads/{}:refs/remotes/{}/{}", branch, remote, branch);

        let output = git_network_cmd(Some(repo_path))
            .args(["fetch", "--", remote, &local_refspec, &remote_refspec])
            .output()
            .map_err(|e| format!("Failed to execute git fetch: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !output.status.success() {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_non_flag_blocks_option_injection() {
        assert!(validate_non_flag("--upload-pack=sh", "remote URL").is_err());
        assert!(validate_non_flag("  -f", "host").is_err());
        assert!(validate_non_flag("", "branch").is_err());
        assert!(validate_non_flag("a\0b", "branch").is_err());
        assert!(validate_non_flag("https://github.com/user/repo.git", "remote URL").is_ok());
        assert!(validate_non_flag("git@github.com:user/repo.git", "remote URL").is_ok());
    }

    #[test]
    fn validate_git_ref_checks_rules() {
        assert!(validate_git_ref("feature/login-fix", "branch").is_ok());
        assert!(validate_git_ref("-evil", "branch").is_err());
        assert!(validate_git_ref("foo..bar", "branch").is_err());
        assert!(validate_git_ref("foo.lock", "branch").is_err());
    }

    #[test]
    fn resolve_repo_path_blocks_traversal_and_absolute() {
        let root = std::env::temp_dir();
        assert!(resolve_repo_path(&root, "src/main.rs").is_ok());
        assert!(resolve_repo_path(&root, "../etc/passwd").is_err());
        assert!(resolve_repo_path(&root, "a/../../outside").is_err());
        assert!(resolve_repo_path(&root, "/etc/passwd").is_err());
        assert!(resolve_repo_path(&root, "").is_err());
    }

    #[test]
    fn parse_ssh_host_port_handles_bracketed_ports() {
        assert_eq!(parse_ssh_host_port("github.com"), ("github.com", None));
        assert_eq!(
            parse_ssh_host_port("[git.example.com]:2222"),
            ("git.example.com", Some("2222"))
        );
    }

    #[test]
    fn generate_patch_preserves_no_newline_and_crlf() {
        let hunk = HunkData {
            old_start: 1,
            old_lines: 2,
            new_start: 1,
            new_lines: 2,
            lines: vec![
                HunkLineData {
                    content: "line1\r\n".to_string(),
                    line_type: "context".to_string(),
                },
                HunkLineData {
                    content: "old".to_string(),
                    line_type: "delete".to_string(),
                },
                HunkLineData {
                    content: "\\ No newline at end of file\n".to_string(),
                    line_type: "no_newline".to_string(),
                },
                HunkLineData {
                    content: "new\r\n".to_string(),
                    line_type: "add".to_string(),
                },
            ],
        };
        let patch = generate_patch("src/file.txt", &hunk);
        assert!(patch.contains(" line1\r\n"));
        assert!(patch.contains("\n\\ No newline at end of file\n"));
        assert!(!patch.contains(" \\ No newline"));
        assert!(patch.contains("+new\r\n"));
    }

    #[test]
    fn generate_patch_handles_new_and_deleted_file_headers() {
        let new_hunk = HunkData {
            old_start: 0,
            old_lines: 0,
            new_start: 1,
            new_lines: 1,
            lines: vec![HunkLineData {
                content: "hello\n".to_string(),
                line_type: "add".to_string(),
            }],
        };
        let new_patch = generate_patch("added.txt", &new_hunk);
        assert!(new_patch.contains("new file mode 100644\n--- /dev/null\n+++ b/added.txt\n"));

        let del_hunk = HunkData {
            old_start: 1,
            old_lines: 1,
            new_start: 0,
            new_lines: 0,
            lines: vec![HunkLineData {
                content: "bye\n".to_string(),
                line_type: "delete".to_string(),
            }],
        };
        let del_patch = generate_patch("removed.txt", &del_hunk);
        assert!(del_patch.contains("deleted file mode 100644\n--- a/removed.txt\n+++ /dev/null\n"));
    }

    #[test]
    fn validate_commit_hex_id_blocks_rebase_todo_injection() {
        assert!(validate_commit_hex_id("abc1234").is_ok());
        assert!(validate_commit_hex_id("abc1234\nexec calc").is_err());
        assert!(validate_commit_hex_id("").is_err());
        assert!(validate_commit_hex_id("zzzzzz").is_err());
    }

    #[test]
    fn extract_ssh_host_handles_scp_and_ssh_urls() {
        assert_eq!(
            extract_ssh_host_from_url("git@github.com:org/repo.git").as_deref(),
            Some("github.com")
        );
        assert_eq!(
            extract_ssh_host_from_url("ssh://git@git.example.com:2222/org/repo.git").as_deref(),
            Some("[git.example.com]:2222")
        );
        assert_eq!(
            extract_ssh_host_from_url("https://github.com/org/repo.git"),
            None
        );
    }

    fn create_temp_git_repo(tag: &str) -> (PathBuf, Repository) {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "forky_test_{}_{}_{}",
            tag,
            std::process::id(),
            nanos
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let repo = Repository::init(&dir).unwrap();
        (dir, repo)
    }

    fn commit_file(repo: &Repository, file_name: &str, content: &str, message: &str) -> Oid {
        let workdir = repo.workdir().unwrap();
        std::fs::write(workdir.join(file_name), content).unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new(file_name)).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig = git2::Signature::now("Test User", "test@example.com").unwrap();
        let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
        let parents: Vec<&git2::Commit> = parent.iter().collect();
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)
            .unwrap()
    }

    #[test]
    fn calculate_ahead_behind_oids_shortcuts_equal_and_caches() {
        let (dir, repo) = create_temp_git_repo("ahead_behind");
        let c1 = commit_file(&repo, "a.txt", "one\n", "first");
        let c2 = commit_file(&repo, "a.txt", "two\n", "second");

        // Equal OIDs short-circuit immediately without needing cache entry
        assert_eq!(calculate_ahead_behind_oids(&repo, c2, c2), (Some(0), Some(0)));

        // Distinct OIDs compute and populate static cache
        assert_eq!(calculate_ahead_behind_oids(&repo, c2, c1), (Some(1), Some(0)));
        {
            let cache = ahead_behind_cache().lock().unwrap();
            assert_eq!(cache.get(&(c2, c1)), Some(&(1, 0)));
        }
        // Subsequent call hits cache and returns same counts
        assert_eq!(calculate_ahead_behind_oids(&repo, c2, c1), (Some(1), Some(0)));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn diff_limits_truncate_large_and_detect_binary_in_8kb_probe() {
        // Exceeds MAX_DIFF_BYTES
        let big_text = vec![b'a'; (MAX_DIFF_BYTES as usize) + 64];
        let diff_big = diff_from_bytes("big.txt", &big_text, true, false);
        assert!(diff_big.is_truncated);
        assert!(diff_big.hunks.is_empty());
        assert_eq!(diff_big.file_size, Some(big_text.len() as u64));

        // Exceeds MAX_DIFF_LINES while under MAX_DIFF_BYTES
        let many_lines = "x\n".repeat(MAX_DIFF_LINES + 250);
        assert!((many_lines.len() as u64) < MAX_DIFF_BYTES);
        let diff_many = diff_from_bytes("many.txt", many_lines.as_bytes(), true, false);
        assert!(diff_many.is_truncated);
        assert_eq!(diff_many.hunks.len(), 1);
        assert_eq!(diff_many.hunks[0].lines.len(), MAX_DIFF_LINES);

        // Large untracked binary file detected from first 8 KB probe without truncating as text
        let (dir, repo) = create_temp_git_repo("diff_probe");
        let mut binary_blob = vec![0u8; 16];
        binary_blob.resize((MAX_DIFF_BYTES as usize) + 1024, b'Z');
        std::fs::write(dir.join("huge.bin"), &binary_blob).unwrap();
        let diff_bin = get_untracked_file_diff(&repo, "huge.bin").unwrap();
        assert!(diff_bin.is_binary);
        assert!(!diff_bin.is_truncated);
        assert_eq!(diff_bin.file_size, Some(binary_blob.len() as u64));

        // Large untracked text file returns truncated without loading full lines
        let big_untracked = vec![b't'; (MAX_DIFF_BYTES as usize) + 128];
        std::fs::write(dir.join("huge.txt"), &big_untracked).unwrap();
        let diff_untracked = get_untracked_file_diff(&repo, "huge.txt").unwrap();
        assert!(!diff_untracked.is_binary);
        assert!(diff_untracked.is_truncated);
        assert!(diff_untracked.hunks.is_empty());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn get_commits_paginates_with_offset_without_gaps_or_overlaps() {
        let (dir, repo) = create_temp_git_repo("pagination");
        for i in 1..=5 {
            commit_file(&repo, "log.txt", &format!("v{}\n", i), &format!("commit {}", i));
        }

        let all = get_commits(&repo, 10, 0).unwrap();
        assert_eq!(all.len(), 5);

        let page1 = get_commits(&repo, 2, 0).unwrap();
        let page2 = get_commits(&repo, 2, 2).unwrap();
        let page3 = get_commits(&repo, 2, 4).unwrap();
        let page4 = get_commits(&repo, 2, 6).unwrap();

        assert_eq!(page1.len(), 2);
        assert_eq!(page2.len(), 2);
        assert_eq!(page3.len(), 1);
        assert!(page4.is_empty());

        let combined_ids: Vec<String> = page1
            .into_iter()
            .chain(page2)
            .chain(page3)
            .map(|c| c.id)
            .collect();
        let all_ids: Vec<String> = all.into_iter().map(|c| c.id).collect();
        assert_eq!(combined_ids, all_ids);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
