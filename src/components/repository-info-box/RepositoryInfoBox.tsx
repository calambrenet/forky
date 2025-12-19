import { FC, useState, useRef, useEffect } from 'react';
import { BranchInfo } from '../../types/git';
import { BranchSelector } from '../branch-selector';
import './RepositoryInfoBox.css';

export interface GitOperationState {
  isActive: boolean;
  operationName: 'Fetch' | 'Pull' | 'Push' | 'Commit';
  operationTarget?: string;
  statusMessage: string;
  isComplete: boolean;
  isError: boolean;
}

interface RepositoryInfoBoxProps {
  repoName?: string;
  currentBranch?: string;
  branches: BranchInfo[];
  onBranchChange: (branchName: string) => void;
  gitOperation?: GitOperationState | null;
  onDismissOperation?: () => void;
  onOpenActivityLog?: () => void;
}

// Icons
const ListIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M2.5 12a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5z"/>
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
    <path d="M1.646 4.646a.5.5 0 01.708 0L8 10.293l5.646-5.647a.5.5 0 01.708.708l-6 6a.5.5 0 01-.708 0l-6-6a.5.5 0 010-.708z"/>
  </svg>
);

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"/>
  </svg>
);

const Spinner = () => (
  <div className="repo-info-spinner" />
);

const ActivityLogIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M14.5 3a.5.5 0 01.5.5v9a.5.5 0 01-.5.5h-13a.5.5 0 01-.5-.5v-9a.5.5 0 01.5-.5h13zm-13-1A1.5 1.5 0 000 3.5v9A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0014.5 2h-13z"/>
    <path d="M3 5.5a.5.5 0 01.5-.5h9a.5.5 0 010 1h-9a.5.5 0 01-.5-.5zM3 8a.5.5 0 01.5-.5h9a.5.5 0 010 1h-9A.5.5 0 013 8zm0 2.5a.5.5 0 01.5-.5h6a.5.5 0 010 1h-6a.5.5 0 01-.5-.5z"/>
  </svg>
);

export const RepositoryInfoBox: FC<RepositoryInfoBoxProps> = ({
  repoName,
  currentBranch,
  branches,
  onBranchChange,
  gitOperation,
  onDismissOperation,
  onOpenActivityLog,
}) => {
  const [isBranchSelectorOpen, setIsBranchSelectorOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close branch selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsBranchSelectorOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleBranchClick = () => {
    if (!gitOperation?.isActive) {
      setIsBranchSelectorOpen(!isBranchSelectorOpen);
    }
  };

  const handleBranchSelect = (branchName: string) => {
    setIsBranchSelectorOpen(false);
    onBranchChange(branchName);
  };

  // If no repo is open, don't render
  if (!repoName) {
    return null;
  }

  const showOperation = gitOperation && (gitOperation.isActive || gitOperation.isComplete);

  return (
    <div className="repo-info-box" ref={containerRef}>
      {/* Activity log button - only show in idle state */}
      {!showOperation && (
        <button
          className="repo-info-log-btn"
          onClick={onOpenActivityLog}
          title="Activity Log"
        >
          <ActivityLogIcon />
        </button>
      )}

      {/* Operation overlay */}
      {showOperation && (
        <div className={`repo-info-operation ${gitOperation.isComplete ? 'complete' : ''} ${gitOperation.isError ? 'error' : ''}`}>
          <div className="operation-header">
            <div className="operation-title-row">
              {gitOperation.isActive && !gitOperation.isComplete && <Spinner />}
              <span className="operation-title">
                {gitOperation.operationName}
                {gitOperation.operationTarget && ` '${gitOperation.operationTarget}'`}
              </span>
            </div>
            <button className="operation-close" onClick={onDismissOperation}>
              <CloseIcon />
            </button>
          </div>
          <div className="operation-status-row">
            <ListIcon />
            <span className="operation-status">{gitOperation.statusMessage}</span>
          </div>
          <div className="operation-progress">
            <div
              className={`operation-progress-fill ${gitOperation.isActive && !gitOperation.isComplete ? 'indeterminate' : ''} ${gitOperation.isComplete ? 'complete' : ''} ${gitOperation.isError ? 'error' : ''}`}
            />
          </div>
        </div>
      )}

      {/* Normal state - repo and branch info (vertical layout) */}
      {!showOperation && (
        <div className="repo-info-content">
          <span className="repo-info-name">{repoName}</span>
          {currentBranch && (
            <button className="repo-info-branch" onClick={handleBranchClick}>
              <span className="branch-text">{currentBranch}</span>
              <ChevronDownIcon />
            </button>
          )}
        </div>
      )}

      {/* Branch selector dropdown */}
      {isBranchSelectorOpen && (
        <BranchSelector
          currentBranch={currentBranch || ''}
          branches={branches}
          onSelect={handleBranchSelect}
          onClose={() => setIsBranchSelectorOpen(false)}
        />
      )}
    </div>
  );
};
