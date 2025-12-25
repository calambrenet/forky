import { FC, useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, GitBranch, FileWarning } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../modal';
import './GitModals.css';

interface CheckoutConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (restoreChanges: boolean) => void;
  targetBranch: string;
  conflictingFiles: string[];
  isLoading?: boolean;
}

export const CheckoutConflictModal: FC<CheckoutConflictModalProps> = memo(({
  isOpen,
  onClose,
  onConfirm,
  targetBranch,
  conflictingFiles,
  isLoading = false,
}) => {
  const { t } = useTranslation();
  const [restoreChanges, setRestoreChanges] = useState(true);

  const handleConfirm = () => {
    onConfirm(restoreChanges);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalHeader
        icon={<AlertTriangle size={24} className="warning-icon" />}
        title={t('modals.checkoutConflict.title')}
        description={t('modals.checkoutConflict.description')}
      />
      <ModalBody>
        <div className="checkout-conflict-content">
          <div className="checkout-conflict-target">
            <span className="target-label">{t('modals.checkoutConflict.targetBranch')}</span>
            <span className="target-branch">
              <GitBranch size={14} />
              {targetBranch}
            </span>
          </div>

          <div className="conflict-files-section">
            <span className="files-label">
              {t('modals.checkoutConflict.filesAffected', { count: conflictingFiles.length })}
            </span>
            <div className="conflict-files-list">
              {conflictingFiles.map((file, index) => (
                <div key={index} className="conflict-file-item">
                  <FileWarning size={14} />
                  <span>{file}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="restore-option">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={restoreChanges}
                onChange={(e) => setRestoreChanges(e.target.checked)}
              />
              <span>{t('modals.checkoutConflict.restoreChanges')}</span>
            </label>
            <p className="restore-hint">
              {restoreChanges
                ? t('modals.checkoutConflict.restoreHint')
                : t('modals.checkoutConflict.noRestoreHint')
              }
            </p>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <button className="btn-cancel" onClick={onClose} disabled={isLoading}>
          {t('common.cancel')}
        </button>
        <button
          className="btn-primary"
          onClick={handleConfirm}
          disabled={isLoading}
        >
          {isLoading ? t('modals.checkoutConflict.switching') : t('modals.checkoutConflict.stashAndSwitch')}
        </button>
      </ModalFooter>
    </Modal>
  );
});
