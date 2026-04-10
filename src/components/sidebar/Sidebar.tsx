import type { FC } from 'react';
import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, FileEdit, GitMerge, Search, X } from 'lucide-react';
import type {
  BranchInfo,
  BranchHead,
  TagInfo,
  StashInfo,
  ViewMode,
  RemoteSortOrder,
} from '../../types/git';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { BranchTree } from './BranchTreeView';
import { BranchContextMenu } from './BranchContextMenu';
import {
  CreateBranchModal,
  CreateTagModal,
  RenameBranchModal,
  DeleteBranchModal,
} from '../git-modals';
import type { TreeNode } from './branchTree';
import { buildBranchTree, buildRemoteTree, buildTagTree, filterTree } from './branchTree';
import './Sidebar.css';

const ICON_SIZE = 16;

interface SidebarProps {
  repoName?: string;
  repoPath?: string;
  branches: BranchInfo[];
  branchHeads: BranchHead[];
  tags: TagInfo[];
  stashes: StashInfo[];
  remotes: string[];
  localChangesCount?: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onBranchSelect: (branch: BranchInfo) => void;
  onBranchCheckout: (branchName: string) => void;
  onTrackRemoteBranch: (remoteBranchName: string) => void;
  onNavigateToCommit: (commitSha: string) => void;
  onAddRemote?: () => void;
  onCreateBranch?: (branchName: string, startPoint: string, checkout: boolean) => void;
  onCreateTag?: (
    tagName: string,
    startPoint: string,
    message: string | null,
    pushToRemotes: boolean
  ) => void;
  onRenameBranch?: (
    oldName: string,
    newName: string,
    renameRemote: boolean,
    remoteName: string | null
  ) => void;
  onDeleteBranch?: (
    branchName: string,
    force: boolean,
    deleteRemote: boolean,
    remoteName: string | null
  ) => void;
  onStashClick?: (stash: StashInfo) => void;
  onMergeInto?: (branch: BranchInfo) => void;
  onRebaseOn?: (branch: BranchInfo) => void;
  onInteractiveRebase?: (branch: BranchInfo) => void;
  onFastForward?: (branch: BranchInfo) => void;
  onBranchPull?: (branch: BranchInfo) => void;
  onBranchPush?: (branch: BranchInfo) => void;
  expandTagsSection?: boolean;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  showSortSubmenu: boolean;
}

interface BranchContextMenuState {
  branch: BranchInfo | null;
  position: { x: number; y: number };
}

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
  forceOpen?: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const CollapsibleSection: FC<CollapsibleSectionProps> = ({
  title,
  count,
  children,
  defaultOpen = true,
  storageKey,
  forceOpen,
  onContextMenu,
}) => {
  const [isOpen, setIsOpen] = useLocalStorage<boolean>(
    storageKey ? `forky:section-${storageKey}` : '',
    defaultOpen
  );

  // If no storageKey, use local state
  const [localIsOpen, setLocalIsOpen] = useState(defaultOpen);
  const actualIsOpen = storageKey ? isOpen : localIsOpen;
  const actualSetIsOpen = storageKey ? setIsOpen : setLocalIsOpen;

  // Force open when prop changes to true
  useEffect(() => {
    if (forceOpen && !actualIsOpen) {
      actualSetIsOpen(true);
    }
  }, [forceOpen, actualIsOpen, actualSetIsOpen]);

  return (
    <div className="sidebar-section">
      <div
        className="section-header"
        onClick={() => actualSetIsOpen(!actualIsOpen)}
        onContextMenu={onContextMenu}
      >
        <span className={`expand-icon ${actualIsOpen ? 'expanded' : ''}`}>▶</span>
        <span className="section-title">{title}</span>
        {count !== undefined && <span className="section-count">{count}</span>}
      </div>
      {actualIsOpen && <div className="section-content">{children}</div>}
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

export const Sidebar: FC<SidebarProps> = memo(
  ({
    repoName,
    repoPath,
    branches,
    branchHeads,
    tags,
    stashes,
    remotes,
    localChangesCount = 0,
    viewMode,
    onViewModeChange,
    onBranchSelect,
    onBranchCheckout,
    onTrackRemoteBranch,
    onNavigateToCommit,
    onAddRemote,
    onCreateBranch,
    onCreateTag,
    onRenameBranch,
    onDeleteBranch,
    onStashClick,
    onMergeInto,
    onRebaseOn,
    onInteractiveRebase,
    onFastForward,
    onBranchPull,
    onBranchPush,
    expandTagsSection,
  }) => {
    const { t } = useTranslation();
    const localBranches = branches.filter((b) => !b.is_remote);
    const remoteBranchesUnsorted = branches.filter((b) => b.is_remote);

    // Filter state
    const [filter, setFilter] = useState('');
    const filterInputRef = useRef<HTMLInputElement>(null);

    // Remote sorting preference (persisted)
    const [remoteSortOrder, setRemoteSortOrder] = useLocalStorage<RemoteSortOrder>(
      'forky:remote-sort-order',
      'alphabetically'
    );

    // Expanded folders state (persisted per repo)
    const expandedStorageKey = repoPath ? `forky:expanded-folders:${repoPath}` : '';
    const [expandedPathsArray, setExpandedPathsArray] = useLocalStorage<string[]>(
      expandedStorageKey,
      []
    );
    const expandedPaths = useMemo(() => new Set(expandedPathsArray), [expandedPathsArray]);

    // Context menu state
    const [contextMenu, setContextMenu] = useState<ContextMenuState>({
      visible: false,
      x: 0,
      y: 0,
      showSortSubmenu: false,
    });
    const [contextMenuAdjusted, setContextMenuAdjusted] = useState<{ x: number; y: number } | null>(
      null
    );
    const contextMenuRef = useRef<HTMLDivElement>(null);

    // Branch context menu state
    const [branchContextMenu, setBranchContextMenu] = useState<BranchContextMenuState | null>(null);

    // Create branch modal state
    const [createBranchModal, setCreateBranchModal] = useState<{
      isOpen: boolean;
      sourceBranch: BranchInfo | null;
    }>({
      isOpen: false,
      sourceBranch: null,
    });

    // Create tag modal state
    const [createTagModal, setCreateTagModal] = useState<{
      isOpen: boolean;
      sourceBranch: BranchInfo | null;
    }>({
      isOpen: false,
      sourceBranch: null,
    });

    // Rename branch modal state
    const [renameBranchModal, setRenameBranchModal] = useState<{
      isOpen: boolean;
      branch: BranchInfo | null;
    }>({
      isOpen: false,
      branch: null,
    });

    // Delete branch modal state
    const [deleteBranchModal, setDeleteBranchModal] = useState<{
      isOpen: boolean;
      branch: BranchInfo | null;
    }>({
      isOpen: false,
      branch: null,
    });

    // Get current branch name
    const currentBranch = useMemo(() => {
      const headBranch = localBranches.find((b) => b.is_head);
      return headBranch?.name || null;
    }, [localBranches]);

    // Sort remote branches based on preference
    const remoteBranches = sortRemoteBranches(remoteBranchesUnsorted, remoteSortOrder);

    // Build tree structures
    const localBranchTree = useMemo(() => buildBranchTree(localBranches), [localBranches]);
    const remoteTree = useMemo(
      () => buildRemoteTree(remoteBranches, remotes),
      [remoteBranches, remotes]
    );
    const tagTree = useMemo(() => buildTagTree(tags), [tags]);

    // Filter trees
    const filteredLocalBranchTree = useMemo(
      () => filterTree(localBranchTree, filter),
      [localBranchTree, filter]
    );
    const filteredRemoteTree = useMemo(() => filterTree(remoteTree, filter), [remoteTree, filter]);
    const filteredTagTree = useMemo(() => filterTree(tagTree, filter), [tagTree, filter]);

    // Create a map of branch names to their commit SHAs
    const branchToCommit = useMemo(() => {
      const map = new Map<string, string>();
      branchHeads.forEach((bh) => {
        map.set(bh.name, bh.commit_sha);
      });
      return map;
    }, [branchHeads]);

    // Toggle folder expansion
    const handleToggleExpand = useCallback(
      (path: string) => {
        const newSet = new Set(expandedPathsArray);
        if (newSet.has(path)) {
          newSet.delete(path);
        } else {
          newSet.add(path);
        }
        setExpandedPathsArray(Array.from(newSet));
      },
      [expandedPathsArray, setExpandedPathsArray]
    );

    // Expand all folders that match filter
    useEffect(() => {
      if (filter.trim()) {
        // When filtering, expand all folders that have matching children
        const pathsToExpand = new Set<string>();

        const collectPaths = (nodes: TreeNode[]) => {
          for (const node of nodes) {
            if (node.type === 'folder' || node.type === 'remote') {
              pathsToExpand.add(node.fullPath);
            }
            collectPaths(node.children);
          }
        };

        collectPaths(filteredLocalBranchTree);
        collectPaths(filteredRemoteTree);
        collectPaths(filteredTagTree);

        if (pathsToExpand.size > 0) {
          const newSet = new Set(expandedPathsArray);
          pathsToExpand.forEach((p) => newSet.add(p));
          setExpandedPathsArray(Array.from(newSet));
        }
      }
    }, [
      filter,
      filteredLocalBranchTree,
      filteredRemoteTree,
      filteredTagTree,
      expandedPathsArray,
      setExpandedPathsArray,
    ]);

    const handleBranchClick = useCallback(
      (branch: BranchInfo) => {
        onBranchSelect(branch);
        // Switch to all-commits view and navigate to the branch's commit
        onViewModeChange('all-commits');
        const commitSha = branchToCommit.get(branch.name);
        if (commitSha) {
          onNavigateToCommit(commitSha);
        }
      },
      [onBranchSelect, onViewModeChange, branchToCommit, onNavigateToCommit]
    );

    const handleLocalBranchDoubleClick = useCallback(
      (branch: BranchInfo) => {
        // Don't checkout if already on this branch
        if (branch.is_head) return;
        onBranchCheckout(branch.name);
      },
      [onBranchCheckout]
    );

    const handleRemoteBranchDoubleClick = useCallback(
      (branch: BranchInfo) => {
        onTrackRemoteBranch(branch.name);
      },
      [onTrackRemoteBranch]
    );

    const handleTagClick = useCallback(
      (tag: TagInfo) => {
        onViewModeChange('all-commits');
        onNavigateToCommit(tag.commit_sha);
      },
      [onViewModeChange, onNavigateToCommit]
    );

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

    const handleSortOrderChange = useCallback(
      (order: RemoteSortOrder) => {
        setRemoteSortOrder(order);
        closeContextMenu();
      },
      [setRemoteSortOrder, closeContextMenu]
    );

    // Branch context menu handlers
    const handleBranchContextMenu = useCallback((branch: BranchInfo, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setBranchContextMenu({
        branch,
        position: { x: event.clientX, y: event.clientY },
      });
    }, []);

    const closeBranchContextMenu = useCallback(() => {
      setBranchContextMenu(null);
    }, []);

    // Branch context menu action handlers
    const handleCopyBranchName = useCallback(
      (branch: BranchInfo) => {
        navigator.clipboard.writeText(branch.name);
        closeBranchContextMenu();
      },
      [closeBranchContextMenu]
    );

    const handleNewBranch = useCallback(
      (branch: BranchInfo) => {
        closeBranchContextMenu();
        setCreateBranchModal({ isOpen: true, sourceBranch: branch });
      },
      [closeBranchContextMenu]
    );

    const handleCloseCreateBranchModal = useCallback(() => {
      setCreateBranchModal({ isOpen: false, sourceBranch: null });
    }, []);

    const handleCreateBranch = useCallback(
      (branchName: string, startPoint: string, checkout: boolean) => {
        onCreateBranch?.(branchName, startPoint, checkout);
        handleCloseCreateBranchModal();
      },
      [onCreateBranch, handleCloseCreateBranchModal]
    );

    // Create tag modal handlers
    const handleNewTag = useCallback(
      (branch: BranchInfo) => {
        closeBranchContextMenu();
        setCreateTagModal({ isOpen: true, sourceBranch: branch });
      },
      [closeBranchContextMenu]
    );

    const handleCloseCreateTagModal = useCallback(() => {
      setCreateTagModal({ isOpen: false, sourceBranch: null });
    }, []);

    const handleCreateTag = useCallback(
      (tagName: string, startPoint: string, message: string | null, pushToRemotes: boolean) => {
        onCreateTag?.(tagName, startPoint, message, pushToRemotes);
        handleCloseCreateTagModal();
      },
      [onCreateTag, handleCloseCreateTagModal]
    );

    // Rename branch modal handlers
    const handleRenameBranchClick = useCallback(
      (branch: BranchInfo) => {
        closeBranchContextMenu();
        setRenameBranchModal({ isOpen: true, branch });
      },
      [closeBranchContextMenu]
    );

    const handleCloseRenameBranchModal = useCallback(() => {
      setRenameBranchModal({ isOpen: false, branch: null });
    }, []);

    const handleRenameBranch = useCallback(
      (oldName: string, newName: string, renameRemote: boolean, remoteName: string | null) => {
        onRenameBranch?.(oldName, newName, renameRemote, remoteName);
        handleCloseRenameBranchModal();
      },
      [onRenameBranch, handleCloseRenameBranchModal]
    );

    // Delete branch modal handlers
    const handleDeleteBranchClick = useCallback(
      (branch: BranchInfo) => {
        closeBranchContextMenu();
        setDeleteBranchModal({ isOpen: true, branch });
      },
      [closeBranchContextMenu]
    );

    const handleCloseDeleteBranchModal = useCallback(() => {
      setDeleteBranchModal({ isOpen: false, branch: null });
    }, []);

    const handleDeleteBranch = useCallback(
      (branchName: string, force: boolean, deleteRemote: boolean, remoteName: string | null) => {
        onDeleteBranch?.(branchName, force, deleteRemote, remoteName);
        handleCloseDeleteBranchModal();
      },
      [onDeleteBranch, handleCloseDeleteBranchModal]
    );

    // Merge into current branch handler (merges clicked branch INTO current branch)
    const handleMergeInto = useCallback(
      (branch: BranchInfo) => {
        closeBranchContextMenu();
        onMergeInto?.(branch);
      },
      [closeBranchContextMenu, onMergeInto]
    );

    // Rebase current branch on target handler
    const handleRebaseOn = useCallback(
      (branch: BranchInfo) => {
        closeBranchContextMenu();
        onRebaseOn?.(branch);
      },
      [closeBranchContextMenu, onRebaseOn]
    );

    // Interactive rebase handler
    const handleInteractiveRebase = useCallback(
      (branch: BranchInfo) => {
        closeBranchContextMenu();
        onInteractiveRebase?.(branch);
      },
      [closeBranchContextMenu, onInteractiveRebase]
    );

    // Checkout handler
    const handleCheckout = useCallback(
      (branch: BranchInfo) => {
        closeBranchContextMenu();
        onBranchCheckout(branch.name);
      },
      [closeBranchContextMenu, onBranchCheckout]
    );

    // Fast-forward handler
    const handleFastForward = useCallback(
      (branch: BranchInfo) => {
        closeBranchContextMenu();
        onFastForward?.(branch);
      },
      [closeBranchContextMenu, onFastForward]
    );

    // Pull branch handler (opens pull modal with branch pre-selected)
    const handleBranchPull = useCallback(
      (branch: BranchInfo) => {
        closeBranchContextMenu();
        onBranchPull?.(branch);
      },
      [closeBranchContextMenu, onBranchPull]
    );

    // Push branch handler (opens push modal with branch pre-selected)
    const handleBranchPush = useCallback(
      (branch: BranchInfo) => {
        closeBranchContextMenu();
        onBranchPush?.(branch);
      },
      [closeBranchContextMenu, onBranchPush]
    );

    // Clear filter
    const handleClearFilter = useCallback(() => {
      setFilter('');
      filterInputRef.current?.focus();
    }, []);

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

    // Adjust context menu position to keep it in viewport
    useEffect(() => {
      if (contextMenu.visible && contextMenuRef.current) {
        const rect = contextMenuRef.current.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padding = 8;

        let newX = contextMenu.x;
        let newY = contextMenu.y;

        // Check right edge
        if (contextMenu.x + rect.width > viewportWidth - padding) {
          newX = Math.max(padding, viewportWidth - rect.width - padding);
        }

        // Check left edge
        if (newX < padding) {
          newX = padding;
        }

        // Check bottom edge
        if (contextMenu.y + rect.height > viewportHeight - padding) {
          newY = Math.max(padding, viewportHeight - rect.height - padding);
        }

        // Check top edge
        if (newY < padding) {
          newY = padding;
        }

        setContextMenuAdjusted({ x: newX, y: newY });
      } else {
        setContextMenuAdjusted(null);
      }
    }, [contextMenu.visible, contextMenu.x, contextMenu.y]);

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

    // Count items for display
    const localBranchCount = localBranches.length;
    const remoteCount = remotes.length;
    const tagCount = tags.length;

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
              {localChangesCount > 0 && <span className="nav-badge">{localChangesCount}</span>}
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

          {/* Filter Input */}
          <div className="sidebar-filter">
            <Search size={14} className="filter-icon" />
            <input
              ref={filterInputRef}
              type="text"
              className="filter-input"
              placeholder={t('sidebar.filter')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {filter && (
              <button className="filter-clear" onClick={handleClearFilter}>
                <X size={14} />
              </button>
            )}
          </div>

          <CollapsibleSection
            title={t('sidebar.branches')}
            count={localBranchCount}
            storageKey="branches"
          >
            {filteredLocalBranchTree.length > 0 ? (
              <BranchTree
                nodes={filteredLocalBranchTree}
                expandedPaths={expandedPaths}
                onToggleExpand={handleToggleExpand}
                onBranchClick={handleBranchClick}
                onBranchDoubleClick={handleLocalBranchDoubleClick}
                onBranchContextMenu={handleBranchContextMenu}
              />
            ) : filter ? (
              <div className="sidebar-empty">{t('sidebar.noMatches')}</div>
            ) : (
              <div className="sidebar-empty">{t('sidebar.noBranches')}</div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title={t('sidebar.remotes')}
            count={remoteCount}
            defaultOpen={false}
            storageKey="remotes"
            onContextMenu={handleRemotesContextMenu}
          >
            {filteredRemoteTree.length > 0 ? (
              <BranchTree
                nodes={filteredRemoteTree}
                expandedPaths={expandedPaths}
                onToggleExpand={handleToggleExpand}
                onBranchClick={handleBranchClick}
                onBranchDoubleClick={handleRemoteBranchDoubleClick}
                onBranchContextMenu={handleBranchContextMenu}
                isRemote
              />
            ) : filter ? (
              <div className="sidebar-empty">{t('sidebar.noMatches')}</div>
            ) : (
              <div className="sidebar-empty">{t('sidebar.noRemotes')}</div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title={t('sidebar.tags')}
            count={tagCount}
            defaultOpen={false}
            storageKey="tags"
            forceOpen={expandTagsSection}
          >
            {filteredTagTree.length > 0 ? (
              <BranchTree
                nodes={filteredTagTree}
                expandedPaths={expandedPaths}
                onToggleExpand={handleToggleExpand}
                onTagClick={handleTagClick}
              />
            ) : filter ? (
              <div className="sidebar-empty">{t('sidebar.noMatches')}</div>
            ) : (
              <div className="sidebar-empty">{t('sidebar.noTags')}</div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title={t('sidebar.stashes')}
            count={stashes.length}
            defaultOpen={false}
            storageKey="stashes"
          >
            {stashes.length > 0 ? (
              <div className="stash-list">
                {stashes.map((stash) => (
                  <div key={stash.id} className="stash-item" onClick={() => onStashClick?.(stash)}>
                    <span className="stash-name">{stash.message}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="sidebar-empty">{t('sidebar.noStashes')}</div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title={t('sidebar.submodules')}
            count={0}
            defaultOpen={false}
            storageKey="submodules"
          >
            <div className="sidebar-empty">{t('sidebar.noSubmodules')}</div>
          </CollapsibleSection>
        </div>

        {/* Remotes Context Menu */}
        {contextMenu.visible && (
          <div
            ref={contextMenuRef}
            className={`sidebar-context-menu ${contextMenuAdjusted ? 'visible' : ''}`}
            style={{
              top: contextMenuAdjusted?.y ?? contextMenu.y,
              left: contextMenuAdjusted?.x ?? contextMenu.x,
            }}
          >
            <div className="context-menu-item" onClick={handleAddRemoteClick}>
              <span className="context-menu-label">{t('contextMenu.addNewRemote')}</span>
            </div>
            <div className="context-menu-separator" />
            <div
              className="context-menu-item has-submenu"
              onMouseEnter={() => setContextMenu((prev) => ({ ...prev, showSortSubmenu: true }))}
              onMouseLeave={() => setContextMenu((prev) => ({ ...prev, showSortSubmenu: false }))}
            >
              <span className="context-menu-label">{t('contextMenu.sortRemotes')}</span>
              <span className="context-menu-arrow">▶</span>
              {contextMenu.showSortSubmenu && (
                <div className="context-submenu">
                  <div
                    className={`context-menu-item ${remoteSortOrder === 'alphabetically' ? 'checked' : ''}`}
                    onClick={() => handleSortOrderChange('alphabetically')}
                  >
                    {remoteSortOrder === 'alphabetically' && (
                      <span className="context-menu-check">✓</span>
                    )}
                    <span className="context-menu-label">{t('contextMenu.alphabetically')}</span>
                  </div>
                  <div
                    className={`context-menu-item ${remoteSortOrder === 'alphabetically-master-top' ? 'checked' : ''}`}
                    onClick={() => handleSortOrderChange('alphabetically-master-top')}
                  >
                    {remoteSortOrder === 'alphabetically-master-top' && (
                      <span className="context-menu-check">✓</span>
                    )}
                    <span className="context-menu-label">
                      {t('contextMenu.alphabeticallyMasterTop')}
                    </span>
                  </div>
                  <div
                    className={`context-menu-item ${remoteSortOrder === 'alphabetically-backward' ? 'checked' : ''}`}
                    onClick={() => handleSortOrderChange('alphabetically-backward')}
                  >
                    {remoteSortOrder === 'alphabetically-backward' && (
                      <span className="context-menu-check">✓</span>
                    )}
                    <span className="context-menu-label">
                      {t('contextMenu.alphabeticallyBackward')}
                    </span>
                  </div>
                  <div
                    className={`context-menu-item ${remoteSortOrder === 'alphabetically-backward-master-top' ? 'checked' : ''}`}
                    onClick={() => handleSortOrderChange('alphabetically-backward-master-top')}
                  >
                    {remoteSortOrder === 'alphabetically-backward-master-top' && (
                      <span className="context-menu-check">✓</span>
                    )}
                    <span className="context-menu-label">
                      {t('contextMenu.alphabeticallyBackwardMasterTop')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Branch Context Menu */}
        {branchContextMenu && branchContextMenu.branch && (
          <BranchContextMenu
            branch={branchContextMenu.branch}
            currentBranch={currentBranch}
            position={branchContextMenu.position}
            onClose={closeBranchContextMenu}
            onCheckout={handleCheckout}
            onFastForward={handleFastForward}
            onPull={handleBranchPull}
            onPush={handleBranchPush}
            onCopyBranchName={handleCopyBranchName}
            onNewBranch={handleNewBranch}
            onNewTag={handleNewTag}
            onRename={handleRenameBranchClick}
            onDelete={handleDeleteBranchClick}
            onMergeInto={handleMergeInto}
            onRebase={handleRebaseOn}
            onInteractiveRebase={handleInteractiveRebase}
          />
        )}

        {/* Create Branch Modal */}
        <CreateBranchModal
          isOpen={createBranchModal.isOpen}
          onClose={handleCloseCreateBranchModal}
          onCreate={handleCreateBranch}
          sourceBranch={createBranchModal.sourceBranch}
          localBranches={localBranches}
        />

        {/* Create Tag Modal */}
        <CreateTagModal
          isOpen={createTagModal.isOpen}
          onClose={handleCloseCreateTagModal}
          onCreate={handleCreateTag}
          sourceBranch={createTagModal.sourceBranch}
          existingTags={tags}
        />

        {/* Rename Branch Modal */}
        <RenameBranchModal
          isOpen={renameBranchModal.isOpen}
          onClose={handleCloseRenameBranchModal}
          onRename={handleRenameBranch}
          branch={renameBranchModal.branch}
          localBranches={localBranches}
        />

        {/* Delete Branch Modal */}
        <DeleteBranchModal
          isOpen={deleteBranchModal.isOpen}
          onClose={handleCloseDeleteBranchModal}
          onDelete={handleDeleteBranch}
          branch={deleteBranchModal.branch}
        />
      </div>
    );
  }
);
