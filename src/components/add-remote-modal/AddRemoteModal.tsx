import { FC, useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal/Modal';
import { GitOperationResult } from '../../types/git';
import './AddRemoteModal.css';

interface AddRemoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string, url: string) => Promise<void>;
  existingRemotes: string[];
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

const ForkIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
    <path d="M12 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 10c-1.1 0-2-.9-2-2v-2c0-1.1.9-2 2-2s2 .9 2 2v2c0 1.1-.9 2-2 2z"/>
  </svg>
);

const LinkIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4.715 6.542L3.343 7.914a3 3 0 104.243 4.243l1.828-1.829A3 3 0 008.586 5.5L8 6.086a1.001 1.001 0 00-.154.199 2 2 0 01.861 3.337L6.88 11.45a2 2 0 11-2.83-2.83l.793-.792a4.018 4.018 0 01-.128-1.287z"/>
    <path d="M6.586 4.672A3 3 0 007.414 9.5l.775-.776a2 2 0 01-.896-3.346L9.12 3.55a2 2 0 012.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 10-4.243-4.243L6.586 4.672z"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
  </svg>
);

const ErrorIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 15A7 7 0 118 1a7 7 0 010 14zm0-1A6 6 0 108 2a6 6 0 000 12zM8 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zm0 8a1 1 0 110-2 1 1 0 010 2z"/>
  </svg>
);

export const AddRemoteModal: FC<AddRemoteModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  existingRemotes,
}) => {
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
  const isValidName = remoteName.trim().length > 0 &&
    /^[a-zA-Z0-9_-]+$/.test(remoteName) &&
    !existingRemotes.includes(remoteName.trim());

  const isValidUrl = repoUrl.trim().length > 0;

  const nameError = remoteName.trim().length > 0 && !isValidName
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

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canAdd) {
      e.preventDefault();
      handleAdd();
    }
  }, [canAdd, handleAdd]);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalHeader
        icon={<ForkIcon />}
        title="Remote"
        description="Add new remote repository reference"
      />
      <ModalBody>
        <div className="add-remote-form" onKeyDown={handleKeyDown}>
          <ModalRow label="Remote">
            <input
              type="text"
              className="add-remote-input"
              value={remoteName}
              onChange={(e) => setRemoteName(e.target.value)}
              placeholder="origin"
              autoFocus
              disabled={isAdding}
            />
          </ModalRow>
          {nameError && <div className="add-remote-error">{nameError}</div>}

          <ModalRow label="Repository URL">
            <input
              type="text"
              className="add-remote-input"
              value={repoUrl}
              onChange={(e) => {
                setRepoUrl(e.target.value);
                setTestStatus('idle');
                setTestMessage('');
              }}
              placeholder="git@github.com:user/repo.git"
              disabled={isAdding}
            />
          </ModalRow>
          <div className="add-remote-url-hint">
            <LinkIcon />
            <span>Git Repository URL</span>
          </div>

          <div className="add-remote-test-section">
            <button
              className="add-remote-test-btn"
              onClick={handleTestConnection}
              disabled={!isValidUrl || testStatus === 'testing' || isAdding}
            >
              {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
            </button>
            {testStatus === 'success' && (
              <div className="add-remote-test-result success">
                <CheckIcon />
                <span>{testMessage}</span>
              </div>
            )}
            {testStatus === 'error' && (
              <div className="add-remote-test-result error">
                <ErrorIcon />
                <span>{testMessage}</span>
              </div>
            )}
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <button className="btn-cancel" onClick={onClose} disabled={isAdding}>
          Cancel
        </button>
        <button
          className="btn-primary"
          onClick={handleAdd}
          disabled={!canAdd}
        >
          {isAdding ? 'Adding...' : 'Add New Remote'}
        </button>
      </ModalFooter>
    </Modal>
  );
};
