import type { FC } from 'react';
import { useState, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, GitBranch, ArrowRight } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { Checkbox } from '../form';
import type { BranchInfo, RebasePreview } from '../../types/git';
import './GitModals.css';

interface RebaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRebase: (preserveMerges: boolean, autostash: boolean) => void;
  targetBranch: BranchInfo | null;
  currentBranch: string;
  preview: RebasePreview | null;
  isLoading: boolean;
}

export const RebaseModal: FC<RebaseModalProps> = memo(
  ({ isOpen, onClose, onRebase, targetBranch, currentBranch, preview, isLoading }) => {
    const { t } = useTranslation();
    const [preserveMerges, setPreserveMerges] = useState(false);
    const [autostash, setAutostash] = useState(true);

    // Reset when modal opens
    useEffect(() => {
      if (isOpen) {
        setPreserveMerges(false);
        setAutostash(true);
      }
    }, [isOpen]);

    const handleRebase = () => {
      if (!isLoading && preview) {
        onRebase(preserveMerges, autostash);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !isLoading && preview) {
        handleRebase();
      }
    };

    const targetBranchName = targetBranch?.name || '';
    const isRebaseDisabled = isLoading || !preview || preview.commits_to_rebase === 0;

    return (
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalHeader
          icon={<RotateCcw size={24} />}
          title={t('modals.rebase.title')}
          description={t('modals.rebase.description')}
        />
        <ModalBody>
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
        </ModalBody>

        <ModalFooter>
          <button className="btn-cancel" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn-primary"
            onClick={handleRebase}
            disabled={isRebaseDisabled}
          >
            {isLoading ? t('modals.rebase.rebasing') : t('modals.rebase.rebase')}
          </button>
        </ModalFooter>
      </Modal>
    );
  }
);
