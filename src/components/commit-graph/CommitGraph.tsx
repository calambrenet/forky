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
import type { CommitInfo, BranchHead } from '../../types/git';
import { calculateGraphLayout, getLaneColor } from './graphUtils';
import './CommitGraph.css';

interface CommitGraphProps {
  commits: CommitInfo[];
  branchHeads: BranchHead[];
  selectedCommitId?: string | null;
  onCommitClick?: (commit: CommitInfo) => void;
  onCommitDoubleClick?: (commit: CommitInfo) => void;
}

export interface CommitGraphHandle {
  scrollToCommit: (commitId: string) => void;
}

const ROW_HEIGHT = 26;
const LANE_WIDTH = 12;
const NODE_RADIUS = 4;
const GRAPH_PADDING = 8;
const MIN_GRAPH_WIDTH = 40;
const VISIBLE_BUFFER = 15;
const SCROLL_QUANTUM_ROWS = 5;
const LANE_PADDING = 16; // Extra padding after the node

interface VisibleRange {
  startRow: number;
  endRow: number;
}

function computeVisibleRange(
  scrollTopPx: number,
  containerHeightPx: number,
  totalCommits: number
): VisibleRange {
  if (totalCommits === 0) {
    return { startRow: 0, endRow: 0 };
  }
  const rawStart = Math.max(0, Math.floor(scrollTopPx / ROW_HEIGHT) - VISIBLE_BUFFER);
  const rawEnd = Math.min(
    totalCommits,
    Math.ceil((scrollTopPx + containerHeightPx) / ROW_HEIGHT) + VISIBLE_BUFFER
  );
  const startRow = Math.floor(rawStart / SCROLL_QUANTUM_ROWS) * SCROLL_QUANTUM_ROWS;
  const endRow = Math.min(
    totalCommits,
    Math.ceil(rawEnd / SCROLL_QUANTUM_ROWS) * SCROLL_QUANTUM_ROWS
  );
  return { startRow, endRow };
}

export const CommitGraph = forwardRef<CommitGraphHandle, CommitGraphProps>(
  ({ commits, branchHeads, selectedCommitId, onCommitClick, onCommitDoubleClick }, ref) => {
    const { t, i18n } = useTranslation();
    const scrollRef = useRef<HTMLDivElement>(null);
    const scrollTopRef = useRef(0);
    const containerHeightRef = useRef(600);
    const [visibleRange, setVisibleRange] = useState<VisibleRange>(() =>
      computeVisibleRange(0, 600, commits.length)
    );

    // Cache Intl.DateTimeFormat instances per locale instead of allocating on every row/render
    const { timeFormatter, dateFormatter } = useMemo(() => {
      const locale = i18n.language || undefined;
      return {
        timeFormatter: new Intl.DateTimeFormat(locale, {
          hour: '2-digit',
          minute: '2-digit',
        }),
        dateFormatter: new Intl.DateTimeFormat(locale, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
      };
    }, [i18n.language]);

    const formatDate = useCallback(
      (dateStr: string, nowMs: number): string => {
        try {
          const date = new Date(dateStr);
          const timeMs = date.getTime();
          if (Number.isNaN(timeMs)) return dateStr;

          const diffDays = Math.floor((nowMs - timeMs) / (1000 * 60 * 60 * 24));

          if (diffDays === 0) {
            return timeFormatter.format(date);
          } else if (diffDays === 1) {
            return t('commits.yesterday');
          } else if (diffDays > 1 && diffDays < 7) {
            return t('commits.daysAgo', { count: diffDays });
          } else {
            return dateFormatter.format(date);
          }
        } catch {
          return dateStr;
        }
      },
      [t, timeFormatter, dateFormatter]
    );

    // Calculate graph layout
    const graphData = useMemo(() => {
      return calculateGraphLayout(commits, branchHeads);
    }, [commits, branchHeads]);

    // Calculate dimensions
    const maxGraphWidth = Math.max(
      MIN_GRAPH_WIDTH,
      (graphData.maxLane + 1) * LANE_WIDTH + GRAPH_PADDING * 2
    );
    const totalHeight = commits.length * ROW_HEIGHT;

    const updateVisibleRange = useCallback(
      (scrollTopPx: number, heightPx: number, total: number) => {
        const next = computeVisibleRange(scrollTopPx, heightPx, total);
        setVisibleRange((prev) =>
          prev.startRow === next.startRow && prev.endRow === next.endRow ? prev : next
        );
      },
      []
    );

    // Keep visibleRange in sync when commits.length changes
    useEffect(() => {
      updateVisibleRange(scrollTopRef.current, containerHeightRef.current, commits.length);
    }, [commits.length, updateVisibleRange]);

    // Calculate the graph width for a specific row based on its lane
    const getRowGraphWidth = useCallback((lane: number) => {
      return Math.max(MIN_GRAPH_WIDTH, GRAPH_PADDING + (lane + 1) * LANE_WIDTH + LANE_PADDING);
    }, []);

    // Handle scroll with quantized range updates (only re-renders when row quantum shifts)
    const handleScroll = useCallback(
      (e: React.UIEvent<HTMLDivElement>) => {
        const nextScrollTop = e.currentTarget.scrollTop;
        scrollTopRef.current = nextScrollTop;
        updateVisibleRange(nextScrollTop, containerHeightRef.current, commits.length);
      },
      [commits.length, updateVisibleRange]
    );

    // Update container height on resize
    useEffect(() => {
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;

      const handleHeightChange = (height: number) => {
        if (height <= 0 || height === containerHeightRef.current) return;
        containerHeightRef.current = height;
        updateVisibleRange(scrollTopRef.current, height, commits.length);
      };

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          handleHeightChange(entry.contentRect.height);
        }
      });

      resizeObserver.observe(scrollEl);
      handleHeightChange(scrollEl.clientHeight);

      return () => resizeObserver.disconnect();
    }, [commits.length, updateVisibleRange]);

    // Expose scrollToCommit method via ref
    useImperativeHandle(
      ref,
      () => ({
        scrollToCommit: (commitId: string) => {
          const commitIndex = commits.findIndex((c) => c.id === commitId);
          if (commitIndex !== -1 && scrollRef.current) {
            const targetScrollTop =
              commitIndex * ROW_HEIGHT - containerHeightRef.current / 2 + ROW_HEIGHT / 2;
            scrollRef.current.scrollTo({
              top: Math.max(0, targetScrollTop),
              behavior: 'smooth',
            });
          }
        },
      }),
      [commits]
    );

    const startRow = Math.min(visibleRange.startRow, commits.length);
    const endRow = Math.min(visibleRange.endRow, commits.length);
    const visibleNodes = graphData.nodes.slice(startRow, endRow);

    // Bound SVG height to visible viewport slice to avoid WebKit GPU texture limits
    const visibleRowCount = Math.max(1, endRow - startRow);
    const svgTop = startRow * ROW_HEIGHT;
    const svgHeight = visibleRowCount * ROW_HEIGHT;

    // Generate SVG path for a connection between commits
    const generatePath = (
      fromLane: number,
      fromRow: number,
      toLane: number,
      toRow: number
    ): string => {
      const x1 = GRAPH_PADDING + fromLane * LANE_WIDTH;
      const y1 = fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
      const x2 = GRAPH_PADDING + toLane * LANE_WIDTH;
      const y2 = toRow * ROW_HEIGHT + ROW_HEIGHT / 2;

      if (fromLane === toLane) {
        return `M ${x1} ${y1} L ${x2} ${y2}`;
      }

      const midY = (y1 + y2) / 2;
      return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
    };

    // Render all graph lines that intersect the visible row range (including continuing lines)
    const renderGraphLines = () => {
      const paths: React.ReactElement[] = [];

      for (const edge of graphData.edges) {
        if (edge.fromRow > endRow || edge.toRow < startRow) continue;
        const pathD = generatePath(edge.fromLane, edge.fromRow, edge.toLane, edge.toRow);
        paths.push(
          <path key={edge.key} d={pathD} stroke={edge.color} strokeWidth={2} fill="none" />
        );
      }

      return paths;
    };

    // Render commit nodes (circles)
    const renderNodes = () => {
      return visibleNodes.map((node) => {
        const x = GRAPH_PADDING + node.lane * LANE_WIDTH;
        const y = node.row * ROW_HEIGHT + ROW_HEIGHT / 2;
        const color = getLaneColor(node.lane);
        const isSelected = selectedCommitId === node.commit.id;

        return (
          <circle
            key={`node-${node.commit.id}`}
            cx={x}
            cy={y}
            r={isSelected ? NODE_RADIUS + 1 : NODE_RADIUS}
            fill={color}
            stroke={isSelected ? 'var(--text-primary)' : color}
            strokeWidth={isSelected ? 2 : 0}
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

    const nowMs = Date.now();

    return (
      <div className="commit-graph-container">
        {/* Header */}
        <div className="commit-graph-header">
          <div className="header-graph" style={{ width: MIN_GRAPH_WIDTH }}></div>
          <div className="header-description">{t('commits.description')}</div>
          <div className="header-author">{t('commits.author')}</div>
          <div className="header-date">{t('commits.date')}</div>
          <div className="header-sha">{t('commits.sha')}</div>
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
              const isSelected = selectedCommitId === node.commit.id;
              const rowGraphWidth = getRowGraphWidth(node.maxActiveLane);

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
                  {/* Graph space - width based on this commit's lane */}
                  <div className="row-graph" style={{ width: rowGraphWidth }} />

                  {/* Branch labels */}
                  <div className="row-labels">
                    {node.branchLabels.map((label) => (
                      <span
                        key={label.name}
                        className={`branch-label ${label.isHead ? 'is-head' : ''}`}
                        style={{ backgroundColor: label.color }}
                      >
                        {label.name}
                      </span>
                    ))}
                  </div>

                  {/* Commit message */}
                  <div className="row-message">{node.commit.message.split('\n')[0]}</div>

                  {/* Author */}
                  <div className="row-author">{node.commit.author}</div>

                  {/* Date */}
                  <div className="row-date">{formatDate(node.commit.date, nowMs)}</div>

                  {/* SHA */}
                  <div className="row-sha">{node.commit.short_id}</div>
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
