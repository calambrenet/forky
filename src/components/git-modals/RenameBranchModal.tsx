import { FC, useState, useEffect, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, AlertTriangle } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { Checkbox } from '../form';
import { BranchInfo } from '../../types/git';
import './GitModals.css';

interface RenameBranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRename: (oldName: string, newName: string, renameRemote: boolean, remoteName: string | null) => void;
  branch: BranchInfo | null;
  localBranches: BranchInfo[];
}

export const RenameBranchModal: FC<RenameBranchModalProps> = memo(({
  isOpen,
  onClose,
  onRename,
  branch,
  localBranches,
}) => {
  const { t } = useTranslation();
  const [newName, setNewName] = useState('');
  const [renameRemote, setRenameRemote] = useState(false);

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

  // Reset when modal opens
  useEffect(() => {
    if (isOpen && branch) {
      setNewName(branch.name);
      setRenameRemote(false);
    }
  }, [isOpen, branch]);

  // Check if new name already exists (and is different from current)
  const branchExists = useMemo(() => {
    if (!newName.trim() || !branch) return false;
    if (newName.trim() === branch.name) return false;
    return localBranches.some(b => b.name === newName.trim());
  }, [localBranches, newName, branch]);

  // Validate branch name (basic git branch name validation)
  const isValidBranchName = useMemo(() => {
    const name = newName.trim();
    if (!name) return false;
    if (name.startsWith('.') || name.startsWith('-')) return false;
    if (name.endsWith('.') || name.endsWith('.lock')) return false;
    if (name.includes('..') || name.includes('~') || name.includes('^') || name.includes(':')) return false;
    if (name.includes('\\') || name.includes(' ') || name.includes('?') || name.includes('*') || name.includes('[')) return false;
    if (name.includes('@{')) return false;
    return true;
  }, [newName]);

  // Check if the name has actually changed
  const hasChanged = useMemo(() => {
    return newName.trim() !== branch?.name;
  }, [newName, branch?.name]);

  const handleRename = () => {
    if (!branchExists && isValidBranchName && hasChanged && branch) {
      onRename(branch.name, newName.trim(), renameRemote, remoteName);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !branchExists && isValidBranchName && hasChanged) {
      handleRename();
    }
  };

  const isRenameDisabled = branchExists || !isValidBranchName || !hasChanged || !newName.trim();

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalHeader
        icon={<GitBranch size={24} />}
        title={t('modals.renameBranch.title')}
        description={t('modals.renameBranch.description')}
      />
      <ModalBody>
        <ModalRow label={t('modals.renameBranch.newName')}>
          <div className="track-branch-input-container">
            <GitBranch size={14} className="input-icon" />
            <input
              type="text"
              className="track-branch-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('modals.renameBranch.newNamePlaceholder')}
              autoFocus
            />
          </div>
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
      {branchExists && (
        <div className="modal-warning">
          <AlertTriangle size={16} />
          <span>{t('modals.renameBranch.branchExists', { branch: newName })}</span>
        </div>
      )}
      <ModalFooter>
        <button className="btn-cancel" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button
          className="btn-primary"
          onClick={handleRename}
          disabled={isRenameDisabled}
        >
          {t('modals.renameBranch.rename')}
        </button>
      </ModalFooter>
    </Modal>
  );
});
