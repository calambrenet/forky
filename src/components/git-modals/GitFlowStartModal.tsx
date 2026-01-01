import type { FC } from 'react';
import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, Play, Flag, AlertTriangle, ChevronDown } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { ModalLoadingIndicator } from './ModalLoadingIndicator';
import { BranchNameInput } from '../form';
import type { GitFlowType, BranchInfo } from '../../types/git';
import type { ValidationResult } from '../../utils/branchNameValidation';
import './GitModals.css';

interface GitFlowStartModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (name: string, baseBranch: string) => void;
  flowType: GitFlowType;
  defaultBaseBranch: string;
  branches: BranchInfo[];
  prefix: string;
}

export const GitFlowStartModal: FC<GitFlowStartModalProps> = memo(
  ({ isOpen, onClose, onStart, flowType, defaultBaseBranch, branches, prefix }) => {
    const { t } = useTranslation();
    const [name, setName] = useState('');
    const [selectedBaseBranch, setSelectedBaseBranch] = useState(defaultBaseBranch);
    const [isLoading, setIsLoading] = useState(false);
    const [isValid, setIsValid] = useState(false);

    // Reset when modal opens
    useEffect(() => {
      if (isOpen) {
        setName('');
        setSelectedBaseBranch(defaultBaseBranch);
        setIsLoading(false);
        setIsValid(false);
      }
    }, [isOpen, defaultBaseBranch]);

    // Get local branches for selection
    const localBranches = useMemo(() => branches.filter((b) => !b.is_remote), [branches]);

    // Get existing branch names with prefix for validation
    const existingBranchNames = useMemo(() => {
      return branches
        .filter((b) => b.name.startsWith(prefix))
        .map((b) => b.name.replace(prefix, ''));
    }, [branches, prefix]);

    const handleValidationChange = useCallback((result: ValidationResult) => {
      setIsValid(result.isValid);
    }, []);

    const handleStart = useCallback(() => {
      if (!isValid || isLoading) return;

      // Set loading state immediately
      setIsLoading(true);

      // Use requestAnimationFrame to allow React to render the loading state
      // before the blocking git operation starts
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onStart(name, selectedBaseBranch);
        });
      });
    }, [isValid, isLoading, onStart, name, selectedBaseBranch]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && isValid && !isLoading) {
          handleStart();
        }
      },
      [isValid, isLoading, handleStart]
    );

    const getIcon = () => {
      switch (flowType) {
        case 'feature':
          return <Play size={24} />;
        case 'release':
          return <Flag size={24} />;
        case 'hotfix':
          return <AlertTriangle size={24} />;
        default:
          return <GitBranch size={24} />;
      }
    };

    const getTitle = () => {
      switch (flowType) {
        case 'feature':
          return t('modals.gitFlowStart.titleFeature');
        case 'release':
          return t('modals.gitFlowStart.titleRelease');
        case 'hotfix':
          return t('modals.gitFlowStart.titleHotfix');
        default:
          return '';
      }
    };

    const getLoadingText = () => {
      switch (flowType) {
        case 'feature':
          return t('modals.gitFlowStart.loadingFeature');
        case 'release':
          return t('modals.gitFlowStart.loadingRelease');
        case 'hotfix':
          return t('modals.gitFlowStart.loadingHotfix');
        default:
          return '';
      }
    };

    const fullBranchName = `${prefix}${name}`;
    const isStartDisabled = !isValid || isLoading;

    return (
      <Modal isOpen={isOpen} onClose={isLoading ? undefined : onClose}>
        <ModalHeader
          icon={getIcon()}
          title={getTitle()}
          description={t('modals.gitFlowStart.description', { type: flowType })}
        />
        <ModalBody className={isLoading ? 'modal-body-loading' : undefined}>
          <div className={isLoading ? 'modal-content-loading' : undefined}>
            <ModalRow label={t('modals.gitFlowStart.baseBranch')}>
              <div className="modal-select-wrapper">
                <GitBranch size={14} className="select-icon" />
                <select
                  className="modal-select"
                  value={selectedBaseBranch}
                  onChange={(e) => setSelectedBaseBranch(e.target.value)}
                  disabled={isLoading}
                >
                  {localBranches.map((branch) => (
                    <option key={branch.name} value={branch.name}>
                      {branch.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="select-chevron" />
              </div>
            </ModalRow>

            <ModalRow label={t('modals.gitFlowStart.name')}>
              <BranchNameInput
                value={name}
                onChange={setName}
                onKeyDown={handleKeyDown}
                onValidationChange={handleValidationChange}
                existingNames={existingBranchNames}
                placeholder={t('modals.gitFlowStart.namePlaceholder', { type: flowType })}
                prefix={prefix}
                disabled={isLoading}
                autoFocus
              />
            </ModalRow>

            {name && (
              <div className="modal-info">
                <GitBranch size={14} />
                <span>{t('modals.gitFlowStart.willCreate', { branch: fullBranchName })}</span>
              </div>
            )}
          </div>
        </ModalBody>

        <ModalFooter className={isLoading ? 'modal-footer-loading' : undefined}>
          <ModalLoadingIndicator isLoading={isLoading} loadingText={getLoadingText()} />
          <button className="btn-cancel" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" onClick={handleStart} disabled={isStartDisabled}>
            {t('modals.gitFlowStart.start')}
          </button>
        </ModalFooter>
      </Modal>
    );
  }
);
