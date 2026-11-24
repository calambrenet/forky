import type { FC } from 'react';
import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { List, type RowComponentProps } from 'react-window';
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
import { VirtualDiffViewer } from '../virtual-diff/VirtualDiffViewer';
import { DiscardChangesModal, DiscardHunkModal } from '../git-modals';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../modal';
import { AlertTriangle } from 'lucide-react';
import {
  useGitOperationStore,
  useRepositoryStore,
  useActiveTabUnstaged,
  useActiveTabStaged,
} from '../../stores';
import { useUIStore } from '../../stores/uiStore';
import './LocalChangesView.css';

const VIRTUALIZE_FILES_THRESHOLD = 100;
const FILE_ITEM_HEIGHT = 42;

interface LocalFileRowExtraProps {
  files: FileStatus[];
  isStaged: boolean;
  selectedFile: FileStatus | null;
  getStatusIcon: (status: string) => { icon: string; color: string; label: string };
  getFileName: (path: string) => string;
  getFileDir: (path: string) => string;
  onSelect: (file: FileStatus) => void;
  onContextMenu: (e: React.MouseEvent, file: FileStatus) => void;
  onAction: (file: FileStatus) => void;
  actionTitle: string;
}

const VirtualLocalFileRow = ({
  index,
  style,
  ariaAttributes,
  files,
  isStaged,
  selectedFile,
  getStatusIcon,
  getFileName,
  getFileDir,
  onSelect,
  onContextMenu,
  onAction,
  actionTitle,
}: RowComponentProps<LocalFileRowExtraProps>) => {
  const file = files[index];
  if (!file) return <div style={style} {...ariaAttributes} />;

  const { icon, color } = getStatusIcon(file.status);
  const isSelected = selectedFile?.path === file.path && selectedFile?.staged === file.staged;

  return (
    <div
      style={{ ...style, boxSizing: 'border-box' }}
      {...ariaAttributes}
      className={`file-item ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(file)}
      onContextMenu={(e) => onContextMenu(e, file)}
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
        title={actionTitle}
      >
        {isStaged ? '−' : '+'}
      </button>
    </div>
  );
};

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
    // Atomic store selectors (read unstaged/staged directly from repositoryStore snapshot)
    const startOperation = useGitOperationStore((s) => s.startOperation);
    const completeOperation = useGitOperationStore((s) => s.completeOperation);
    const addLogEntry = useGitOperationStore((s) => s.addLogEntry);
    const unstaged = useActiveTabUnstaged();
    const staged = useActiveTabStaged();
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
    const changesSidebarRef = useRef<HTMLDivElement>(null);

    // Commit panel state
    const [lastCommitMessage, setLastCommitMessage] = useState<CommitMessage | null>(null);
    const [isCommitLoading, setIsCommitLoading] = useState(false);

    // Missing Git identity confirmation modal
    const [missingIdentityOpen, setMissingIdentityOpen] = useState(false);
    const openSettings = useUIStore((state) => state.openSettings);

    // Image diff state
    const [imageDiff, setImageDiff] = useState<ImageDiffState>({
      oldImage: null,
      newImage: null,
      isLoading: false,
    });

    // Hunk in-flight state (hover is handled purely via CSS in VirtualDiffViewer.css)
    const [busyHunkKey, setBusyHunkKey] = useState<string | null>(null);

    const diffReqIdRef = useRef(0);
    const imageReqIdRef = useRef(0);
    const prevRefreshKeyRef = useRef(refreshKey);

    const loadFileStatus = useCallback(async (): Promise<FileStatusSeparated | null> => {
      const state = useRepositoryStore.getState();
      const matchingTab = state.tabs.find((t) => t.path === repoPath);
      if (matchingTab) {
        return state.refreshTabStatus(matchingTab.id);
      }
      try {
        return await invoke<FileStatusSeparated>('get_file_status_separated', { repoPath });
      } catch (error) {
        console.error('Error loading file status:', error);
        return null;
      }
    }, [repoPath]);

    useEffect(() => {
      // Reset view state on repository switch so previous repo's diff/file never leaks
      diffReqIdRef.current += 1;
      imageReqIdRef.current += 1;
      setSelectedFile(null);
      setDiffInfo(null);
      setImageDiff({ oldImage: null, newImage: null, isLoading: false });
      setLastCommitMessage(null);
      setIsLoadingDiff(false);
    }, [repoPath]);

    const loadImageContent = useCallback(
      async (file: FileStatus) => {
        const reqId = ++imageReqIdRef.current;
        setImageDiff({ oldImage: null, newImage: null, isLoading: true });

        try {
          let oldImage: ImageContent | null = null;
          let newImage: ImageContent | null = null;

          if (file.status === 'untracked' || file.status === 'new') {
            newImage = await invoke<ImageContent>('get_image_content', {
              repoPath,
              filePath: file.path,
            });
          } else if (file.status === 'deleted') {
            oldImage = await invoke<ImageContent>('get_image_from_head', {
              repoPath,
              filePath: file.path,
            });
          } else if (file.status === 'modified') {
            if (file.staged) {
              try {
                oldImage = await invoke<ImageContent>('get_image_from_head', {
                  repoPath,
                  filePath: file.path,
                });
              } catch {
                // File might be new in this branch
              }
              newImage = await invoke<ImageContent>('get_image_from_index', {
                repoPath,
                filePath: file.path,
              });
            } else {
              // Unstaged modified file: compare against index first, falling back to HEAD
              try {
                oldImage = await invoke<ImageContent>('get_image_from_index', {
                  repoPath,
                  filePath: file.path,
                });
              } catch {
                try {
                  oldImage = await invoke<ImageContent>('get_image_from_head', {
                    repoPath,
                    filePath: file.path,
                  });
                } catch {
                  // File might be new
                }
              }
              newImage = await invoke<ImageContent>('get_image_content', {
                repoPath,
                filePath: file.path,
              });
            }
          }

          if (reqId !== imageReqIdRef.current) return;
          setImageDiff({ oldImage, newImage, isLoading: false });
        } catch (error) {
          if (reqId !== imageReqIdRef.current) return;
          console.error('Error loading image content:', error);
          setImageDiff({ oldImage: null, newImage: null, isLoading: false });
        }
      },
      [repoPath]
    );

    const loadDiff = useCallback(
      async (file: FileStatus) => {
        const reqId = ++diffReqIdRef.current;
        imageReqIdRef.current += 1; // Cancel any in-flight image load from previous selection
        setIsLoadingDiff(true);
        try {
          const diff = await invoke<DiffInfo>('get_working_diff', {
            repoPath,
            filePath: file.path,
            staged: file.staged,
            fileStatus: file.status,
          });
          if (reqId !== diffReqIdRef.current) return;
          setDiffInfo(diff);

          if (diff.is_binary && diff.binary_type === 'image') {
            void loadImageContent(file);
          } else {
            setImageDiff({ oldImage: null, newImage: null, isLoading: false });
          }
        } catch (error) {
          if (reqId !== diffReqIdRef.current) return;
          console.error('Error loading diff:', error);
          setDiffInfo(null);
          setImageDiff({ oldImage: null, newImage: null, isLoading: false });
        } finally {
          if (reqId === diffReqIdRef.current) {
            setIsLoadingDiff(false);
          }
        }
      },
      [repoPath, loadImageContent]
    );

    // Reconcile selectedFile against fresh unstaged/staged lists so we never leave an orphaned selection
    const reconcileSelection = useCallback(
      (
        fresh: FileStatusSeparated | null,
        preferredPath: string | undefined,
        preferredStaged: boolean
      ) => {
        if (!fresh || !preferredPath) return;
        const primaryList = preferredStaged ? fresh.staged : fresh.unstaged;
        const secondaryList = preferredStaged ? fresh.unstaged : fresh.staged;
        const match =
          primaryList.find((f) => f.path === preferredPath) ||
          secondaryList.find((f) => f.path === preferredPath) ||
          null;

        setSelectedFile(match);
        if (match) {
          void loadDiff(match);
        } else {
          diffReqIdRef.current += 1;
          imageReqIdRef.current += 1;
          setDiffInfo(null);
          setImageDiff({ oldImage: null, newImage: null, isLoading: false });
        }
      },
      [loadDiff]
    );

    // When an external Git operation bumps refreshKey, re-diff the active file if still present
    // without issuing a duplicate `get_file_status_separated` (the store snapshot is already updated).
    useEffect(() => {
      if (refreshKey === prevRefreshKeyRef.current) return;
      prevRefreshKeyRef.current = refreshKey;
      if (!selectedFile) return;

      const tabState = useRepositoryStore.getState().getActiveTabState();
      if (!tabState) return;
      reconcileSelection(
        { unstaged: tabState.unstaged, staged: tabState.staged },
        selectedFile.path,
        selectedFile.staged
      );
    }, [refreshKey, selectedFile, reconcileSelection]);

    const handleFileSelect = useCallback(
      (file: FileStatus) => {
        setSelectedFile(file);
        void loadDiff(file);
      },
      [loadDiff]
    );

    const handleStageFile = async (file: FileStatus) => {
      try {
        await invoke('stage_file', { repoPath, filePath: file.path });
        const fresh = await loadFileStatus();
        if (selectedFile?.path === file.path && selectedFile.staged === file.staged) {
          reconcileSelection(fresh, file.path, true);
        }
      } catch (error) {
        console.error('Error staging file:', error);
      }
    };

    const handleUnstageFile = async (file: FileStatus) => {
      try {
        await invoke('unstage_file', { repoPath, filePath: file.path });
        const fresh = await loadFileStatus();
        if (selectedFile?.path === file.path && selectedFile.staged === file.staged) {
          reconcileSelection(fresh, file.path, false);
        }
      } catch (error) {
        console.error('Error unstaging file:', error);
      }
    };

    const handleStageAll = async () => {
      if (unstaged.length === 0) return;
      try {
        await invoke('stage_files', {
          repoPath,
          filePaths: unstaged.map((f) => f.path),
        });
        const fresh = await loadFileStatus();
        if (selectedFile) {
          reconcileSelection(fresh, selectedFile.path, true);
        }
      } catch (error) {
        console.error('Error staging all files:', error);
      }
    };

    const handleUnstageAll = async () => {
      if (staged.length === 0) return;
      try {
        await invoke('unstage_files', {
          repoPath,
          filePaths: staged.map((f) => f.path),
        });
        const fresh = await loadFileStatus();
        if (selectedFile) {
          reconcileSelection(fresh, selectedFile.path, false);
        }
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
          repoPath,
          filePath: file.path,
          isUntracked,
        });

        const fresh = await loadFileStatus();

        if (selectedFile?.path === file.path && selectedFile.staged === file.staged) {
          reconcileSelection(fresh, file.path, file.staged);
        }
      } catch (error) {
        console.error('Error discarding changes:', error);
        useUIStore.getState().addAlert('error', t('alerts.gitError'), String(error));
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

    const getHunkKey = (hunk: DiffHunk) =>
      `${hunk.old_start}-${hunk.old_lines}-${hunk.new_start}-${hunk.new_lines}`;

    // Hunk operation handlers
    const handleStageHunk = async (hunk: DiffHunk) => {
      if (!selectedFile) return;
      const hunkKey = getHunkKey(hunk);
      if (busyHunkKey === hunkKey) return;

      setBusyHunkKey(hunkKey);
      const filePath = selectedFile.path;
      const hunkData = convertToHunkData(hunk);

      try {
        await invoke('stage_hunk', {
          repoPath,
          filePath,
          hunk: hunkData,
        });
        const fresh = await loadFileStatus();
        reconcileSelection(fresh, filePath, false);
      } catch (error) {
        console.error('Error staging hunk:', error);
        useUIStore.getState().addAlert('error', t('alerts.gitError'), String(error));
      } finally {
        setBusyHunkKey(null);
      }
    };

    const handleUnstageHunk = async (hunk: DiffHunk) => {
      if (!selectedFile) return;
      const hunkKey = getHunkKey(hunk);
      if (busyHunkKey === hunkKey) return;

      setBusyHunkKey(hunkKey);
      const filePath = selectedFile.path;
      const hunkData = convertToHunkData(hunk);

      try {
        await invoke('unstage_hunk', {
          repoPath,
          filePath,
          hunk: hunkData,
        });
        const fresh = await loadFileStatus();
        reconcileSelection(fresh, filePath, true);
      } catch (error) {
        console.error('Error unstaging hunk:', error);
        useUIStore.getState().addAlert('error', t('alerts.gitError'), String(error));
      } finally {
        setBusyHunkKey(null);
      }
    };

    const handleDiscardHunk = (hunk: DiffHunk) => {
      setDiscardHunkModal({ isOpen: true, hunk });
    };

    const handleConfirmDiscardHunk = async (hunk: DiffHunk) => {
      if (!selectedFile) return;
      const hunkKey = getHunkKey(hunk);
      if (busyHunkKey === hunkKey) return;

      setBusyHunkKey(hunkKey);
      const filePath = selectedFile.path;
      const hunkData = convertToHunkData(hunk);

      try {
        await invoke('discard_hunk', {
          repoPath,
          filePath,
          hunk: hunkData,
        });
        const fresh = await loadFileStatus();
        reconcileSelection(fresh, filePath, selectedFile.staged);
      } catch (error) {
        console.error('Error discarding hunk:', error);
        useUIStore.getState().addAlert('error', t('alerts.gitError'), String(error));
      } finally {
        setBusyHunkKey(null);
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
    const handleAmendChange = useCallback(
      async (amend: boolean) => {
        if (amend) {
          try {
            const message = await invoke<CommitMessage>('get_last_commit_message', { repoPath });
            setLastCommitMessage(message);
          } catch (error) {
            console.error('Error loading last commit message:', error);
            setLastCommitMessage(null);
          }
        } else {
          setLastCommitMessage(null);
        }
      },
      [repoPath]
    );

    const handleCommit = useCallback(
      async (subject: string, description: string, amend: boolean): Promise<boolean> => {
        setIsCommitLoading(true);
        await new Promise((r) => setTimeout(r, 0));

        const fullMessage = description ? `${subject}\n\n${description}` : subject;
        const command = amend ? `git commit --amend -m "${subject}"` : `git commit -m "${subject}"`;

        startOperation('Commit', amend ? '(amend)' : undefined);

        try {
          const result = await invoke<{
            success: boolean;
            message: string;
            error_type?: string;
          }>('git_commit', {
            repoPath,
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

          await loadFileStatus();
          onRefreshRepository?.();

          if (result.success) {
            setSelectedFile(null);
            setDiffInfo(null);
            return true;
          }

          if (result.error_type === 'missing_identity') {
            setMissingIdentityOpen(true);
          } else {
            useUIStore.getState().addAlert('error', t('alerts.gitError'), result.message);
          }
          return false;
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
          useUIStore.getState().addAlert('error', t('alerts.gitError'), errorMessage);
          await loadFileStatus();
          onRefreshRepository?.();
          return false;
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
        t,
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
        case 'conflicted':
          return { icon: '!', color: 'var(--accent-red)', label: t('fileStatus.conflicted') };
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

    const handleResizeStart = useCallback(() => setIsResizing(true), []);

    useEffect(() => {
      if (!isResizing) return;

      let pendingWidth: number | null = null;
      let rafId: number | null = null;

      const handleMouseMove = (e: MouseEvent) => {
        if (!containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const relativeX = e.clientX - containerRect.left;
        const newWidth = Math.max(200, Math.min(500, relativeX));
        pendingWidth = newWidth;
        if (rafId === null) {
          rafId = requestAnimationFrame(() => {
            rafId = null;
            if (changesSidebarRef.current && pendingWidth !== null) {
              changesSidebarRef.current.style.width = `${pendingWidth}px`;
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
          setSidebarWidth(pendingWidth);
        }
        setIsResizing(false);
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
    }, [isResizing]);

    const unstagedRowProps = useMemo<LocalFileRowExtraProps>(
      () => ({
        files: unstaged,
        isStaged: false,
        selectedFile,
        getStatusIcon,
        getFileName,
        getFileDir,
        onSelect: handleFileSelect,
        onContextMenu: handleContextMenu,
        onAction: handleStageFile,
        actionTitle: t('localChanges.stage'),
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [unstaged, selectedFile, handleFileSelect, t]
    );

    const stagedRowProps = useMemo<LocalFileRowExtraProps>(
      () => ({
        files: staged,
        isStaged: true,
        selectedFile,
        getStatusIcon,
        getFileName,
        getFileDir,
        onSelect: handleFileSelect,
        onContextMenu: handleContextMenu,
        onAction: handleUnstageFile,
        actionTitle: t('localChanges.unstage'),
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [staged, selectedFile, handleFileSelect, t]
    );

    const renderFileList = (
      files: FileStatus[],
      title: string,
      isStaged: boolean,
      onAction: (file: FileStatus) => void,
      onActionAll: () => void,
      virtualRowProps: LocalFileRowExtraProps
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
          ) : files.length > VIRTUALIZE_FILES_THRESHOLD ? (
            <List<LocalFileRowExtraProps>
              rowComponent={VirtualLocalFileRow}
              rowCount={files.length}
              rowHeight={FILE_ITEM_HEIGHT}
              rowProps={virtualRowProps}
              overscanCount={10}
              style={{ height: '100%', width: '100%' }}
            />
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

      // No diff info or empty hunks (unless truncated due to file size limit)
      if (!diffInfo || (diffInfo.hunks.length === 0 && !diffInfo.is_truncated)) {
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
        <VirtualDiffViewer
          diffInfo={diffInfo}
          filePath={selectedFile.path}
          statusLabel={getStatusIcon(selectedFile.status).label}
          isStaged={isStaged}
          isUntracked={isUntracked}
          busyHunkKey={busyHunkKey}
          getHunkKey={getHunkKey}
          onStageHunk={(hunk) => void handleStageHunk(hunk)}
          onUnstageHunk={(hunk) => void handleUnstageHunk(hunk)}
          onDiscardHunk={handleDiscardHunk}
        />
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
        <div ref={changesSidebarRef} className="changes-sidebar" style={{ width: sidebarWidth }}>
          {renderFileList(
            unstaged,
            t('localChanges.unstaged'),
            false,
            handleStageFile,
            handleStageAll,
            unstagedRowProps
          )}
          {renderFileList(
            staged,
            t('localChanges.staged'),
            true,
            handleUnstageFile,
            handleUnstageAll,
            stagedRowProps
          )}
        </div>
        <Resizer direction="horizontal" onMouseDown={handleResizeStart} isResizing={isResizing} />
        <div className="diff-panel">
          {renderDiffContent()}
          <CommitPanel
            key={repoPath}
            stagedCount={staged.length}
            onCommit={handleCommit}
            isLoading={isCommitLoading}
            lastCommitMessage={lastCommitMessage}
            onAmendChange={handleAmendChange}
          />
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
        <Modal isOpen={missingIdentityOpen} onClose={() => setMissingIdentityOpen(false)}>
          <ModalHeader
            icon={<AlertTriangle size={24} />}
            title={t('settings.missingIdentity.title')}
            description={t('settings.missingIdentity.message')}
          />
          <ModalBody>{null}</ModalBody>
          <ModalFooter>
            <button className="btn-cancel" onClick={() => setMissingIdentityOpen(false)}>
              {t('common.cancel')}
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                setMissingIdentityOpen(false);
                openSettings('git');
              }}
            >
              {t('settings.missingIdentity.openSettings')}
            </button>
          </ModalFooter>
        </Modal>
      </div>
    );
  }
);
