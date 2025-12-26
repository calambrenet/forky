import type { FC } from 'react';
import { useState, useEffect, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, Globe, GitBranch } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { Select, Checkbox } from '../form';
import type { BranchInfo } from '../../types/git';
import './GitModals.css';

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

export const PullModal: FC<PullModalProps> = memo(
  ({ isOpen, onClose, onPull, remotes, branches, currentBranch, savedOptions }) => {
    const { t } = useTranslation();
    const [selectedRemote, setSelectedRemote] = useState(
      savedOptions?.remote || remotes[0] || 'origin'
    );
    const [selectedBranch, setSelectedBranch] = useState(
      savedOptions?.branch || currentBranch || 'main'
    );
    const [rebase, setRebase] = useState(savedOptions?.rebase ?? false);
    const [autostash, setAutostash] = useState(savedOptions?.autostash ?? false);

    // Get remote branches for selected remote
    const remoteBranches = useMemo(() => {
      return branches
        .filter((b) => b.is_remote && b.name.startsWith(`${selectedRemote}/`))
        .map((b) => ({
          value: b.name.replace(`${selectedRemote}/`, ''),
          label: b.name.replace(`${selectedRemote}/`, ''),
          icon: <GitBranch size={14} />,
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
        const matchingBranch = remoteBranches.find((b) => b.value === currentBranch);
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

    const remoteOptions = remotes.map((remote) => ({
      value: remote,
      label: remote,
      icon: <Globe size={14} />,
    }));

    return (
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalHeader
          icon={<ArrowDown size={24} />}
          title={t('modals.pull.title')}
          description={t('modals.pull.description')}
        />
        <ModalBody>
          <ModalRow label={t('modals.pull.remote')}>
            <Select value={selectedRemote} options={remoteOptions} onChange={setSelectedRemote} />
          </ModalRow>
          <ModalRow label={t('modals.pull.branch')}>
            <Select
              value={selectedBranch}
              options={
                remoteBranches.length > 0
                  ? remoteBranches
                  : [
                      {
                        value: selectedBranch,
                        label: selectedBranch,
                        icon: <GitBranch size={14} />,
                      },
                    ]
              }
              onChange={setSelectedBranch}
            />
          </ModalRow>
          <ModalRow label={t('modals.pull.into')}>
            <div className="modal-row-info">
              <GitBranch size={14} />
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
          <button className="btn-cancel" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" onClick={handlePull}>
            {t('toolbar.pull')}
          </button>
        </ModalFooter>
      </Modal>
    );
  }
);
