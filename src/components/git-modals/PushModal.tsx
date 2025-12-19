import { FC, useState, useEffect, useMemo } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { Select, Checkbox } from '../form';
import { BranchInfo } from '../../types/git';
import './GitModals.css';

// Fork icon for modal header
const ForkIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C11.45 2 11 2.45 11 3V8.59L7.91 5.5L6.5 6.91L11 11.41V14.17C9.84 14.58 9 15.69 9 17C9 18.66 10.34 20 12 20C13.66 20 15 18.66 15 17C15 15.69 14.16 14.58 13 14.17V11.41L17.5 6.91L16.09 5.5L13 8.59V3C13 2.45 12.55 2 12 2ZM12 16C12.55 16 13 16.45 13 17C13 17.55 12.55 18 12 18C11.45 18 11 17.55 11 17C11 16.45 11.45 16 12 16Z"/>
  </svg>
);

// Branch icon
const BranchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z"/>
  </svg>
);

interface PushModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPush: (options: PushOptions) => void;
  remotes: string[];
  branches: BranchInfo[];
  currentBranch: string | null;
  savedOptions?: PushOptions;
}

export interface PushOptions {
  branch: string;
  remote: string;
  remoteBranch: string;
  pushTags: boolean;
  forceWithLease: boolean;
}

export const PushModal: FC<PushModalProps> = ({
  isOpen,
  onClose,
  onPush,
  remotes,
  branches,
  currentBranch,
  savedOptions,
}) => {
  const [selectedBranch, setSelectedBranch] = useState(savedOptions?.branch || currentBranch || 'main');
  const [selectedRemote, setSelectedRemote] = useState(savedOptions?.remote || remotes[0] || 'origin');
  const [pushTags, setPushTags] = useState(savedOptions?.pushTags ?? false);
  const [forceWithLease, setForceWithLease] = useState(savedOptions?.forceWithLease ?? false);

  // Get local branches
  const localBranches = useMemo(() => {
    return branches
      .filter(b => !b.is_remote)
      .map(b => ({
        value: b.name,
        label: b.name,
        icon: <BranchIcon />,
      }));
  }, [branches]);

  // Build remote destination options
  const remoteDestinations = useMemo(() => {
    return remotes.map(remote => ({
      value: remote,
      label: `default (${remote}/${selectedBranch})`,
      icon: <BranchIcon />,
    }));
  }, [remotes, selectedBranch]);

  // Update state when savedOptions change
  useEffect(() => {
    if (savedOptions) {
      setSelectedBranch(savedOptions.branch || currentBranch || 'main');
      setSelectedRemote(savedOptions.remote || remotes[0] || 'origin');
      setPushTags(savedOptions.pushTags ?? false);
      setForceWithLease(savedOptions.forceWithLease ?? false);
    }
  }, [savedOptions, remotes, currentBranch]);

  // Reset to defaults when modal opens
  useEffect(() => {
    if (isOpen && !savedOptions) {
      setSelectedBranch(currentBranch || 'main');
      setSelectedRemote(remotes[0] || 'origin');
      setPushTags(false);
      setForceWithLease(false);
    }
  }, [isOpen, remotes, currentBranch, savedOptions]);

  const handlePush = () => {
    onPush({
      branch: selectedBranch,
      remote: selectedRemote,
      remoteBranch: selectedBranch, // Same as local branch by default
      pushTags,
      forceWithLease,
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalHeader
        icon={<ForkIcon />}
        title="Push"
        description="Push your local changes to remote repository"
      />
      <ModalBody>
        <ModalRow label="Branch">
          <Select
            value={selectedBranch}
            options={localBranches.length > 0 ? localBranches : [{ value: selectedBranch, label: selectedBranch, icon: <BranchIcon /> }]}
            onChange={setSelectedBranch}
          />
        </ModalRow>
        <ModalRow label="To">
          <Select
            value={selectedRemote}
            options={remoteDestinations}
            onChange={setSelectedRemote}
          />
        </ModalRow>
      </ModalBody>
      <div className="modal-checkboxes">
        <Checkbox
          checked={pushTags}
          onChange={setPushTags}
          label="Push all tags"
        />
        <Checkbox
          checked={forceWithLease}
          onChange={setForceWithLease}
          label="Force push"
        />
      </div>
      <ModalFooter>
        <button className="btn-cancel" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={handlePush}>Push</button>
      </ModalFooter>
    </Modal>
  );
};
