import type { FC } from 'react';
import { useState, useRef, useEffect } from 'react';
import { GitBranch, Check } from 'lucide-react';
import type { BranchInfo } from '../../types/git';
import './BranchSelector.css';

interface BranchSelectorProps {
  currentBranch: string;
  branches: BranchInfo[];
  onSelect: (branchName: string) => void;
  onClose: () => void;
}

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
  const localBranches = branches.filter((b) => !b.is_remote);
  const filteredBranches = filter
    ? localBranches.filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()))
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
                {branch.name === currentBranch ? <Check size={14} /> : <GitBranch size={14} />}
              </span>
              <span className="branch-item-name">{branch.name}</span>
              {branch.is_head && <span className="branch-item-head">HEAD</span>}
            </button>
          ))
        )}
      </div>
    </div>
  );
};
