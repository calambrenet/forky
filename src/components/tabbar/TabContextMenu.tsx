import type { FC } from 'react';
import { useEffect, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import './TabContextMenu.css';

interface TabContextMenuProps {
  x: number;
  y: number;
  tabId: string;
  tabIndex: number;
  totalTabs: number;
  onClose: () => void;
  onCloseTab: (tabId: string) => void;
  onCloseOthers: (tabId: string) => void;
  onCloseAll: () => void;
  onCloseToRight: (tabIndex: number) => void;
  onCloseToLeft: (tabIndex: number) => void;
}

export const TabContextMenu: FC<TabContextMenuProps> = memo(
  ({
    x,
    y,
    tabId,
    tabIndex,
    totalTabs,
    onClose,
    onCloseTab,
    onCloseOthers,
    onCloseAll,
    onCloseToRight,
    onCloseToLeft,
  }) => {
    const { t } = useTranslation();
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on click outside or escape
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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
      }, 0);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }, [onClose]);

    // Adjust position if menu would overflow viewport
    useEffect(() => {
      if (menuRef.current) {
        const rect = menuRef.current.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (rect.right > viewportWidth) {
          menuRef.current.style.left = `${viewportWidth - rect.width - 10}px`;
        }
        if (rect.bottom > viewportHeight) {
          menuRef.current.style.top = `${viewportHeight - rect.height - 10}px`;
        }
      }
    }, [x, y]);

    const hasTabsToRight = tabIndex < totalTabs - 1;
    const hasTabsToLeft = tabIndex > 0;
    const hasOtherTabs = totalTabs > 1;

    const handleClose = () => {
      onCloseTab(tabId);
      onClose();
    };

    const handleCloseOthers = () => {
      if (hasOtherTabs) {
        onCloseOthers(tabId);
        onClose();
      }
    };

    const handleCloseAll = () => {
      onCloseAll();
      onClose();
    };

    const handleCloseToRight = () => {
      if (hasTabsToRight) {
        onCloseToRight(tabIndex);
        onClose();
      }
    };

    const handleCloseToLeft = () => {
      if (hasTabsToLeft) {
        onCloseToLeft(tabIndex);
        onClose();
      }
    };

    return (
      <div ref={menuRef} className="tab-context-menu" style={{ left: x, top: y }}>
        <div className="tab-context-menu-item" onClick={handleClose}>
          {t('tabContextMenu.close')}
        </div>
        <div className="tab-context-menu-separator" />
        <div
          className={`tab-context-menu-item ${!hasOtherTabs ? 'disabled' : ''}`}
          onClick={handleCloseOthers}
        >
          {t('tabContextMenu.closeOthers')}
        </div>
        <div className="tab-context-menu-item" onClick={handleCloseAll}>
          {t('tabContextMenu.closeAll')}
        </div>
        <div className="tab-context-menu-separator" />
        <div
          className={`tab-context-menu-item ${!hasTabsToRight ? 'disabled' : ''}`}
          onClick={handleCloseToRight}
        >
          {t('tabContextMenu.closeToRight')}
        </div>
        <div
          className={`tab-context-menu-item ${!hasTabsToLeft ? 'disabled' : ''}`}
          onClick={handleCloseToLeft}
        >
          {t('tabContextMenu.closeToLeft')}
        </div>
      </div>
    );
  }
);
