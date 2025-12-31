import type { FC } from 'react';
import { useState, useEffect, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RotateCcw,
  GitBranch,
  GripVertical,
  ChevronDown,
  Check,
  Edit3,
  Layers,
  Trash2,
} from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../modal';
import { Checkbox } from '../form';
import { ModalLoadingIndicator } from './ModalLoadingIndicator';
import type { BranchInfo, InteractiveRebaseEntry, RebaseAction } from '../../types/git';
import './InteractiveRebaseModal.css';
import './GitModals.css';

interface InteractiveRebaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRebase: (entries: InteractiveRebaseEntry[], autostash: boolean) => void;
  targetBranch: BranchInfo | null;
  currentBranch: string;
  commits: InteractiveRebaseEntry[];
  isLoadingCommits: boolean;
}

const ACTION_OPTIONS: { value: RebaseAction; label: string; icon: React.ReactNode }[] = [
  { value: 'pick', label: 'Pick', icon: <Check size={12} /> },
  { value: 'reword', label: 'Reword', icon: <Edit3 size={12} /> },
  { value: 'edit', label: 'Edit', icon: <Edit3 size={12} /> },
  { value: 'squash', label: 'Squash', icon: <Layers size={12} /> },
  { value: 'fixup', label: 'Fixup', icon: <Layers size={12} /> },
  { value: 'drop', label: 'Drop', icon: <Trash2 size={12} /> },
];

interface CommitRowProps {
  entry: InteractiveRebaseEntry;
  index: number;
  onActionChange: (index: number, action: RebaseAction) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  isDragOver: boolean;
}

const CommitRow: FC<CommitRowProps> = memo(
  ({
    entry,
    index,
    onActionChange,
    onDragStart,
    onDragOver,
    onDragEnd,
    isDragging,
    isDragOver,
  }) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const handleActionSelect = (action: RebaseAction) => {
      onActionChange(index, action);
      setIsDropdownOpen(false);
    };

    const currentAction = ACTION_OPTIONS.find((a) => a.value === entry.action);

    return (
      <div
        className={`interactive-rebase-row ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''} ${entry.action === 'drop' ? 'dropped' : ''}`}
        draggable
        onDragStart={() => onDragStart(index)}
        onDragOver={(e) => {
          e.preventDefault();
          onDragOver(index);
        }}
        onDragEnd={onDragEnd}
      >
        <div className="row-drag-handle">
          <GripVertical size={14} />
        </div>

        <div className="row-action-dropdown">
          <button
            className={`action-button action-${entry.action}`}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            {currentAction?.icon}
            <span>{currentAction?.label}</span>
            <ChevronDown size={12} />
          </button>
          {isDropdownOpen && (
            <div className="action-dropdown-menu">
              {ACTION_OPTIONS.map((option) => (
                <div
                  key={option.value}
                  className={`action-option ${entry.action === option.value ? 'selected' : ''}`}
                  onClick={() => handleActionSelect(option.value)}
                >
                  {option.icon}
                  <span>{option.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="row-commit-id">{entry.short_id}</div>
        <div className="row-commit-message" title={entry.message}>
          {entry.message}
        </div>
        <div className="row-author">{entry.author}</div>
      </div>
    );
  }
);

export const InteractiveRebaseModal: FC<InteractiveRebaseModalProps> = memo(
  ({ isOpen, onClose, onRebase, targetBranch, currentBranch, commits, isLoadingCommits }) => {
    const { t } = useTranslation();
    const [entries, setEntries] = useState<InteractiveRebaseEntry[]>([]);
    const [autostash, setAutostash] = useState(true);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Update entries when commits change
    useEffect(() => {
      if (isOpen) {
        setEntries([...commits]);
        setAutostash(true);
        setIsLoading(false);
      }
    }, [isOpen, commits]);

    // Reset when modal closes
    useEffect(() => {
      if (!isOpen) {
        setEntries([]);
        setIsLoading(false);
      }
    }, [isOpen]);

    const handleActionChange = useCallback((index: number, action: RebaseAction) => {
      setEntries((prev) => {
        const newEntries = [...prev];
        newEntries[index] = { ...newEntries[index], action };
        return newEntries;
      });
    }, []);

    const handleDragStart = useCallback((index: number) => {
      setDragIndex(index);
    }, []);

    const handleDragOver = useCallback((index: number) => {
      setDragOverIndex(index);
    }, []);

    const handleDragEnd = useCallback(() => {
      if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
        setEntries((prev) => {
          const newEntries = [...prev];
          const [removed] = newEntries.splice(dragIndex, 1);
          newEntries.splice(dragOverIndex, 0, removed);
          return newEntries;
        });
      }
      setDragIndex(null);
      setDragOverIndex(null);
    }, [dragIndex, dragOverIndex]);

    const handleRebase = useCallback(() => {
      if (isLoading || isLoadingCommits || entries.length === 0) return;

      // Set loading state immediately
      setIsLoading(true);

      // Use requestAnimationFrame to allow React to render the loading state
      // before the blocking git operation starts
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onRebase(entries, autostash);
        });
      });
    }, [isLoading, isLoadingCommits, entries, autostash, onRebase]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !isLoading && !isLoadingCommits && entries.length > 0) {
        handleRebase();
      }
    };

    const targetBranchName = targetBranch?.name || '';
    const isRebaseDisabled = isLoading || isLoadingCommits || entries.length === 0;

    return (
      <Modal isOpen={isOpen} onClose={isLoading ? undefined : onClose}>
        <ModalHeader
          icon={<RotateCcw size={24} />}
          title={t('modals.interactiveRebase.title')}
          description={t('modals.interactiveRebase.description')}
        />
        <ModalBody className={isLoading ? 'modal-body-loading' : undefined}>
          <div className={isLoading ? 'modal-content-loading' : undefined}>
            {/* Branch info */}
            <div className="interactive-rebase-branches">
              <div className="branch-info">
                <span className="branch-label">{t('modals.interactiveRebase.rebasing')}</span>
                <div className="branch-name">
                  <GitBranch size={14} />
                  <span>{currentBranch}</span>
                </div>
              </div>
              <div className="branch-arrow">→</div>
              <div className="branch-info">
                <span className="branch-label">{t('modals.interactiveRebase.onto')}</span>
                <div className="branch-name">
                  <GitBranch size={14} />
                  <span>{targetBranchName}</span>
                </div>
              </div>
            </div>

            {/* Commits list */}
            <div className="interactive-rebase-commits" onKeyDown={handleKeyDown}>
              <div className="commits-header">
                <span className="header-drag"></span>
                <span className="header-action">{t('modals.interactiveRebase.action')}</span>
                <span className="header-commit">{t('modals.interactiveRebase.commit')}</span>
                <span className="header-message">{t('modals.interactiveRebase.message')}</span>
                <span className="header-author">{t('modals.interactiveRebase.author')}</span>
              </div>
              <div className="commits-list">
                {isLoadingCommits ? (
                  <div className="commits-loading">
                    <RotateCcw size={20} className="spinning" />
                    <span>{t('common.loading')}</span>
                  </div>
                ) : entries.length === 0 ? (
                  <div className="commits-empty">
                    <RotateCcw size={20} />
                    <span>{t('modals.interactiveRebase.noCommits')}</span>
                  </div>
                ) : (
                  entries.map((entry, index) => (
                    <CommitRow
                      key={entry.commit_id}
                      entry={entry}
                      index={index}
                      onActionChange={handleActionChange}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDragEnd={handleDragEnd}
                      isDragging={dragIndex === index}
                      isDragOver={dragOverIndex === index}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Options */}
            <div className="interactive-rebase-options">
              <Checkbox
                checked={autostash}
                onChange={setAutostash}
                label={t('modals.interactiveRebase.autostash')}
                disabled={isLoading || isLoadingCommits}
              />
            </div>
          </div>
        </ModalBody>

        <ModalFooter className={isLoading ? 'modal-footer-loading' : undefined}>
          <ModalLoadingIndicator
            isLoading={isLoading}
            loadingText={t('modals.interactiveRebase.loading')}
          />
          <button className="btn-cancel" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" onClick={handleRebase} disabled={isRebaseDisabled}>
            {t('modals.interactiveRebase.startRebase')}
          </button>
        </ModalFooter>
      </Modal>
    );
  }
);
