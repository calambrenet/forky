import type { FC } from 'react';
import { useState, useEffect, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, GitMerge, GitPullRequest } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../modal';
import { ModalLoadingIndicator } from './ModalLoadingIndicator';
import './GitModals.css';

interface DivergentBranchesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMerge: () => void;
  onRebase: () => void;
}

export const DivergentBranchesModal: FC<DivergentBranchesModalProps> = memo(
  ({ isOpen, onClose, onMerge, onRebase }) => {
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(false);
    const [loadingType, setLoadingType] = useState<'merge' | 'rebase' | null>(null);

    // Reset when modal opens
    useEffect(() => {
      if (isOpen) {
        setIsLoading(false);
        setLoadingType(null);
      }
    }, [isOpen]);

    const handleMerge = useCallback(() => {
      if (isLoading) return;

      setIsLoading(true);
      setLoadingType('merge');

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onMerge();
        });
      });
    }, [isLoading, onMerge]);

    const handleRebase = useCallback(() => {
      if (isLoading) return;

      setIsLoading(true);
      setLoadingType('rebase');

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onRebase();
        });
      });
    }, [isLoading, onRebase]);

    const getLoadingText = () => {
      if (loadingType === 'merge') {
        return t('modals.divergentBranches.loadingMerge');
      } else if (loadingType === 'rebase') {
        return t('modals.divergentBranches.loadingRebase');
      }
      return '';
    };

    return (
      <Modal isOpen={isOpen} onClose={isLoading ? undefined : onClose}>
        <ModalHeader
          icon={<GitBranch size={24} className="warning-icon" />}
          title={t('modals.divergentBranches.title')}
          description={t('modals.divergentBranches.description')}
        />
        <ModalBody className={isLoading ? 'modal-body-loading' : undefined}>
          <div className={`divergent-branches-content ${isLoading ? 'modal-content-loading' : ''}`}>
            <p className="divergent-branches-explanation">
              {t('modals.divergentBranches.explanation')}
            </p>

            <div className="divergent-branches-options">
              <button className="divergent-option-btn" onClick={handleMerge} disabled={isLoading}>
                <GitMerge size={20} />
                <div className="option-text">
                  <strong>{t('modals.divergentBranches.merge')}</strong>
                  <span>{t('modals.divergentBranches.mergeDescription')}</span>
                </div>
              </button>

              <button className="divergent-option-btn" onClick={handleRebase} disabled={isLoading}>
                <GitPullRequest size={20} />
                <div className="option-text">
                  <strong>{t('modals.divergentBranches.rebase')}</strong>
                  <span>{t('modals.divergentBranches.rebaseDescription')}</span>
                </div>
              </button>
            </div>
          </div>
        </ModalBody>
        <ModalFooter className={isLoading ? 'modal-footer-loading' : undefined}>
          <ModalLoadingIndicator isLoading={isLoading} loadingText={getLoadingText()} />
          <button className="btn-cancel" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </button>
        </ModalFooter>
      </Modal>
    );
  }
);
