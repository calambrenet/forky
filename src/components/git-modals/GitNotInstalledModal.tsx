import type { FC } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../modal';
import './GitModals.css';

interface GitNotInstalledModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GIT_DOWNLOAD_URLS: Record<string, string> = {
  windows: 'https://git-scm.com/download/win',
  macos: 'https://git-scm.com/download/mac',
  linux: 'https://git-scm.com/download/linux',
};

export const GitNotInstalledModal: FC<GitNotInstalledModalProps> = memo(({ isOpen, onClose }) => {
  const { t } = useTranslation();

  const handleDownloadClick = () => {
    // Detect OS and open appropriate download page
    const platform = navigator.platform.toLowerCase();
    let url = GIT_DOWNLOAD_URLS.linux; // default

    if (platform.includes('win')) {
      url = GIT_DOWNLOAD_URLS.windows;
    } else if (platform.includes('mac')) {
      url = GIT_DOWNLOAD_URLS.macos;
    }

    window.open(url, '_blank');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalHeader
        icon={<AlertTriangle size={24} className="warning-icon" />}
        title={t('modals.gitNotInstalled.title')}
        description={t('modals.gitNotInstalled.description')}
      />
      <ModalBody>
        <div className="git-not-installed-content">
          <p className="git-not-installed-message">{t('modals.gitNotInstalled.message')}</p>
          <ul className="git-not-installed-limitations">
            <li>{t('modals.gitNotInstalled.limitation1')}</li>
            <li>{t('modals.gitNotInstalled.limitation2')}</li>
            <li>{t('modals.gitNotInstalled.limitation3')}</li>
            <li>{t('modals.gitNotInstalled.limitation4')}</li>
          </ul>
          <p className="git-not-installed-note">{t('modals.gitNotInstalled.note')}</p>
        </div>
      </ModalBody>
      <ModalFooter>
        <button className="btn-cancel" onClick={onClose}>
          {t('modals.gitNotInstalled.continueAnyway')}
        </button>
        <button className="btn-primary" onClick={handleDownloadClick}>
          <ExternalLink size={16} />
          {t('modals.gitNotInstalled.downloadGit')}
        </button>
      </ModalFooter>
    </Modal>
  );
});
