import type { FC } from 'react';
import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import type {
  FileStatus,
  FileStatusSeparated,
  DiffInfo,
  CommitMessage,
  DiffHunk,
  HunkData,
} from '../../types/git';
import { Resizer } from '../resizer/Resizer';
import { CommitPanel } from '../commit-panel';
import { DiscardChangesModal, DiscardHunkModal } from '../git-modals';
import { useGitOperationStore, useRepositoryStore } from '../../stores';
import './LocalChangesView.css';

interface ImageContent {
  base64: string;
  mime_type: string;
  file_size: number;
}

interface ImageDiffState {
  oldImage: ImageContent | null;
  newImage: ImageContent | null;
  isLoading: boolean;
}

interface LocalChangesViewProps {
  repoPath: string;
  refreshKey?: number;
  onRefreshRepository?: () => void;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  file: FileStatus | null;
}

export const LocalChangesView: FC<LocalChangesViewProps> = memo(
  ({ repoPath, refreshKey, onRefreshRepository }) => {
    const { t } = useTranslation();
    // Git operation store
    const { startOperation, completeOperation, addLogEntry } = useGitOperationStore();
    const [unstaged, setUnstaged] = useState<FileStatus[]>([]);
    const [staged, setStaged] = useState<FileStatus[]>([]);
    const [selectedFile, setSelectedFile] = useState<FileStatus | null>(null);
    const [diffInfo, setDiffInfo] = useState<DiffInfo | null>(null);
    const [isLoadingDiff, setIsLoadingDiff] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(300);
    const [isResizing, setIsResizing] = useState(false);
    const [contextMenu, setContextMenu] = useState<ContextMenuState>({
      visible: false,
      x: 0,
      y: 0,
      file: null,
    });
    const [discardModal, setDiscardModal] = useState<{ isOpen: boolean; file: FileStatus | null }>({
      isOpen: false,
      file: null,
    });
    const [discardHunkModal, setDiscardHunkModal] = useState<{
      isOpen: boolean;
      hunk: DiffHunk | null;
    }>({
      isOpen: false,
      hunk: null,
    });
    const contextMenuRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Commit panel state
    const [lastCommitMessage, setLastCommitMessage] = useState<CommitMessage | null>(null);
    const [isCommitLoading, setIsCommitLoading] = useState(false);

    // Image diff state
    const [imageDiff, setImageDiff] = useState<ImageDiffState>({
      oldImage: null,
      newImage: null,
      isLoading: false,
    });

    // Hunk hover state
    const [hoveredHunkIndex, setHoveredHunkIndex] = useState<number | null>(null);

    // Get store actions for updating pending changes indicator and file statuses
    const { setTabHasPendingChanges, updateTabState } = useRepositoryStore.getState();

    const loadFileStatus = useCallback(async () => {
      try {
        const result = await invoke<FileStatusSeparated>('get_file_status_separated');
        setUnstaged(result.unstaged);
        setStaged(result.staged);

        // Update the store with file statuses and pending changes indicator
        const { activeTabId } = useRepositoryStore.getState();
        if (activeTabId) {
          const allFiles = [...result.unstaged, ...result.staged];
          const hasChanges = allFiles.length > 0;

          // Update fileStatuses in store (for sidebar counter)
          updateTabState(activeTabId, { fileStatuses: allFiles });
          setTabHasPendingChanges(activeTabId, hasChanges);
        }
      } catch (error) {
        console.error('Error loading file status:', error);
      }
    }, [setTabHasPendingChanges, updateTabState]);

    useEffect(() => {
      loadFileStatus();
    }, [loadFileStatus, repoPath, refreshKey]);

    const loadImageContent = useCallback(async (file: FileStatus) => {
      setImageDiff({ oldImage: null, newImage: null, isLoading: true });

      try {
        let oldImage: ImageContent | null = null;
        let newImage: ImageContent | null = null;

        // Determine what images to load based on file status
        if (file.status === 'untracked' || file.status === 'new') {
          // New file: only show new image
          newImage = await invoke<ImageContent>('get_image_content', { filePath: file.path });
        } else if (file.status === 'deleted') {
          // Deleted file: only show old image from HEAD
          oldImage = await invoke<ImageContent>('get_image_from_head', { filePath: file.path });
        } else if (file.status === 'modified') {
          // Modified file: show both old and new
          // For staged files, get old from HEAD, new from index
          // For unstaged files, get old from index (or HEAD if not staged), new from working dir
          if (file.staged) {
            try {
              oldImage = await invoke<ImageContent>('get_image_from_head', { filePath: file.path });
            } catch {
              // File might be new in this branch
            }
            newImage = await invoke<ImageContent>('get_image_from_index', { filePath: file.path });
          } else {
            try {
              oldImage = await invoke<ImageContent>('get_image_from_head', { filePath: file.path });
            } catch {
              // File might be new
            }
            newImage = await invoke<ImageContent>('get_image_content', { filePath: file.path });
          }
        }

        setImageDiff({ oldImage, newImage, isLoading: false });
      } catch (error) {
        console.error('Error loading image content:', error);
        setImageDiff({ oldImage: null, newImage: null, isLoading: false });
      }
    }, []);

    const loadDiff = useCallback(
      async (file: FileStatus) => {
        setIsLoadingDiff(true);
        try {
          const diff = await invoke<DiffInfo>('get_working_diff', {
            filePath: file.path,
            staged: file.staged,
            fileStatus: file.status,
          });
          setDiffInfo(diff);

          // If it's a binary image, also load the image content
          if (diff.is_binary && diff.binary_type === 'image') {
            loadImageContent(file);
          } else {
            setImageDiff({ oldImage: null, newImage: null, isLoading: false });
          }
        } catch (error) {
          console.error('Error loading diff:', error);
          setDiffInfo(null);
          setImageDiff({ oldImage: null, newImage: null, isLoading: false });
        } finally {
          setIsLoadingDiff(false);
        }
      },
      [loadImageContent]
    );

    const handleFileSelect = (file: FileStatus) => {
      setSelectedFile(file);
      loadDiff(file);
    };

    const handleStageFile = async (file: FileStatus) => {
      try {
        await invoke('stage_file', { filePath: file.path });
        await loadFileStatus();
        if (selectedFile?.path === file.path) {
          const newFile = { ...file, staged: true };
          setSelectedFile(newFile);
          loadDiff(newFile);
        }
      } catch (error) {
        console.error('Error staging file:', error);
      }
    };

    const handleUnstageFile = async (file: FileStatus) => {
      try {
        await invoke('unstage_file', { filePath: file.path });
        await loadFileStatus();
        if (selectedFile?.path === file.path) {
          const newFile = { ...file, staged: false };
          setSelectedFile(newFile);
          loadDiff(newFile);
        }
      } catch (error) {
        console.error('Error unstaging file:', error);
      }
    };

    const handleStageAll = async () => {
      try {
        for (const file of unstaged) {
          await invoke('stage_file', { filePath: file.path });
        }
        await loadFileStatus();
      } catch (error) {
        console.error('Error staging all files:', error);
      }
    };

    const handleUnstageAll = async () => {
      try {
        for (const file of staged) {
          await invoke('unstage_file', { filePath: file.path });
        }
        await loadFileStatus();
      } catch (error) {
        console.error('Error unstaging all files:', error);
      }
    };

    const handleDiscardChanges = (file: FileStatus) => {
      setDiscardModal({ isOpen: true, file });
    };

    const handleConfirmDiscard = async (file: FileStatus) => {
      const isUntracked = file.status === 'untracked' || file.status === 'new';

      try {
        await invoke('discard_file', {
          filePath: file.path,
          isUntracked,
        });

        // Refresh file status
        await loadFileStatus();

        // Clear selection if the discarded file was selected
        if (selectedFile?.path === file.path) {
          setSelectedFile(null);
          setDiffInfo(null);
        }
      } catch (error) {
        console.error('Error discarding changes:', error);
      }
    };

    // Convert DiffHunk to HunkData for backend
    const convertToHunkData = (hunk: DiffHunk): HunkData => ({
      old_start: hunk.old_start,
      old_lines: hunk.old_lines,
      new_start: hunk.new_start,
      new_lines: hunk.new_lines,
      lines: hunk.lines.map((line) => ({
        content: line.content,
        line_type: line.line_type,
      })),
    });

    // Hunk operation handlers
    const handleStageHunk = async (hunk: DiffHunk) => {
      if (!selectedFile) return;
      const filePath = selectedFile.path;
      const hunkData = convertToHunkData(hunk);

      try {
        await invoke('stage_hunk', {
          filePath,
          hunk: hunkData,
        });
        await loadFileStatus();
        // Reload the diff for the same file
        const updatedFile = { ...selectedFile, staged: false };
        setSelectedFile(updatedFile);
        loadDiff(updatedFile);
      } catch (error) {
        console.error('Error staging hunk:', error);
        alert(`Error staging hunk: ${error}`);
      }
    };

    const handleUnstageHunk = async (hunk: DiffHunk) => {
      if (!selectedFile) return;
      const filePath = selectedFile.path;
      const hunkData = convertToHunkData(hunk);

      try {
        await invoke('unstage_hunk', {
          filePath,
          hunk: hunkData,
        });
        await loadFileStatus();
        // Reload the diff for the same file
        const updatedFile = { ...selectedFile, staged: true };
        setSelectedFile(updatedFile);
        loadDiff(updatedFile);
      } catch (error) {
        console.error('Error unstaging hunk:', error);
        alert(`Error unstaging hunk: ${error}`);
      }
    };

    const handleDiscardHunk = (hunk: DiffHunk) => {
      setDiscardHunkModal({ isOpen: true, hunk });
    };

    const handleConfirmDiscardHunk = async (hunk: DiffHunk) => {
      if (!selectedFile) return;
      const filePath = selectedFile.path;
      const hunkData = convertToHunkData(hunk);

      try {
        await invoke('discard_hunk', {
          filePath,
          hunk: hunkData,
        });
        await loadFileStatus();
        // Reload the diff for the same file
        loadDiff(selectedFile);
      } catch (error) {
        console.error('Error discarding hunk:', error);
        alert(`Error discarding hunk: ${error}`);
      } finally {
        setDiscardHunkModal({ isOpen: false, hunk: null });
      }
    };

    const handleOpenFile = async (_file: FileStatus) => {
      // TODO: Open file in default editor
    };

    const handleShowInFolder = async (_file: FileStatus) => {
      // TODO: Show in file manager
    };

    // Commit handlers
    const handleAmendChange = useCallback(async (amend: boolean) => {
      if (amend) {
        try {
          const message = await invoke<CommitMessage>('get_last_commit_message');
          setLastCommitMessage(message);
        } catch (error) {
          console.error('Error loading last commit message:', error);
          setLastCommitMessage(null);
        }
      } else {
        setLastCommitMessage(null);
      }
    }, []);

    const handleCommit = useCallback(
      async (subject: string, description: string, amend: boolean) => {
        setIsCommitLoading(true);

        // Build the full commit message
        const fullMessage = description ? `${subject}\n\n${description}` : subject;
        const command = amend ? `git commit --amend -m "${subject}"` : `git commit -m "${subject}"`;

        startOperation('Commit', amend ? '(amend)' : undefined);

        try {
          const result = await invoke<{ success: boolean; message: string }>('git_commit', {
            message: fullMessage,
            amend,
          });

          completeOperation(result);
          addLogEntry(
            repoPath,
            'Commit',
            amend ? 'Amend Commit' : 'Commit',
            command,
            result.message,
            result.success
          );

          if (result.success) {
            // Refresh file status after successful commit
            await loadFileStatus();
            setSelectedFile(null);
            setDiffInfo(null);
            onRefreshRepository?.();
          }
        } catch (error) {
          const errorMessage = String(error);
          completeOperation({ success: false, message: errorMessage });
          addLogEntry(
            repoPath,
            'Commit',
            amend ? 'Amend Commit' : 'Commit',
            command,
            errorMessage,
            false
          );
        } finally {
          setIsCommitLoading(false);
        }
      },
      [
        loadFileStatus,
        startOperation,
        completeOperation,
        addLogEntry,
        onRefreshRepository,
        repoPath,
      ]
    );

    // Context menu handlers
    const handleContextMenu = (e: React.MouseEvent, file: FileStatus) => {
      e.preventDefault();
      setContextMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        file,
      });
    };

    const closeContextMenu = () => {
      setContextMenu({ visible: false, x: 0, y: 0, file: null });
    };

    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
          closeContextMenu();
        }
      };

      if (contextMenu.visible) {
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }
    }, [contextMenu.visible]);

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          closeContextMenu();
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    const getStatusIcon = (status: string) => {
      switch (status) {
        case 'new':
        case 'untracked':
          return { icon: 'A', color: 'var(--accent-green)', label: t('fileStatus.added') };
        case 'modified':
          return { icon: 'M', color: 'var(--accent-yellow)', label: t('fileStatus.modified') };
        case 'deleted':
          return { icon: 'D', color: 'var(--accent-red)', label: t('fileStatus.deleted') };
        case 'renamed':
          return { icon: 'R', color: 'var(--accent-blue)', label: t('fileStatus.renamed') };
        default:
          return { icon: '?', color: 'var(--text-secondary)', label: t('fileStatus.unknown') };
      }
    };

    const getFileName = (path: string) => path.split('/').pop() || path;
    const getFileDir = (path: string) => {
      const parts = path.split('/');
      parts.pop();
      return parts.length > 0 ? parts.join('/') + '/' : '';
    };

    const formatFileSize = (bytes: number | null) => {
      if (bytes === null) return '';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const handleResizeStart = () => setIsResizing(true);

    useEffect(() => {
      if (!isResizing) return;

      const handleMouseMove = (e: MouseEvent) => {
        if (!containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const relativeX = e.clientX - containerRect.left;
        const newWidth = Math.max(200, Math.min(500, relativeX));
        setSidebarWidth(newWidth);
      };

      const handleMouseUp = () => setIsResizing(false);

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
    }, [isResizing]);

    const renderFileList = (
      files: FileStatus[],
      title: string,
      isStaged: boolean,
      onAction: (file: FileStatus) => void,
      onActionAll: () => void
    ) => (
      <div className="file-panel">
        <div className="file-panel-header">
          <span className="panel-title">{title}</span>
          <span className="file-count">{files.length}</span>
          {files.length > 0 && (
            <button
              className="action-btn-small"
              onClick={onActionAll}
              title={isStaged ? t('localChanges.unstageAll') : t('localChanges.stageAll')}
            >
              {isStaged ? '−' : '+'}
            </button>
          )}
        </div>
        <div className="file-list">
          {files.length === 0 ? (
            <div className="empty-message">
              {isStaged ? t('localChanges.noStagedChanges') : t('localChanges.noUnstagedChanges')}
            </div>
          ) : (
            files.map((file) => {
              const { icon, color } = getStatusIcon(file.status);
              const isSelected =
                selectedFile?.path === file.path && selectedFile?.staged === file.staged;
              return (
                <div
                  key={`${file.path}-${file.staged}`}
                  className={`file-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleFileSelect(file)}
                  onContextMenu={(e) => handleContextMenu(e, file)}
                >
                  <span className="file-status-icon" style={{ color }}>
                    {icon}
                  </span>
                  <span className="file-info">
                    <span className="file-name">{getFileName(file.path)}</span>
                    <span className="file-dir">{getFileDir(file.path)}</span>
                  </span>
                  <button
                    className="action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAction(file);
                    }}
                    title={isStaged ? t('localChanges.unstage') : t('localChanges.stage')}
                  >
                    {isStaged ? '−' : '+'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    );

    const renderBinaryViewer = () => {
      if (!diffInfo || !selectedFile) return null;

      if (diffInfo.binary_type === 'image') {
        // Loading state
        if (imageDiff.isLoading) {
          return (
            <div className="binary-viewer image-viewer">
              <div className="binary-header">
                <span className="binary-icon">🖼️</span>
                <span className="binary-info">{t('common.loading')}</span>
              </div>
            </div>
          );
        }

        const { oldImage, newImage } = imageDiff;
        const hasOldImage = oldImage !== null;
        const hasNewImage = newImage !== null;
        const isSideBySide = hasOldImage && hasNewImage;

        // No images loaded
        if (!hasOldImage && !hasNewImage) {
          return (
            <div className="binary-viewer image-viewer">
              <div className="binary-header">
                <span className="binary-icon">🖼️</span>
                <span className="binary-info">{t('diff.imagePreview')}</span>
              </div>
              <div className="image-preview-empty">
                <span>{t('diff.noChanges')}</span>
              </div>
            </div>
          );
        }

        return (
          <div className="binary-viewer image-viewer">
            <div className="binary-header">
              <span className="binary-icon">🖼️</span>
              <span className="binary-info">
                {t('diff.imagePreview')}
                {newImage && ` • ${formatFileSize(newImage.file_size)}`}
                {!newImage && oldImage && ` • ${formatFileSize(oldImage.file_size)}`}
              </span>
            </div>
            <div className={`image-diff-container ${isSideBySide ? 'side-by-side' : 'single'}`}>
              {hasOldImage && (
                <div className="image-diff-panel old">
                  <div className="image-diff-label">
                    <span className="label-text">{t('diff.oldVersion')}</span>
                    <span className="label-size">{formatFileSize(oldImage.file_size)}</span>
                  </div>
                  <div className="image-preview">
                    <img
                      src={`data:${oldImage.mime_type};base64,${oldImage.base64}`}
                      alt={`Old: ${selectedFile.path}`}
                    />
                  </div>
                </div>
              )}
              {hasNewImage && (
                <div className="image-diff-panel new">
                  <div className="image-diff-label">
                    <span className="label-text">{t('diff.newVersion')}</span>
                    <span className="label-size">{formatFileSize(newImage.file_size)}</span>
                  </div>
                  <div className="image-preview">
                    <img
                      src={`data:${newImage.mime_type};base64,${newImage.base64}`}
                      alt={`New: ${selectedFile.path}`}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      }

      // For other binary files
      return (
        <div className="binary-viewer">
          <div className="binary-placeholder">
            <span className="binary-icon">📄</span>
            <span className="binary-type">{t('localChanges.binaryFile')}</span>
            <span className="binary-size">{formatFileSize(diffInfo.file_size)}</span>
            <span className="binary-note">{t('localChanges.cannotDisplayBinary')}</span>
          </div>
        </div>
      );
    };

    const renderDiffContent = () => {
      if (!selectedFile) {
        return (
          <div className="diff-empty">
            <span>{t('localChanges.selectFileToViewDiff')}</span>
          </div>
        );
      }

      if (isLoadingDiff) {
        return (
          <div className="diff-loading">
            <span>{t('common.loading')}</span>
          </div>
        );
      }

      // Handle binary files
      if (diffInfo?.is_binary) {
        return (
          <div className="diff-content">
            <div className="diff-file-header">
              <span className="diff-file-path">{selectedFile.path}</span>
              <span className="diff-file-status">{getStatusIcon(selectedFile.status).label}</span>
            </div>
            {renderBinaryViewer()}
          </div>
        );
      }

      // No diff info or empty hunks
      if (!diffInfo || diffInfo.hunks.length === 0) {
        const { label } = getStatusIcon(selectedFile.status);
        return (
          <div className="diff-empty">
            <span>No diff available - {label}</span>
          </div>
        );
      }

      const isStaged = selectedFile.staged;
      const isUntracked = selectedFile.status === 'untracked' || selectedFile.status === 'new';

      return (
        <div className="diff-content">
          <div className="diff-file-header">
            <span className="diff-file-path">{selectedFile.path}</span>
            <span className="diff-file-status">{getStatusIcon(selectedFile.status).label}</span>
          </div>
          <div className="diff-hunks">
            {diffInfo.hunks.map((hunk, hunkIndex) => (
              <div
                key={hunkIndex}
                className="diff-hunk"
                onMouseEnter={() => setHoveredHunkIndex(hunkIndex)}
                onMouseLeave={() => setHoveredHunkIndex(null)}
              >
                <div className="diff-hunk-header">
                  <span className="hunk-info">
                    @@ -{hunk.old_start},{hunk.old_lines} +{hunk.new_start},{hunk.new_lines} @@
                  </span>
                  {hoveredHunkIndex === hunkIndex && (
                    <div className="hunk-actions">
                      {isStaged ? (
                        // Staged file: only show Unstage button
                        <button
                          className="hunk-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnstageHunk(hunk);
                          }}
                          title={t('localChanges.unstageHunk')}
                        >
                          {t('localChanges.unstage')}
                        </button>
                      ) : (
                        // Unstaged file: show Stage and Discard buttons
                        <>
                          <button
                            className="hunk-action-btn stage"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStageHunk(hunk);
                            }}
                            title={t('localChanges.stageHunk')}
                          >
                            {t('localChanges.stage')}
                          </button>
                          {!isUntracked && (
                            <button
                              className="hunk-action-btn discard"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDiscardHunk(hunk);
                              }}
                              title={t('localChanges.discardHunk')}
                            >
                              {t('localChanges.discard')}
                            </button>
                          )}
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

    const renderContextMenu = () => {
      if (!contextMenu.visible || !contextMenu.file) return null;

      const file = contextMenu.file;
      const isStaged = file.staged;

      return (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <div
            className="context-menu-item"
            onClick={() => {
              handleOpenFile(file);
              closeContextMenu();
            }}
          >
            <span className="context-menu-label">{t('contextMenu.openFile')}</span>
            <span className="context-menu-shortcut">Enter</span>
          </div>
          <div
            className="context-menu-item"
            onClick={() => {
              handleShowInFolder(file);
              closeContextMenu();
            }}
          >
            <span className="context-menu-label">{t('contextMenu.openInExplorer')}</span>
            <span className="context-menu-shortcut">⌘⇧R</span>
          </div>
          <div className="context-menu-separator" />
          {isStaged ? (
            <div
              className="context-menu-item"
              onClick={() => {
                handleUnstageFile(file);
                closeContextMenu();
              }}
            >
              <span className="context-menu-label">{t('contextMenu.unstageFile')}</span>
              <span className="context-menu-shortcut">⌘U</span>
            </div>
          ) : (
            <div
              className="context-menu-item"
              onClick={() => {
                handleStageFile(file);
                closeContextMenu();
              }}
            >
              <span className="context-menu-label">{t('contextMenu.stageFile')}</span>
              <span className="context-menu-shortcut">⌘S</span>
            </div>
          )}
          {!isStaged && (
            <div
              className="context-menu-item danger"
              onClick={() => {
                handleDiscardChanges(file);
                closeContextMenu();
              }}
            >
              <span className="context-menu-label">{t('contextMenu.discardChanges')}</span>
              <span className="context-menu-shortcut">⌘⌫</span>
            </div>
          )}
          <div className="context-menu-separator" />
          <div
            className="context-menu-item"
            onClick={() => {
              handleStageAll();
              closeContextMenu();
            }}
          >
            <span className="context-menu-label">{t('localChanges.stageAll')}</span>
            <span className="context-menu-shortcut">⌘⇧S</span>
          </div>
        </div>
      );
    };

    return (
      <div className="local-changes-view" ref={containerRef}>
        <div className="changes-sidebar" style={{ width: sidebarWidth }}>
          {renderFileList(
            unstaged,
            t('localChanges.unstaged'),
            false,
            handleStageFile,
            handleStageAll
          )}
          {renderFileList(
            staged,
            t('localChanges.staged'),
            true,
            handleUnstageFile,
            handleUnstageAll
          )}
        </div>
        <Resizer direction="horizontal" onMouseDown={handleResizeStart} isResizing={isResizing} />
        <div className="diff-panel">
          {renderDiffContent()}
          {staged.length > 0 && (
            <CommitPanel
              stagedCount={staged.length}
              onCommit={handleCommit}
              isLoading={isCommitLoading}
              lastCommitMessage={lastCommitMessage}
              onAmendChange={handleAmendChange}
            />
          )}
        </div>
        {renderContextMenu()}
        <DiscardChangesModal
          isOpen={discardModal.isOpen}
          onClose={() => setDiscardModal({ isOpen: false, file: null })}
          onConfirm={handleConfirmDiscard}
          file={discardModal.file}
        />
        <DiscardHunkModal
          isOpen={discardHunkModal.isOpen}
          onClose={() => setDiscardHunkModal({ isOpen: false, hunk: null })}
          onConfirm={handleConfirmDiscardHunk}
          hunk={discardHunkModal.hunk}
          filePath={selectedFile?.path}
        />
      </div>
    );
  }
);
