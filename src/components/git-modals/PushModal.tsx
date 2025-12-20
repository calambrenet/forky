import { FC, useState, useEffect, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, GitBranch } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { Select, Checkbox } from '../form';
import { BranchInfo } from '../../types/git';
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

export const PushModal: FC<PushModalProps> = memo(({
  isOpen,
  onClose,
  onPush,
  remotes,
  branches,
  currentBranch,
  savedOptions,
}) => {
  const { t } = useTranslation();
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
        icon: <GitBranch size={14} />,
      }));
  }, [branches]);

  // Build remote destination options
  const remoteDestinations = useMemo(() => {
    return remotes.map(remote => ({
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
        icon={<ArrowUp size={24} />}
        title={t('modals.push.title')}
        description={t('modals.push.description')}
      />
      <ModalBody>
        <ModalRow label={t('modals.push.branch')}>
          <Select
            value={selectedBranch}
            options={localBranches.length > 0 ? localBranches : [{ value: selectedBranch, label: selectedBranch, icon: <GitBranch size={14} /> }]}
            onChange={setSelectedBranch}
          />
        </ModalRow>
        <ModalRow label={t('modals.push.to')}>
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
          label={t('modals.push.pushAllTags')}
        />
        <Checkbox
          checked={forceWithLease}
          onChange={setForceWithLease}
          label={t('modals.push.forcePush')}
        />
      </div>
      <ModalFooter>
        <button className="btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn-primary" onClick={handlePush}>{t('toolbar.push')}</button>
      </ModalFooter>
    </Modal>
  );
});
