import { FC, useState, useEffect, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
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

// Remote icon
const RemoteIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4.5 3A1.5 1.5 0 003 4.5v7A1.5 1.5 0 004.5 13h7a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0011.5 3h-7zM2 4.5A2.5 2.5 0 014.5 2h7A2.5 2.5 0 0114 4.5v7a2.5 2.5 0 01-2.5 2.5h-7A2.5 2.5 0 012 11.5v-7z"/>
    <path d="M8 5a.5.5 0 01.5.5v2h2a.5.5 0 010 1h-2v2a.5.5 0 01-1 0v-2h-2a.5.5 0 010-1h2v-2A.5.5 0 018 5z"/>
  </svg>
);

// Branch icon
const BranchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z"/>
  </svg>
);

interface PullModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPull: (options: PullOptions) => void;
  remotes: string[];
  branches: BranchInfo[];
  currentBranch: string | null;
  savedOptions?: PullOptions;
}

export interface PullOptions {
  remote: string;
  branch: string;
  rebase: boolean;
  autostash: boolean;
}

export const PullModal: FC<PullModalProps> = memo(({
  isOpen,
  onClose,
  onPull,
  remotes,
  branches,
  currentBranch,
  savedOptions,
}) => {
  const { t } = useTranslation();
  const [selectedRemote, setSelectedRemote] = useState(savedOptions?.remote || remotes[0] || 'origin');
  const [selectedBranch, setSelectedBranch] = useState(savedOptions?.branch || currentBranch || 'main');
  const [rebase, setRebase] = useState(savedOptions?.rebase ?? false);
  const [autostash, setAutostash] = useState(savedOptions?.autostash ?? false);

  // Get remote branches for selected remote
  const remoteBranches = useMemo(() => {
    return branches
      .filter(b => b.is_remote && b.name.startsWith(`${selectedRemote}/`))
      .map(b => ({
        value: b.name.replace(`${selectedRemote}/`, ''),
        label: b.name.replace(`${selectedRemote}/`, ''),
        icon: <BranchIcon />,
      }));
  }, [branches, selectedRemote]);

  // Update state when savedOptions change
  useEffect(() => {
    if (savedOptions) {
      setSelectedRemote(savedOptions.remote || remotes[0] || 'origin');
      setSelectedBranch(savedOptions.branch || currentBranch || 'main');
      setRebase(savedOptions.rebase ?? false);
      setAutostash(savedOptions.autostash ?? false);
    }
  }, [savedOptions, remotes, currentBranch]);

  // Reset branch when remote changes
  useEffect(() => {
    if (remoteBranches.length > 0) {
      const matchingBranch = remoteBranches.find(b => b.value === currentBranch);
      if (matchingBranch) {
        setSelectedBranch(matchingBranch.value);
      } else {
        setSelectedBranch(remoteBranches[0]?.value || 'main');
      }
    }
  }, [selectedRemote, remoteBranches, currentBranch]);

  // Reset to defaults when modal opens
  useEffect(() => {
    if (isOpen && !savedOptions) {
      setSelectedRemote(remotes[0] || 'origin');
      setSelectedBranch(currentBranch || 'main');
      setRebase(false);
      setAutostash(false);
    }
  }, [isOpen, remotes, currentBranch, savedOptions]);

  const handlePull = () => {
    onPull({
      remote: selectedRemote,
      branch: selectedBranch,
      rebase,
      autostash,
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
        title={t('modals.pull.title')}
        description={t('modals.pull.description')}
      />
      <ModalBody>
        <ModalRow label={t('modals.pull.remote')}>
          <Select
            value={selectedRemote}
            options={remoteOptions}
            onChange={setSelectedRemote}
          />
        </ModalRow>
        <ModalRow label={t('modals.pull.branch')}>
          <Select
            value={selectedBranch}
            options={remoteBranches.length > 0 ? remoteBranches : [{ value: selectedBranch, label: selectedBranch, icon: <BranchIcon /> }]}
            onChange={setSelectedBranch}
          />
        </ModalRow>
        <ModalRow label={t('modals.pull.into')}>
          <div className="modal-row-info">
            <BranchIcon />
            <span>{currentBranch || t('modals.pull.noBranch')}</span>
          </div>
        </ModalRow>
      </ModalBody>
      <div className="modal-checkboxes">
        <Checkbox
          checked={rebase}
          onChange={setRebase}
          label={t('modals.pull.rebaseInsteadOfMerge')}
        />
        <Checkbox
          checked={autostash}
          onChange={setAutostash}
          label={t('modals.pull.stashAndReapply')}
        />
      </div>
      <ModalFooter>
        <button className="btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn-primary" onClick={handlePull}>{t('toolbar.pull')}</button>
      </ModalFooter>
    </Modal>
  );
});
