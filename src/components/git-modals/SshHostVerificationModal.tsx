import { FC, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../modal';
import './GitModals.css';

// Warning/Security icon
const SecurityIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
  </svg>
);

export interface SshHostInfo {
  host: string;
  keyType: string;
  fingerprint: string;
}

interface SshHostVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
  hostInfo: SshHostInfo | null;
  isLoading?: boolean;
}

export const SshHostVerificationModal: FC<SshHostVerificationModalProps> = memo(({
  isOpen,
  onClose,
  onAccept,
  onReject,
  hostInfo,
  isLoading = false,
}) => {
  const { t } = useTranslation();

  if (!hostInfo) return null;

  const handleReject = () => {
    onReject();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalHeader
        icon={<SecurityIcon />}
        title={t('modals.sshVerification.title')}
        description={t('modals.sshVerification.cantEstablish', { host: hostInfo.host })}
      />
      <ModalBody>
        <div className="ssh-verification-content">
          <div className="ssh-fingerprint-box">
            <div className="ssh-fingerprint-label">{t('modals.sshVerification.fingerprint', { keyType: hostInfo.keyType })}</div>
            <code className="ssh-fingerprint-value">{hostInfo.fingerprint}</code>
          </div>
          <p className="ssh-verification-warning">
            {t('modals.sshVerification.confirmConnect')}
          </p>
        </div>
      </ModalBody>
      <ModalFooter>
        <button className="btn-cancel" onClick={handleReject} disabled={isLoading}>
          {t('modals.sshVerification.noCancel')}
        </button>
        <button className="btn-primary" onClick={onAccept} disabled={isLoading}>
          {isLoading ? t('modals.sshVerification.adding') : t('modals.sshVerification.yesTrust')}
        </button>
      </ModalFooter>
    </Modal>
  );
});
