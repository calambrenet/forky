import type { FC } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, FileX } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import type { DiffHunk } from '../../types/git';
import './GitModals.css';

interface DiscardHunkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (hunk: DiffHunk) => void;
  hunk: DiffHunk | null;
  filePath?: string;
}

export const DiscardHunkModal: FC<DiscardHunkModalProps> = memo(
  ({ isOpen, onClose, onConfirm, hunk, filePath }) => {
    const { t } = useTranslation();

    const handleConfirm = () => {
      if (hunk) {
        onConfirm(hunk);
      }
    };

    // Count additions and deletions in the hunk
    const additions = hunk?.lines.filter((l) => l.line_type === 'add').length || 0;
    const deletions = hunk?.lines.filter((l) => l.line_type === 'delete').length || 0;

    return (
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalHeader
          icon={<AlertTriangle size={24} className="warning-icon" />}
          title={t('modals.discardHunk.title')}
          description={t('modals.discardHunk.description')}
        />
        <ModalBody>
          {filePath && (
            <ModalRow label={t('modals.discardChanges.file')}>
              <div className="discard-file-value">
                <FileX size={14} />
                <span className="file-path-display">{filePath}</span>
              </div>
            </ModalRow>
          )}
          <ModalRow label={t('modals.discardHunk.hunkInfo')}>
            <div className="hunk-info-display">
              <span className="hunk-range">
                @@ -{hunk?.old_start},{hunk?.old_lines} +{hunk?.new_start},{hunk?.new_lines} @@
              </span>
              <span className="hunk-stats">
                <span className="additions">+{additions}</span>
                <span className="deletions">-{deletions}</span>
              </span>
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
