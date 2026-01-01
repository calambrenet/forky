import type { FC } from 'react';
import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { Checkbox, BranchNameInput } from '../form';
import type { BranchInfo } from '../../types/git';
import type { ValidationResult } from '../../utils/branchNameValidation';
import './GitModals.css';

interface RenameBranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRename: (
    oldName: string,
    newName: string,
    renameRemote: boolean,
    remoteName: string | null
  ) => void;
  branch: BranchInfo | null;
  localBranches: BranchInfo[];
}

export const RenameBranchModal: FC<RenameBranchModalProps> = memo(
  ({ isOpen, onClose, onRename, branch, localBranches }) => {
    const { t } = useTranslation();
    const [newName, setNewName] = useState('');
    const [renameRemote, setRenameRemote] = useState(false);
    const [isValid, setIsValid] = useState(false);

    // Get remote name from upstream (e.g., "origin/feature/xxx" -> "origin")
    const remoteName = useMemo(() => {
      if (!branch?.upstream) return null;
      const parts = branch.upstream.split('/');
      return parts[0] || null;
    }, [branch?.upstream]);

    // Get the remote branch display name (truncated if too long)
    const remoteBranchDisplay = useMemo(() => {
      if (!branch?.upstream) return '';
      const maxLength = 40;
      if (branch.upstream.length > maxLength) {
        return branch.upstream.substring(0, maxLength) + '...';
      }
      return branch.upstream;
    }, [branch?.upstream]);

    // Get existing branch names, excluding current branch for validation
    const existingBranchNames = useMemo(() => {
      return localBranches.filter((b) => b.name !== branch?.name).map((b) => b.name);
    }, [localBranches, branch?.name]);

    // Reset when modal opens
    useEffect(() => {
      if (isOpen && branch) {
        setNewName(branch.name);
        setRenameRemote(false);
        setIsValid(false);
      }
    }, [isOpen, branch]);

    // Check if the name has actually changed
    const hasChanged = useMemo(() => {
      return newName !== branch?.name;
    }, [newName, branch?.name]);

    const handleValidationChange = useCallback((result: ValidationResult) => {
      setIsValid(result.isValid);
    }, []);

    const handleRename = useCallback(() => {
      if (isValid && hasChanged && branch) {
        onRename(branch.name, newName, renameRemote, remoteName);
        onClose();
      }
    }, [isValid, hasChanged, branch, newName, renameRemote, remoteName, onRename, onClose]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && isValid && hasChanged) {
          handleRename();
        }
      },
      [isValid, hasChanged, handleRename]
    );

    const isRenameDisabled = !isValid || !hasChanged || !newName;

    return (
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalHeader
          icon={<GitBranch size={24} />}
          title={t('modals.renameBranch.title')}
          description={t('modals.renameBranch.description')}
        />
        <ModalBody>
          <ModalRow label={t('modals.renameBranch.newName')}>
            <BranchNameInput
              value={newName}
              onChange={setNewName}
              onKeyDown={handleKeyDown}
              onValidationChange={handleValidationChange}
              existingNames={existingBranchNames}
              placeholder={t('modals.renameBranch.newNamePlaceholder')}
              autoFocus
            />
          </ModalRow>
        </ModalBody>
        {branch?.upstream && (
          <div className="modal-checkboxes">
            <Checkbox
              checked={renameRemote}
              onChange={setRenameRemote}
              label={t('modals.renameBranch.alsoRenameRemote', { remote: remoteBranchDisplay })}
            />
          </div>
        )}
        <ModalFooter>
          <button className="btn-cancel" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" onClick={handleRename} disabled={isRenameDisabled}>
            {t('modals.renameBranch.rename')}
          </button>
        </ModalFooter>
      </Modal>
    );
  }
);
