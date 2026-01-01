import type { FC, MouseEvent as ReactMouseEvent } from 'react';
import { memo, useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Trash2, AlertTriangle } from 'lucide-react';
import type { GitLogEntry } from '../../types/git';
import {
  useUIStore,
  useActivityLogPanelOpen,
  useActivityLogPanelHeight,
  ACTIVITY_PANEL_MIN_HEIGHT,
  ACTIVITY_PANEL_MAX_HEIGHT_PERCENT,
} from '../../stores/uiStore';
import { ActivityLogEntry } from './ActivityLogEntry';
import './ActivityLogPanel.css';

interface ActivityLogPanelProps {
  entries: GitLogEntry[];
  onClear: () => void;
}

export const ActivityLogPanel: FC<ActivityLogPanelProps> = memo(({ entries, onClear }) => {
  const { t } = useTranslation();
  const isOpen = useActivityLogPanelOpen();
  const height = useActivityLogPanelHeight();
  const setActivityLogPanelOpen = useUIStore((state) => state.setActivityLogPanelOpen);
  const setActivityLogPanelHeight = useUIStore((state) => state.setActivityLogPanelHeight);
  const setIsResizing = useUIStore((state) => state.setIsResizing);

  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const resizeRef = useRef<{
    startY: number;
    startHeight: number;
  } | null>(null);

  const errorCount = useMemo(() => entries.filter((e) => !e.success).length, [entries]);

  const handleClose = useCallback(() => {
    setActivityLogPanelOpen(false);
  }, [setActivityLogPanelOpen]);

  const handleToggleEntry = useCallback((id: string) => {
    setExpandedEntries((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const handleResizeStart = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      resizeRef.current = {
        startY: e.clientY,
        startHeight: height,
      };
      setIsResizing('activityLogPanel');
    },
    [height, setIsResizing]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;

      const deltaY = resizeRef.current.startY - e.clientY;
      const newHeight = resizeRef.current.startHeight + deltaY;

      const viewportHeight = window.innerHeight;
      const maxHeight = viewportHeight * ACTIVITY_PANEL_MAX_HEIGHT_PERCENT;
      const clampedHeight = Math.min(maxHeight, Math.max(ACTIVITY_PANEL_MIN_HEIGHT, newHeight));

      setActivityLogPanelHeight(clampedHeight);
    };

    const handleMouseUp = () => {
      if (resizeRef.current) {
        resizeRef.current = null;
        setIsResizing(null);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setActivityLogPanelHeight, setIsResizing]);

  if (!isOpen) return null;

  return (
    <div className="activity-log-panel" style={{ height: `${height}px` }}>
      <div className="activity-log-resize-handle" onMouseDown={handleResizeStart} />
      <div className="activity-log-header">
        <div className="activity-log-header-left">
          <span className="activity-log-title">{t('activityLog.title')}</span>
          {errorCount > 0 && (
            <span className="activity-log-error-badge">
              <AlertTriangle size={12} />
              {errorCount} {errorCount === 1 ? t('activityLog.error') : t('activityLog.errors')}
            </span>
          )}
        </div>
        <div className="activity-log-header-right">
          <button
            className="activity-log-header-btn"
            onClick={onClear}
            title={t('activityLog.clear')}
            disabled={entries.length === 0}
          >
            <Trash2 size={14} />
            <span>{t('activityLog.clear')}</span>
          </button>
          <button
            className="activity-log-header-btn close"
            onClick={handleClose}
            title={t('common.close')}
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="activity-log-list">
        {entries.length === 0 ? (
          <div className="activity-log-empty">{t('activityLog.empty')}</div>
        ) : (
          entries.map((entry) => (
            <ActivityLogEntry
              key={entry.id}
              entry={entry}
              isExpanded={expandedEntries.has(entry.id)}
              onToggleExpand={() => handleToggleEntry(entry.id)}
            />
          ))
        )}
      </div>
    </div>
  );
});

ActivityLogPanel.displayName = 'ActivityLogPanel';
