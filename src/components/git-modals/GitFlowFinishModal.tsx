import type { FC } from 'react';
import { useState, useEffect, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { GitMerge, GitBranch, Tag } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { Checkbox } from '../form';
import { ModalLoadingIndicator } from './ModalLoadingIndicator';
import type { GitFlowType } from '../../types/git';
import './GitModals.css';

interface GitFlowFinishModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFinish: (deleteBranch: boolean) => void;
  flowType: GitFlowType;
  branchName: string;
  featureName: string;
  masterBranch: string;
  developBranch: string;
}

export const GitFlowFinishModal: FC<GitFlowFinishModalProps> = memo(
  ({
    isOpen,
    onClose,
    onFinish,
    flowType,
    branchName,
    featureName,
    masterBranch,
    developBranch,
  }) => {
    const { t } = useTranslation();
    const [deleteBranch, setDeleteBranch] = useState(true);
    const [isLoading, setIsLoading] = useState(false);

    // Reset when modal opens
    useEffect(() => {
      if (isOpen) {
        setDeleteBranch(true);
        setIsLoading(false);
      }
    }, [isOpen]);

    const handleFinish = useCallback(() => {
      if (isLoading) return;

      // Set loading state immediately
      setIsLoading(true);

      // Use requestAnimationFrame to allow React to render the loading state
      // before the blocking git operation starts
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onFinish(deleteBranch);
        });
      });
    }, [isLoading, onFinish, deleteBranch]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !isLoading) {
        handleFinish();
      }
    };

    const getTitle = () => {
      switch (flowType) {
        case 'feature':
          return t('modals.gitFlowFinish.titleFeature');
        case 'release':
          return t('modals.gitFlowFinish.titleRelease');
        case 'hotfix':
          return t('modals.gitFlowFinish.titleHotfix');
        default:
          return '';
      }
    };

    const getLoadingText = () => {
      switch (flowType) {
        case 'feature':
          return t('modals.gitFlowFinish.loadingFeature');
        case 'release':
          return t('modals.gitFlowFinish.loadingRelease');
        case 'hotfix':
          return t('modals.gitFlowFinish.loadingHotfix');
        default:
          return '';
      }
    };

    // Feature merges only to develop
    // Release and Hotfix merge to both master and develop, and create a tag
    const isFeature = flowType === 'feature';

    return (
      <Modal isOpen={isOpen} onClose={isLoading ? undefined : onClose}>
        <ModalHeader
          icon={<GitMerge size={24} />}
          title={getTitle()}
          description={t('modals.gitFlowFinish.description', { type: flowType, name: featureName })}
        />
        <ModalBody className={isLoading ? 'modal-body-loading' : undefined}>
          <div className={isLoading ? 'modal-content-loading' : undefined}>
            <ModalRow label={t('modals.gitFlowFinish.branch')}>
              <div className="track-branch-value">
                <GitBranch size={14} />
                <span className="branch-name-display">{branchName}</span>
              </div>
            </ModalRow>

            {/* Merge info */}
            <div className="modal-info-list" onKeyDown={handleKeyDown}>
              {isFeature ? (
                <div className="modal-info">
                  <GitMerge size={14} />
                  <span>{t('modals.gitFlowFinish.mergeInto', { branch: developBranch })}</span>
                </div>
              ) : (
                <>
                  <div className="modal-info">
                    <GitMerge size={14} />
                    <span>
                      {t('modals.gitFlowFinish.mergeIntoBoth', {
                        master: masterBranch,
                        develop: developBranch,
                      })}
                    </span>
                  </div>
                  <div className="modal-info">
                    <Tag size={14} />
                    <span>{t('modals.gitFlowFinish.createTag', { tag: featureName })}</span>
                  </div>
                </>
              )}
            </div>

            {/* Delete branch checkbox */}
            <div className="modal-checkboxes">
              <Checkbox
                checked={deleteBranch}
                onChange={setDeleteBranch}
                label={t('modals.gitFlowFinish.deleteBranch')}
                disabled={isLoading}
              />
            </div>
          </div>
        </ModalBody>

        <ModalFooter className={isLoading ? 'modal-footer-loading' : undefined}>
          <ModalLoadingIndicator isLoading={isLoading} loadingText={getLoadingText()} />
          <button className="btn-cancel" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" onClick={handleFinish} disabled={isLoading}>
            {t('modals.gitFlowFinish.finish')}
          </button>
        </ModalFooter>
      </Modal>
    );
  }
);
