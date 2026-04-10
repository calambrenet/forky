import type { FC } from 'react';
import { useState, useEffect, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { ModalLoadingIndicator } from './ModalLoadingIndicator';
import { BranchNameInput } from '../form';
import './GitModals.css';

interface GitFlowInitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInit: (config: {
    masterBranch: string;
    developBranch: string;
    featurePrefix: string;
    releasePrefix: string;
    hotfixPrefix: string;
    versionTagPrefix: string;
  }) => void;
  defaultMasterBranch?: string;
}

export const GitFlowInitModal: FC<GitFlowInitModalProps> = memo(
  ({ isOpen, onClose, onInit, defaultMasterBranch = 'main' }) => {
    const { t } = useTranslation();
    const [masterBranch, setMasterBranch] = useState(defaultMasterBranch);
    const [developBranch, setDevelopBranch] = useState('develop');
    const [featurePrefix, setFeaturePrefix] = useState('feature/');
    const [releasePrefix, setReleasePrefix] = useState('release/');
    const [hotfixPrefix, setHotfixPrefix] = useState('hotfix/');
    const [versionTagPrefix, setVersionTagPrefix] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Reset when modal opens
    useEffect(() => {
      if (isOpen) {
        setMasterBranch(defaultMasterBranch);
        setDevelopBranch('develop');
        setFeaturePrefix('feature/');
        setReleasePrefix('release/');
        setHotfixPrefix('hotfix/');
        setVersionTagPrefix('');
        setIsLoading(false);
      }
    }, [isOpen, defaultMasterBranch]);

    const isValid =
      masterBranch !== '' &&
      developBranch !== '' &&
      featurePrefix !== '' &&
      releasePrefix !== '' &&
      hotfixPrefix !== '';

    const handleInit = useCallback(() => {
      if (!isValid || isLoading) return;

      setIsLoading(true);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onInit({
            masterBranch,
            developBranch,
            featurePrefix,
            releasePrefix,
            hotfixPrefix,
            versionTagPrefix,
          });
        });
      });
    }, [
      isValid,
      isLoading,
      onInit,
      masterBranch,
      developBranch,
      featurePrefix,
      releasePrefix,
      hotfixPrefix,
      versionTagPrefix,
    ]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && isValid && !isLoading) {
          handleInit();
        }
      },
      [isValid, isLoading, handleInit]
    );

    return (
      <Modal isOpen={isOpen} onClose={isLoading ? undefined : onClose}>
        <ModalHeader
          icon={<GitBranch size={24} />}
          title={t('modals.gitFlowInit.title')}
          description={t('modals.gitFlowInit.description')}
        />
        <ModalBody className={isLoading ? 'modal-body-loading' : undefined}>
          <div className={isLoading ? 'modal-content-loading' : undefined}>
            <ModalRow label={t('modals.gitFlowInit.productionBranch')}>
              <BranchNameInput
                value={masterBranch}
                onChange={setMasterBranch}
                onKeyDown={handleKeyDown}
                placeholder="main"
                disabled={isLoading}
                showErrors={false}
                autoFocus
              />
            </ModalRow>

            <ModalRow label={t('modals.gitFlowInit.developmentBranch')}>
              <BranchNameInput
                value={developBranch}
                onChange={setDevelopBranch}
                onKeyDown={handleKeyDown}
                placeholder="develop"
                disabled={isLoading}
                showErrors={false}
              />
            </ModalRow>

            <ModalRow label={t('modals.gitFlowInit.featurePrefix')}>
              <BranchNameInput
                value={featurePrefix}
                onChange={setFeaturePrefix}
                onKeyDown={handleKeyDown}
                placeholder="feature/"
                mode="prefix"
                disabled={isLoading}
                showErrors={false}
              />
            </ModalRow>

            <ModalRow label={t('modals.gitFlowInit.releasePrefix')}>
              <BranchNameInput
                value={releasePrefix}
                onChange={setReleasePrefix}
                onKeyDown={handleKeyDown}
                placeholder="release/"
                mode="prefix"
                disabled={isLoading}
                showErrors={false}
              />
            </ModalRow>

            <ModalRow label={t('modals.gitFlowInit.hotfixPrefix')}>
              <BranchNameInput
                value={hotfixPrefix}
                onChange={setHotfixPrefix}
                onKeyDown={handleKeyDown}
                placeholder="hotfix/"
                mode="prefix"
                disabled={isLoading}
                showErrors={false}
              />
            </ModalRow>

            <ModalRow label={t('modals.gitFlowInit.versionTagPrefix')}>
              <BranchNameInput
                value={versionTagPrefix}
                onChange={setVersionTagPrefix}
                onKeyDown={handleKeyDown}
                placeholder=""
                mode="tag"
                disabled={isLoading}
                showErrors={false}
              />
            </ModalRow>
          </div>
        </ModalBody>

        <ModalFooter className={isLoading ? 'modal-footer-loading' : undefined}>
          <ModalLoadingIndicator
            isLoading={isLoading}
            loadingText={t('modals.gitFlowInit.loading')}
          />
          <button className="btn-cancel" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" onClick={handleInit} disabled={!isValid || isLoading}>
            {t('modals.gitFlowInit.initialize')}
          </button>
        </ModalFooter>
      </Modal>
    );
  }
);

GitFlowInitModal.displayName = 'GitFlowInitModal';
