import type { FC } from 'react';
import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  RotateCcw,
  GitBranch,
  GripVertical,
  ChevronDown,
  Check,
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

// Reword and Edit require interactive message-editing/pause-resume UI not supported here
const ACTION_OPTIONS: { value: RebaseAction; label: string; icon: React.ReactNode }[] = [
  { value: 'pick', label: 'Pick', icon: <Check size={12} /> },
  { value: 'squash', label: 'Squash', icon: <Layers size={12} /> },
  { value: 'fixup', label: 'Fixup', icon: <Layers size={12} /> },
  { value: 'drop', label: 'Drop', icon: <Trash2 size={12} /> },
];

interface OpenDropdownState {
  index: number;
  top: number;
  left: number;
}

interface CommitRowProps {
  entry: InteractiveRebaseEntry;
  index: number;
  onToggleDropdown: (index: number, buttonEl: HTMLButtonElement) => void;
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
    onToggleDropdown,
    onDragStart,
    onDragOver,
    onDragEnd,
    isDragging,
    isDragOver,
  }) => {
    const currentAction = ACTION_OPTIONS.find((a) => a.value === entry.action) ?? ACTION_OPTIONS[0];

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
            type="button"
            className={`action-button action-${entry.action}`}
            onClick={(e) => onToggleDropdown(index, e.currentTarget)}
          >
            {currentAction.icon}
            <span>{currentAction.label}</span>
            <ChevronDown size={12} />
          </button>
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
    const [openDropdown, setOpenDropdown] = useState<OpenDropdownState | null>(null);
    const dropdownMenuRef = useRef<HTMLDivElement>(null);
    const initializedForOpenRef = useRef(false);

    // Initialize entries once when modal opens and commits finish loading (so parent re-renders never wipe edits)
    useEffect(() => {
      if (!isOpen) {
        initializedForOpenRef.current = false;
        setEntries([]);
        setAutostash(true);
        setIsLoading(false);
        setOpenDropdown(null);
        return;
      }

      if (!isLoadingCommits && !initializedForOpenRef.current) {
        initializedForOpenRef.current = true;
        setEntries([...commits]);
        setAutostash(true);
        setIsLoading(false);
      }
    }, [isOpen, isLoadingCommits, commits]);

    // Close row action dropdown on click outside, scroll, or Escape (without closing parent Modal)
    useEffect(() => {
      if (!openDropdown) return;

      const handleMouseDown = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (dropdownMenuRef.current?.contains(target) || target.closest('.action-button')) {
          return;
        }
        setOpenDropdown(null);
      };

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setOpenDropdown(null);
        }
      };

      document.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('keydown', handleEscape, true);
      return () => {
        document.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('keydown', handleEscape, true);
      };
    }, [openDropdown]);

    const handleToggleDropdown = useCallback((index: number, buttonEl: HTMLButtonElement) => {
      setOpenDropdown((prev) => {
        if (prev?.index === index) return null;
        const rect = buttonEl.getBoundingClientRect();
        const estimatedHeight = ACTION_OPTIONS.length * 32 + 8;
        const spaceBelow = window.innerHeight - rect.bottom;
        const top =
          spaceBelow < estimatedHeight && rect.top > estimatedHeight
            ? rect.top - estimatedHeight - 4
            : rect.bottom + 4;
        return { index, top, left: rect.left };
      });
    }, []);

    const handleActionChange = useCallback((index: number, action: RebaseAction) => {
      setEntries((prev) => {
        const newEntries = [...prev];
        if (newEntries[index]) {
          newEntries[index] = { ...newEntries[index], action };
        }
        return newEntries;
      });
      setOpenDropdown(null);
    }, []);

    const handleDragStart = useCallback((index: number) => {
      setOpenDropdown(null);
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

      setOpenDropdown(null);
      setIsLoading(true);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onRebase(entries, autostash);
        });
      });
    }, [isLoading, isLoadingCommits, entries, autostash, onRebase]);

    const targetBranchName = targetBranch?.name || '';
    const isRebaseDisabled = isLoading || isLoadingCommits || entries.length === 0;
    const activeEntry = openDropdown ? entries[openDropdown.index] : null;

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
            <div className="interactive-rebase-commits">
              <div className="commits-header">
                <span className="header-drag"></span>
                <span className="header-action">{t('modals.interactiveRebase.action')}</span>
                <span className="header-commit">{t('modals.interactiveRebase.commit')}</span>
                <span className="header-message">{t('modals.interactiveRebase.message')}</span>
                <span className="header-author">{t('modals.interactiveRebase.author')}</span>
              </div>
              <div className="commits-list" onScroll={() => openDropdown && setOpenDropdown(null)}>
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
                      onToggleDropdown={handleToggleDropdown}
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

        {/* Portal menu prevents clipping inside .commits-list overflow container */}
        {openDropdown &&
          activeEntry &&
          createPortal(
            <div
              ref={dropdownMenuRef}
              className="action-dropdown-menu"
              style={{
                position: 'fixed',
                top: openDropdown.top,
                left: openDropdown.left,
                zIndex: 2200,
              }}
            >
              {ACTION_OPTIONS.map((option) => (
                <div
                  key={option.value}
                  className={`action-option ${activeEntry.action === option.value ? 'selected' : ''}`}
                  onClick={() => handleActionChange(openDropdown.index, option.value)}
                >
                  {option.icon}
                  <span>{option.label}</span>
                </div>
              ))}
            </div>,
            document.body
          )}
      </Modal>
    );
  }
);
