import type { FC } from 'react';
import { useState, useEffect, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, AlertTriangle } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import type { BranchInfo } from '../../types/git';
import './GitModals.css';

interface TrackRemoteBranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTrack: (localBranchName: string, remoteBranchName: string) => void;
  remoteBranch: string;
  localBranches: BranchInfo[];
}

// Extract local branch name from remote branch name (e.g., "origin/feature/foo" -> "feature/foo")
const getDefaultLocalBranchName = (remoteBranch: string): string => {
  const parts = remoteBranch.split('/');
  if (parts.length > 1) {
    // Remove the remote name (first part)
    return parts.slice(1).join('/');
  }
  return remoteBranch;
};

export const TrackRemoteBranchModal: FC<TrackRemoteBranchModalProps> = memo(
  ({ isOpen, onClose, onTrack, remoteBranch, localBranches }) => {
    const { t } = useTranslation();
    const defaultLocalName = getDefaultLocalBranchName(remoteBranch);
    const [localBranchName, setLocalBranchName] = useState(defaultLocalName);

    // Reset when modal opens with new remote branch
    useEffect(() => {
      if (isOpen) {
        setLocalBranchName(getDefaultLocalBranchName(remoteBranch));
      }
    }, [isOpen, remoteBranch]);

    // Check if local branch already exists
    const localBranchExists = useMemo(() => {
      return localBranches.some((b) => b.name === localBranchName);
    }, [localBranches, localBranchName]);

    const handleTrack = () => {
      if (!localBranchExists && localBranchName.trim()) {
        onTrack(localBranchName.trim(), remoteBranch);
        onClose();
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !localBranchExists && localBranchName.trim()) {
        handleTrack();
      }
    };

    const isTrackDisabled = localBranchExists || !localBranchName.trim();

    return (
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalHeader
          icon={<GitBranch size={24} />}
          title={t('modals.trackBranch.title')}
          description={t('modals.trackBranch.description')}
        />
        <ModalBody>
          <ModalRow label={t('modals.trackBranch.remoteBranch')}>
            <div className="track-branch-value">
              <GitBranch size={14} />
              <span className="branch-name-display">{remoteBranch}</span>
            </div>
          </ModalRow>
          <ModalRow label={t('modals.trackBranch.localBranch')}>
            <div className="track-branch-input-container">
              <GitBranch size={14} className="input-icon" />
              <input
                type="text"
                className="track-branch-input"
                value={localBranchName}
                onChange={(e) => setLocalBranchName(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
            </div>
          </ModalRow>
        </ModalBody>
        {localBranchExists && (
          <div className="modal-warning">
            <AlertTriangle size={16} />
            <span>{t('modals.trackBranch.branchExists', { branch: localBranchName })}</span>
          </div>
        )}
        <ModalFooter>
          <button className="btn-cancel" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" onClick={handleTrack} disabled={isTrackDisabled}>
            {t('modals.trackBranch.track')}
          </button>
        </ModalFooter>
      </Modal>
    );
  }
);
