import type { FC } from 'react';
import { useState, useEffect, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, AlertTriangle } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { Checkbox } from '../form';
import type { BranchInfo } from '../../types/git';
import './GitModals.css';

interface CreateBranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (branchName: string, startPoint: string, checkout: boolean) => void;
  sourceBranch: BranchInfo | null;
  localBranches: BranchInfo[];
}

export const CreateBranchModal: FC<CreateBranchModalProps> = memo(
  ({ isOpen, onClose, onCreate, sourceBranch, localBranches }) => {
    const { t } = useTranslation();
    const [branchName, setBranchName] = useState('');
    const [checkoutAfterCreate, setCheckoutAfterCreate] = useState(true);

    // Reset when modal opens
    useEffect(() => {
      if (isOpen) {
        setBranchName('');
        setCheckoutAfterCreate(true);
      }
    }, [isOpen]);

    // Check if branch name already exists
    const branchExists = useMemo(() => {
      if (!branchName.trim()) return false;
      return localBranches.some((b) => b.name === branchName.trim());
    }, [localBranches, branchName]);

    // Validate branch name (basic git branch name validation)
    const isValidBranchName = useMemo(() => {
      const name = branchName.trim();
      if (!name) return false;
      // Git branch name rules: no spaces, no "..", no starting with ".", no ending with ".lock", etc.
      if (name.startsWith('.') || name.startsWith('-')) return false;
      if (name.endsWith('.') || name.endsWith('.lock')) return false;
      if (name.includes('..') || name.includes('~') || name.includes('^') || name.includes(':'))
        return false;
      if (
        name.includes('\\') ||
        name.includes(' ') ||
        name.includes('?') ||
        name.includes('*') ||
        name.includes('[')
      )
        return false;
      if (name.includes('@{')) return false;
      return true;
    }, [branchName]);

    const handleCreate = () => {
      if (!branchExists && isValidBranchName && sourceBranch) {
        onCreate(branchName.trim(), sourceBranch.name, checkoutAfterCreate);
        onClose();
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !branchExists && isValidBranchName) {
        handleCreate();
      }
    };

    const isCreateDisabled = branchExists || !isValidBranchName || !branchName.trim();

    const sourceBranchDisplayName = sourceBranch?.name || '';

    return (
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalHeader
          icon={<GitBranch size={24} />}
          title={t('modals.createBranch.title')}
          description={t('modals.createBranch.description')}
        />
        <ModalBody>
          <ModalRow label={t('modals.createBranch.createAt')}>
            <div className="track-branch-value">
              <GitBranch size={14} />
              <span className="branch-name-display">{sourceBranchDisplayName}</span>
            </div>
          </ModalRow>
          <ModalRow label={t('modals.createBranch.branchName')}>
            <div className="track-branch-input-container">
              <GitBranch size={14} className="input-icon" />
              <input
                type="text"
                className="track-branch-input"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('modals.createBranch.branchNamePlaceholder')}
                autoFocus
              />
            </div>
          </ModalRow>
        </ModalBody>
        <div className="modal-checkboxes">
          <Checkbox
            checked={checkoutAfterCreate}
            onChange={setCheckoutAfterCreate}
            label={t('modals.createBranch.checkoutAfterCreate')}
          />
        </div>
        {branchExists && (
          <div className="modal-warning">
            <AlertTriangle size={16} />
            <span>{t('modals.createBranch.branchExists', { branch: branchName })}</span>
          </div>
        )}
        <ModalFooter>
          <button className="btn-cancel" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" onClick={handleCreate} disabled={isCreateDisabled}>
            {checkoutAfterCreate
              ? t('modals.createBranch.createAndCheckout')
              : t('modals.createBranch.create')}
          </button>
        </ModalFooter>
      </Modal>
    );
  }
);
