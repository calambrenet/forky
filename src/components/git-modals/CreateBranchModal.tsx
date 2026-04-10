import type { FC } from 'react';
import { useState, useEffect, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { Checkbox, BranchNameInput } from '../form';
import type { BranchInfo } from '../../types/git';
import type { ValidationResult } from '../../utils/branchNameValidation';
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
    const [isValid, setIsValid] = useState(false);

    // Get existing branch names for validation
    const existingBranchNames = localBranches.map((b) => b.name);

    // Reset when modal opens
    useEffect(() => {
      if (isOpen) {
        setBranchName('');
        setCheckoutAfterCreate(true);
        setIsValid(false);
      }
    }, [isOpen]);

    const handleValidationChange = useCallback((result: ValidationResult) => {
      setIsValid(result.isValid);
    }, []);

    const handleCreate = useCallback(() => {
      if (isValid && sourceBranch && branchName) {
        onCreate(branchName, sourceBranch.name, checkoutAfterCreate);
        onClose();
      }
    }, [isValid, sourceBranch, branchName, checkoutAfterCreate, onCreate, onClose]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && isValid) {
          handleCreate();
        }
      },
      [isValid, handleCreate]
    );

    const isCreateDisabled = !isValid || !branchName;
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
            <BranchNameInput
              value={branchName}
              onChange={setBranchName}
              onKeyDown={handleKeyDown}
              onValidationChange={handleValidationChange}
              existingNames={existingBranchNames}
              placeholder={t('modals.createBranch.branchNamePlaceholder')}
              autoFocus
            />
          </ModalRow>
        </ModalBody>
        <div className="modal-checkboxes">
          <Checkbox
            checked={checkoutAfterCreate}
            onChange={setCheckoutAfterCreate}
            label={t('modals.createBranch.checkoutAfterCreate')}
          />
        </div>
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
