import type { FC } from 'react';
import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, Globe, GitBranch } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { Select, Checkbox } from '../form';
import { ModalLoadingIndicator } from './ModalLoadingIndicator';
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
    const [isLoading, setIsLoading] = useState(false);

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
      if (isOpen) {
        setIsLoading(false);
        if (!savedOptions) {
          setSelectedRemote(remotes[0] || 'origin');
          setSelectedBranch(currentBranch || 'main');
          setRebase(false);
          setAutostash(false);
        }
      }
    }, [isOpen, remotes, currentBranch, savedOptions]);

    const handlePull = useCallback(() => {
      if (isLoading) return;

      // Set loading state immediately
      setIsLoading(true);

      // Use requestAnimationFrame to allow React to render the loading state
      // before the blocking git operation starts
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onPull({
            remote: selectedRemote,
            branch: selectedBranch,
            rebase,
            autostash,
          });
        });
      });
    }, [isLoading, onPull, selectedRemote, selectedBranch, rebase, autostash]);

    const remoteOptions = remotes.map((remote) => ({
      value: remote,
      label: remote,
      icon: <Globe size={14} />,
    }));

    return (
      <Modal isOpen={isOpen} onClose={isLoading ? undefined : onClose}>
        <ModalHeader
          icon={<ArrowDown size={24} />}
          title={t('modals.pull.title')}
          description={t('modals.pull.description')}
        />
        <ModalBody className={isLoading ? 'modal-body-loading' : undefined}>
          <div className={isLoading ? 'modal-content-loading' : undefined}>
            <ModalRow label={t('modals.pull.remote')}>
              <Select
                value={selectedRemote}
                options={remoteOptions}
                onChange={setSelectedRemote}
                disabled={isLoading}
              />
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
                disabled={isLoading}
              />
            </ModalRow>
            <ModalRow label={t('modals.pull.into')}>
              <div className="modal-row-info">
                <GitBranch size={14} />
                <span>{currentBranch || t('modals.pull.noBranch')}</span>
              </div>
            </ModalRow>
          </div>
        </ModalBody>
        <div className={`modal-checkboxes ${isLoading ? 'modal-content-loading' : ''}`}>
          <Checkbox
            checked={rebase}
            onChange={setRebase}
            label={t('modals.pull.rebaseInsteadOfMerge')}
            disabled={isLoading}
          />
          <Checkbox
            checked={autostash}
            onChange={setAutostash}
            label={t('modals.pull.stashAndReapply')}
            disabled={isLoading}
          />
        </div>
        <ModalFooter className={isLoading ? 'modal-footer-loading' : undefined}>
          <ModalLoadingIndicator isLoading={isLoading} loadingText={t('modals.pull.loading')} />
          <button className="btn-cancel" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" onClick={handlePull} disabled={isLoading}>
            {t('toolbar.pull')}
          </button>
        </ModalFooter>
      </Modal>
    );
  }
);
