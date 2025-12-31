import type { FC } from 'react';
import { useState, useEffect, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { ModalLoadingIndicator } from './ModalLoadingIndicator';
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
      masterBranch.trim() !== '' &&
      developBranch.trim() !== '' &&
      featurePrefix.trim() !== '' &&
      releasePrefix.trim() !== '' &&
      hotfixPrefix.trim() !== '';

    const handleInit = useCallback(() => {
      if (!isValid || isLoading) return;

      setIsLoading(true);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onInit({
            masterBranch: masterBranch.trim(),
            developBranch: developBranch.trim(),
            featurePrefix: featurePrefix.trim(),
            releasePrefix: releasePrefix.trim(),
            hotfixPrefix: hotfixPrefix.trim(),
            versionTagPrefix: versionTagPrefix.trim(),
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

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && isValid && !isLoading) {
        handleInit();
      }
    };

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
              <input
                type="text"
                className="modal-input"
                value={masterBranch}
                onChange={(e) => setMasterBranch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="main"
                autoFocus
                disabled={isLoading}
              />
            </ModalRow>

            <ModalRow label={t('modals.gitFlowInit.developmentBranch')}>
              <input
                type="text"
                className="modal-input"
                value={developBranch}
                onChange={(e) => setDevelopBranch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="develop"
                disabled={isLoading}
              />
            </ModalRow>

            <ModalRow label={t('modals.gitFlowInit.featurePrefix')}>
              <input
                type="text"
                className="modal-input"
                value={featurePrefix}
                onChange={(e) => setFeaturePrefix(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="feature/"
                disabled={isLoading}
              />
            </ModalRow>

            <ModalRow label={t('modals.gitFlowInit.releasePrefix')}>
              <input
                type="text"
                className="modal-input"
                value={releasePrefix}
                onChange={(e) => setReleasePrefix(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="release/"
                disabled={isLoading}
              />
            </ModalRow>

            <ModalRow label={t('modals.gitFlowInit.hotfixPrefix')}>
              <input
                type="text"
                className="modal-input"
                value={hotfixPrefix}
                onChange={(e) => setHotfixPrefix(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="hotfix/"
                disabled={isLoading}
              />
            </ModalRow>

            <ModalRow label={t('modals.gitFlowInit.versionTagPrefix')}>
              <input
                type="text"
                className="modal-input"
                value={versionTagPrefix}
                onChange={(e) => setVersionTagPrefix(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder=""
                disabled={isLoading}
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
