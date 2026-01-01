import type { FC } from 'react';
import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Tag, GitBranch } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { Checkbox, BranchNameInput } from '../form';
import type { BranchInfo, TagInfo } from '../../types/git';
import type { ValidationResult } from '../../utils/branchNameValidation';
import './GitModals.css';

interface CreateTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (
    tagName: string,
    startPoint: string,
    message: string | null,
    pushToRemotes: boolean
  ) => void;
  sourceBranch: BranchInfo | null;
  existingTags: TagInfo[];
}

export const CreateTagModal: FC<CreateTagModalProps> = memo(
  ({ isOpen, onClose, onCreate, sourceBranch, existingTags }) => {
    const { t } = useTranslation();
    const [tagName, setTagName] = useState('');
    const [message, setMessage] = useState('');
    const [pushToRemotes, setPushToRemotes] = useState(true);
    const [isValid, setIsValid] = useState(false);

    // Get existing tag names for validation
    const existingTagNames = useMemo(() => {
      return existingTags.map((tag) => tag.name);
    }, [existingTags]);

    // Reset when modal opens
    useEffect(() => {
      if (isOpen) {
        setTagName('');
        setMessage('');
        setPushToRemotes(true);
        setIsValid(false);
      }
    }, [isOpen]);

    const handleValidationChange = useCallback((result: ValidationResult) => {
      setIsValid(result.isValid);
    }, []);

    const handleCreate = useCallback(() => {
      if (isValid && sourceBranch && tagName) {
        const trimmedMessage = message.trim();
        onCreate(tagName, sourceBranch.name, trimmedMessage || null, pushToRemotes);
        onClose();
      }
    }, [isValid, sourceBranch, tagName, message, pushToRemotes, onCreate, onClose]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && isValid) {
          handleCreate();
        }
      },
      [isValid, handleCreate]
    );

    const isCreateDisabled = !isValid || !tagName;
    const sourceBranchDisplayName = sourceBranch?.name || '';

    return (
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalHeader
          icon={<Tag size={24} />}
          title={t('modals.createTag.title')}
          description={t('modals.createTag.description')}
        />
        <ModalBody>
          <ModalRow label={t('modals.createTag.createAt')}>
            <div className="track-branch-value">
              <GitBranch size={14} />
              <span className="branch-name-display">{sourceBranchDisplayName}</span>
            </div>
          </ModalRow>
          <ModalRow label={t('modals.createTag.tagName')}>
            <BranchNameInput
              value={tagName}
              onChange={setTagName}
              onKeyDown={handleKeyDown}
              onValidationChange={handleValidationChange}
              existingNames={existingTagNames}
              mode="tag"
              placeholder={t('modals.createTag.tagNamePlaceholder')}
              autoFocus
            />
          </ModalRow>
          <ModalRow label={t('modals.createTag.message')}>
            <textarea
              className="modal-textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('modals.createTag.messagePlaceholder')}
              rows={4}
            />
          </ModalRow>
        </ModalBody>
        <div className="modal-checkboxes">
          <Checkbox
            checked={pushToRemotes}
            onChange={setPushToRemotes}
            label={t('modals.createTag.pushToRemotes')}
          />
        </div>
        <ModalFooter>
          <button className="btn-cancel" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" onClick={handleCreate} disabled={isCreateDisabled}>
            {pushToRemotes ? t('modals.createTag.createAndPush') : t('modals.createTag.create')}
          </button>
        </ModalFooter>
      </Modal>
    );
  }
);
