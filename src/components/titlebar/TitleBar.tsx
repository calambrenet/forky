import { FC, useEffect, useState, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { X, Minus, Square, Copy } from 'lucide-react';
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
          <X size={10} strokeWidth={2} />
        </button>
        <button
          className="titlebar-btn minimize"
          onClick={handleMinimize}
          title="Minimize"
        >
          <Minus size={10} strokeWidth={2} />
        </button>
        <button
          className="titlebar-btn maximize"
          onClick={handleMaximize}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? <Copy size={10} strokeWidth={1.5} /> : <Square size={10} strokeWidth={1.5} />}
        </button>
      </div>
      <div className="titlebar-content">
        {children}
      </div>
    </div>
  );
};
