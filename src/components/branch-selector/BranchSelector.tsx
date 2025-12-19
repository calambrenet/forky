import { FC, useState, useRef, useEffect } from 'react';
import { BranchInfo } from '../../types/git';
import './BranchSelector.css';

interface BranchSelectorProps {
  currentBranch: string;
  branches: BranchInfo[];
  onSelect: (branchName: string) => void;
  onClose: () => void;
}

const BranchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M13.854 3.646a.5.5 0 010 .708l-7 7a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 11.708-.708L6.5 10.293l6.646-6.647a.5.5 0 01.708 0z"/>
  </svg>
);

export const BranchSelector: FC<BranchSelectorProps> = ({
  currentBranch,
  branches,
  onSelect,
  onClose,
}) => {
  const [filter, setFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Filter branches - only show local branches (not remote)
  const localBranches = branches.filter(b => !b.is_remote);
  const filteredBranches = filter
    ? localBranches.filter(b => b.name.toLowerCase().includes(filter.toLowerCase()))
    : localBranches;

  const handleSelect = (branchName: string) => {
    if (branchName !== currentBranch) {
      onSelect(branchName);
    }
    onClose();
  };

  return (
    <div className="branch-selector">
      <div className="branch-selector-header">
        <input
          ref={inputRef}
          type="text"
          className="branch-selector-search"
          placeholder="Filter branches..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="branch-selector-list" ref={listRef}>
        {filteredBranches.length === 0 ? (
          <div className="branch-selector-empty">No branches found</div>
        ) : (
          filteredBranches.map((branch) => (
            <button
              key={branch.name}
              className={`branch-selector-item ${branch.name === currentBranch ? 'current' : ''}`}
              onClick={() => handleSelect(branch.name)}
            >
              <span className="branch-item-icon">
                {branch.name === currentBranch ? <CheckIcon /> : <BranchIcon />}
              </span>
              <span className="branch-item-name">{branch.name}</span>
              {branch.is_head && (
                <span className="branch-item-head">HEAD</span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
};
