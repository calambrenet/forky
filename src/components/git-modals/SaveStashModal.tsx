import type { FC } from 'react';
import { useState, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, FileText } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { Checkbox } from '../form';
import './GitModals.css';

interface SaveStashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (message: string, includeUntracked: boolean, keepIndex: boolean) => void;
  isSnapshot?: boolean;
}

export const SaveStashModal: FC<SaveStashModalProps> = memo(
  ({ isOpen, onClose, onSave, isSnapshot = false }) => {
    const { t } = useTranslation();
    const [message, setMessage] = useState('');
    const [stageNewFiles, setStageNewFiles] = useState(true);

    // Reset when modal opens
    useEffect(() => {
      if (isOpen) {
        setMessage('');
        setStageNewFiles(true);
      }
    }, [isOpen]);

    const handleSave = () => {
      onSave(message.trim(), stageNewFiles, isSnapshot);
      onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        handleSave();
      }
    };

    const title = isSnapshot ? t('modals.saveStash.titleSnapshot') : t('modals.saveStash.title');

    const description = isSnapshot
      ? t('modals.saveStash.descriptionSnapshot')
      : t('modals.saveStash.description');

    const buttonText = isSnapshot
      ? t('modals.saveStash.saveSnapshot')
      : t('modals.saveStash.saveStash');

    return (
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalHeader icon={<Archive size={24} />} title={title} description={description} />
        <ModalBody>
          <ModalRow label={t('modals.saveStash.message')}>
            <div className="track-branch-input-container">
              <FileText size={14} className="input-icon" />
              <input
                type="text"
                className="track-branch-input"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('modals.saveStash.messagePlaceholder')}
                autoFocus
              />
            </div>
          </ModalRow>
        </ModalBody>
        <div className="modal-checkboxes">
          <div className="checkbox-with-hint">
            <Checkbox
              checked={stageNewFiles}
              onChange={setStageNewFiles}
              label={t('modals.saveStash.stageNewFiles')}
            />
            <span className="checkbox-hint">{t('modals.saveStash.stageNewFilesHint')}</span>
          </div>
        </div>
        <ModalFooter>
          <button className="btn-cancel" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" onClick={handleSave}>
            {buttonText}
          </button>
        </ModalFooter>
      </Modal>
    );
  }
);
