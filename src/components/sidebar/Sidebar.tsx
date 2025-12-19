import { FC, useState } from 'react';
import { BranchInfo, BranchHead, TagInfo, ViewMode } from '../../types/git';
import './Sidebar.css';

interface SidebarProps {
  repoName?: string;
  repoPath?: string;
  branches: BranchInfo[];
  branchHeads: BranchHead[];
  tags: TagInfo[];
  remotes: string[];
  localChangesCount?: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onBranchSelect: (branch: BranchInfo) => void;
  onNavigateToCommit: (commitSha: string) => void;
}

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const CollapsibleSection: FC<CollapsibleSectionProps> = ({
  title,
  count,
  children,
  defaultOpen = true
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="sidebar-section">
      <div className="section-header" onClick={() => setIsOpen(!isOpen)}>
        <span className={`expand-icon ${isOpen ? 'expanded' : ''}`}>▶</span>
        <span className="section-title">{title}</span>
        {count !== undefined && <span className="section-count">{count}</span>}
      </div>
      {isOpen && <div className="section-content">{children}</div>}
    </div>
  );
};

export const Sidebar: FC<SidebarProps> = ({
  repoName,
  repoPath,
  branches,
  branchHeads,
  tags,
  remotes,
  localChangesCount = 0,
  viewMode,
  onViewModeChange,
  onBranchSelect,
  onNavigateToCommit,
}) => {
  const localBranches = branches.filter(b => !b.is_remote);
  const remoteBranches = branches.filter(b => b.is_remote);

  // Create a map of branch names to their commit SHAs
  const branchToCommit = new Map<string, string>();
  branchHeads.forEach(bh => {
    branchToCommit.set(bh.name, bh.commit_sha);
  });

  const handleBranchClick = (branch: BranchInfo) => {
    onBranchSelect(branch);
    // Switch to all-commits view and navigate to the branch's commit
    onViewModeChange('all-commits');
    const commitSha = branchToCommit.get(branch.name);
    if (commitSha) {
      onNavigateToCommit(commitSha);
    }
  };

  const handleTagClick = (tag: TagInfo) => {
    onViewModeChange('all-commits');
    onNavigateToCommit(tag.commit_sha);
  };

  // Extract parent folder name from path
  const getParentFolder = (path?: string) => {
    if (!path) return '';
    const parts = path.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return parts[parts.length - 2];
    }
    return '';
  };

  const parentFolder = getParentFolder(repoPath);

  return (
    <div className="sidebar">
      {repoName && (
        <div className="sidebar-repo-header">
          <div className="repo-icon-large">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8z"/>
            </svg>
          </div>
          <div className="repo-info">
            <span className="repo-title">{repoName}</span>
            {parentFolder && <span className="repo-parent">({parentFolder})</span>}
          </div>
        </div>
      )}
      <div className="sidebar-content">
        <div className="sidebar-nav-section">
          <div
            className={`sidebar-nav-item ${viewMode === 'local-changes' ? 'active' : ''}`}
            onClick={() => onViewModeChange('local-changes')}
          >
            <span className="nav-icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M12.5 0H5.914a1.5 1.5 0 00-1.06.44L2.439 2.854A1.5 1.5 0 002 3.914V14.5A1.5 1.5 0 003.5 16h9a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0012.5 0zm-7 2.75a.75.75 0 00-1.5 0v2.5a.75.75 0 001.5 0v-2.5zm2 0a.75.75 0 00-1.5 0v2.5a.75.75 0 001.5 0v-2.5z"/>
              </svg>
            </span>
            <span className="nav-label">Local Changes</span>
            {localChangesCount > 0 && (
              <span className="nav-badge">{localChangesCount}</span>
            )}
          </div>
          <div
            className={`sidebar-nav-item ${viewMode === 'all-commits' ? 'active' : ''}`}
            onClick={() => onViewModeChange('all-commits')}
          >
            <span className="nav-icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.5 2.5 0 006 8.5h1.5v5.128a2.251 2.251 0 101.5 0V8.5H10a2.5 2.5 0 002.5-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a1 1 0 01-1 1H6a1 1 0 01-1-1v-.878zm6-2.122a.75.75 0 111.5 0 .75.75 0 01-1.5 0zm-3 10a.75.75 0 111.5 0 .75.75 0 01-1.5 0z"/>
              </svg>
            </span>
            <span className="nav-label">All Commits</span>
          </div>
        </div>

        <CollapsibleSection title="Branches" count={localBranches.length}>
          {localBranches.map((branch) => (
            <div
              key={branch.name}
              className={`sidebar-item ${branch.is_head ? 'active' : ''}`}
              onClick={() => handleBranchClick(branch)}
            >
              <span className="item-icon">{branch.is_head ? '●' : '○'}</span>
              <span className="branch-label">{branch.name}</span>
            </div>
          ))}
        </CollapsibleSection>

        <CollapsibleSection title="Remotes" count={remotes.length} defaultOpen={false}>
          {remotes.map((remote) => (
            <div key={remote} className="sidebar-item remote-item">
              <span className="item-icon">🌐</span>
              <span>{remote}</span>
            </div>
          ))}
          {remoteBranches.map((branch) => (
            <div
              key={branch.name}
              className="sidebar-item remote-branch"
              onClick={() => handleBranchClick(branch)}
            >
              <span className="item-icon">↳</span>
              <span className="branch-label">{branch.name}</span>
            </div>
          ))}
        </CollapsibleSection>

        <CollapsibleSection title="Tags" count={tags.length} defaultOpen={false}>
          {tags.map((tag) => (
            <div
              key={tag.name}
              className="sidebar-item"
              onClick={() => handleTagClick(tag)}
            >
              <span className="item-icon">🏷</span>
              <span>{tag.name}</span>
            </div>
          ))}
        </CollapsibleSection>

        <CollapsibleSection title="Stashes" count={0} defaultOpen={false}>
          <div className="sidebar-empty">No stashes</div>
        </CollapsibleSection>

        <CollapsibleSection title="Submodules" count={0} defaultOpen={false}>
          <div className="sidebar-empty">No submodules</div>
        </CollapsibleSection>
      </div>
    </div>
  );
};
