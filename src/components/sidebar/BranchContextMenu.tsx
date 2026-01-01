import type { FC } from 'react';
import { useEffect, useRef, useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GitBranch,
  GitMerge,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Tag,
  Trash2,
  Copy,
  Edit3,
  RotateCcw,
  GitPullRequest,
} from 'lucide-react';
import type { BranchInfo } from '../../types/git';
import './BranchContextMenu.css';

const ICON_SIZE = 14;
const VIEWPORT_PADDING = 8; // Minimum distance from viewport edges

export interface BranchContextMenuProps {
  branch: BranchInfo;
  currentBranch: string | null;
  position: { x: number; y: number };
  onClose: () => void;
  // Action handlers (to be implemented later)
  onCheckout?: (branch: BranchInfo) => void;
  onFastForward?: (branch: BranchInfo) => void;
  onPull?: (branch: BranchInfo) => void;
  onPush?: (branch: BranchInfo) => void;
  onCreatePullRequest?: (branch: BranchInfo) => void;
  onMergeInto?: (branch: BranchInfo) => void;
  onRebase?: (branch: BranchInfo) => void;
  onInteractiveRebase?: (branch: BranchInfo) => void;
  onNewBranch?: (branch: BranchInfo) => void;
  onNewTag?: (branch: BranchInfo) => void;
  onRename?: (branch: BranchInfo) => void;
  onDelete?: (branch: BranchInfo) => void;
  onCopyBranchName?: (branch: BranchInfo) => void;
}

interface MenuItemProps {
  icon?: React.ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
}

const MenuItem: FC<MenuItemProps> = ({ icon, label, shortcut, disabled, danger, onClick }) => {
  const handleClick = () => {
    if (!disabled && onClick) {
      onClick();
    }
  };

  return (
    <div
      className={`branch-menu-item ${disabled ? 'disabled' : ''} ${danger ? 'danger' : ''}`}
      onClick={handleClick}
    >
      {icon && <span className="menu-item-icon">{icon}</span>}
      <span className="menu-item-label">{label}</span>
      {shortcut && <span className="menu-item-shortcut">{shortcut}</span>}
    </div>
  );
};

const MenuSeparator: FC = () => <div className="branch-menu-separator" />;

export const BranchContextMenu: FC<BranchContextMenuProps> = memo(
  ({
    branch,
    currentBranch,
    position,
    onClose,
    onCheckout,
    onFastForward,
    onPull,
    onPush,
    onCreatePullRequest,
    onMergeInto,
    onRebase,
    onInteractiveRebase,
    onNewBranch,
    onNewTag,
    onRename,
    onDelete,
    onCopyBranchName,
  }) => {
    const { t } = useTranslation();
    const menuRef = useRef<HTMLDivElement>(null);
    const [adjustedPosition, setAdjustedPosition] = useState<{ x: number; y: number } | null>(null);

    const isCurrentBranch = branch.name === currentBranch;
    const branchDisplayName = branch.name.split('/').pop() || branch.name;

    // Get remote name for remote branches (e.g., "origin" from "origin/main")
    const remoteName = branch.is_remote ? branch.name.split('/')[0] : 'origin';

    // Close on click outside
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          onClose();
        }
      };

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }, [onClose]);

    // Adjust position to keep menu in viewport
    useEffect(() => {
      if (menuRef.current) {
        const rect = menuRef.current.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let newX = position.x;
        let newY = position.y;

        // Check right edge
        if (position.x + rect.width > viewportWidth - VIEWPORT_PADDING) {
          newX = Math.max(VIEWPORT_PADDING, viewportWidth - rect.width - VIEWPORT_PADDING);
        }

        // Check left edge
        if (newX < VIEWPORT_PADDING) {
          newX = VIEWPORT_PADDING;
        }

        // Check bottom edge
        if (position.y + rect.height > viewportHeight - VIEWPORT_PADDING) {
          newY = Math.max(VIEWPORT_PADDING, viewportHeight - rect.height - VIEWPORT_PADDING);
        }

        // Check top edge
        if (newY < VIEWPORT_PADDING) {
          newY = VIEWPORT_PADDING;
        }

        setAdjustedPosition({ x: newX, y: newY });
      }
    }, [position]);

    const finalPosition = adjustedPosition || position;

    return (
      <div
        ref={menuRef}
        className={`branch-context-menu ${adjustedPosition ? 'visible' : ''}`}
        style={{ top: finalPosition.y, left: finalPosition.x }}
      >
        {/* Checkout */}
        <MenuItem
          icon={<GitBranch size={ICON_SIZE} />}
          label={t('branchContextMenu.checkout', { branch: branchDisplayName })}
          disabled={isCurrentBranch}
          onClick={() => onCheckout?.(branch)}
        />

        <MenuSeparator />

        {/* Fast-Forward */}
        <MenuItem
          icon={<ArrowDown size={ICON_SIZE} />}
          label={t('branchContextMenu.fastForward', {
            remote: remoteName,
            branch: branchDisplayName,
          })}
          onClick={() => onFastForward?.(branch)}
        />

        {/* Pull (only for current branch) */}
        {isCurrentBranch && (
          <MenuItem
            icon={<ArrowDown size={ICON_SIZE} />}
            label={t('branchContextMenu.pull', { remote: remoteName, branch: branchDisplayName })}
            onClick={() => onPull?.(branch)}
          />
        )}

        {/* Push */}
        <MenuItem
          icon={<ArrowUp size={ICON_SIZE} />}
          label={t('branchContextMenu.push', { branch: branchDisplayName, remote: remoteName })}
          onClick={() => onPush?.(branch)}
        />

        {/* Create Pull Request */}
        <MenuItem
          icon={<GitPullRequest size={ICON_SIZE} />}
          label={t('branchContextMenu.createPullRequest', { remote: remoteName })}
          onClick={() => onCreatePullRequest?.(branch)}
        />

        <MenuSeparator />

        {/* Merge into current branch */}
        <MenuItem
          icon={<GitMerge size={ICON_SIZE} />}
          label={t('branchContextMenu.mergeInto', { branch: branchDisplayName })}
          disabled={isCurrentBranch}
          onClick={() => onMergeInto?.(branch)}
        />

        {/* Rebase on this branch */}
        <MenuItem
          icon={<RotateCcw size={ICON_SIZE} />}
          label={t('branchContextMenu.rebaseOn', { branch: branchDisplayName })}
          disabled={isCurrentBranch}
          onClick={() => onRebase?.(branch)}
        />

        {/* Interactive Rebase */}
        <MenuItem
          icon={<RotateCcw size={ICON_SIZE} />}
          label={t('branchContextMenu.interactiveRebase', { branch: branchDisplayName })}
          disabled={isCurrentBranch}
          onClick={() => onInteractiveRebase?.(branch)}
        />

        <MenuSeparator />

        {/* New Branch */}
        <MenuItem
          icon={<GitBranch size={ICON_SIZE} />}
          label={t('branchContextMenu.newBranch')}
          shortcut="⌘B"
          onClick={() => onNewBranch?.(branch)}
        />

        {/* New Tag */}
        <MenuItem
          icon={<Tag size={ICON_SIZE} />}
          label={t('branchContextMenu.newTag')}
          shortcut="⌘T"
          onClick={() => onNewTag?.(branch)}
        />

        <MenuSeparator />

        {/* Git Flow - placeholder for now */}
        <MenuItem
          icon={<ExternalLink size={ICON_SIZE} />}
          label={t('branchContextMenu.gitFlow')}
          disabled
        />

        <MenuSeparator />

        {/* Rename */}
        <MenuItem
          icon={<Edit3 size={ICON_SIZE} />}
          label={t('branchContextMenu.rename', { branch: branchDisplayName })}
          onClick={() => onRename?.(branch)}
        />

        {/* Delete */}
        <MenuItem
          icon={<Trash2 size={ICON_SIZE} />}
          label={t('branchContextMenu.delete', { branch: branchDisplayName })}
          disabled={isCurrentBranch}
          danger
          onClick={() => onDelete?.(branch)}
        />

        <MenuSeparator />

        {/* Copy Branch Name */}
        <MenuItem
          icon={<Copy size={ICON_SIZE} />}
          label={t('branchContextMenu.copyBranchName')}
          onClick={() => onCopyBranchName?.(branch)}
        />
      </div>
    );
  }
);
