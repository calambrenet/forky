import type { FC } from 'react';
import { useEffect, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen } from 'lucide-react';
import './RecentReposDropdown.css';

export interface RecentRepo {
  path: string;
  name: string;
  last_opened: number;
}

interface RecentReposDropdownProps {
  repos: RecentRepo[];
  onRepoClick: (path: string) => void;
  onClose: () => void;
}

export const RecentReposDropdown: FC<RecentReposDropdownProps> = memo(
  ({ repos, onRepoClick, onClose }) => {
    const { t } = useTranslation();
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
          onClose();
        }
      };

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };

      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
      }, 50);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }, [onClose]);

    const truncatePath = (path: string, maxLength = 45): string => {
      if (path.length <= maxLength) return path;
      const parts = path.split('/');
      if (parts.length <= 2) return '...' + path.slice(-(maxLength - 3));
      // Mostrar inicio y fin: ~/.../.../repo
      const home = path.startsWith('/Users/') ? '~' + path.slice(path.indexOf('/', 7)) : path;
      if (home.length <= maxLength) return home;
      return '...' + home.slice(-(maxLength - 3));
    };

    return (
      <div ref={dropdownRef} className="recent-repos-dropdown">
        <div className="recent-repos-dropdown-header">{t('recentReposDropdown.title')}</div>

        {repos.length > 0 ? (
          <div className="recent-repos-dropdown-list">
            {repos.map((repo) => (
              <div
                key={repo.path}
                className="recent-repos-dropdown-item"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onRepoClick(repo.path);
                  onClose();
                }}
              >
                <FolderOpen size={14} className="recent-repos-dropdown-icon" />
                <div className="recent-repos-dropdown-info">
                  <span className="recent-repos-dropdown-name">{repo.name}</span>
                  <span className="recent-repos-dropdown-path">{truncatePath(repo.path)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="recent-repos-dropdown-empty">{t('recentReposDropdown.noRecent')}</div>
        )}
      </div>
    );
  }
);
