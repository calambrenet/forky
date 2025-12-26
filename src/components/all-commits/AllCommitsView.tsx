import type { FC } from 'react';
import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import type { CommitGraphHandle } from '../commit-graph';
import { CommitGraph } from '../commit-graph';
import type { CommitInfo, BranchHead, FileStatus, DiffInfo } from '../../types/git';
import { Resizer } from '../resizer/Resizer';
import './AllCommitsView.css';

interface AllCommitsViewProps {
  repoPath: string;
  selectedCommitId?: string | null;
  onCommitSelect?: (commitId: string) => void;
}

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
    const detailContentRef = useRef<HTMLDivElement>(null);
    const graphRef = useRef<CommitGraphHandle>(null);

    // Derive selectedCommit from selectedCommitId
    const selectedCommit = useMemo(() => {
      if (!selectedCommitId) return null;
      return commits.find((c) => c.id === selectedCommitId) || null;
    }, [selectedCommitId, commits]);

    const loadCommits = useCallback(async (limit: number = 100) => {
      try {
        const result = await invoke<CommitInfo[]>('get_commits', { limit });
        setCommits(result);
        setHasMore(result.length >= limit);
      } catch (error) {
        console.error('Error loading commits:', error);
      }
    }, []);

    const loadBranchHeads = useCallback(async () => {
      try {
        const result = await invoke<BranchHead[]>('get_branch_heads');
        setBranchHeads(result);
      } catch (error) {
        console.error('Error loading branch heads:', error);
      }
    }, []);

    useEffect(() => {
      loadCommits();
      loadBranchHeads();
    }, [loadCommits, loadBranchHeads, repoPath]);

    const loadMore = useCallback(async () => {
      if (!hasMore) return;
      const newLimit = commits.length + 100;
      try {
        const result = await invoke<CommitInfo[]>('get_commits', { limit: newLimit });
        setCommits(result);
        setHasMore(result.length >= newLimit);
      } catch (error) {
        console.error('Error loading more commits:', error);
      }
    }, [commits.length, hasMore]);

    const loadCommitFiles = useCallback(async (commit: CommitInfo) => {
      setIsLoadingFiles(true);
      try {
        const files = await invoke<FileStatus[]>('get_commit_files', { commitId: commit.id });
        setCommitFiles(files);
      } catch (error) {
        console.error('Error loading commit files:', error);
        setCommitFiles([]);
      } finally {
        setIsLoadingFiles(false);
      }
    }, []);

    const loadDiff = useCallback(async (commit: CommitInfo, file: FileStatus) => {
      setIsLoadingDiff(true);
      try {
        const diff = await invoke<DiffInfo>('get_commit_diff', {
          commitId: commit.id,
          filePath: file.path,
        });
        setDiffInfo(diff);
      } catch (error) {
        console.error('Error loading diff:', error);
        setDiffInfo(null);
      } finally {
        setIsLoadingDiff(false);
      }
    }, []);

    const handleCommitClick = (commit: CommitInfo) => {
      onCommitSelect?.(commit.id);
      setSelectedFile(null);
      setDiffInfo(null);
      loadCommitFiles(commit);
    };

    // Load commit files when selectedCommit changes (from external navigation)
    useEffect(() => {
      if (selectedCommit) {
        loadCommitFiles(selectedCommit);
      }
    }, [selectedCommit?.id, loadCommitFiles]);

    // Scroll to commit when selectedCommitId changes externally
    useEffect(() => {
      if (selectedCommitId && graphRef.current) {
        graphRef.current.scrollToCommit(selectedCommitId);
      }
    }, [selectedCommitId]);

    const handleFileSelect = (file: FileStatus) => {
      setSelectedFile(file);
      if (selectedCommit) {
        loadDiff(selectedCommit, file);
      }
    };

    const getStatusIcon = (status: string) => {
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
    };

    const getFileName = (path: string) => path.split('/').pop() || path;
    const getFileDir = (path: string) => {
      const parts = path.split('/');
      parts.pop();
      return parts.length > 0 ? parts.join('/') + '/' : '';
    };

    // Resizing handlers
    const handleVerticalResizeStart = () => setIsResizingVertical(true);
    const handleHorizontalResizeStart = () => setIsResizingHorizontal(true);

    useEffect(() => {
      if (!isResizingVertical) return;

      const handleMouseMove = (e: MouseEvent) => {
        if (!containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const newHeight = containerRect.bottom - e.clientY;
        setDetailPanelHeight(Math.max(150, Math.min(500, newHeight)));
      };

      const handleMouseUp = () => setIsResizingVertical(false);

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }, [isResizingVertical]);

    useEffect(() => {
      if (!isResizingHorizontal) return;

      const handleMouseMove = (e: MouseEvent) => {
        if (!detailContentRef.current) return;
        const containerRect = detailContentRef.current.getBoundingClientRect();
        const relativeX = e.clientX - containerRect.left;
        setFilePanelWidth(Math.max(200, Math.min(400, relativeX)));
      };

      const handleMouseUp = () => setIsResizingHorizontal(false);

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }, [isResizingHorizontal]);

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

      if (!diffInfo || diffInfo.hunks.length === 0) {
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
        <div className="diff-content">
          <div className="diff-file-header">
            <span className="diff-file-path">{selectedFile.path}</span>
            <span className="diff-file-status">{getStatusIcon(selectedFile.status).label}</span>
          </div>
          <div className="diff-hunks">
            {diffInfo.hunks.map((hunk, hunkIndex) => (
              <div key={hunkIndex} className="diff-hunk">
                <div className="diff-hunk-header">
                  @@ -{hunk.old_start},{hunk.old_lines} +{hunk.new_start},{hunk.new_lines} @@
                </div>
                <div className="diff-lines">
                  {hunk.lines.map((line, lineIndex) => (
                    <div key={lineIndex} className={`diff-line ${line.line_type}`}>
                      <span className="line-number old">{line.old_line_no ?? ''}</span>
                      <span className="line-number new">{line.new_line_no ?? ''}</span>
                      <span className="line-prefix">
                        {line.line_type === 'add' ? '+' : line.line_type === 'delete' ? '-' : ' '}
                      </span>
                      <span className="line-content">{line.content}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    };

    return (
      <div className="all-commits-view" ref={containerRef}>
        <div
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

        <div className="detail-panel" style={{ height: detailPanelHeight }}>
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
                <div className="files-panel" style={{ width: filePanelWidth }}>
                  <div className="files-header">
                    <span className="files-title">{t('commits.changedFiles')}</span>
                    <span className="files-count">{commitFiles.length}</span>
                  </div>
                  <div className="files-list">
                    {isLoadingFiles ? (
                      <div className="files-loading">{t('commits.loadingFiles')}</div>
                    ) : commitFiles.length === 0 ? (
                      <div className="files-empty">{t('commits.noFilesChanged')}</div>
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
