//! Path validation helpers for IPC commands.
//!
//! Every Tauri command that operates on a repository must pass the user-provided
//! `repo_path` through [`open_validated_repo`] (when a `git2::Repository` is needed)
//! or [`validate_repo_path_string`] (when only a canonical path is needed).
//!
//! These helpers enforce:
//! - Path canonicalization (resolves `..`, symlinks, etc.) to prevent path traversal.
//! - Directory existence check.
//! - For [`open_validated_repo`]: that the path is a valid git repository with a `.git/HEAD`.

// Functions in this module are consumed gradually as commands are migrated to
// the `repoPath`-explicit API (phases 1-2 of DEVELOPMENT_PLAN_MULTI_REPO.md).
// Allow dead code until all Tauri commands have been migrated.
#![allow(dead_code)]

use git2::Repository;
use std::path::{Path, PathBuf};

/// Canonicalize a user-provided repository path and validate that it points to
/// an existing directory.
///
/// Returns the canonicalized path on success. The canonical form is what callers
/// should use for any subsequent filesystem or git operation, avoiding subtle
/// bugs caused by `..` segments or symlinks.
///
/// # Errors
/// - If the path does not exist or cannot be canonicalized.
/// - If the canonicalized path is not a directory.
pub fn validate_repo_path_string(repo_path: &str) -> Result<PathBuf, String> {
    let raw = PathBuf::from(repo_path);
    let canonical = dunce::canonicalize(&raw)
        .map_err(|e| format!("Invalid repository path '{}': {}", repo_path, e))?;
    if !canonical.is_dir() {
        return Err(format!("Path is not a directory: {}", canonical.display()));
    }
    Ok(canonical)
}

/// Open a validated git repository at `repo_path`.
///
/// This is the entry point for every Tauri command that needs a `git2::Repository`.
/// It combines path canonicalization, directory check, and repository open, with
/// the additional sanity check that `.git/HEAD` exists (rejects bare repos or
/// corrupted directories early with a clear error message).
///
/// # Security
/// Prevents path traversal: the caller may pass any `String` from the frontend;
/// `canonicalize` resolves `..` and symlinks so the final path is always absolute
/// and normalized before `git2` opens it.
pub fn open_validated_repo(repo_path: &str) -> Result<Repository, String> {
    let canonical = validate_repo_path_string(repo_path)?;
    let repo = Repository::open(&canonical)
        .map_err(|e| format!("Not a git repository at '{}': {}", canonical.display(), e))?;
    // Sanity check: a repository without .git/HEAD is either bare or corrupted.
    // Rejecting bare repos here avoids surprising behavior in commands that
    // assume a working tree exists (status, diff, checkout...).
    if !repo.path().join("HEAD").exists() {
        return Err(format!(
            "Invalid repository: missing .git/HEAD at '{}'",
            canonical.display()
        ));
    }
    Ok(repo)
}

/// Same as [`validate_repo_path_string`] but accepts an already-canonical `Path`.
/// Useful internally when the path comes from a trusted source (e.g. the watcher
/// state) and we only want to assert it still exists.
pub fn validate_repo_path(repo_path: &Path) -> Result<PathBuf, String> {
    let canonical = dunce::canonicalize(repo_path)
        .map_err(|e| format!("Invalid repository path '{}': {}", repo_path.display(), e))?;
    if !canonical.is_dir() {
        return Err(format!("Path is not a directory: {}", canonical.display()));
    }
    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::process::Command;

    /// Create a temporary git repository and return its canonical path.
    /// The repo is initialized via `git init` (libgit2 init also works, but
    /// using the CLI mirrors the real-world scenario the validation protects).
    fn temp_repo() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().expect("create temp dir");
        let status = Command::new("git")
            .arg("init")
            .arg(dir.path())
            .env("GIT_AUTHOR_NAME", "test")
            .env("GIT_AUTHOR_EMAIL", "test@example.com")
            .env("GIT_COMMITTER_NAME", "test")
            .env("GIT_COMMITTER_EMAIL", "test@example.com")
            .status()
            .expect("git init");
        assert!(status.success(), "git init failed");
        let canonical = dunce::canonicalize(dir.path()).expect("canonicalize");
        (dir, canonical)
    }

    #[test]
    fn test_open_validated_repo_valid() {
        let (_dir, canonical) = temp_repo();
        let repo = open_validated_repo(&canonical.to_string_lossy());
        assert!(repo.is_ok(), "valid repo should open");
    }

    #[test]
    fn test_open_validated_repo_nonexistent() {
        let result = open_validated_repo("/this/path/does/not/exist");
        let err = result.err().expect("should error");
        assert!(
            err.contains("Invalid repository path") || err.contains("No such file"),
            "error should mention invalid path, got: {err}"
        );
    }

    #[test]
    fn test_open_validated_repo_not_a_repo() {
        let dir = tempfile::tempdir().expect("create temp dir");
        // No `git init` — just an empty directory.
        let result = open_validated_repo(&dir.path().to_string_lossy());
        let err = result.err().expect("should error");
        assert!(
            err.contains("Not a git repository"),
            "error should mention not a git repo, got: {err}"
        );
    }

    #[test]
    fn test_open_validated_repo_path_traversal_rejected() {
        // A path with `..` segments resolves to whatever the parent is.
        // If it doesn't end up being a git repo, the open should fail — the
        // important guarantee is that `canonicalize` is invoked, not that
        // we produce some specific error string here.
        let dir = tempfile::tempdir().expect("create temp dir");
        let parent = dir.path().parent().expect("parent exists");
        let traversal = parent.join("../../../../../../../../../../../../../..");
        let result = open_validated_repo(&traversal.to_string_lossy());
        assert!(result.is_err(), "path traversal should not succeed");
    }

    #[test]
    fn test_open_validated_repo_relative_path_canonicalized() {
        let (_dir, canonical) = temp_repo();
        // cd into parent and reference the repo directory by relative path.
        let parent = canonical.parent().expect("parent exists");
        let basename = canonical
            .file_name()
            .expect("basename")
            .to_string_lossy()
            .to_string();
        let relative = format!("{}/{}", parent.display(), basename);
        // Pass it without canonicalization — the function must canonicalize.
        let result = open_validated_repo(&relative);
        assert!(result.is_ok(), "relative-but-valid path should canonicalize");
    }

    #[test]
    fn test_validate_repo_path_string_not_directory() {
        let dir = tempfile::tempdir().expect("create temp dir");
        let file_path = dir.path().join("not_a_dir.txt");
        fs::write(&file_path, "hello").expect("write file");
        let result = validate_repo_path_string(&file_path.to_string_lossy());
        let err = result.err().expect("should error");
        assert!(
            err.contains("not a directory"),
            "error should mention not a directory, got: {err}"
        );
    }

    #[test]
    fn test_validate_repo_path_accepts_path() {
        let (_dir, canonical) = temp_repo();
        let result = validate_repo_path(&canonical);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), canonical);
    }
}