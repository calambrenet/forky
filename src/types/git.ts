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
  ahead: number | null;
  behind: number | null;
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

export interface StashInfo {
  index: number;
  id: string;
  message: string;
  branch: string;
  timestamp: number;
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

// HunkData for sending to backend (for stage/unstage/discard operations)
export interface HunkData {
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  lines: HunkLineData[];
}

export interface HunkLineData {
  content: string;
  line_type: string;
}

export interface DiffLine {
  content: string;
  line_type: 'add' | 'delete' | 'context';
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
  hasPendingChanges: boolean;
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
  conflicting_files?: string[];
}

// Merge preview for merge modal
export interface MergePreview {
  source_branch: string;
  target_branch: string;
  commits_ahead: number;
  can_fast_forward: boolean;
  has_conflicts: boolean;
  conflicting_files: string[];
}

// Merge type options
export type MergeType = 'default' | 'no-ff' | 'squash';

// Rebase preview for rebase modal
export interface RebasePreview {
  source_branch: string;
  target_branch: string;
  commits_to_rebase: number;
}

// Rebase options
export interface RebaseOptions {
  preserve_merges: boolean;
  autostash: boolean;
}

// Interactive rebase action type
export type RebaseAction = 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop';

// Interactive rebase entry
export interface InteractiveRebaseEntry {
  action: RebaseAction;
  commit_id: string;
  short_id: string;
  message: string;
  author: string;
  date: string;
}

// Git operation state for UI display
export interface GitOperationState {
  isActive: boolean;
  operationName: 'Fetch' | 'Pull' | 'Push' | 'Commit';
  operationTarget?: string;
  statusMessage: string;
  isComplete: boolean;
  isError: boolean;
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

// Git activity log entry
export interface GitLogEntry {
  id: string;
  timestamp: Date;
  operationType:
    | 'Fetch'
    | 'Pull'
    | 'Push'
    | 'Checkout'
    | 'Branch'
    | 'Commit'
    | 'Merge'
    | 'Stash'
    | 'Other';
  operationName: string;
  command: string;
  output: string;
  success: boolean;
  isBackground?: boolean;
}

// Commit message with subject and body
export interface CommitMessage {
  subject: string;
  body: string;
}

// Remote branch sorting order
export type RemoteSortOrder =
  | 'alphabetically'
  | 'alphabetically-master-top'
  | 'alphabetically-backward'
  | 'alphabetically-backward-master-top';

// Panel sizes for UI layout
export interface PanelSizes {
  sidebarWidth: number;
  commitPanelHeight: number;
  diffSidebarWidth: number;
}

// Modal types
export type ModalType = 'fetch' | 'pull' | 'push' | null;

// SSH verification state for modal
export interface SshVerificationState {
  isOpen: boolean;
  hostInfo: {
    host: string;
    keyType: string;
    fingerprint: string;
  } | null;
  pendingOperation: (() => Promise<void>) | null;
}

// Credential modal state
export interface CredentialModalState {
  isOpen: boolean;
  request: CredentialRequest | null;
  pendingOperation: ((credential: string) => Promise<void>) | null;
}

// Tab state for repository views
export interface TabState {
  branches: BranchInfo[];
  branchHeads: BranchHead[];
  tags: TagInfo[];
  stashes: StashInfo[];
  remotes: string[];
  commits: CommitInfo[];
  fileStatuses: FileStatus[];
  selectedCommitId: string | null;
  selectedFile: FileStatus | null;
  viewMode: ViewMode;
}

// Git Flow types
export interface GitFlowConfig {
  initialized: boolean;
  master_branch: string;
  develop_branch: string;
  feature_prefix: string;
  release_prefix: string;
  hotfix_prefix: string;
  version_tag_prefix: string;
}

export type GitFlowBranchType = 'Feature' | 'Release' | 'Hotfix' | 'Master' | 'Develop' | 'Other';

export interface CurrentBranchFlowInfo {
  branch_type: GitFlowBranchType;
  name: string;
}

export type GitFlowType = 'feature' | 'release' | 'hotfix';
