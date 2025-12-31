import type { FC } from 'react';
import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, GitBranch } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { Select, Checkbox } from '../form';
import { ModalLoadingIndicator } from './ModalLoadingIndicator';
import type { BranchInfo } from '../../types/git';
import './GitModals.css';

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

export const PushModal: FC<PushModalProps> = memo(
  ({ isOpen, onClose, onPush, remotes, branches, currentBranch, savedOptions }) => {
    const { t } = useTranslation();
    const [selectedBranch, setSelectedBranch] = useState(
      savedOptions?.branch || currentBranch || 'main'
    );
    const [selectedRemote, setSelectedRemote] = useState(
      savedOptions?.remote || remotes[0] || 'origin'
    );
    const [pushTags, setPushTags] = useState(savedOptions?.pushTags ?? false);
    const [forceWithLease, setForceWithLease] = useState(savedOptions?.forceWithLease ?? false);
    const [isLoading, setIsLoading] = useState(false);

    // Get local branches
    const localBranches = useMemo(() => {
      return branches
        .filter((b) => !b.is_remote)
        .map((b) => ({
          value: b.name,
          label: b.name,
          icon: <GitBranch size={14} />,
        }));
    }, [branches]);

    // Build remote destination options
    const remoteDestinations = useMemo(() => {
      return remotes.map((remote) => ({
        value: remote,
        label: `default (${remote}/${selectedBranch})`,
        icon: <GitBranch size={14} />,
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
      if (isOpen) {
        setIsLoading(false);
        if (!savedOptions) {
          setSelectedBranch(currentBranch || 'main');
          setSelectedRemote(remotes[0] || 'origin');
          setPushTags(false);
          setForceWithLease(false);
        }
      }
    }, [isOpen, remotes, currentBranch, savedOptions]);

    const handlePush = useCallback(() => {
      if (isLoading) return;

      // Set loading state immediately
      setIsLoading(true);

      // Use requestAnimationFrame to allow React to render the loading state
      // before the blocking git operation starts
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onPush({
            branch: selectedBranch,
            remote: selectedRemote,
            remoteBranch: selectedBranch, // Same as local branch by default
            pushTags,
            forceWithLease,
          });
        });
      });
    }, [isLoading, onPush, selectedBranch, selectedRemote, pushTags, forceWithLease]);

    return (
      <Modal isOpen={isOpen} onClose={isLoading ? undefined : onClose}>
        <ModalHeader
          icon={<ArrowUp size={24} />}
          title={t('modals.push.title')}
          description={t('modals.push.description')}
        />
        <ModalBody className={isLoading ? 'modal-body-loading' : undefined}>
          <div className={isLoading ? 'modal-content-loading' : undefined}>
            <ModalRow label={t('modals.push.branch')}>
              <Select
                value={selectedBranch}
                options={
                  localBranches.length > 0
                    ? localBranches
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
            <ModalRow label={t('modals.push.to')}>
              <Select
                value={selectedRemote}
                options={remoteDestinations}
                onChange={setSelectedRemote}
                disabled={isLoading}
              />
            </ModalRow>
          </div>
        </ModalBody>
        <div className={`modal-checkboxes ${isLoading ? 'modal-content-loading' : ''}`}>
          <Checkbox
            checked={pushTags}
            onChange={setPushTags}
            label={t('modals.push.pushAllTags')}
            disabled={isLoading}
          />
          <Checkbox
            checked={forceWithLease}
            onChange={setForceWithLease}
            label={t('modals.push.forcePush')}
            disabled={isLoading}
          />
        </div>
        <ModalFooter className={isLoading ? 'modal-footer-loading' : undefined}>
          <ModalLoadingIndicator isLoading={isLoading} loadingText={t('modals.push.loading')} />
          <button className="btn-cancel" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" onClick={handlePush} disabled={isLoading}>
            {t('toolbar.push')}
          </button>
        </ModalFooter>
      </Modal>
    );
  }
);
