import type { FC } from 'react';
import { useEffect, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, Plus, Play, Flag, AlertTriangle, CheckCircle } from 'lucide-react';
import type { GitFlowConfig, CurrentBranchFlowInfo } from '../../types/git';
import './BranchDropdown.css';

interface BranchDropdownProps {
  gitFlowConfig: GitFlowConfig | null;
  currentBranchFlowInfo: CurrentBranchFlowInfo | null;
  onNewBranch: () => void;
  onStartFeature: () => void;
  onStartRelease: () => void;
  onStartHotfix: () => void;
  onFinishBranch: () => void;
  onClose: () => void;
}

export const BranchDropdown: FC<BranchDropdownProps> = memo(
  ({
    gitFlowConfig,
    currentBranchFlowInfo,
    onNewBranch,
    onStartFeature,
    onStartRelease,
    onStartHotfix,
    onFinishBranch,
    onClose,
  }) => {
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

    const handleItemClick = (action: () => void) => {
      action();
      onClose();
    };

    // Check if current branch can be finished (is a git flow branch)
    const canFinish =
      currentBranchFlowInfo &&
      ['Feature', 'Release', 'Hotfix'].includes(currentBranchFlowInfo.branch_type);

    const getFinishLabel = () => {
      if (!currentBranchFlowInfo || !canFinish) return '';
      return t('branchDropdown.finishBranch', { name: currentBranchFlowInfo.name });
    };

    return (
      <div ref={dropdownRef} className="branch-dropdown">
        {/* New Branch */}
        <div
          className="branch-dropdown-item"
          onMouseDown={(e) => {
            e.stopPropagation();
            handleItemClick(onNewBranch);
          }}
        >
          <Plus size={14} className="branch-dropdown-icon" />
          <span>{t('branchDropdown.newBranch')}</span>
        </div>

        {/* Git Flow Section - only show if initialized */}
        {gitFlowConfig?.initialized && (
          <>
            <div className="branch-dropdown-separator" />
            <div className="branch-dropdown-section">
              <GitBranch size={12} />
              <span>{t('branchDropdown.gitFlow')}</span>
            </div>

            {/* Start Feature */}
            <div
              className="branch-dropdown-item"
              onMouseDown={(e) => {
                e.stopPropagation();
                handleItemClick(onStartFeature);
              }}
            >
              <Play size={14} className="branch-dropdown-icon" />
              <span>{t('branchDropdown.startFeature')}</span>
            </div>

            {/* Start Release */}
            <div
              className="branch-dropdown-item"
              onMouseDown={(e) => {
                e.stopPropagation();
                handleItemClick(onStartRelease);
              }}
            >
              <Flag size={14} className="branch-dropdown-icon" />
              <span>{t('branchDropdown.startRelease')}</span>
            </div>

            {/* Start Hotfix */}
            <div
              className="branch-dropdown-item"
              onMouseDown={(e) => {
                e.stopPropagation();
                handleItemClick(onStartHotfix);
              }}
            >
              <AlertTriangle size={14} className="branch-dropdown-icon" />
              <span>{t('branchDropdown.startHotfix')}</span>
            </div>

            {/* Finish Branch - only show if on a git flow branch */}
            {canFinish && (
              <>
                <div className="branch-dropdown-separator-small" />
                <div
                  className="branch-dropdown-item finish"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    handleItemClick(onFinishBranch);
                  }}
                >
                  <CheckCircle size={14} className="branch-dropdown-icon" />
                  <span>{getFinishLabel()}</span>
                </div>
              </>
            )}
          </>
        )}
      </div>
    );
  }
);
