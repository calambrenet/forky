import type { FC } from 'react';
import { useState, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { GitMerge, GitBranch, AlertTriangle, ArrowRight, Check, Zap } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { Select } from '../form';
import type { BranchInfo, MergePreview, MergeType } from '../../types/git';
import './GitModals.css';

interface MergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMerge: (mergeType: MergeType) => void;
  sourceBranch: BranchInfo | null;
  targetBranch: string;
  preview: MergePreview | null;
  isLoading: boolean;
}

export const MergeModal: FC<MergeModalProps> = memo(
  ({ isOpen, onClose, onMerge, sourceBranch, targetBranch, preview, isLoading }) => {
    const { t } = useTranslation();
    const [mergeType, setMergeType] = useState<MergeType>('default');

    // Reset when modal opens
    useEffect(() => {
      if (isOpen) {
        setMergeType('default');
      }
    }, [isOpen]);

    const handleMerge = () => {
      if (!isLoading && preview && !preview.has_conflicts) {
        onMerge(mergeType);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !isLoading && preview && !preview.has_conflicts) {
        handleMerge();
      }
    };

    const mergeTypeOptions = [
      {
        value: 'default',
        label: t('modals.merge.typeDefault'),
        icon: <Zap size={14} />,
      },
      {
        value: 'no-ff',
        label: t('modals.merge.typeNoFf'),
        icon: <GitMerge size={14} />,
      },
      {
        value: 'squash',
        label: t('modals.merge.typeSquash'),
        icon: <GitMerge size={14} />,
      },
    ];

    const sourceBranchName = sourceBranch?.name || '';
    const isMergeDisabled =
      isLoading || !preview || preview.has_conflicts || preview.commits_ahead === 0;

    return (
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalHeader
          icon={<GitMerge size={24} />}
          title={t('modals.merge.title')}
          description={t('modals.merge.description')}
        />
        <ModalBody>
          {/* From branch */}
          <ModalRow label={t('modals.merge.from')}>
            <div className="merge-branch-display">
              <GitBranch size={14} />
              <span className="branch-name-display">{sourceBranchName}</span>
            </div>
          </ModalRow>

          {/* Arrow indicator */}
          <div className="merge-arrow-container">
            <ArrowRight size={16} className="merge-arrow" />
          </div>

          {/* Into branch */}
          <ModalRow label={t('modals.merge.into')}>
            <div className="merge-branch-display current">
              <GitBranch size={14} />
              <span className="branch-name-display">{targetBranch}</span>
            </div>
          </ModalRow>

          {/* Preview info */}
          {preview && (
            <div className="merge-preview-info" onKeyDown={handleKeyDown}>
              {preview.commits_ahead > 0 ? (
                <div className="merge-commits-count">
                  <span className="commits-number">{preview.commits_ahead}</span>
                  <span className="commits-label">
                    {t('modals.merge.commitsToMerge', { count: preview.commits_ahead })}
                  </span>
                </div>
              ) : (
                <div className="merge-no-commits">
                  <Check size={16} />
                  <span>{t('modals.merge.noCommitsToMerge')}</span>
                </div>
              )}

              {preview.can_fast_forward && preview.commits_ahead > 0 && (
                <div className="merge-ff-indicator">
                  <Zap size={14} />
                  <span>{t('modals.merge.canFastForward')}</span>
                </div>
              )}
            </div>
          )}

          {/* Merge type selector */}
          {preview && preview.commits_ahead > 0 && !preview.has_conflicts && (
            <ModalRow label={t('modals.merge.mergeType')}>
              <Select
                value={mergeType}
                options={mergeTypeOptions}
                onChange={(value) => setMergeType(value as MergeType)}
                disabled={isLoading}
              />
            </ModalRow>
          )}
        </ModalBody>

        {/* Conflict warning */}
        {preview?.has_conflicts && (
          <div className="modal-warning">
            <AlertTriangle size={16} />
            <span>
              {t('modals.merge.hasConflicts', { count: preview.conflicting_files.length })}
            </span>
          </div>
        )}

        <ModalFooter>
          <button className="btn-cancel" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" onClick={handleMerge} disabled={isMergeDisabled}>
            {isLoading ? t('modals.merge.merging') : t('modals.merge.merge')}
          </button>
        </ModalFooter>
      </Modal>
    );
  }
);
