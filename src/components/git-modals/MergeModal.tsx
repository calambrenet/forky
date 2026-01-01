import type { FC } from 'react';
import { useState, useEffect, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { GitMerge, GitBranch, AlertTriangle, ArrowRight, Check, Zap } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { Select } from '../form';
import { ModalLoadingIndicator } from './ModalLoadingIndicator';
import type { BranchInfo, MergePreview, MergeType } from '../../types/git';
import './GitModals.css';

interface MergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMerge: (mergeType: MergeType) => void;
  sourceBranch: BranchInfo | null;
  targetBranch: string;
  preview: MergePreview | null;
}

export const MergeModal: FC<MergeModalProps> = memo(
  ({ isOpen, onClose, onMerge, sourceBranch, targetBranch, preview }) => {
    const { t } = useTranslation();
    const [mergeType, setMergeType] = useState<MergeType>('default');
    const [isLoading, setIsLoading] = useState(false);

    // Reset when modal opens
    useEffect(() => {
      if (isOpen) {
        setMergeType('default');
        setIsLoading(false);
      }
    }, [isOpen]);

    const handleMerge = useCallback(() => {
      if (isLoading || !preview || preview.has_conflicts) return;

      // Set loading state immediately
      setIsLoading(true);

      // Use requestAnimationFrame to allow React to render the loading state
      // before the blocking git operation starts
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onMerge(mergeType);
        });
      });
    }, [isLoading, preview, onMerge, mergeType]);

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
      <Modal isOpen={isOpen} onClose={isLoading ? undefined : onClose}>
        <ModalHeader
          icon={<GitMerge size={24} />}
          title={t('modals.merge.title')}
          description={t('modals.merge.description')}
        />
        <ModalBody className={isLoading ? 'modal-body-loading' : undefined}>
          <div className={isLoading ? 'modal-content-loading' : undefined}>
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
          </div>
        </ModalBody>

        {/* Conflict warning */}
        {preview?.has_conflicts && (
          <div className={`modal-warning ${isLoading ? 'modal-content-loading' : ''}`}>
            <AlertTriangle size={16} />
            <span>
              {t('modals.merge.hasConflicts', { count: preview.conflicting_files.length })}
            </span>
          </div>
        )}

        <ModalFooter className={isLoading ? 'modal-footer-loading' : undefined}>
          <ModalLoadingIndicator isLoading={isLoading} loadingText={t('modals.merge.loading')} />
          <button className="btn-cancel" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" onClick={handleMerge} disabled={isMergeDisabled}>
            {t('modals.merge.merge')}
          </button>
        </ModalFooter>
      </Modal>
    );
  }
);
