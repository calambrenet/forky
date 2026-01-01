import type { FC } from 'react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getVersion, getTauriVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Modal, ModalBody, ModalFooter } from '../modal';
import { ExternalLink } from 'lucide-react';
import appIcon from '../../assets/app-icon.png';
import './AboutModal.css';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [appVersion, setAppVersion] = useState<string>('');
  const [tauriVersion, setTauriVersion] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      getVersion().then(setAppVersion);
      getTauriVersion().then(setTauriVersion);
    }
  }, [isOpen]);

  const handleOpenLink = async (url: string) => {
    try {
      await openUrl(url);
    } catch (error) {
      console.error('Failed to open link:', error);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalBody className="about-modal-body">
        <div className="about-logo">
          <img src={appIcon} alt="Forky" className="about-logo-icon" />
          <div className="about-app-info">
            <h1 className="about-app-name">{t('app.name')}</h1>
            <p className="about-app-tagline">{t('app.tagline')}</p>
          </div>
        </div>

        <div className="about-version-info">
          <div className="about-version-row">
            <span className="about-version-label">{t('about.version')}</span>
            <span className="about-version-value">{appVersion}</span>
            <span className="about-version-badge">{t('about.alpha')}</span>
          </div>
          <div className="about-version-row">
            <span className="about-version-label">{t('about.tauriVersion')}</span>
            <span className="about-version-value">{tauriVersion}</span>
          </div>
        </div>

        <div className="about-description">
          <p>{t('about.description')}</p>
        </div>

        <div className="about-links">
          <button
            className="about-link"
            onClick={() => handleOpenLink('https://github.com/calambrenet/forky')}
          >
            <ExternalLink size={14} />
            <span>GitHub</span>
          </button>
          <button
            className="about-link"
            onClick={() => handleOpenLink('https://github.com/calambrenet/forky/releases')}
          >
            <ExternalLink size={14} />
            <span>{t('about.releases')}</span>
          </button>
          <button
            className="about-link"
            onClick={() => handleOpenLink('https://github.com/calambrenet/forky/issues')}
          >
            <ExternalLink size={14} />
            <span>{t('about.reportIssue')}</span>
          </button>
        </div>

        <div className="about-author">
          <p className="about-author-label">{t('about.createdBy')}</p>
          <div className="about-author-links">
            <button
              className="about-author-link"
              onClick={() => handleOpenLink('https://jluiscastro.com')}
            >
              José Luis Castro
            </button>
            <span className="about-author-separator">·</span>
            <button
              className="about-author-link"
              onClick={() => handleOpenLink('https://x.com/calambrenet')}
            >
              @calambrenet
            </button>
          </div>
        </div>

        <div className="about-license">
          <p>{t('about.license')}</p>
        </div>
      </ModalBody>

      <ModalFooter>
        <button className="btn-primary" onClick={onClose}>
          {t('common.close')}
        </button>
      </ModalFooter>
    </Modal>
  );
};
