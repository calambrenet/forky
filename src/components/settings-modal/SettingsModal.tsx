import type { FC } from 'react';
import { useCallback, useEffect, useRef, useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings as SettingsIcon, GitBranch, X } from 'lucide-react';
import type { SettingsPanel } from '../../stores/uiStore';
import { GeneralPanel } from './panels/GeneralPanel';
import { GitPanel } from './panels/GitPanel';
import './SettingsModal.css';

interface SettingsModalProps {
  isOpen: boolean;
  initialPanel: SettingsPanel;
  onClose: () => void;
}

const ICON_SIZE = 20;

export const SettingsModal: FC<SettingsModalProps> = memo(
  ({ isOpen, initialPanel, onClose }) => {
    const { t } = useTranslation();
    const overlayRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<SettingsPanel>(initialPanel);

    // Sync active tab with requested initial panel whenever modal opens
    useEffect(() => {
      if (isOpen) {
        setActiveTab(initialPanel);
      }
    }, [isOpen, initialPanel]);

    const handleEscape = useCallback(
      (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      },
      [onClose]
    );

    const handleOverlayClick = useCallback(
      (e: React.MouseEvent) => {
        if (e.target === overlayRef.current) {
          onClose();
        }
      },
      [onClose]
    );

    useEffect(() => {
      if (isOpen) {
        document.addEventListener('keydown', handleEscape);
        document.body.style.overflow = 'hidden';
        return () => {
          document.removeEventListener('keydown', handleEscape);
          document.body.style.overflow = '';
        };
      }
    }, [isOpen, handleEscape]);

    if (!isOpen) return null;

    return (
      <div
        className="settings-modal-overlay"
        ref={overlayRef}
        onClick={handleOverlayClick}
      >
        <div className="settings-modal-dialog" role="dialog" aria-modal="true">
          <header className="settings-modal-header">
            <h2 className="settings-modal-title">{t('settings.title')}</h2>
            <button
              type="button"
              className="settings-modal-close"
              aria-label={t('common.close')}
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </header>

          <nav className="settings-modal-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'general'}
              className={`settings-modal-tab${
                activeTab === 'general' ? ' settings-modal-tab-active' : ''
              }`}
              onClick={() => setActiveTab('general')}
            >
              <SettingsIcon size={ICON_SIZE} />
              <span>{t('settings.tabs.general')}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'git'}
              className={`settings-modal-tab${
                activeTab === 'git' ? ' settings-modal-tab-active' : ''
              }`}
              onClick={() => setActiveTab('git')}
            >
              <GitBranch size={ICON_SIZE} />
              <span>{t('settings.tabs.git')}</span>
            </button>
          </nav>

          <div className="settings-modal-body">
            {activeTab === 'general' ? <GeneralPanel /> : <GitPanel onClose={onClose} />}
          </div>
        </div>
      </div>
    );
  }
);

SettingsModal.displayName = 'SettingsModal';
