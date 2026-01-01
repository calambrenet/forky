import type { FC } from 'react';
import { useEffect, useRef, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, Globe } from 'lucide-react';
import type { BranchInfo } from '../../types/git';
import './MergeDropdown.css';

interface MergeDropdownProps {
  branches: BranchInfo[];
  currentBranch: string | null;
  onBranchSelect: (branch: BranchInfo) => void;
  onClose: () => void;
}

export const MergeDropdown: FC<MergeDropdownProps> = memo(
  ({ branches, currentBranch, onBranchSelect, onClose }) => {
    const { t } = useTranslation();
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
          onClose();
        }
      };

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };

      // Add listeners with a small delay to prevent immediate close
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
      }, 50);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }, [onClose]);

    // Filter and group branches
    const { localBranches, remoteBranches } = useMemo(() => {
      // Filter out current branch
      const filtered = branches.filter((b) => b.name !== currentBranch);

      // Split into local and remote (only remote branches with upstream/tracking)
      const local = filtered.filter((b) => !b.is_remote);
      const remote = filtered.filter((b) => b.is_remote);

      return {
        localBranches: local,
        remoteBranches: remote,
      };
    }, [branches, currentBranch]);

    const handleBranchClick = (branch: BranchInfo) => {
      onBranchSelect(branch);
      onClose();
    };

    // Get display name (last part of branch name for remote branches)
    const getDisplayName = (branch: BranchInfo) => {
      if (branch.is_remote) {
        // For remote branches like "origin/main", show "origin/main"
        return branch.name;
      }
      return branch.name;
    };

    const hasNoBranches = localBranches.length === 0 && remoteBranches.length === 0;

    return (
      <div ref={dropdownRef} className="merge-dropdown">
        <div className="merge-dropdown-header">{t('mergeDropdown.title')}</div>

        {hasNoBranches ? (
          <div className="merge-dropdown-empty">{t('mergeDropdown.noBranches')}</div>
        ) : (
          <>
            {/* Local Branches Section */}
            {localBranches.length > 0 && (
              <>
                <div className="merge-dropdown-section">
                  <GitBranch size={12} />
                  <span>{t('mergeDropdown.localBranches')}</span>
                </div>
                <div className="merge-dropdown-list">
                  {localBranches.map((branch) => (
                    <div
                      key={branch.name}
                      className="merge-dropdown-item"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handleBranchClick(branch);
                      }}
                    >
                      <GitBranch size={14} className="merge-dropdown-icon" />
                      <span className="merge-dropdown-name">{getDisplayName(branch)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Remote Branches Section */}
            {remoteBranches.length > 0 && (
              <>
                <div className="merge-dropdown-section">
                  <Globe size={12} />
                  <span>{t('mergeDropdown.remoteBranches')}</span>
                </div>
                <div className="merge-dropdown-list">
                  {remoteBranches.map((branch) => (
                    <div
                      key={branch.name}
                      className="merge-dropdown-item"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handleBranchClick(branch);
                      }}
                    >
                      <Globe size={14} className="merge-dropdown-icon" />
                      <span className="merge-dropdown-name">{getDisplayName(branch)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    );
  }
);
