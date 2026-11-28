import {
  useMemo,
  useRef,
  useEffect,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, Cloud, CornerDownLeft, GitBranch, Tag } from 'lucide-react';
import type { CommitInfo, BranchHead, TagInfo, StashInfo } from '../../types/git';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import {
  calculateGraphLayout,
  getLaneColor,
  type GraphEdge,
  type RemoteProvider,
} from './graphUtils';
import './CommitGraph.css';

interface CommitGraphProps {
  commits: CommitInfo[];
  branchHeads: BranchHead[];
  tags?: TagInfo[];
  stashes?: StashInfo[];
  remoteUrls?: Record<string, string>;
  localChangesCount?: number;
  selectedCommitId?: string | null;
  onCommitClick?: (commit: CommitInfo) => void;
  onCommitDoubleClick?: (commit: CommitInfo) => void;
  onSelectLocalChanges?: () => void;
  onReachBottom?: () => void;
}

export interface CommitGraphHandle {
  scrollToCommit: (commitId: string) => void;
}

interface ColumnWidths {
  author: number;
  sha: number;
  date: number;
}

type ColumnDivider = 'desc-author' | 'author-sha' | 'sha-date';

const DEFAULT_COLUMN_WIDTHS: ColumnWidths = {
  author: 150,
  sha: 80,
  date: 195,
};

const COL_LIMITS = {
  author: { min: 80, max: 360 },
  sha: { min: 64, max: 160 },
  date: { min: 110, max: 320 },
} as const;

const ROW_HEIGHT = 26;
const LANE_WIDTH = 14;
const NODE_RADIUS = 4;
const MERGE_OUTER_RADIUS = 5;
const MERGE_INNER_RADIUS = 2;
const GRAPH_PADDING = 14;
const MIN_GRAPH_WIDTH = 40;
const VISIBLE_BUFFER = 15;
const SCROLL_QUANTUM_ROWS = 5;
const LANE_PADDING = 12;
const LOAD_MORE_THRESHOLD_PX = 200;
const SMOOTH_SCROLL_MAX_DISTANCE_PX = 2500;

interface VisibleRange {
  startRow: number;
  endRow: number;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function RemoteProviderIcon({ provider }: { provider: RemoteProvider }) {
  if (provider === 'github') {
    return (
      <svg
        className="ref-badge-icon"
        width={10}
        height={10}
        viewBox="0 0 16 16"
        fill="currentColor"
      >
        <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
      </svg>
    );
  }
  if (provider === 'gitlab') {
    return (
      <svg
        className="ref-badge-icon"
        width={10}
        height={10}
        viewBox="0 0 16 16"
        fill="currentColor"
      >
        <path d="m15.73 9.09-.86-2.66L13.17.85a.3.3 0 0 0-.57 0L10.9 6.43H5.1L3.4.85a.3.3 0 0 0-.57 0L1.13 6.43.27 9.09a.6.6 0 0 0 .22.67L8 15.2l7.51-5.44a.6.6 0 0 0 .22-.67Z" />
      </svg>
    );
  }
  if (provider === 'bitbucket') {
    return (
      <svg
        className="ref-badge-icon"
        width={10}
        height={10}
        viewBox="0 0 16 16"
        fill="currentColor"
      >
        <path d="M.77 1.2a.5.5 0 0 0-.5.58l2.06 12.53a.68.68 0 0 0 .67.57h9.98a.5.5 0 0 0 .5-.42l2.05-12.68a.5.5 0 0 0-.5-.58H.77Zm8.95 8.95H6.28L5.35 5.3h5.3l-.93 4.85Z" />
      </svg>
    );
  }
  return <Cloud size={10} className="ref-badge-icon" />;
}

function computeVisibleRange(
  scrollTopPx: number,
  containerHeightPx: number,
  totalRows: number
): VisibleRange {
  if (totalRows === 0) {
    return { startRow: 0, endRow: 0 };
  }
  const rawStart = Math.max(0, Math.floor(scrollTopPx / ROW_HEIGHT) - VISIBLE_BUFFER);
  const rawEnd = Math.min(
    totalRows,
    Math.ceil((scrollTopPx + containerHeightPx) / ROW_HEIGHT) + VISIBLE_BUFFER
  );
  const startRow = Math.floor(rawStart / SCROLL_QUANTUM_ROWS) * SCROLL_QUANTUM_ROWS;
  const endRow = Math.min(totalRows, Math.ceil(rawEnd / SCROLL_QUANTUM_ROWS) * SCROLL_QUANTUM_ROWS);
  return { startRow, endRow };
}

export const CommitGraph = forwardRef<CommitGraphHandle, CommitGraphProps>(
  (
    {
      commits,
      branchHeads,
      tags,
      stashes,
      remoteUrls,
      localChangesCount = 0,
      selectedCommitId,
      onCommitClick,
      onCommitDoubleClick,
      onSelectLocalChanges,
      onReachBottom,
    },
    ref
  ) => {
    const { t, i18n } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const scrollTopRef = useRef(0);
    const containerHeightRef = useRef(600);
    const [columnWidths, setColumnWidths] = useLocalStorage<ColumnWidths>(
      'forky:commit-columns',
      DEFAULT_COLUMN_WIDTHS
    );
    const columnWidthsRef = useRef(columnWidths);
    columnWidthsRef.current = columnWidths;

    // Calculate graph layout (including virtual uncommitted row when localChangesCount > 0)
    const graphData = useMemo(() => {
      return calculateGraphLayout(commits, branchHeads, {
        tags,
        stashes,
        remoteUrls,
        localChangesCount,
      });
    }, [commits, branchHeads, tags, stashes, remoteUrls, localChangesCount]);

    const totalRows = graphData.nodes.length;

    const [visibleRange, setVisibleRange] = useState<VisibleRange>(() =>
      computeVisibleRange(0, 600, totalRows)
    );

    // Cache Intl.DateTimeFormat instances per locale (always including time like Fork)
    const { timeFormatter, dateTimeFormatter } = useMemo(() => {
      const locale = i18n.language || undefined;
      return {
        timeFormatter: new Intl.DateTimeFormat(locale, {
          hour: '2-digit',
          minute: '2-digit',
        }),
        dateTimeFormatter: new Intl.DateTimeFormat(locale, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
    }, [i18n.language]);

    const formatDate = useCallback(
      (dateStr: string, today: Date, yesterday: Date): string => {
        try {
          const date = new Date(dateStr);
          if (Number.isNaN(date.getTime())) return dateStr;

          if (isSameCalendarDay(date, today)) {
            return t('commits.todayAt', { time: timeFormatter.format(date) });
          }
          if (isSameCalendarDay(date, yesterday)) {
            return t('commits.yesterdayAt', { time: timeFormatter.format(date) });
          }
          return dateTimeFormatter.format(date);
        } catch {
          return dateStr;
        }
      },
      [t, timeFormatter, dateTimeFormatter]
    );

    // Column resizing with 1:1 cursor tracking via CSS custom properties (zero React re-renders during drag)
    const startColumnResize = useCallback(
      (divider: ColumnDivider, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const start = { ...columnWidthsRef.current };
        let pending: ColumnWidths | null = null;
        let rafId: number | null = null;

        const applyDomWidths = (w: ColumnWidths) => {
          const el = containerRef.current;
          if (!el) return;
          el.style.setProperty('--col-author-width', `${w.author}px`);
          el.style.setProperty('--col-sha-width', `${w.sha}px`);
          el.style.setProperty('--col-date-width', `${w.date}px`);
        };

        const handleMouseMove = (moveEvent: MouseEvent) => {
          const dx = moveEvent.clientX - startX;
          let next: ColumnWidths;

          if (divider === 'desc-author') {
            next = {
              ...start,
              author: clamp(start.author - dx, COL_LIMITS.author.min, COL_LIMITS.author.max),
            };
          } else if (divider === 'author-sha') {
            const minDx = Math.max(
              COL_LIMITS.author.min - start.author,
              start.sha - COL_LIMITS.sha.max
            );
            const maxDx = Math.min(
              COL_LIMITS.author.max - start.author,
              start.sha - COL_LIMITS.sha.min
            );
            const effDx = clamp(dx, minDx, maxDx);
            next = {
              ...start,
              author: start.author + effDx,
              sha: start.sha - effDx,
            };
          } else {
            const minDx = Math.max(
              COL_LIMITS.sha.min - start.sha,
              start.date - COL_LIMITS.date.max
            );
            const maxDx = Math.min(
              COL_LIMITS.sha.max - start.sha,
              start.date - COL_LIMITS.date.min
            );
            const effDx = clamp(dx, minDx, maxDx);
            next = {
              ...start,
              sha: start.sha + effDx,
              date: start.date - effDx,
            };
          }

          pending = next;
          if (rafId === null) {
            rafId = requestAnimationFrame(() => {
              rafId = null;
              if (pending) applyDomWidths(pending);
            });
          }
        };

        const handleMouseUp = () => {
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          if (pending) {
            applyDomWidths(pending);
            setColumnWidths(pending);
          }
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      },
      [setColumnWidths]
    );

    // Calculate dimensions
    const maxGraphWidth = Math.max(
      MIN_GRAPH_WIDTH,
      (graphData.maxLane + 1) * LANE_WIDTH + GRAPH_PADDING + LANE_PADDING
    );
    const totalHeight = totalRows * ROW_HEIGHT;

    const updateVisibleRange = useCallback(
      (scrollTopPx: number, heightPx: number, total: number) => {
        const next = computeVisibleRange(scrollTopPx, heightPx, total);
        setVisibleRange((prev) =>
          prev.startRow === next.startRow && prev.endRow === next.endRow ? prev : next
        );
      },
      []
    );

    const checkNearBottom = useCallback(
      (el: HTMLDivElement | null) => {
        if (!el || !onReachBottom || commits.length === 0) return;
        const remainingPx = el.scrollHeight - (el.scrollTop + el.clientHeight);
        if (remainingPx <= LOAD_MORE_THRESHOLD_PX) {
          onReachBottom();
        }
      },
      [onReachBottom, commits.length]
    );

    const syncScrollbarGutter = useCallback(() => {
      const scrollEl = scrollRef.current;
      const containerEl = containerRef.current;
      if (!scrollEl || !containerEl) return;
      const scrollbarWidth = Math.max(0, scrollEl.offsetWidth - scrollEl.clientWidth);
      containerEl.style.setProperty('--scrollbar-width', `${scrollbarWidth}px`);
    }, []);

    // Keep visibleRange in sync when totalRows changes and auto-fill tall viewports
    useEffect(() => {
      updateVisibleRange(scrollTopRef.current, containerHeightRef.current, totalRows);
      syncScrollbarGutter();
      checkNearBottom(scrollRef.current);
    }, [totalRows, updateVisibleRange, syncScrollbarGutter, checkNearBottom]);

    const getRowGraphWidth = useCallback((lane: number) => {
      return Math.max(MIN_GRAPH_WIDTH, GRAPH_PADDING + lane * LANE_WIDTH + LANE_PADDING + 4);
    }, []);

    const handleScroll = useCallback(
      (e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        const nextScrollTop = el.scrollTop;
        scrollTopRef.current = nextScrollTop;
        updateVisibleRange(nextScrollTop, containerHeightRef.current, totalRows);
        checkNearBottom(el);
      },
      [totalRows, updateVisibleRange, checkNearBottom]
    );

    // Update container height on resize
    useEffect(() => {
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;

      const handleHeightChange = (height: number) => {
        if (height <= 0 || height === containerHeightRef.current) return;
        containerHeightRef.current = height;
        updateVisibleRange(scrollTopRef.current, height, totalRows);
        checkNearBottom(scrollEl);
      };

      const resizeObserver = new ResizeObserver((entries) => {
        syncScrollbarGutter();
        for (const entry of entries) {
          handleHeightChange(entry.contentRect.height);
        }
      });

      resizeObserver.observe(scrollEl);
      syncScrollbarGutter();
      handleHeightChange(scrollEl.clientHeight);

      return () => resizeObserver.disconnect();
    }, [totalRows, updateVisibleRange, syncScrollbarGutter, checkNearBottom]);

    // Expose scrollToCommit method via ref (accounts for virtual uncommitted row 0)
    useImperativeHandle(
      ref,
      () => ({
        scrollToCommit: (commitId: string) => {
          const nodeIndex = graphData.nodes.findIndex((n) => n.commit.id === commitId);
          const scrollEl = scrollRef.current;
          if (nodeIndex !== -1 && scrollEl) {
            const targetScrollTop = Math.max(
              0,
              nodeIndex * ROW_HEIGHT - containerHeightRef.current / 2 + ROW_HEIGHT / 2
            );
            const distance = Math.abs(targetScrollTop - scrollEl.scrollTop);
            const behavior: ScrollBehavior =
              distance > SMOOTH_SCROLL_MAX_DISTANCE_PX ? 'auto' : 'smooth';
            scrollEl.scrollTo({
              top: targetScrollTop,
              behavior,
            });
            if (behavior === 'auto') {
              scrollTopRef.current = targetScrollTop;
              updateVisibleRange(targetScrollTop, containerHeightRef.current, totalRows);
            }
          }
        },
      }),
      [graphData.nodes, totalRows, updateVisibleRange]
    );

    const startRow = Math.min(visibleRange.startRow, totalRows);
    const endRow = Math.min(visibleRange.endRow, totalRows);
    const visibleNodes = graphData.nodes.slice(startRow, endRow);

    // Bound SVG height to visible viewport slice to avoid WebKit GPU texture limits
    const visibleRowCount = Math.max(1, endRow - startRow);
    const svgTop = startRow * ROW_HEIGHT;
    const svgHeight = visibleRowCount * ROW_HEIGHT;

    // Generate Fork-style parallel rail path with 1-row smooth vertical-tangent transitions
    const generatePath = (edge: GraphEdge): string => {
      const xFrom = GRAPH_PADDING + edge.fromLane * LANE_WIDTH;
      const xVia = GRAPH_PADDING + edge.viaLane * LANE_WIDTH;
      const xTo = GRAPH_PADDING + edge.toLane * LANE_WIDTH;
      const y1 = edge.fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
      const y2 = edge.toRow * ROW_HEIGHT + ROW_HEIGHT / 2;
      const dy = Math.max(1, y2 - y1);

      if (xFrom === xVia && xVia === xTo) {
        return `M ${xFrom} ${y1} L ${xTo} ${y2}`;
      }

      if (xFrom !== xVia && xVia === xTo) {
        const bend = Math.min(ROW_HEIGHT, dy);
        const cp = bend * 0.5;
        const yBend = y1 + bend;
        if (yBend >= y2) {
          return `M ${xFrom} ${y1} C ${xFrom} ${y1 + cp}, ${xVia} ${y2 - cp}, ${xVia} ${y2}`;
        }
        return `M ${xFrom} ${y1} C ${xFrom} ${y1 + cp}, ${xVia} ${yBend - cp}, ${xVia} ${yBend} L ${xVia} ${y2}`;
      }

      if (xFrom === xVia && xVia !== xTo) {
        const bend = Math.min(ROW_HEIGHT, dy);
        const cp = bend * 0.5;
        const yBend = y2 - bend;
        if (yBend <= y1) {
          return `M ${xFrom} ${y1} C ${xVia} ${y1 + cp}, ${xTo} ${y2 - cp}, ${xTo} ${y2}`;
        }
        return `M ${xFrom} ${y1} L ${xVia} ${yBend} C ${xVia} ${yBend + cp}, ${xTo} ${y2 - cp}, ${xTo} ${y2}`;
      }

      const bend = Math.min(ROW_HEIGHT, dy / 2);
      const cp = bend * 0.5;
      const yTop = y1 + bend;
      const yBot = y2 - bend;
      return `M ${xFrom} ${y1} C ${xFrom} ${y1 + cp}, ${xVia} ${yTop - cp}, ${xVia} ${yTop} L ${xVia} ${yBot} C ${xVia} ${yBot + cp}, ${xTo} ${y2 - cp}, ${xTo} ${y2}`;
    };

    const renderGraphLines = () => {
      const paths: React.ReactElement[] = [];

      for (const edge of graphData.edges) {
        if (edge.fromRow > endRow || edge.toRow < startRow) continue;
        const pathD = generatePath(edge);
        paths.push(
          <path
            key={edge.key}
            d={pathD}
            stroke={edge.color}
            strokeWidth={1.85}
            strokeDasharray={edge.isDashed ? '3 2.5' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        );
      }

      return paths;
    };

    const renderNodes = () => {
      return visibleNodes.map((node) => {
        const x = GRAPH_PADDING + node.lane * LANE_WIDTH;
        const y = node.row * ROW_HEIGHT + ROW_HEIGHT / 2;
        const color = node.isUncommitted ? 'var(--text-secondary)' : getLaneColor(node.lane);
        const isSelected = !node.isUncommitted && selectedCommitId === node.commit.id;

        if (node.isUncommitted) {
          return (
            <circle
              key="node-uncommitted"
              cx={x}
              cy={y}
              r={NODE_RADIUS + 0.5}
              fill="var(--bg-primary)"
              stroke={color}
              strokeWidth={1.75}
              strokeDasharray="2.5 1.75"
            />
          );
        }

        if (node.isStash) {
          return (
            <circle
              key={`node-${node.commit.id}`}
              cx={x}
              cy={y}
              r={isSelected ? NODE_RADIUS + 1 : NODE_RADIUS}
              fill="var(--bg-primary)"
              stroke={isSelected ? 'var(--text-highlight)' : color}
              strokeWidth={1.75}
            />
          );
        }

        if (node.isMerge) {
          return (
            <g key={`node-${node.commit.id}`}>
              <circle
                cx={x}
                cy={y}
                r={isSelected ? MERGE_OUTER_RADIUS + 1 : MERGE_OUTER_RADIUS}
                fill="var(--bg-primary)"
                stroke={isSelected ? 'var(--text-highlight)' : color}
                strokeWidth={1.85}
              />
              <circle
                cx={x}
                cy={y}
                r={MERGE_INNER_RADIUS}
                fill={isSelected ? 'var(--text-highlight)' : color}
              />
            </g>
          );
        }

        return (
          <circle
            key={`node-${node.commit.id}`}
            cx={x}
            cy={y}
            r={isSelected ? NODE_RADIUS + 1 : NODE_RADIUS}
            fill={color}
            stroke={isSelected ? 'var(--text-highlight)' : 'var(--bg-primary)'}
            strokeWidth={1.5}
          />
        );
      });
    };

    if (commits.length === 0) {
      return (
        <div className="commit-graph-empty">
          <span>{t('commits.noCommits')}</span>
        </div>
      );
    }

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const containerStyle = {
      '--col-author-width': `${columnWidths.author}px`,
      '--col-sha-width': `${columnWidths.sha}px`,
      '--col-date-width': `${columnWidths.date}px`,
    } as React.CSSProperties;

    return (
      <div className="commit-graph-container" ref={containerRef} style={containerStyle}>
        {/* Header (Fork column order: Description | Author | SHA | Date, resizable) */}
        <div className="commit-graph-header">
          <div className="header-graph" style={{ width: MIN_GRAPH_WIDTH }} />
          <div className="header-description">{t('commits.description')}</div>
          <div className="header-author">
            <div
              className="col-resize-handle"
              onMouseDown={(e) => startColumnResize('desc-author', e)}
            />
            <span>{t('commits.author')}</span>
          </div>
          <div className="header-sha">
            <div
              className="col-resize-handle"
              onMouseDown={(e) => startColumnResize('author-sha', e)}
            />
            <span>{t('commits.sha')}</span>
          </div>
          <div className="header-date">
            <div
              className="col-resize-handle"
              onMouseDown={(e) => startColumnResize('sha-date', e)}
            />
            <span>{t('commits.date')}</span>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="commit-graph-scroll" ref={scrollRef} onScroll={handleScroll}>
          <div className="commit-graph-content" style={{ height: totalHeight }}>
            {/* Viewport-bounded SVG Graph layer */}
            <svg
              className="commit-graph-svg"
              width={maxGraphWidth}
              height={svgHeight}
              viewBox={`0 ${svgTop} ${maxGraphWidth} ${svgHeight}`}
              style={{ top: svgTop, height: svgHeight }}
            >
              <g className="graph-lines">{renderGraphLines()}</g>
              <g className="graph-nodes">{renderNodes()}</g>
            </svg>

            {/* Commit rows */}
            {visibleNodes.map((node) => {
              const rowGraphWidth = getRowGraphWidth(node.maxActiveLane);

              if (node.isUncommitted) {
                return (
                  <div
                    key={node.commit.id}
                    className="commit-row is-uncommitted"
                    style={{
                      top: node.row * ROW_HEIGHT,
                      height: ROW_HEIGHT,
                    }}
                    onClick={() => onSelectLocalChanges?.()}
                  >
                    <div className="row-graph" style={{ width: rowGraphWidth }} />
                    <div className="row-message">
                      <span className="row-message-text uncommitted-label">
                        {t('commits.uncommittedChanges', { count: localChangesCount })}
                      </span>
                    </div>
                    <div className="row-author" />
                    <div className="row-sha" />
                    <div className="row-date" />
                  </div>
                );
              }

              const isSelected = selectedCommitId === node.commit.id;

              return (
                <div
                  key={node.commit.id}
                  className={`commit-row ${isSelected ? 'selected' : ''}`}
                  style={{
                    top: node.row * ROW_HEIGHT,
                    height: ROW_HEIGHT,
                  }}
                  onClick={() => onCommitClick?.(node.commit)}
                  onDoubleClick={() => onCommitDoubleClick?.(node.commit)}
                >
                  <div className="row-graph" style={{ width: rowGraphWidth }} />

                  {/* Ref badges: branches (local, remote, or paired), stashes, tags */}
                  {(node.branchLabels.length > 0 ||
                    node.stashLabels.length > 0 ||
                    node.tagLabels.length > 0) && (
                    <div className="row-labels">
                      {node.branchLabels.map((label) => (
                        <span
                          key={`branch-${label.title}`}
                          className={`branch-label ${label.isHead ? 'is-head' : ''} ${!label.hasLocal && label.hasRemote ? 'is-remote' : ''}`}
                          style={{ '--branch-color': label.color } as React.CSSProperties}
                          title={label.title}
                        >
                          {label.hasRemote && label.remoteProvider && (
                            <RemoteProviderIcon provider={label.remoteProvider} />
                          )}
                          {label.hasLocal && !label.isHead && (
                            <GitBranch size={10} className="ref-badge-icon" />
                          )}
                          <span className="ref-badge-text">{label.name}</span>
                        </span>
                      ))}
                      {node.stashLabels.map((stashId) => (
                        <span
                          key={`stash-${stashId}`}
                          className="stash-label"
                          style={
                            {
                              '--stash-color': getLaneColor(node.lane),
                            } as React.CSSProperties
                          }
                          title={stashId}
                        >
                          <Archive size={10} className="ref-badge-icon" />
                          <span className="ref-badge-text">{stashId}</span>
                        </span>
                      ))}
                      {node.tagLabels.map((tagName) => (
                        <span key={`tag-${tagName}`} className="tag-label" title={tagName}>
                          <Tag size={10} className="ref-badge-icon" />
                          <span className="ref-badge-text">{tagName}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Commit message + multi-line body indicator */}
                  <div className="row-message">
                    <span className="row-message-text">{node.displaySubject}</span>
                    {node.hasBody && (
                      <CornerDownLeft
                        size={11}
                        className="multiline-indicator"
                        aria-label="Multi-line commit message"
                      />
                    )}
                  </div>

                  {/* Author */}
                  <div className="row-author">{node.commit.author}</div>

                  {/* SHA */}
                  <div className="row-sha">{node.commit.short_id}</div>

                  {/* Date with time */}
                  <div className="row-date">{formatDate(node.commit.date, today, yesterday)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
);

CommitGraph.displayName = 'CommitGraph';

export default CommitGraph;
