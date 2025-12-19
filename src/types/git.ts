export interface CommitInfo {
  id: string;
  short_id: string;
  message: string;
  author: string;
  author_email: string;
  date: string;
  parent_ids: string[];
}

export interface BranchInfo {
  name: string;
  is_head: boolean;
  is_remote: boolean;
  upstream: string | null;
}

export interface BranchHead {
  name: string;
  commit_sha: string;
  is_head: boolean;
}

export interface TagInfo {
  name: string;
  commit_sha: string;
}

export interface FileStatus {
  path: string;
  status: string;
  staged: boolean;
}

export interface RepositoryInfo {
  path: string;
  name: string;
  current_branch: string | null;
  is_bare: boolean;
  is_empty: boolean;
}

export interface DiffHunk {
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  content: string;
  line_type: "add" | "delete" | "context";
  old_line_no: number | null;
  new_line_no: number | null;
}

export interface DiffInfo {
  file_path: string;
  old_content: string | null;
  new_content: string | null;
  hunks: DiffHunk[];
  is_binary: boolean;
  binary_type: string | null; // "image", "pdf", "other"
  file_size: number | null;
}

export interface RepositoryTab {
  id: string;
  path: string;
  name: string;
  currentBranch: string | null;
}

export interface FileStatusSeparated {
  unstaged: FileStatus[];
  staged: FileStatus[];
}

export type ViewMode = 'local-changes' | 'all-commits';

export interface SshHostVerification {
  host: string;
  key_type: string;
  fingerprint: string;
}

export interface CredentialRequest {
  credential_type: 'username' | 'password' | 'passphrase';
  prompt: string;
  host?: string;
}

export interface GitOperationResult {
  success: boolean;
  message: string;
  requires_ssh_verification?: SshHostVerification;
  requires_credential?: CredentialRequest;
  error_type?: string;
}

// Git operation options storage (persisted per repository)
export interface GitOptionsStorage {
  fetch?: {
    remote: string;
    all: boolean;
  };
  pull?: {
    remote: string;
    branch: string;
    rebase: boolean;
    autostash: boolean;
  };
  push?: {
    remote: string;
    pushTags: boolean;
    forceWithLease: boolean;
  };
}
