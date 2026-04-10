import type { FC } from 'react';
import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { BranchNameInput } from '../form';
import type { BranchInfo } from '../../types/git';
import type { ValidationResult } from '../../utils/branchNameValidation';
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
    const [isValid, setIsValid] = useState(false);

    // Get existing branch names for validation
    const existingBranchNames = useMemo(() => {
      return localBranches.map((b) => b.name);
    }, [localBranches]);

    // Reset when modal opens with new remote branch
    useEffect(() => {
      if (isOpen) {
        setLocalBranchName(getDefaultLocalBranchName(remoteBranch));
        setIsValid(false);
      }
    }, [isOpen, remoteBranch]);

    const handleValidationChange = useCallback((result: ValidationResult) => {
      setIsValid(result.isValid);
    }, []);

    const handleTrack = useCallback(() => {
      if (isValid && localBranchName) {
        onTrack(localBranchName, remoteBranch);
        onClose();
      }
    }, [isValid, localBranchName, remoteBranch, onTrack, onClose]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && isValid) {
          handleTrack();
        }
      },
      [isValid, handleTrack]
    );

    const isTrackDisabled = !isValid || !localBranchName;

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
            <BranchNameInput
              value={localBranchName}
              onChange={setLocalBranchName}
              onKeyDown={handleKeyDown}
              onValidationChange={handleValidationChange}
              existingNames={existingBranchNames}
              autoFocus
            />
          </ModalRow>
        </ModalBody>
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
