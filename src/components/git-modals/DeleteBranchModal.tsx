import type { FC } from 'react';
import { useState, useEffect, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, Server } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { Checkbox } from '../form';
import type { BranchInfo } from '../../types/git';
import './GitModals.css';

interface DeleteBranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDelete: (
    branchName: string,
    force: boolean,
    deleteRemote: boolean,
    remoteName: string | null
  ) => void;
  branch: BranchInfo | null;
}

export const DeleteBranchModal: FC<DeleteBranchModalProps> = memo(
  ({ isOpen, onClose, onDelete, branch }) => {
    const { t } = useTranslation();
    const [deleteRemote, setDeleteRemote] = useState(false);
    const [forceDelete, setForceDelete] = useState(false);

    // Get remote name from upstream (e.g., "origin/feature/xxx" -> "origin")
    const remoteName = useMemo(() => {
      if (!branch?.upstream) return null;
      const parts = branch.upstream.split('/');
      return parts[0] || null;
    }, [branch?.upstream]);

    // Get the remote branch display name (truncated if too long)
    const remoteBranchDisplay = useMemo(() => {
      if (!branch?.upstream) return '';
      const maxLength = 35;
      if (branch.upstream.length > maxLength) {
        return branch.upstream.substring(0, maxLength) + '...';
      }
      return branch.upstream;
    }, [branch?.upstream]);

    // Reset when modal opens
    useEffect(() => {
      if (isOpen) {
        setDeleteRemote(false);
        setForceDelete(false);
      }
    }, [isOpen]);

    const handleDelete = () => {
      if (branch) {
        onDelete(branch.name, forceDelete, deleteRemote, remoteName);
        onClose();
      }
    };

    return (
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalHeader
          icon={<GitBranch size={24} />}
          title={t('modals.deleteBranch.title')}
          description={t('modals.deleteBranch.description')}
        />
        <ModalBody>
          <ModalRow label={t('modals.deleteBranch.branch')}>
            <div className="track-branch-value">
              <GitBranch size={14} />
              <span className="branch-name-display">{branch?.name || ''}</span>
            </div>
          </ModalRow>
        </ModalBody>
        <div className="modal-checkboxes">
          {branch?.upstream && (
            <div className="checkbox-with-info">
              <Checkbox
                checked={deleteRemote}
                onChange={setDeleteRemote}
                label={t('modals.deleteBranch.alsoDeleteRemote')}
              />
              <span className="checkbox-info">
                <Server size={12} />
                {remoteBranchDisplay}
              </span>
            </div>
          )}
          <Checkbox
            checked={forceDelete}
            onChange={setForceDelete}
            label={t('modals.deleteBranch.forceDelete')}
          />
        </div>
        <ModalFooter>
          <button className="btn-cancel" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-danger" onClick={handleDelete}>
            {t('modals.deleteBranch.delete')}
          </button>
        </ModalFooter>
      </Modal>
    );
  }
);
