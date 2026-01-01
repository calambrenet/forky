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
const LANE_PADDING = 16; // Extra padding after the node

export const CommitGraph = forwardRef<CommitGraphHandle, CommitGraphProps>(
  ({ commits, branchHeads, selectedCommitId, onCommitClick, onCommitDoubleClick }, ref) => {
    const { t } = useTranslation();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);

    // Localized date formatting
    const formatDate = useCallback(
      (dateStr: string): string => {
        try {
          const date = new Date(dateStr);
          const now = new Date();
          const diffMs = now.getTime() - date.getTime();
          const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

          if (diffDays === 0) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } else if (diffDays === 1) {
            return t('commits.yesterday');
          } else if (diffDays < 7) {
            return t('commits.daysAgo', { count: diffDays });
          } else {
            return date.toLocaleDateString([], {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });
          }
        } catch {
          return dateStr;
        }
      },
      [t]
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

    // Calculate the graph width for a specific row based on its lane
    const getRowGraphWidth = useCallback((lane: number) => {
      return Math.max(MIN_GRAPH_WIDTH, GRAPH_PADDING + (lane + 1) * LANE_WIDTH + LANE_PADDING);
    }, []);

    // Handle scroll
    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
      setScrollTop(e.currentTarget.scrollTop);
    }, []);

    // Update container height on resize
    useEffect(() => {
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerHeight(entry.contentRect.height);
        }
      });

      resizeObserver.observe(scrollEl);
      setContainerHeight(scrollEl.clientHeight);

      return () => resizeObserver.disconnect();
    }, []);

    // Expose scrollToCommit method via ref
    useImperativeHandle(
      ref,
      () => ({
        scrollToCommit: (commitId: string) => {
          const commitIndex = commits.findIndex((c) => c.id === commitId);
          if (commitIndex !== -1 && scrollRef.current) {
            const targetScrollTop = commitIndex * ROW_HEIGHT - containerHeight / 2 + ROW_HEIGHT / 2;
            scrollRef.current.scrollTo({
              top: Math.max(0, targetScrollTop),
              behavior: 'smooth',
            });
          }
        },
      }),
      [commits, containerHeight]
    );

    // Calculate visible range
    const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - VISIBLE_BUFFER);
    const endRow = Math.min(
      commits.length,
      Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + VISIBLE_BUFFER
    );

    const visibleNodes = graphData.nodes.slice(startRow, endRow);

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
        // Straight vertical line
        return `M ${x1} ${y1} L ${x2} ${y2}`;
      }

      // Curved path for branch/merge
      const midY = (y1 + y2) / 2;
      return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
    };

    // Render all graph lines
    const renderGraphLines = () => {
      const paths: React.ReactElement[] = [];
      const renderedPaths = new Set<string>();

      visibleNodes.forEach((node) => {
        node.parentConnections.forEach((conn, connIndex) => {
          const pathKey = `${node.commit.id}-${conn.parentSha}`;
          if (renderedPaths.has(pathKey)) return;
          renderedPaths.add(pathKey);

          const pathD = generatePath(node.lane, node.row, conn.parentLane, conn.parentRow);
          const color = getLaneColor(node.lane);

          paths.push(
            <path
              key={`${node.commit.id}-${connIndex}`}
              d={pathD}
              stroke={color}
              strokeWidth={2}
              fill="none"
            />
          );
        });

        // Draw continuing lines for commits that are parents of earlier visible commits
        // This ensures the line continues through the visible area
      });

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
            {/* SVG Graph layer */}
            <svg className="commit-graph-svg" width={maxGraphWidth} style={{ height: totalHeight }}>
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
                  <div className="row-date">{formatDate(node.commit.date)}</div>

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
