import type { FC } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Check } from 'lucide-react';
import { useLocale } from '../../i18n/useLocale';
import type { GitLogEntry } from '../../types/git';
import './GitActivityLog.css';

interface GitActivityLogProps {
  entries: GitLogEntry[];
  isOpen: boolean;
  onClose: () => void;
}

type FilterType = 'all' | 'user' | 'background';

export const GitActivityLog: FC<GitActivityLogProps> = ({ entries, isOpen, onClose }) => {
  const { t } = useTranslation();
  const { formatTime, formatDate } = useLocale();
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(
    entries.length > 0 ? entries[0].id : null
  );
  const [filter, setFilter] = useState<FilterType>('all');

  if (!isOpen) return null;

  const filteredEntries = entries.filter((entry) => {
    if (filter === 'all') return true;
    if (filter === 'background') return entry.isBackground;
    if (filter === 'user') return !entry.isBackground;
    return true;
  });

  const selectedEntry = entries.find((e) => e.id === selectedEntryId);

  return (
    <div className="git-activity-overlay" onClick={onClose}>
      <div className="git-activity-log" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="git-activity-header">
          <span className="git-activity-title">{t('activityLog.title')}</span>
          <button className="git-activity-close" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="git-activity-content">
          {/* Left panel - list */}
          <div className="git-activity-list-panel">
            {/* Filter tabs */}
            <div className="git-activity-filters">
              <button
                className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All
              </button>
              <button
                className={`filter-tab ${filter === 'user' ? 'active' : ''}`}
                onClick={() => setFilter('user')}
              >
                User
              </button>
              <button
                className={`filter-tab ${filter === 'background' ? 'active' : ''}`}
                onClick={() => setFilter('background')}
              >
                Background
              </button>
            </div>

            {/* Entry list */}
            <div className="git-activity-list">
              {filteredEntries.length === 0 ? (
                <div className="git-activity-empty">{t('activityLog.noActivity')}</div>
              ) : (
                filteredEntries.map((entry) => (
                  <button
                    key={entry.id}
                    className={`git-activity-item ${selectedEntryId === entry.id ? 'selected' : ''} ${entry.success ? 'success' : 'error'}`}
                    onClick={() => setSelectedEntryId(entry.id)}
                  >
                    <div className="activity-item-content">
                      <span className="activity-item-name">{entry.operationName}</span>
                      <span className="activity-item-status">
                        {entry.output.split('\n')[0].substring(0, 50)}
                        {entry.output.length > 50 ? '...' : ''}
                      </span>
                    </div>
                    <span className="activity-item-time">{formatTime(entry.timestamp)}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right panel - details */}
          <div className="git-activity-detail-panel">
            {selectedEntry ? (
              <>
                <div className="detail-header">
                  <div className="detail-title-row">
                    <span className="detail-title">{selectedEntry.operationName}</span>
                    <span
                      className={`detail-status ${selectedEntry.success ? 'success' : 'error'}`}
                    >
                      {selectedEntry.success ? <Check size={12} /> : <X size={12} />}
                      {selectedEntry.output.split('\n')[0]}
                    </span>
                  </div>
                  <span className="detail-timestamp">{formatDate(selectedEntry.timestamp)}</span>
                </div>
                <div className="detail-content">
                  <div className="detail-command">
                    <span className="command-prompt">$</span>
                    <span className="command-text">{selectedEntry.command}</span>
                  </div>
                  <pre className="detail-output">{selectedEntry.output}</pre>
                </div>
              </>
            ) : (
              <div className="detail-empty">{t('commits.selectCommitToViewDetails')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
