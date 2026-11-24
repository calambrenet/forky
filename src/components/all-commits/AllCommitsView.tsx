import type { FC } from 'react';
import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { List, type RowComponentProps } from 'react-window';
import type { CommitGraphHandle } from '../commit-graph';
import { CommitGraph } from '../commit-graph';
import type { CommitInfo, BranchHead, FileStatus, DiffInfo } from '../../types/git';
import { Resizer } from '../resizer/Resizer';
import { VirtualDiffViewer } from '../virtual-diff/VirtualDiffViewer';
import './AllCommitsView.css';

const COMMITS_PAGE_SIZE = 100;
const VIRTUALIZE_FILES_THRESHOLD = 100;
const FILE_ITEM_HEIGHT = 42;

interface AllCommitsViewProps {
  repoPath: string;
  selectedCommitId?: string | null;
  onCommitSelect?: (commitId: string) => void;
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'new':
    case 'added':
      return { icon: 'A', color: 'var(--accent-green)', label: 'Added' };
    case 'modified':
      return { icon: 'M', color: 'var(--accent-yellow)', label: 'Modified' };
    case 'deleted':
      return { icon: 'D', color: 'var(--accent-red)', label: 'Deleted' };
    case 'renamed':
      return { icon: 'R', color: 'var(--accent-blue)', label: 'Renamed' };
    default:
      return { icon: '?', color: 'var(--text-secondary)', label: 'Unknown' };
  }
}

function getFileName(path: string) {
  return path.split('/').pop() || path;
}

function getFileDir(path: string) {
  const parts = path.split('/');
  parts.pop();
  return parts.length > 0 ? parts.join('/') + '/' : '';
}

interface CommitFileRowExtraProps {
  files: FileStatus[];
  selectedPath: string | null;
  onSelect: (file: FileStatus) => void;
}

const VirtualCommitFileRow = ({
  index,
  style,
  ariaAttributes,
  files,
  selectedPath,
  onSelect,
}: RowComponentProps<CommitFileRowExtraProps>) => {
  const file = files[index];
  if (!file) return <div style={style} {...ariaAttributes} />;
  const { icon, color } = getStatusIcon(file.status);
  const isSelected = selectedPath === file.path;

  return (
    <div
      style={{ ...style, boxSizing: 'border-box' }}
      {...ariaAttributes}
      className={`file-item ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(file)}
    >
      <span className="file-status-icon" style={{ color }}>
        {icon}
      </span>
      <span className="file-info">
        <span className="file-name">{getFileName(file.path)}</span>
        <span className="file-dir">{getFileDir(file.path)}</span>
      </span>
    </div>
  );
};

export const AllCommitsView: FC<AllCommitsViewProps> = memo(
  ({ repoPath, selectedCommitId, onCommitSelect }) => {
    const { t } = useTranslation();
    const [commits, setCommits] = useState<CommitInfo[]>([]);
    const [branchHeads, setBranchHeads] = useState<BranchHead[]>([]);
    const [commitFiles, setCommitFiles] = useState<FileStatus[]>([]);
    const [selectedFile, setSelectedFile] = useState<FileStatus | null>(null);
    const [diffInfo, setDiffInfo] = useState<DiffInfo | null>(null);
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);
    const [isLoadingDiff, setIsLoadingDiff] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [detailPanelHeight, setDetailPanelHeight] = useState(300);
    const [filePanelWidth, setFilePanelWidth] = useState(250);
    const [isResizingVertical, setIsResizingVertical] = useState(false);
    const [isResizingHorizontal, setIsResizingHorizontal] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const graphPanelRef = useRef<HTMLDivElement>(null);
    const detailPanelRef = useRef<HTMLDivElement>(null);
    const detailContentRef = useRef<HTMLDivElement>(null);
    const filesPanelRef = useRef<HTMLDivElement>(null);
    const graphRef = useRef<CommitGraphHandle>(null);
    const commitsReqIdRef = useRef(0);
    const isLoadingMoreRef = useRef(false);
    const branchHeadsReqIdRef = useRef(0);
    const filesReqIdRef = useRef(0);
    const diffReqIdRef = useRef(0);

    // Derive selectedCommit from selectedCommitId
    const selectedCommit = useMemo(() => {
      if (!selectedCommitId) return null;
      return commits.find((c) => c.id === selectedCommitId) || null;
    }, [selectedCommitId, commits]);

    const loadCommits = useCallback(async () => {
      const reqId = ++commitsReqIdRef.current;
      isLoadingMoreRef.current = false;
      try {
        const result = await invoke<CommitInfo[]>('get_commits', {
          repoPath,
          limit: COMMITS_PAGE_SIZE,
          offset: 0,
        });
        if (reqId !== commitsReqIdRef.current) return;
        setCommits(result);
        setHasMore(result.length === COMMITS_PAGE_SIZE);
      } catch (error) {
        if (reqId !== commitsReqIdRef.current) return;
        console.error('Error loading commits:', error);
        setCommits([]);
        setHasMore(false);
      }
    }, [repoPath]);

    const loadBranchHeads = useCallback(async () => {
      const reqId = ++branchHeadsReqIdRef.current;
      try {
        const result = await invoke<BranchHead[]>('get_branch_heads', { repoPath });
        if (reqId !== branchHeadsReqIdRef.current) return;
        setBranchHeads(result);
      } catch (error) {
        if (reqId !== branchHeadsReqIdRef.current) return;
        console.error('Error loading branch heads:', error);
        setBranchHeads([]);
      }
    }, [repoPath]);

    useEffect(() => {
      // Clear stale view state when switching repositories
      filesReqIdRef.current += 1;
      diffReqIdRef.current += 1;
      setCommits([]);
      setBranchHeads([]);
      setCommitFiles([]);
      setSelectedFile(null);
      setDiffInfo(null);
      setIsLoadingFiles(false);
      setIsLoadingDiff(false);
      void loadCommits();
      void loadBranchHeads();
    }, [loadCommits, loadBranchHeads, repoPath]);

    // Incremental pagination: fetch only the next page using offset instead of re-fetching 0..N
    const loadMore = useCallback(async () => {
      if (!hasMore || isLoadingMoreRef.current) return;
      isLoadingMoreRef.current = true;
      const offset = commits.length;
      const reqId = ++commitsReqIdRef.current;
      try {
        const page = await invoke<CommitInfo[]>('get_commits', {
          repoPath,
          limit: COMMITS_PAGE_SIZE,
          offset,
        });
        if (reqId !== commitsReqIdRef.current) return;
        setCommits((prev) => {
          const existingIds = new Set(prev.map((c) => c.id));
          const uniqueNew = page.filter((c) => !existingIds.has(c.id));
          return uniqueNew.length > 0 ? [...prev, ...uniqueNew] : prev;
        });
        setHasMore(page.length === COMMITS_PAGE_SIZE);
      } catch (error) {
        if (reqId !== commitsReqIdRef.current) return;
        console.error('Error loading more commits:', error);
      } finally {
        if (reqId === commitsReqIdRef.current) {
          isLoadingMoreRef.current = false;
        }
      }
    }, [commits.length, hasMore, repoPath]);

    const loadCommitFiles = useCallback(
      async (commit: CommitInfo) => {
        const reqId = ++filesReqIdRef.current;
        setIsLoadingFiles(true);
        try {
          const files = await invoke<FileStatus[]>('get_commit_files', {
            repoPath,
            commitId: commit.id,
          });
          if (reqId !== filesReqIdRef.current) return;
          setCommitFiles(files);
        } catch (error) {
          if (reqId !== filesReqIdRef.current) return;
          console.error('Error loading commit files:', error);
          setCommitFiles([]);
        } finally {
          if (reqId === filesReqIdRef.current) {
            setIsLoadingFiles(false);
          }
        }
      },
      [repoPath]
    );

    const loadDiff = useCallback(
      async (commit: CommitInfo, file: FileStatus) => {
        const reqId = ++diffReqIdRef.current;
        setIsLoadingDiff(true);
        try {
          const diff = await invoke<DiffInfo>('get_commit_diff', {
            repoPath,
            commitId: commit.id,
            filePath: file.path,
          });
          if (reqId !== diffReqIdRef.current) return;
          setDiffInfo(diff);
        } catch (error) {
          if (reqId !== diffReqIdRef.current) return;
          console.error('Error loading diff:', error);
          setDiffInfo(null);
        } finally {
          if (reqId === diffReqIdRef.current) {
            setIsLoadingDiff(false);
          }
        }
      },
      [repoPath]
    );

    const handleCommitClick = useCallback(
      (commit: CommitInfo) => {
        onCommitSelect?.(commit.id);
      },
      [onCommitSelect]
    );

    // Single source of truth for loading commit files & resetting file/diff selection
    useEffect(() => {
      diffReqIdRef.current += 1;
      setSelectedFile(null);
      setDiffInfo(null);
      setIsLoadingDiff(false);

      if (selectedCommit) {
        void loadCommitFiles(selectedCommit);
      } else {
        filesReqIdRef.current += 1;
        setCommitFiles([]);
        setIsLoadingFiles(false);
      }
    }, [selectedCommit, loadCommitFiles]);

    // Scroll to commit when selectedCommitId changes or commits finish loading
    useEffect(() => {
      if (selectedCommitId && commits.length > 0 && graphRef.current) {
        graphRef.current.scrollToCommit(selectedCommitId);
      }
    }, [selectedCommitId, commits.length]);

    const handleFileSelect = useCallback(
      (file: FileStatus) => {
        setSelectedFile(file);
        if (selectedCommit) {
          void loadDiff(selectedCommit, file);
        }
      },
      [selectedCommit, loadDiff]
    );

    // Resizing handlers (rAF DOM updates during drag; commit React state once on mouseup)
    const handleVerticalResizeStart = useCallback(() => setIsResizingVertical(true), []);
    const handleHorizontalResizeStart = useCallback(() => setIsResizingHorizontal(true), []);

    useEffect(() => {
      if (!isResizingVertical) return;

      let pendingHeight: number | null = null;
      let rafId: number | null = null;

      const handleMouseMove = (e: MouseEvent) => {
        if (!containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const newHeight = Math.max(150, Math.min(500, containerRect.bottom - e.clientY));
        pendingHeight = newHeight;
        if (rafId === null) {
          rafId = requestAnimationFrame(() => {
            rafId = null;
            if (pendingHeight !== null) {
              if (detailPanelRef.current) {
                detailPanelRef.current.style.height = `${pendingHeight}px`;
              }
              if (graphPanelRef.current) {
                graphPanelRef.current.style.height = `calc(100% - ${pendingHeight}px - 4px)`;
              }
            }
          });
        }
      };

      const handleMouseUp = () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        if (pendingHeight !== null) {
          setDetailPanelHeight(pendingHeight);
        }
        setIsResizingVertical(false);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        if (rafId !== null) cancelAnimationFrame(rafId);
      };
    }, [isResizingVertical]);

    useEffect(() => {
      if (!isResizingHorizontal) return;

      let pendingWidth: number | null = null;
      let rafId: number | null = null;

      const handleMouseMove = (e: MouseEvent) => {
        if (!detailContentRef.current) return;
        const containerRect = detailContentRef.current.getBoundingClientRect();
        const relativeX = e.clientX - containerRect.left;
        const newWidth = Math.max(200, Math.min(400, relativeX));
        pendingWidth = newWidth;
        if (rafId === null) {
          rafId = requestAnimationFrame(() => {
            rafId = null;
            if (filesPanelRef.current && pendingWidth !== null) {
              filesPanelRef.current.style.width = `${pendingWidth}px`;
            }
          });
        }
      };

      const handleMouseUp = () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        if (pendingWidth !== null) {
          setFilePanelWidth(pendingWidth);
        }
        setIsResizingHorizontal(false);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        if (rafId !== null) cancelAnimationFrame(rafId);
      };
    }, [isResizingHorizontal]);

    const fileRowProps = useMemo<CommitFileRowExtraProps>(
      () => ({
        files: commitFiles,
        selectedPath: selectedFile?.path ?? null,
        onSelect: handleFileSelect,
      }),
      [commitFiles, selectedFile?.path, handleFileSelect]
    );

    const renderDiffContent = () => {
      if (!selectedFile) {
        return (
          <div className="diff-empty">
            <span>{t('commits.selectFileToViewChanges')}</span>
          </div>
        );
      }

      if (isLoadingDiff) {
        return (
          <div className="diff-loading">
            <span>{t('commits.loadingDiff')}</span>
          </div>
        );
      }

      if (!diffInfo || (diffInfo.hunks.length === 0 && !diffInfo.is_truncated)) {
        const { label } = getStatusIcon(selectedFile.status);
        return (
          <div className="diff-empty">
            <span>
              {t('commits.noDiffAvailable')} - {label}
            </span>
          </div>
        );
      }

      return (
        <VirtualDiffViewer
          diffInfo={diffInfo}
          filePath={selectedFile.path}
          statusLabel={getStatusIcon(selectedFile.status).label}
        />
      );
    };

    return (
      <div className="all-commits-view" ref={containerRef}>
        <div
          ref={graphPanelRef}
          className="graph-panel"
          style={{ height: `calc(100% - ${detailPanelHeight}px - 4px)` }}
        >
          {commits.length > 0 ? (
            <CommitGraph
              ref={graphRef}
              commits={commits}
              branchHeads={branchHeads}
              selectedCommitId={selectedCommitId}
              onCommitClick={handleCommitClick}
            />
          ) : (
            <div className="graph-empty">
              <span>{t('commits.noCommits')}</span>
            </div>
          )}
          {hasMore && (
            <div className="load-more-container">
              <button className="load-more-btn" onClick={loadMore}>
                {t('commits.loadMore')}
              </button>
            </div>
          )}
        </div>

        <Resizer
          direction="vertical"
          onMouseDown={handleVerticalResizeStart}
          isResizing={isResizingVertical}
        />

        <div ref={detailPanelRef} className="detail-panel" style={{ height: detailPanelHeight }}>
          {selectedCommit ? (
            <>
              <div className="commit-info-header">
                <div className="commit-message">{selectedCommit.message}</div>
                <div className="commit-meta">
                  <span className="commit-author">{selectedCommit.author}</span>
                  <span className="commit-date">{selectedCommit.date}</span>
                  <span className="commit-sha">{selectedCommit.short_id}</span>
                </div>
              </div>
              <div className="detail-content" ref={detailContentRef}>
                <div ref={filesPanelRef} className="files-panel" style={{ width: filePanelWidth }}>
                  <div className="files-header">
                    <span className="files-title">{t('commits.changedFiles')}</span>
                    <span className="files-count">{commitFiles.length}</span>
                  </div>
                  <div className="files-list">
                    {isLoadingFiles ? (
                      <div className="files-loading">{t('commits.loadingFiles')}</div>
                    ) : commitFiles.length === 0 ? (
                      <div className="files-empty">{t('commits.noFilesChanged')}</div>
                    ) : commitFiles.length > VIRTUALIZE_FILES_THRESHOLD ? (
                      <List<CommitFileRowExtraProps>
                        rowComponent={VirtualCommitFileRow}
                        rowCount={commitFiles.length}
                        rowHeight={FILE_ITEM_HEIGHT}
                        rowProps={fileRowProps}
                        overscanCount={10}
                        style={{ height: '100%', width: '100%' }}
                      />
                    ) : (
                      commitFiles.map((file) => {
                        const { icon, color } = getStatusIcon(file.status);
                        const isSelected = selectedFile?.path === file.path;
                        return (
                          <div
                            key={file.path}
                            className={`file-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleFileSelect(file)}
                          >
                            <span className="file-status-icon" style={{ color }}>
                              {icon}
                            </span>
                            <span className="file-info">
                              <span className="file-name">{getFileName(file.path)}</span>
                              <span className="file-dir">{getFileDir(file.path)}</span>
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <Resizer
                  direction="horizontal"
                  onMouseDown={handleHorizontalResizeStart}
                  isResizing={isResizingHorizontal}
                />

                <div className="diff-panel">{renderDiffContent()}</div>
              </div>
            </>
          ) : (
            <div className="no-commit-selected">
              <span>{t('commits.selectCommitToViewDetails')}</span>
            </div>
          )}
        </div>
      </div>
    );
  }
);
