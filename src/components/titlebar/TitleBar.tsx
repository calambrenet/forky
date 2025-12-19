import { FC, useEffect, useState, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './TitleBar.css';

interface TitleBarProps {
  children?: React.ReactNode;
}

export const TitleBar: FC<TitleBarProps> = ({ children }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    const checkMaximized = async () => {
      try {
        setIsMaximized(await appWindow.isMaximized());
      } catch (e) {
        console.error('Error checking maximized state:', e);
      }
    };
    checkMaximized();

    const unlisten = appWindow.onResized(async () => {
      try {
        setIsMaximized(await appWindow.isMaximized());
      } catch (e) {
        console.error('Error on resize:', e);
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [appWindow]);

  const handleMinimize = async () => {
    try {
      await appWindow.minimize();
    } catch (e) {
      console.error('Error minimizing:', e);
    }
  };

  const handleMaximize = async () => {
    try {
      await appWindow.toggleMaximize();
    } catch (e) {
      console.error('Error toggling maximize:', e);
    }
  };

  const handleClose = async () => {
    try {
      await appWindow.close();
    } catch (e) {
      console.error('Error closing:', e);
    }
  };

  const handleMouseDown = useCallback(async (e: React.MouseEvent) => {
    // Only drag on left click and if not clicking on interactive elements
    if (e.buttons === 1) {
      const target = e.target as HTMLElement;
      // Don't drag if clicking on buttons, inputs, menus, or titlebar controls
      if (
        target.closest('button') ||
        target.closest('input') ||
        target.closest('.titlebar-controls') ||
        target.closest('.menu-container') ||
        target.closest('.menu-dropdown') ||
        target.closest('.menu-item')
      ) {
        return;
      }

      if (e.detail === 2) {
        // Double click to maximize
        await handleMaximize();
      } else {
        // Single click to start dragging
        try {
          await appWindow.startDragging();
        } catch (err) {
          console.error('Error starting drag:', err);
        }
      }
    }
  }, [appWindow]);

  return (
    <div className="titlebar" onMouseDown={handleMouseDown}>
      <div className="titlebar-controls">
        <button
          className="titlebar-btn close"
          onClick={handleClose}
          title="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <button
          className="titlebar-btn minimize"
          onClick={handleMinimize}
          title="Minimize"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 5H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <button
          className="titlebar-btn maximize"
          onClick={handleMaximize}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M2 3V8H7M3 2H8V7" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="1" y="1" width="8" height="8" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
          )}
        </button>
      </div>
      <div className="titlebar-content">
        {children}
      </div>
    </div>
  );
};
