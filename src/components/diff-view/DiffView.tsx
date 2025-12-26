import type { FC } from 'react';
import type { CommitInfo, FileStatus } from '../../types/git';
import { Resizer } from '../resizer/Resizer';
import './DiffView.css';

interface DiffViewProps {
  selectedCommit: CommitInfo | null;
  fileStatuses: FileStatus[];
  selectedFile: FileStatus | null;
  onSelectFile: (file: FileStatus) => void;
  sidebarWidth: number;
  onResizeSidebar: () => void;
  isResizing: boolean;
}

export const DiffView: FC<DiffViewProps> = ({
  selectedCommit,
  fileStatuses,
  selectedFile,
  onSelectFile,
  sidebarWidth,
  onResizeSidebar,
  isResizing,
}) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'new':
      case 'untracked':
        return { icon: 'A', color: 'var(--accent-green)' };
      case 'modified':
        return { icon: 'M', color: 'var(--accent-yellow)' };
      case 'deleted':
        return { icon: 'D', color: 'var(--accent-red)' };
      default:
        return { icon: '?', color: 'var(--text-secondary)' };
    }
  };

  return (
    <div className="diff-view">
      <div className="diff-sidebar" style={{ width: sidebarWidth }}>
        <div className="diff-sidebar-header">
          {selectedCommit ? (
            <div className="commit-detail">
              <div className="commit-detail-message">{selectedCommit.message}</div>
              <div className="commit-detail-author">
                {selectedCommit.author} • {selectedCommit.date}
              </div>
            </div>
          ) : (
            <div className="changes-header">
              <span>Working Copy Changes</span>
              <span className="file-count">{fileStatuses.length}</span>
            </div>
          )}
        </div>
        <div className="file-list">
          {fileStatuses.length === 0 ? (
            <div className="no-changes">No changes</div>
          ) : (
            fileStatuses.map((file) => {
              const { icon, color } = getStatusIcon(file.status);
              return (
                <div
                  key={file.path}
                  className={`file-item ${selectedFile?.path === file.path ? 'selected' : ''}`}
                  onClick={() => onSelectFile(file)}
                >
                  <span className="file-status" style={{ color }}>
                    {icon}
                  </span>
                  <span className="file-path">{file.path}</span>
                  {file.staged && <span className="staged-indicator">Staged</span>}
                </div>
              );
            })
          )}
        </div>
      </div>
      <Resizer direction="horizontal" onMouseDown={onResizeSidebar} isResizing={isResizing} />
      <div className="diff-content">
        {selectedFile ? (
          <div className="diff-placeholder">
            <div className="diff-file-header">
              <span>{selectedFile.path}</span>
            </div>
            <div className="diff-lines">
              <pre className="diff-code">
                {/* Diff content will be loaded here */}
                <span className="diff-line context"> // File diff will be displayed here</span>
                <span className="diff-line add">+ // Added lines shown in green</span>
                <span className="diff-line delete">- // Deleted lines shown in red</span>
              </pre>
            </div>
          </div>
        ) : (
          <div className="diff-empty">
            <span>Select a file to view changes</span>
          </div>
        )}
      </div>
    </div>
  );
};
