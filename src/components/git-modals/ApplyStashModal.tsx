import type { FC } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, Play, Download, Trash2 } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../modal';
import type { StashInfo } from '../../types/git';
import './GitModals.css';

interface ApplyStashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: () => void;
  onPop: () => void;
  onDrop: () => void;
  stash: StashInfo | null;
}

export const ApplyStashModal: FC<ApplyStashModalProps> = memo(
  ({ isOpen, onClose, onApply, onPop, onDrop, stash }) => {
    const { t } = useTranslation();

    if (!stash) return null;

    const handleApply = () => {
      onApply();
      onClose();
    };

    const handlePop = () => {
      onPop();
      onClose();
    };

    const handleDrop = () => {
      onDrop();
      onClose();
    };

    // Format timestamp to readable date
    const formatDate = (timestamp: number) => {
      const date = new Date(timestamp * 1000);
      return date.toLocaleString();
    };

    return (
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalHeader
          icon={<Archive size={24} />}
          title={t('modals.applyStash.title')}
          description={t('modals.applyStash.description')}
        />
        <ModalBody>
          <div className="stash-details">
            <div className="stash-details-row">
              <span className="stash-details-label">{t('modals.applyStash.stashId')}</span>
              <span className="stash-details-value">{stash.id}</span>
            </div>
            <div className="stash-details-row">
              <span className="stash-details-label">{t('modals.applyStash.message')}</span>
              <span className="stash-details-value stash-message">{stash.message}</span>
            </div>
            {stash.branch && (
              <div className="stash-details-row">
                <span className="stash-details-label">{t('modals.applyStash.branch')}</span>
                <span className="stash-details-value">{stash.branch}</span>
              </div>
            )}
            <div className="stash-details-row">
              <span className="stash-details-label">{t('modals.applyStash.date')}</span>
              <span className="stash-details-value">{formatDate(stash.timestamp)}</span>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <button className="btn-cancel" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <div className="stash-actions">
            <button
              className="btn-secondary stash-action-btn"
              onClick={handleDrop}
              title={t('modals.applyStash.dropDescription')}
            >
              <Trash2 size={14} />
              {t('modals.applyStash.drop')}
            </button>
            <button
              className="btn-secondary stash-action-btn"
              onClick={handleApply}
              title={t('modals.applyStash.applyDescription')}
            >
              <Download size={14} />
              {t('modals.applyStash.apply')}
            </button>
            <button
              className="btn-primary stash-action-btn"
              onClick={handlePop}
              title={t('modals.applyStash.popDescription')}
            >
              <Play size={14} />
              {t('modals.applyStash.pop')}
            </button>
          </div>
        </ModalFooter>
      </Modal>
    );
  }
);
