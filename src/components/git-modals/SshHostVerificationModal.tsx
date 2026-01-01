import type { FC } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../modal';
import './GitModals.css';

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

export const SshHostVerificationModal: FC<SshHostVerificationModalProps> = memo(
  ({ isOpen, onClose, onAccept, onReject, hostInfo, isLoading = false }) => {
    const { t } = useTranslation();

    if (!hostInfo) return null;

    const handleReject = () => {
      onReject();
      onClose();
    };

    return (
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalHeader
          icon={<ShieldAlert size={24} />}
          title={t('modals.sshVerification.title')}
          description={t('modals.sshVerification.cantEstablish', { host: hostInfo.host })}
        />
        <ModalBody>
          <div className="ssh-verification-content">
            <div className="ssh-fingerprint-box">
              <div className="ssh-fingerprint-label">
                {t('modals.sshVerification.fingerprint', { keyType: hostInfo.keyType })}
              </div>
              <code className="ssh-fingerprint-value">{hostInfo.fingerprint}</code>
            </div>
            <p className="ssh-verification-warning">{t('modals.sshVerification.confirmConnect')}</p>
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
  }
);
