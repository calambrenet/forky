import type { FC } from 'react';
import { memo, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { List, type RowComponentProps } from 'react-window';
import type { DiffHunk, DiffInfo, DiffLine } from '../../types/git';
import './VirtualDiffViewer.css';

const VIRTUALIZE_DIFF_THRESHOLD = 120;
const HUNK_HEADER_HEIGHT = 28;
const DIFF_LINE_HEIGHT = 20;

type FlatDiffItem =
  | { kind: 'hunk'; hunk: DiffHunk; hunkIndex: number; hunkKey: string }
  | { kind: 'line'; line: DiffLine; hunkIndex: number; lineIndex: number };

export interface VirtualDiffViewerProps {
  diffInfo: DiffInfo;
  filePath: string;
  statusLabel: string;
  isStaged?: boolean;
  isUntracked?: boolean;
  busyHunkKey?: string | null;
  getHunkKey?: (hunk: DiffHunk) => string;
  onStageHunk?: (hunk: DiffHunk) => void;
  onUnstageHunk?: (hunk: DiffHunk) => void;
  onDiscardHunk?: (hunk: DiffHunk) => void;
}

interface DiffRowExtraProps {
  items: FlatDiffItem[];
  showActions: boolean;
  isStaged: boolean;
  isUntracked: boolean;
  busyHunkKey: string | null;
  onStageHunk?: (hunk: DiffHunk) => void;
  onUnstageHunk?: (hunk: DiffHunk) => void;
  onDiscardHunk?: (hunk: DiffHunk) => void;
  stageLabel: string;
  stageTitle: string;
  unstageLabel: string;
  unstageTitle: string;
  discardLabel: string;
  discardTitle: string;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getLinePrefix(lineType: DiffLine['line_type']): string {
  switch (lineType) {
    case 'add':
      return '+';
    case 'delete':
      return '-';
    case 'no_newline':
      return '\\';
    default:
      return ' ';
  }
}

const defaultGetHunkKey = (hunk: DiffHunk) =>
  `${hunk.old_start}:${hunk.old_lines}:${hunk.new_start}:${hunk.new_lines}`;

const VirtualDiffRow = ({
  index,
  style,
  ariaAttributes,
  items,
  showActions,
  isStaged,
  isUntracked,
  busyHunkKey,
  onStageHunk,
  onUnstageHunk,
  onDiscardHunk,
  stageLabel,
  stageTitle,
  unstageLabel,
  unstageTitle,
  discardLabel,
  discardTitle,
}: RowComponentProps<DiffRowExtraProps>) => {
  const item = items[index];
  if (!item) return <div style={style} {...ariaAttributes} />;

  if (item.kind === 'hunk') {
    const { hunk, hunkKey } = item;
    const isHunkBusy = busyHunkKey === hunkKey;
    return (
      <div style={style} {...ariaAttributes} className="diff-hunk-header virtual-hunk-header">
        <span className="hunk-info">
          @@ -{hunk.old_start},{hunk.old_lines} +{hunk.new_start},{hunk.new_lines} @@
        </span>
        {showActions && (isStaged || !isUntracked) && (
          <div className="hunk-actions">
            {isStaged ? (
              <button
                className="hunk-action-btn"
                disabled={isHunkBusy}
                onClick={(e) => {
                  e.stopPropagation();
                  onUnstageHunk?.(hunk);
                }}
                title={unstageTitle}
              >
                {unstageLabel}
              </button>
            ) : (
              <>
                <button
                  className="hunk-action-btn stage"
                  disabled={isHunkBusy}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStageHunk?.(hunk);
                  }}
                  title={stageTitle}
                >
                  {stageLabel}
                </button>
                <button
                  className="hunk-action-btn discard"
                  disabled={isHunkBusy}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDiscardHunk?.(hunk);
                  }}
                  title={discardTitle}
                >
                  {discardLabel}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  const { line } = item;
  return (
    <div
      style={style}
      {...ariaAttributes}
      className={`diff-line virtual-diff-line ${line.line_type}`}
    >
      <span className="line-number old">{line.old_line_no ?? ''}</span>
      <span className="line-number new">{line.new_line_no ?? ''}</span>
      <span className="line-prefix">{getLinePrefix(line.line_type)}</span>
      <span className="line-content">{line.content}</span>
    </div>
  );
};

export const VirtualDiffViewer: FC<VirtualDiffViewerProps> = memo(
  ({
    diffInfo,
    filePath,
    statusLabel,
    isStaged = false,
    isUntracked = false,
    busyHunkKey = null,
    getHunkKey = defaultGetHunkKey,
    onStageHunk,
    onUnstageHunk,
    onDiscardHunk,
  }) => {
    const { t } = useTranslation();
    const showActions = Boolean(onStageHunk || onUnstageHunk || onDiscardHunk);

    const flatItems = useMemo<FlatDiffItem[]>(() => {
      const items: FlatDiffItem[] = [];
      for (let hunkIndex = 0; hunkIndex < diffInfo.hunks.length; hunkIndex++) {
        const hunk = diffInfo.hunks[hunkIndex];
        items.push({
          kind: 'hunk',
          hunk,
          hunkIndex,
          hunkKey: getHunkKey(hunk),
        });
        for (let lineIndex = 0; lineIndex < hunk.lines.length; lineIndex++) {
          items.push({
            kind: 'line',
            line: hunk.lines[lineIndex],
            hunkIndex,
            lineIndex,
          });
        }
      }
      return items;
    }, [diffInfo.hunks, getHunkKey]);

    const shouldVirtualize = flatItems.length >= VIRTUALIZE_DIFF_THRESHOLD;

    const getRowHeight = useCallback(
      (index: number) =>
        flatItems[index]?.kind === 'hunk' ? HUNK_HEADER_HEIGHT : DIFF_LINE_HEIGHT,
      [flatItems]
    );

    const stageLabel = t('localChanges.stage');
    const stageTitle = t('localChanges.stageHunk');
    const unstageLabel = t('localChanges.unstage');
    const unstageTitle = t('localChanges.unstageHunk');
    const discardLabel = t('localChanges.discard');
    const discardTitle = t('localChanges.discardHunk');

    const rowProps = useMemo<DiffRowExtraProps>(
      () => ({
        items: flatItems,
        showActions,
        isStaged,
        isUntracked,
        busyHunkKey,
        onStageHunk,
        onUnstageHunk,
        onDiscardHunk,
        stageLabel,
        stageTitle,
        unstageLabel,
        unstageTitle,
        discardLabel,
        discardTitle,
      }),
      [
        flatItems,
        showActions,
        isStaged,
        isUntracked,
        busyHunkKey,
        onStageHunk,
        onUnstageHunk,
        onDiscardHunk,
        stageLabel,
        stageTitle,
        unstageLabel,
        unstageTitle,
        discardLabel,
        discardTitle,
      ]
    );

    const sizeText = formatBytes(diffInfo.file_size);

    return (
      <div className="diff-content">
        <div className="diff-file-header">
          <span className="diff-file-path">{filePath}</span>
          <span className="diff-file-status">{statusLabel}</span>
        </div>

        {diffInfo.is_truncated && (
          <div className="diff-truncated-banner">
            {diffInfo.hunks.length === 0
              ? t('diff.tooLarge', {
                  size: sizeText,
                  defaultValue: sizeText
                    ? `File is too large to render diff (${sizeText}).`
                    : 'File is too large to render diff.',
                })
              : t('diff.truncatedLines', {
                  size: sizeText,
                  defaultValue: sizeText
                    ? `Diff truncated at 10,000 lines for performance (${sizeText}).`
                    : 'Diff truncated at 10,000 lines for performance.',
                })}
          </div>
        )}

        {diffInfo.hunks.length === 0 ? null : shouldVirtualize ? (
          <div className="virtual-diff-container">
            <List<DiffRowExtraProps>
              className="diff-hunks virtual-diff-list"
              rowComponent={VirtualDiffRow}
              rowCount={flatItems.length}
              rowHeight={getRowHeight}
              rowProps={rowProps}
              overscanCount={15}
              style={{ height: '100%', width: '100%' }}
            />
          </div>
        ) : (
          <div className="diff-hunks">
            {diffInfo.hunks.map((hunk, hunkIndex) => {
              const hunkKey = getHunkKey(hunk);
              const isHunkBusy = busyHunkKey === hunkKey;
              return (
                <div key={`${hunkKey}-${hunkIndex}`} className="diff-hunk">
                  <div className="diff-hunk-header">
                    <span className="hunk-info">
                      @@ -{hunk.old_start},{hunk.old_lines} +{hunk.new_start},{hunk.new_lines} @@
                    </span>
                    {showActions && (isStaged || !isUntracked) && (
                      <div className="hunk-actions">
                        {isStaged ? (
                          <button
                            className="hunk-action-btn"
                            disabled={isHunkBusy}
                            onClick={(e) => {
                              e.stopPropagation();
                              onUnstageHunk?.(hunk);
                            }}
                            title={unstageTitle}
                          >
                            {unstageLabel}
                          </button>
                        ) : (
                          <>
                            <button
                              className="hunk-action-btn stage"
                              disabled={isHunkBusy}
                              onClick={(e) => {
                                e.stopPropagation();
                                onStageHunk?.(hunk);
                              }}
                              title={stageTitle}
                            >
                              {stageLabel}
                            </button>
                            <button
                              className="hunk-action-btn discard"
                              disabled={isHunkBusy}
                              onClick={(e) => {
                                e.stopPropagation();
                                onDiscardHunk?.(hunk);
                              }}
                              title={discardTitle}
                            >
                              {discardLabel}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="diff-lines">
                    {hunk.lines.map((line, lineIndex) => (
                      <div key={lineIndex} className={`diff-line ${line.line_type}`}>
                        <span className="line-number old">{line.old_line_no ?? ''}</span>
                        <span className="line-number new">{line.new_line_no ?? ''}</span>
                        <span className="line-prefix">{getLinePrefix(line.line_type)}</span>
                        <span className="line-content">{line.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);

VirtualDiffViewer.displayName = 'VirtualDiffViewer';
