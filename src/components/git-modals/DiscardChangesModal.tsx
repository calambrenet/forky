import type { FC } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, FileX } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import type { FileStatus } from '../../types/git';
import './GitModals.css';

interface DiscardChangesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (file: FileStatus) => void;
  file: FileStatus | null;
}

export const DiscardChangesModal: FC<DiscardChangesModalProps> = memo(
  ({ isOpen, onClose, onConfirm, file }) => {
    const { t } = useTranslation();

    const handleConfirm = () => {
      if (file) {
        onConfirm(file);
        onClose();
      }
    };

    const isUntracked = file?.status === 'untracked' || file?.status === 'new';

    return (
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalHeader
          icon={<AlertTriangle size={24} className="warning-icon" />}
          title={t('modals.discardChanges.title')}
          description={
            isUntracked
              ? t('modals.discardChanges.descriptionUntracked')
              : t('modals.discardChanges.description')
          }
        />
        <ModalBody>
          <ModalRow label={t('modals.discardChanges.file')}>
            <div className="discard-file-value">
              <FileX size={14} />
              <span className="file-path-display">{file?.path || ''}</span>
            </div>
          </ModalRow>
        </ModalBody>
        <div className="modal-warning">
          <AlertTriangle size={16} />
          <span>{t('modals.discardChanges.warning')}</span>
        </div>
        <ModalFooter>
          <button className="btn-cancel" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-danger" onClick={handleConfirm}>
            {t('modals.discardChanges.discard')}
          </button>
        </ModalFooter>
      </Modal>
    );
  }
);
