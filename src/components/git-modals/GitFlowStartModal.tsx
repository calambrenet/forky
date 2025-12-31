import type { FC } from 'react';
import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, Play, Flag, AlertTriangle } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { ModalLoadingIndicator } from './ModalLoadingIndicator';
import type { GitFlowType } from '../../types/git';
import './GitModals.css';

interface GitFlowStartModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (name: string) => void;
  flowType: GitFlowType;
  baseBranch: string;
  prefix: string;
}

export const GitFlowStartModal: FC<GitFlowStartModalProps> = memo(
  ({ isOpen, onClose, onStart, flowType, baseBranch, prefix }) => {
    const { t } = useTranslation();
    const [name, setName] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Reset when modal opens
    useEffect(() => {
      if (isOpen) {
        setName('');
        setIsLoading(false);
      }
    }, [isOpen]);

    // Validate name (no spaces, no special characters)
    const isValidName = useMemo(() => {
      const trimmed = name.trim();
      if (!trimmed) return false;
      if (trimmed.startsWith('.') || trimmed.startsWith('-')) return false;
      if (trimmed.includes(' ') || trimmed.includes('..')) return false;
      if (/[~^:?*\\[\]@{]/.test(trimmed)) return false;
      return true;
    }, [name]);

    const handleStart = useCallback(() => {
      if (!isValidName || isLoading) return;

      // Set loading state immediately
      setIsLoading(true);

      // Use requestAnimationFrame to allow React to render the loading state
      // before the blocking git operation starts
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onStart(name.trim());
        });
      });
    }, [isValidName, isLoading, onStart, name]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && isValidName && !isLoading) {
        handleStart();
      }
    };

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

    const fullBranchName = `${prefix}${name.trim()}`;
    const isStartDisabled = !isValidName || isLoading;

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
              <div className="track-branch-value">
                <GitBranch size={14} />
                <span className="branch-name-display">{baseBranch}</span>
              </div>
            </ModalRow>

            <ModalRow label={t('modals.gitFlowStart.name')}>
              <div className="track-branch-input-container">
                <GitBranch size={14} className="input-icon" />
                <input
                  type="text"
                  className="track-branch-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('modals.gitFlowStart.namePlaceholder', { type: flowType })}
                  autoFocus
                  disabled={isLoading}
                />
              </div>
            </ModalRow>

            {name.trim() && (
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
