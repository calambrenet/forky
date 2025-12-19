import { FC, useState, useEffect } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { Select, Checkbox } from '../form';
import './GitModals.css';

// Fork icon for modal header
const ForkIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C11.45 2 11 2.45 11 3V8.59L7.91 5.5L6.5 6.91L11 11.41V14.17C9.84 14.58 9 15.69 9 17C9 18.66 10.34 20 12 20C13.66 20 15 18.66 15 17C15 15.69 14.16 14.58 13 14.17V11.41L17.5 6.91L16.09 5.5L13 8.59V3C13 2.45 12.55 2 12 2ZM12 16C12.55 16 13 16.45 13 17C13 17.55 12.55 18 12 18C11.45 18 11 17.55 11 17C11 16.45 11.45 16 12 16Z"/>
  </svg>
);

// Remote icon
const RemoteIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4.5 3A1.5 1.5 0 003 4.5v7A1.5 1.5 0 004.5 13h7a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0011.5 3h-7zM2 4.5A2.5 2.5 0 014.5 2h7A2.5 2.5 0 0114 4.5v7a2.5 2.5 0 01-2.5 2.5h-7A2.5 2.5 0 012 11.5v-7z"/>
    <path d="M8 5a.5.5 0 01.5.5v2h2a.5.5 0 010 1h-2v2a.5.5 0 01-1 0v-2h-2a.5.5 0 010-1h2v-2A.5.5 0 018 5z"/>
  </svg>
);

interface FetchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFetch: (options: FetchOptions) => void;
  remotes: string[];
  savedOptions?: FetchOptions;
}

export interface FetchOptions {
  remote: string;
  all: boolean;
}

export const FetchModal: FC<FetchModalProps> = ({
  isOpen,
  onClose,
  onFetch,
  remotes,
  savedOptions,
}) => {
  const [selectedRemote, setSelectedRemote] = useState(savedOptions?.remote || remotes[0] || 'origin');
  const [fetchAll, setFetchAll] = useState(savedOptions?.all ?? true);

  // Update state when savedOptions change
  useEffect(() => {
    if (savedOptions) {
      setSelectedRemote(savedOptions.remote || remotes[0] || 'origin');
      setFetchAll(savedOptions.all ?? true);
    }
  }, [savedOptions, remotes]);

  // Reset to defaults when modal opens
  useEffect(() => {
    if (isOpen && !savedOptions) {
      setSelectedRemote(remotes[0] || 'origin');
      setFetchAll(true);
    }
  }, [isOpen, remotes, savedOptions]);

  const handleFetch = () => {
    onFetch({
      remote: selectedRemote,
      all: fetchAll,
    });
    onClose();
  };

  const remoteOptions = remotes.map(remote => ({
    value: remote,
    label: remote,
    icon: <RemoteIcon />,
  }));

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalHeader
        icon={<ForkIcon />}
        title="Fetch"
        description="Fetch latest changes from remote repository"
      />
      <ModalBody>
        <ModalRow label="Remote">
          <Select
            value={selectedRemote}
            options={remoteOptions}
            onChange={setSelectedRemote}
            disabled={fetchAll}
          />
        </ModalRow>
      </ModalBody>
      <div className="modal-checkboxes">
        <Checkbox
          checked={fetchAll}
          onChange={setFetchAll}
          label="Fetch all remotes"
        />
      </div>
      <ModalFooter>
        <button className="btn-cancel" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={handleFetch}>Fetch</button>
      </ModalFooter>
    </Modal>
  );
};
