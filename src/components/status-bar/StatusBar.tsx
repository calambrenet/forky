import type { FC } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal } from 'lucide-react';
import { useUIStore, useActivityLogPanelOpen } from '../../stores/uiStore';
import './StatusBar.css';

interface StatusBarProps {
  entryCount: number;
  errorCount: number;
}

export const StatusBar: FC<StatusBarProps> = memo(({ entryCount, errorCount }) => {
  const { t } = useTranslation();
  const isActivityLogOpen = useActivityLogPanelOpen();
  const toggleActivityLogPanel = useUIStore((state) => state.toggleActivityLogPanel);

  return (
    <div className="status-bar">
      <button
        className={`status-bar-item ${isActivityLogOpen ? 'active' : ''}`}
        onClick={toggleActivityLogPanel}
        title={t('statusBar.activityLog')}
      >
        <Terminal size={14} />
        <span className="status-bar-item-label">{t('statusBar.activityLog')}</span>
        {entryCount > 0 && <span className="status-bar-badge">{entryCount}</span>}
        {errorCount > 0 && <span className="status-bar-badge error">{errorCount}</span>}
      </button>
    </div>
  );
});

StatusBar.displayName = 'StatusBar';
