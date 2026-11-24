import type { FC, MouseEvent as ReactMouseEvent } from 'react';
import { memo, useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { List, useDynamicRowHeight, type RowComponentProps } from 'react-window';
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

const VIRTUALIZE_LOG_THRESHOLD = 50;
const DEFAULT_LOG_ROW_HEIGHT = 35;

interface ActivityLogPanelProps {
  entries: GitLogEntry[];
  onClear: () => void;
}

interface ActivityLogRowExtraProps {
  entries: GitLogEntry[];
  expandedEntries: Set<string>;
  onToggleEntry: (id: string) => void;
}

const VirtualActivityLogRow = ({
  index,
  style,
  ariaAttributes,
  entries,
  expandedEntries,
  onToggleEntry,
}: RowComponentProps<ActivityLogRowExtraProps>) => {
  const entry = entries[index];
  if (!entry) return <div style={style} {...ariaAttributes} />;
  return (
    <div style={style} {...ariaAttributes}>
      <ActivityLogEntry
        entry={entry}
        isExpanded={expandedEntries.has(entry.id)}
        onToggleExpand={() => onToggleEntry(entry.id)}
      />
    </div>
  );
};

export const ActivityLogPanel: FC<ActivityLogPanelProps> = memo(({ entries, onClear }) => {
  const { t } = useTranslation();
  const isOpen = useActivityLogPanelOpen();
  const height = useActivityLogPanelHeight();
  const isResizingPanel = useUIStore((state) => state.isResizing === 'activityLogPanel');
  const setActivityLogPanelOpen = useUIStore((state) => state.setActivityLogPanelOpen);
  const setActivityLogPanelHeight = useUIStore((state) => state.setActivityLogPanelHeight);
  const setIsResizing = useUIStore((state) => state.setIsResizing);

  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<{
    startY: number;
    startHeight: number;
    pendingHeight: number;
  } | null>(null);
  const rafRef = useRef<number | null>(null);

  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: DEFAULT_LOG_ROW_HEIGHT,
    key: entries.length,
  });

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
        pendingHeight: height,
      };
      setIsResizing('activityLogPanel');
    },
    [height, setIsResizing]
  );

  // Attach global mouse listeners ONLY while actively dragging the resize handle
  useEffect(() => {
    if (!isResizingPanel) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;

      const deltaY = resizeRef.current.startY - e.clientY;
      const newHeight = resizeRef.current.startHeight + deltaY;

      const viewportHeight = window.innerHeight;
      const maxHeight = viewportHeight * ACTIVITY_PANEL_MAX_HEIGHT_PERCENT;
      const clampedHeight = Math.min(maxHeight, Math.max(ACTIVITY_PANEL_MIN_HEIGHT, newHeight));
      resizeRef.current.pendingHeight = clampedHeight;

      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          if (panelRef.current && resizeRef.current) {
            panelRef.current.style.height = `${resizeRef.current.pendingHeight}px`;
          }
        });
      }
    };

    const handleMouseUp = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (resizeRef.current) {
        const finalHeight = resizeRef.current.pendingHeight;
        resizeRef.current = null;
        setActivityLogPanelHeight(finalHeight);
        setIsResizing(null);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isResizingPanel, setActivityLogPanelHeight, setIsResizing]);

  const rowProps = useMemo<ActivityLogRowExtraProps>(
    () => ({
      entries,
      expandedEntries,
      onToggleEntry: handleToggleEntry,
    }),
    [entries, expandedEntries, handleToggleEntry]
  );

  if (!isOpen) return null;

  return (
    <div ref={panelRef} className="activity-log-panel" style={{ height: `${height}px` }}>
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
        ) : entries.length > VIRTUALIZE_LOG_THRESHOLD ? (
          <List<ActivityLogRowExtraProps>
            rowComponent={VirtualActivityLogRow}
            rowCount={entries.length}
            rowHeight={dynamicRowHeight}
            rowProps={rowProps}
            overscanCount={10}
            style={{ height: '100%', width: '100%' }}
          />
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
