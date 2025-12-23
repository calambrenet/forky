import { FC, useState, useEffect, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Tag, GitBranch, AlertTriangle } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { Checkbox } from '../form';
import { BranchInfo, TagInfo } from '../../types/git';
import './GitModals.css';

interface CreateTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (tagName: string, startPoint: string, message: string | null, pushToRemotes: boolean) => void;
  sourceBranch: BranchInfo | null;
  existingTags: TagInfo[];
}

export const CreateTagModal: FC<CreateTagModalProps> = memo(({
  isOpen,
  onClose,
  onCreate,
  sourceBranch,
  existingTags,
}) => {
  const { t } = useTranslation();
  const [tagName, setTagName] = useState('');
  const [message, setMessage] = useState('');
  const [pushToRemotes, setPushToRemotes] = useState(true);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setTagName('');
      setMessage('');
      setPushToRemotes(true);
    }
  }, [isOpen]);

  // Check if tag name already exists
  const tagExists = useMemo(() => {
    if (!tagName.trim()) return false;
    return existingTags.some(t => t.name === tagName.trim());
  }, [existingTags, tagName]);

  // Validate tag name (similar to git ref name validation)
  const isValidTagName = useMemo(() => {
    const name = tagName.trim();
    if (!name) return false;
    // Git tag name rules: no spaces, no "..", no starting with ".", no ending with ".lock", etc.
    if (name.startsWith('.') || name.startsWith('-')) return false;
    if (name.endsWith('.') || name.endsWith('.lock')) return false;
    if (name.includes('..') || name.includes('~') || name.includes('^') || name.includes(':')) return false;
    if (name.includes('\\') || name.includes(' ') || name.includes('?') || name.includes('*') || name.includes('[')) return false;
    if (name.includes('@{')) return false;
    return true;
  }, [tagName]);

  const handleCreate = () => {
    if (!tagExists && isValidTagName && sourceBranch) {
      const trimmedMessage = message.trim();
      onCreate(
        tagName.trim(),
        sourceBranch.name,
        trimmedMessage || null,
        pushToRemotes
      );
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !tagExists && isValidTagName) {
      handleCreate();
    }
  };

  const isCreateDisabled = tagExists || !isValidTagName || !tagName.trim();

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
          <div className="track-branch-input-container">
            <Tag size={14} className="input-icon" />
            <input
              type="text"
              className="track-branch-input"
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('modals.createTag.tagNamePlaceholder')}
              autoFocus
            />
          </div>
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
      {tagExists && (
        <div className="modal-warning">
          <AlertTriangle size={16} />
          <span>{t('modals.createTag.tagExists', { tag: tagName })}</span>
        </div>
      )}
      <ModalFooter>
        <button className="btn-cancel" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button
          className="btn-primary"
          onClick={handleCreate}
          disabled={isCreateDisabled}
        >
          {pushToRemotes
            ? t('modals.createTag.createAndPush')
            : t('modals.createTag.create')
          }
        </button>
      </ModalFooter>
    </Modal>
  );
});
