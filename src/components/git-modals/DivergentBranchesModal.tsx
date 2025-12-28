import type { FC } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, GitMerge, GitPullRequest } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../modal';
import './GitModals.css';

interface DivergentBranchesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMerge: () => void;
  onRebase: () => void;
  isLoading?: boolean;
}

export const DivergentBranchesModal: FC<DivergentBranchesModalProps> = memo(
  ({ isOpen, onClose, onMerge, onRebase, isLoading = false }) => {
    const { t } = useTranslation();

    return (
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalHeader
          icon={<GitBranch size={24} className="warning-icon" />}
          title={t('modals.divergentBranches.title')}
          description={t('modals.divergentBranches.description')}
        />
        <ModalBody>
          <div className="divergent-branches-content">
            <p className="divergent-branches-explanation">
              {t('modals.divergentBranches.explanation')}
            </p>

            <div className="divergent-branches-options">
              <button
                className="divergent-option-btn"
                onClick={onMerge}
                disabled={isLoading}
              >
                <GitMerge size={20} />
                <div className="option-text">
                  <strong>{t('modals.divergentBranches.merge')}</strong>
                  <span>{t('modals.divergentBranches.mergeDescription')}</span>
                </div>
              </button>

              <button
                className="divergent-option-btn"
                onClick={onRebase}
                disabled={isLoading}
              >
                <GitPullRequest size={20} />
                <div className="option-text">
                  <strong>{t('modals.divergentBranches.rebase')}</strong>
                  <span>{t('modals.divergentBranches.rebaseDescription')}</span>
                </div>
              </button>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <button className="btn-cancel" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </button>
        </ModalFooter>
      </Modal>
    );
  }
);
