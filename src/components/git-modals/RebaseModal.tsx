import type { FC } from 'react';
import { useState, useEffect, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, GitBranch, ArrowRight } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { Checkbox } from '../form';
import { ModalLoadingIndicator } from './ModalLoadingIndicator';
import type { BranchInfo, RebasePreview } from '../../types/git';
import './GitModals.css';

interface RebaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRebase: (preserveMerges: boolean, autostash: boolean) => void;
  targetBranch: BranchInfo | null;
  currentBranch: string;
  preview: RebasePreview | null;
}

export const RebaseModal: FC<RebaseModalProps> = memo(
  ({ isOpen, onClose, onRebase, targetBranch, currentBranch, preview }) => {
    const { t } = useTranslation();
    const [preserveMerges, setPreserveMerges] = useState(false);
    const [autostash, setAutostash] = useState(true);
    const [isLoading, setIsLoading] = useState(false);

    // Reset when modal opens
    useEffect(() => {
      if (isOpen) {
        setPreserveMerges(false);
        setAutostash(true);
        setIsLoading(false);
      }
    }, [isOpen]);

    const handleRebase = useCallback(() => {
      if (isLoading || !preview) return;

      // Set loading state immediately
      setIsLoading(true);

      // Use requestAnimationFrame to allow React to render the loading state
      // before the blocking git operation starts
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onRebase(preserveMerges, autostash);
        });
      });
    }, [isLoading, preview, onRebase, preserveMerges, autostash]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !isLoading && preview) {
        handleRebase();
      }
    };

    const targetBranchName = targetBranch?.name || '';
    const isRebaseDisabled = isLoading || !preview || preview.commits_to_rebase === 0;

    return (
      <Modal isOpen={isOpen} onClose={isLoading ? undefined : onClose}>
        <ModalHeader
          icon={<RotateCcw size={24} />}
          title={t('modals.rebase.title')}
          description={t('modals.rebase.description')}
        />
        <ModalBody className={isLoading ? 'modal-body-loading' : undefined}>
          <div className={isLoading ? 'modal-content-loading' : undefined}>
            {/* Current branch (will be rebased) */}
            <ModalRow label={t('modals.rebase.current')}>
              <div className="merge-branch-display current">
                <GitBranch size={14} />
                <span className="branch-name-display">{currentBranch}</span>
              </div>
            </ModalRow>

            {/* Arrow indicator */}
            <div className="merge-arrow-container">
              <ArrowRight size={16} className="merge-arrow" />
            </div>

            {/* Onto branch */}
            <ModalRow label={t('modals.rebase.onto')}>
              <div className="merge-branch-display">
                <GitBranch size={14} />
                <span className="branch-name-display">{targetBranchName}</span>
              </div>
            </ModalRow>

            {/* Preview info */}
            {preview && (
              <div className="merge-preview-info" onKeyDown={handleKeyDown}>
                {preview.commits_to_rebase > 0 ? (
                  <div className="merge-commits-count">
                    <span className="commits-number">{preview.commits_to_rebase}</span>
                    <span className="commits-label">
                      {t('modals.rebase.commitsToRebase', { count: preview.commits_to_rebase })}
                    </span>
                  </div>
                ) : (
                  <div className="merge-no-commits">
                    <RotateCcw size={16} />
                    <span>{t('modals.rebase.noCommitsToRebase')}</span>
                  </div>
                )}
              </div>
            )}

            {/* Options */}
            {preview && preview.commits_to_rebase > 0 && (
              <>
                <ModalRow label="">
                  <Checkbox
                    checked={preserveMerges}
                    onChange={setPreserveMerges}
                    label={t('modals.rebase.preserveMerges')}
                    disabled={isLoading}
                  />
                </ModalRow>

                <ModalRow label="">
                  <Checkbox
                    checked={autostash}
                    onChange={setAutostash}
                    label={t('modals.rebase.autostash')}
                    disabled={isLoading}
                  />
                </ModalRow>
              </>
            )}
          </div>
        </ModalBody>

        <ModalFooter className={isLoading ? 'modal-footer-loading' : undefined}>
          <ModalLoadingIndicator isLoading={isLoading} loadingText={t('modals.rebase.loading')} />
          <button className="btn-cancel" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" onClick={handleRebase} disabled={isRebaseDisabled}>
            {t('modals.rebase.rebase')}
          </button>
        </ModalFooter>
      </Modal>
    );
  }
);
