import { FC, useState, useRef, useEffect, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, FileEdit, GitMerge } from 'lucide-react';
import { BranchInfo, BranchHead, TagInfo, ViewMode, RemoteSortOrder } from '../../types/git';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import './Sidebar.css';

const ICON_SIZE = 16;

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
  onAddRemote?: () => void;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  showSortSubmenu: boolean;
}

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const CollapsibleSection: FC<CollapsibleSectionProps> = ({
  title,
  count,
  children,
  defaultOpen = true,
  onContextMenu,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="sidebar-section">
      <div
        className="section-header"
        onClick={() => setIsOpen(!isOpen)}
        onContextMenu={onContextMenu}
      >
        <span className={`expand-icon ${isOpen ? 'expanded' : ''}`}>▶</span>
        <span className="section-title">{title}</span>
        {count !== undefined && <span className="section-count">{count}</span>}
      </div>
      {isOpen && <div className="section-content">{children}</div>}
    </div>
  );
};

// Sorting function for remote branches
const sortRemoteBranches = (branches: BranchInfo[], sortOrder: RemoteSortOrder): BranchInfo[] => {
  const sorted = [...branches];

  switch (sortOrder) {
    case 'alphabetically':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));

    case 'alphabetically-master-top':
      return sorted.sort((a, b) => {
        const aIsMain = a.name.includes('/main') || a.name.includes('/master');
        const bIsMain = b.name.includes('/main') || b.name.includes('/master');
        if (aIsMain && !bIsMain) return -1;
        if (!aIsMain && bIsMain) return 1;
        return a.name.localeCompare(b.name);
      });

    case 'alphabetically-backward':
      return sorted.sort((a, b) => b.name.localeCompare(a.name));

    case 'alphabetically-backward-master-top':
      return sorted.sort((a, b) => {
        const aIsMain = a.name.includes('/main') || a.name.includes('/master');
        const bIsMain = b.name.includes('/main') || b.name.includes('/master');
        if (aIsMain && !bIsMain) return -1;
        if (!aIsMain && bIsMain) return 1;
        return b.name.localeCompare(a.name);
      });

    default:
      return sorted;
  }
};

export const Sidebar: FC<SidebarProps> = memo(({
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
  onAddRemote,
}) => {
  const { t } = useTranslation();
  const localBranches = branches.filter(b => !b.is_remote);
  const remoteBranchesUnsorted = branches.filter(b => b.is_remote);

  // Remote sorting preference (persisted)
  const [remoteSortOrder, setRemoteSortOrder] = useLocalStorage<RemoteSortOrder>(
    'forky:remote-sort-order',
    'alphabetically'
  );

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    showSortSubmenu: false,
  });
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Sort remote branches based on preference
  const remoteBranches = sortRemoteBranches(remoteBranchesUnsorted, remoteSortOrder);

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

  // Context menu handlers
  const handleRemotesContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      showSortSubmenu: false,
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0, showSortSubmenu: false });
  }, []);

  const handleAddRemoteClick = useCallback(() => {
    closeContextMenu();
    onAddRemote?.();
  }, [closeContextMenu, onAddRemote]);

  const handleSortOrderChange = useCallback((order: RemoteSortOrder) => {
    setRemoteSortOrder(order);
    closeContextMenu();
  }, [setRemoteSortOrder, closeContextMenu]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };

    if (contextMenu.visible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu.visible, closeContextMenu]);

  // Close context menu on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeContextMenu();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeContextMenu]);

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
            <BookOpen size={20} />
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
              <FileEdit size={ICON_SIZE} />
            </span>
            <span className="nav-label">{t('sidebar.localChanges')}</span>
            {localChangesCount > 0 && (
              <span className="nav-badge">{localChangesCount}</span>
            )}
          </div>
          <div
            className={`sidebar-nav-item ${viewMode === 'all-commits' ? 'active' : ''}`}
            onClick={() => onViewModeChange('all-commits')}
          >
            <span className="nav-icon">
              <GitMerge size={ICON_SIZE} />
            </span>
            <span className="nav-label">{t('sidebar.allCommits')}</span>
          </div>
        </div>

        <CollapsibleSection title={t('sidebar.branches')} count={localBranches.length}>
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

        <CollapsibleSection
          title={t('sidebar.remotes')}
          count={remotes.length}
          defaultOpen={false}
          onContextMenu={handleRemotesContextMenu}
        >
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

        <CollapsibleSection title={t('sidebar.tags')} count={tags.length} defaultOpen={false}>
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

        <CollapsibleSection title={t('sidebar.stashes')} count={0} defaultOpen={false}>
          <div className="sidebar-empty">{t('sidebar.noStashes')}</div>
        </CollapsibleSection>

        <CollapsibleSection title={t('sidebar.submodules')} count={0} defaultOpen={false}>
          <div className="sidebar-empty">{t('sidebar.noSubmodules')}</div>
        </CollapsibleSection>
      </div>

      {/* Remotes Context Menu */}
      {contextMenu.visible && (
        <div
          ref={contextMenuRef}
          className="sidebar-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <div className="context-menu-item" onClick={handleAddRemoteClick}>
            <span className="context-menu-label">{t('contextMenu.addNewRemote')}</span>
          </div>
          <div className="context-menu-separator" />
          <div
            className="context-menu-item has-submenu"
            onMouseEnter={() => setContextMenu(prev => ({ ...prev, showSortSubmenu: true }))}
            onMouseLeave={() => setContextMenu(prev => ({ ...prev, showSortSubmenu: false }))}
          >
            <span className="context-menu-label">{t('contextMenu.sortRemotes')}</span>
            <span className="context-menu-arrow">▶</span>
            {contextMenu.showSortSubmenu && (
              <div className="context-submenu">
                <div
                  className={`context-menu-item ${remoteSortOrder === 'alphabetically' ? 'checked' : ''}`}
                  onClick={() => handleSortOrderChange('alphabetically')}
                >
                  {remoteSortOrder === 'alphabetically' && <span className="context-menu-check">✓</span>}
                  <span className="context-menu-label">{t('contextMenu.alphabetically')}</span>
                </div>
                <div
                  className={`context-menu-item ${remoteSortOrder === 'alphabetically-master-top' ? 'checked' : ''}`}
                  onClick={() => handleSortOrderChange('alphabetically-master-top')}
                >
                  {remoteSortOrder === 'alphabetically-master-top' && <span className="context-menu-check">✓</span>}
                  <span className="context-menu-label">{t('contextMenu.alphabeticallyMasterTop')}</span>
                </div>
                <div
                  className={`context-menu-item ${remoteSortOrder === 'alphabetically-backward' ? 'checked' : ''}`}
                  onClick={() => handleSortOrderChange('alphabetically-backward')}
                >
                  {remoteSortOrder === 'alphabetically-backward' && <span className="context-menu-check">✓</span>}
                  <span className="context-menu-label">{t('contextMenu.alphabeticallyBackward')}</span>
                </div>
                <div
                  className={`context-menu-item ${remoteSortOrder === 'alphabetically-backward-master-top' ? 'checked' : ''}`}
                  onClick={() => handleSortOrderChange('alphabetically-backward-master-top')}
                >
                  {remoteSortOrder === 'alphabetically-backward-master-top' && <span className="context-menu-check">✓</span>}
                  <span className="context-menu-label">{t('contextMenu.alphabeticallyBackwardMasterTop')}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
