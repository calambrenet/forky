import type { FC } from 'react';
import { useEffect, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera } from 'lucide-react';
import type { StashInfo } from '../../types/git';
import './StashDropdown.css';

interface StashDropdownProps {
  stashes: StashInfo[];
  onStashClick: (stash: StashInfo) => void;
  onSaveSnapshot: () => void;
  onClose: () => void;
}

export const StashDropdown: FC<StashDropdownProps> = memo(
  ({ stashes, onStashClick, onSaveSnapshot, onClose }) => {
    const { t } = useTranslation();
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
          onClose();
        }
      };

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };

      // Add listeners with a small delay to prevent immediate close
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

    const handleStashClick = (stash: StashInfo) => {
      onStashClick(stash);
      onClose();
    };

    const handleSaveSnapshot = () => {
      onSaveSnapshot();
      onClose();
    };

    // Format timestamp to readable date
    const formatDate = (timestamp: number) => {
      const date = new Date(timestamp * 1000);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      } else if (diffDays === 1) {
        return t('stashDropdown.yesterday');
      } else if (diffDays < 7) {
        return `${diffDays} ${t('stashDropdown.daysAgo')}`;
      } else {
        return date.toLocaleDateString();
      }
    };

    // Get display message (truncate if needed)
    const getDisplayMessage = (message: string) => {
      const maxLength = 50;
      if (message.length > maxLength) {
        return message.substring(0, maxLength) + '...';
      }
      return message;
    };

    // Show max 10 recent stashes
    const recentStashes = stashes.slice(0, 10);

    return (
      <div ref={dropdownRef} className="stash-dropdown">
        <div className="stash-dropdown-header">{t('stashDropdown.recentStashes')}</div>

        {recentStashes.length > 0 ? (
          <div className="stash-dropdown-list">
            {recentStashes.map((stash) => (
              <div
                key={stash.id}
                className="stash-dropdown-item"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleStashClick(stash);
                }}
              >
                <span className="stash-dropdown-message">{getDisplayMessage(stash.message)}</span>
                <span className="stash-dropdown-date">{formatDate(stash.timestamp)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="stash-dropdown-empty">{t('stashDropdown.noStashes')}</div>
        )}

        <div className="stash-dropdown-separator" />

        <div
          className="stash-dropdown-item stash-dropdown-action"
          onMouseDown={(e) => {
            e.stopPropagation();
            handleSaveSnapshot();
          }}
        >
          <Camera size={14} />
          <span>{t('stashDropdown.saveSnapshot')}</span>
        </div>
      </div>
    );
  }
);
