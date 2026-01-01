import type { FC } from 'react';
import { useState, useEffect, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Globe } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { Select, Checkbox } from '../form';
import { ModalLoadingIndicator } from './ModalLoadingIndicator';
import './GitModals.css';

interface FetchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFetch: (options: FetchOptions) => void;
  remotes: string[];
  savedOptions?: FetchOptions;
}

export interface FetchOptions {
  remote: string;
  all: boolean;
}

export const FetchModal: FC<FetchModalProps> = memo(
  ({ isOpen, onClose, onFetch, remotes, savedOptions }) => {
    const { t } = useTranslation();
    const [selectedRemote, setSelectedRemote] = useState(
      savedOptions?.remote || remotes[0] || 'origin'
    );
    const [fetchAll, setFetchAll] = useState(savedOptions?.all ?? true);
    const [isLoading, setIsLoading] = useState(false);

    // Update state when savedOptions change
    useEffect(() => {
      if (savedOptions) {
        setSelectedRemote(savedOptions.remote || remotes[0] || 'origin');
        setFetchAll(savedOptions.all ?? true);
      }
    }, [savedOptions, remotes]);

    // Reset to defaults when modal opens
    useEffect(() => {
      if (isOpen) {
        setIsLoading(false);
        if (!savedOptions) {
          setSelectedRemote(remotes[0] || 'origin');
          setFetchAll(true);
        }
      }
    }, [isOpen, remotes, savedOptions]);

    const handleFetch = useCallback(() => {
      if (isLoading) return;

      // Set loading state immediately
      setIsLoading(true);

      // Use requestAnimationFrame to allow React to render the loading state
      // before the blocking git operation starts
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onFetch({
            remote: selectedRemote,
            all: fetchAll,
          });
        });
      });
    }, [isLoading, onFetch, selectedRemote, fetchAll]);

    const remoteOptions = remotes.map((remote) => ({
      value: remote,
      label: remote,
      icon: <Globe size={14} />,
    }));

    return (
      <Modal isOpen={isOpen} onClose={isLoading ? undefined : onClose}>
        <ModalHeader
          icon={<Download size={24} />}
          title={t('modals.fetch.title')}
          description={t('modals.fetch.description')}
        />
        <ModalBody className={isLoading ? 'modal-body-loading' : undefined}>
          <div className={isLoading ? 'modal-content-loading' : undefined}>
            <ModalRow label={t('modals.fetch.remote')}>
              <Select
                value={selectedRemote}
                options={remoteOptions}
                onChange={setSelectedRemote}
                disabled={fetchAll || isLoading}
              />
            </ModalRow>
          </div>
        </ModalBody>
        <div className={`modal-checkboxes ${isLoading ? 'modal-content-loading' : ''}`}>
          <Checkbox
            checked={fetchAll}
            onChange={setFetchAll}
            label={t('modals.fetch.fetchAllRemotes')}
            disabled={isLoading}
          />
        </div>
        <ModalFooter className={isLoading ? 'modal-footer-loading' : undefined}>
          <ModalLoadingIndicator isLoading={isLoading} loadingText={t('modals.fetch.loading')} />
          <button className="btn-cancel" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" onClick={handleFetch} disabled={isLoading}>
            {t('toolbar.fetch')}
          </button>
        </ModalFooter>
      </Modal>
    );
  }
);
