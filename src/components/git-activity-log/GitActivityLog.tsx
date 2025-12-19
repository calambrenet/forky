import { FC, useState } from 'react';
import { GitLogEntry } from '../../types/git';
import './GitActivityLog.css';

interface GitActivityLogProps {
  entries: GitLogEntry[];
  isOpen: boolean;
  onClose: () => void;
}

type FilterType = 'all' | 'user' | 'background';

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"/>
  </svg>
);

const SuccessIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M13.854 3.646a.5.5 0 010 .708l-7 7a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 11.708-.708L6.5 10.293l6.646-6.647a.5.5 0 01.708 0z"/>
  </svg>
);

const ErrorIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"/>
  </svg>
);

const formatTime = (date: Date): string => {
  return date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDateTime = (date: Date): string => {
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const GitActivityLog: FC<GitActivityLogProps> = ({
  entries,
  isOpen,
  onClose,
}) => {
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
          <span className="git-activity-title">Activity Log</span>
          <button className="git-activity-close" onClick={onClose}>
            <CloseIcon />
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
                <div className="git-activity-empty">No activity yet</div>
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
                    <span className={`detail-status ${selectedEntry.success ? 'success' : 'error'}`}>
                      {selectedEntry.success ? <SuccessIcon /> : <ErrorIcon />}
                      {selectedEntry.output.split('\n')[0]}
                    </span>
                  </div>
                  <span className="detail-timestamp">{formatDateTime(selectedEntry.timestamp)}</span>
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
              <div className="detail-empty">Select an entry to view details</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
