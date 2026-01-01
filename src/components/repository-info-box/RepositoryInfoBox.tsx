import type { FC } from 'react';
import { useState, useRef, useEffect } from 'react';
import { List, ChevronDown, X } from 'lucide-react';
import type { BranchInfo } from '../../types/git';
import { BranchSelector } from '../branch-selector';
import './RepositoryInfoBox.css';

export interface GitOperationState {
  isActive: boolean;
  operationName: 'Fetch' | 'Pull' | 'Push' | 'Commit' | 'Checkout';
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
}

const Spinner = () => <div className="repo-info-spinner" />;

export const RepositoryInfoBox: FC<RepositoryInfoBoxProps> = ({
  repoName,
  currentBranch,
  branches,
  onBranchChange,
  gitOperation,
  onDismissOperation,
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
      {/* Operation overlay */}
      {showOperation && (
        <div
          className={`repo-info-operation ${gitOperation.isComplete ? 'complete' : ''} ${gitOperation.isError ? 'error' : ''}`}
        >
          <div className="operation-header">
            <div className="operation-title-row">
              {gitOperation.isActive && !gitOperation.isComplete && <Spinner />}
              <span className="operation-title">
                {gitOperation.operationName}
                {gitOperation.operationTarget && ` '${gitOperation.operationTarget}'`}
              </span>
            </div>
            <button className="operation-close" onClick={onDismissOperation}>
              <X size={12} />
            </button>
          </div>
          <div className="operation-status-row">
            <List size={14} />
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
              <ChevronDown size={10} />
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
