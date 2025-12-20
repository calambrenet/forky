import { FC, useState, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Globe } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalRow } from '../modal';
import { Select, Checkbox } from '../form';
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

export const FetchModal: FC<FetchModalProps> = memo(({
  isOpen,
  onClose,
  onFetch,
  remotes,
  savedOptions,
}) => {
  const { t } = useTranslation();
  const [selectedRemote, setSelectedRemote] = useState(savedOptions?.remote || remotes[0] || 'origin');
  const [fetchAll, setFetchAll] = useState(savedOptions?.all ?? true);

  // Update state when savedOptions change
  useEffect(() => {
    if (savedOptions) {
      setSelectedRemote(savedOptions.remote || remotes[0] || 'origin');
      setFetchAll(savedOptions.all ?? true);
    }
  }, [savedOptions, remotes]);

  // Reset to defaults when modal opens
  useEffect(() => {
    if (isOpen && !savedOptions) {
      setSelectedRemote(remotes[0] || 'origin');
      setFetchAll(true);
    }
  }, [isOpen, remotes, savedOptions]);

  const handleFetch = () => {
    onFetch({
      remote: selectedRemote,
      all: fetchAll,
    });
    onClose();
  };

  const remoteOptions = remotes.map(remote => ({
    value: remote,
    label: remote,
    icon: <Globe size={14} />,
  }));

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalHeader
        icon={<Download size={24} />}
        title={t('modals.fetch.title')}
        description={t('modals.fetch.description')}
      />
      <ModalBody>
        <ModalRow label={t('modals.fetch.remote')}>
          <Select
            value={selectedRemote}
            options={remoteOptions}
            onChange={setSelectedRemote}
            disabled={fetchAll}
          />
        </ModalRow>
      </ModalBody>
      <div className="modal-checkboxes">
        <Checkbox
          checked={fetchAll}
          onChange={setFetchAll}
          label={t('modals.fetch.fetchAllRemotes')}
        />
      </div>
      <ModalFooter>
        <button className="btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn-primary" onClick={handleFetch}>{t('toolbar.fetch')}</button>
      </ModalFooter>
    </Modal>
  );
});
