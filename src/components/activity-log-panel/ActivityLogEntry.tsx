import type { FC } from 'react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Check, AlertTriangle } from 'lucide-react';
import type { GitLogEntry } from '../../types/git';

interface ActivityLogEntryProps {
  entry: GitLogEntry;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function formatRelativeTime(date: Date, t: (key: string) => string): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return t('activityLog.time.justNow');
  } else if (diffMinutes < 60) {
    return t('activityLog.time.minutesAgo').replace('{n}', String(diffMinutes));
  } else if (diffHours < 24) {
    return t('activityLog.time.hoursAgo').replace('{n}', String(diffHours));
  } else {
    return t('activityLog.time.daysAgo').replace('{n}', String(diffDays));
  }
}

export const ActivityLogEntry: FC<ActivityLogEntryProps> = memo(
  ({ entry, isExpanded, onToggleExpand }) => {
    const { t } = useTranslation();

    const relativeTime = useMemo(() => {
      return formatRelativeTime(entry.timestamp, t);
    }, [entry.timestamp, t]);

    const hasDetails = entry.command || entry.output;

    return (
      <div className={`activity-log-entry ${isExpanded ? 'expanded' : ''}`}>
        <div
          className="activity-log-entry-row"
          onClick={hasDetails ? onToggleExpand : undefined}
          style={{ cursor: hasDetails ? 'pointer' : 'default' }}
        >
          <div className="activity-log-entry-expand">
            {hasDetails && <ChevronRight size={14} />}
          </div>
          <div className={`activity-log-entry-status ${entry.success ? 'success' : 'error'}`}>
            {entry.success ? <Check size={14} /> : <AlertTriangle size={14} />}
          </div>
          <span className="activity-log-entry-type">{entry.operationType}</span>
          <span className="activity-log-entry-name">{entry.operationName}</span>
          <span className="activity-log-entry-time">{relativeTime}</span>
        </div>
        {isExpanded && hasDetails && (
          <div className="activity-log-entry-details">
            {entry.command && (
              <div className="activity-log-entry-detail-row">
                <span className="activity-log-entry-detail-label">{t('activityLog.command')}:</span>
                <code className="activity-log-entry-detail-value">{entry.command}</code>
              </div>
            )}
            {entry.output && (
              <div className="activity-log-entry-output">
                <pre className={`activity-log-entry-output-text ${!entry.success ? 'error' : ''}`}>
                  {entry.output}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
  // Custom comparison to handle Date objects properly
  (prevProps, nextProps) =>
    prevProps.entry.id === nextProps.entry.id &&
    prevProps.isExpanded === nextProps.isExpanded &&
    prevProps.entry.timestamp.getTime() === nextProps.entry.timestamp.getTime()
);

ActivityLogEntry.displayName = 'ActivityLogEntry';
