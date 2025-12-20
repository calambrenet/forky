import { FC, useState, useEffect, memo } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../modal';
import { CredentialRequest } from '../../types/git';
import './GitModals.css';

// Key/lock icon for credentials
const CredentialIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
  </svg>
);

// Re-export for backwards compatibility
export type { CredentialRequest };

interface GitCredentialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  request: CredentialRequest | null;
  isLoading?: boolean;
}

export const GitCredentialModal: FC<GitCredentialModalProps> = memo(({
  isOpen,
  onClose,
  onSubmit,
  onCancel,
  request,
  isLoading = false,
}) => {
  const [value, setValue] = useState('');

  // Reset value when request changes
  useEffect(() => {
    if (isOpen) {
      setValue('');
    }
  }, [isOpen, request]);

  if (!request) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSubmit(value);
    }
  };

  const handleCancel = () => {
    onCancel();
    onClose();
  };

  const getTitle = () => {
    switch (request.credential_type) {
      case 'username':
        return 'Username Required';
      case 'password':
        return 'Password Required';
      case 'passphrase':
        return 'SSH Passphrase Required';
      default:
        return 'Authentication Required';
    }
  };

  const getDescription = () => {
    if (request.host) {
      return `Authentication required for ${request.host}`;
    }
    return request.prompt || 'Please enter your credentials';
  };

  const getInputType = () => {
    return request.credential_type === 'username' ? 'text' : 'password';
  };

  const getPlaceholder = () => {
    switch (request.credential_type) {
      case 'username':
        return 'Enter username';
      case 'password':
        return 'Enter password or access token';
      case 'passphrase':
        return 'Enter SSH key passphrase';
      default:
        return 'Enter value';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalHeader
        icon={<CredentialIcon />}
        title={getTitle()}
        description={getDescription()}
      />
      <ModalBody>
        <form onSubmit={handleSubmit} className="credential-form">
          <div className="credential-input-wrapper">
            <input
              type={getInputType()}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={getPlaceholder()}
              autoFocus
              disabled={isLoading}
              className="credential-input"
            />
          </div>
          {request.credential_type === 'password' && (
            <p className="credential-hint">
              For GitHub/GitLab, use a Personal Access Token instead of your password.
            </p>
          )}
        </form>
      </ModalBody>
      <ModalFooter>
        <button className="btn-cancel" onClick={handleCancel} disabled={isLoading}>
          Cancel
        </button>
        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={isLoading || !value.trim()}
        >
          {isLoading ? 'Authenticating...' : 'Submit'}
        </button>
      </ModalFooter>
    </Modal>
  );
});
