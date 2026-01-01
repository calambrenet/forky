import type { FC } from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Globe, Check, AlertCircle } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal/Modal';
import type { GitOperationResult } from '../../types/git';
import './AddRemoteModal.css';

interface AddRemoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string, url: string) => Promise<void>;
  existingRemotes: string[];
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

export const AddRemoteModal: FC<AddRemoteModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  existingRemotes,
}) => {
  const { t } = useTranslation();
  const [remoteName, setRemoteName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setRemoteName('');
      setRepoUrl('');
      setTestStatus('idle');
      setTestMessage('');
      setIsAdding(false);
    }
  }, [isOpen]);

  // Validation
  const isValidName =
    remoteName.trim().length > 0 &&
    /^[a-zA-Z0-9_-]+$/.test(remoteName) &&
    !existingRemotes.includes(remoteName.trim());

  const isValidUrl = repoUrl.trim().length > 0;

  const nameError =
    remoteName.trim().length > 0 && !isValidName
      ? existingRemotes.includes(remoteName.trim())
        ? 'Remote name already exists'
        : 'Invalid name (use alphanumeric, - or _)'
      : '';

  const canAdd = isValidName && isValidUrl && !isAdding;

  const handleTestConnection = useCallback(async () => {
    if (!isValidUrl) return;

    setTestStatus('testing');
    setTestMessage('');

    try {
      const result = await invoke<GitOperationResult>('git_test_remote_connection', {
        url: repoUrl.trim(),
      });

      if (result.success) {
        setTestStatus('success');
        setTestMessage('Connection successful');
      } else {
        setTestStatus('error');
        setTestMessage(result.message || 'Connection failed');
      }
    } catch (error) {
      setTestStatus('error');
      setTestMessage(String(error));
    }
  }, [repoUrl, isValidUrl]);

  const handleAdd = useCallback(async () => {
    if (!canAdd) return;

    setIsAdding(true);
    try {
      await onAdd(remoteName.trim(), repoUrl.trim());
      onClose();
    } catch (error) {
      console.error('Error adding remote:', error);
    } finally {
      setIsAdding(false);
    }
  }, [canAdd, remoteName, repoUrl, onAdd, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && canAdd) {
        e.preventDefault();
        handleAdd();
      }
    },
    [canAdd, handleAdd]
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalHeader
        icon={<Globe size={24} />}
        title={t('modals.addRemote.title')}
        description={t('modals.addRemote.description')}
      />
      <ModalBody>
        <div className="add-remote-form" onKeyDown={handleKeyDown}>
          <ModalRow label={t('modals.addRemote.name')}>
            <input
              type="text"
              className="add-remote-input"
              value={remoteName}
              onChange={(e) => setRemoteName(e.target.value)}
              placeholder={t('modals.addRemote.namePlaceholder')}
              autoFocus
              disabled={isAdding}
            />
          </ModalRow>
          {nameError && <div className="add-remote-error">{nameError}</div>}

          <ModalRow label={t('modals.addRemote.url')}>
            <input
              type="text"
              className="add-remote-input"
              value={repoUrl}
              onChange={(e) => {
                setRepoUrl(e.target.value);
                setTestStatus('idle');
                setTestMessage('');
              }}
              placeholder={t('modals.addRemote.urlPlaceholder')}
              disabled={isAdding}
            />
          </ModalRow>

          <div className="add-remote-test-section">
            <button
              className="add-remote-test-btn"
              onClick={handleTestConnection}
              disabled={!isValidUrl || testStatus === 'testing' || isAdding}
            >
              {testStatus === 'testing'
                ? t('modals.addRemote.testing')
                : t('modals.addRemote.testConnection')}
            </button>
            {testStatus === 'success' && (
              <div className="add-remote-test-result success">
                <Check size={14} />
                <span>{t('modals.addRemote.connectionSuccess')}</span>
              </div>
            )}
            {testStatus === 'error' && (
              <div className="add-remote-test-result error">
                <AlertCircle size={14} />
                <span>{testMessage}</span>
              </div>
            )}
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <button className="btn-cancel" onClick={onClose} disabled={isAdding}>
          {t('common.cancel')}
        </button>
        <button className="btn-primary" onClick={handleAdd} disabled={!canAdd}>
          {isAdding ? t('modals.addRemote.adding') : t('modals.addRemote.add')}
        </button>
      </ModalFooter>
    </Modal>
  );
};
