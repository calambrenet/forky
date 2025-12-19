import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocalStorage } from './useLocalStorage';

interface PanelSizes {
  sidebarWidth: number;
  commitPanelHeight: number;
  diffSidebarWidth: number;
}

const DEFAULT_SIZES: PanelSizes = {
  sidebarWidth: 260,
  commitPanelHeight: 50, // percentage
  diffSidebarWidth: 300,
};

const MIN_SIZES = {
  sidebarWidth: 180,
  commitPanelHeight: 20,
  diffSidebarWidth: 200,
};

const MAX_SIZES = {
  sidebarWidth: 500,
  commitPanelHeight: 80,
  diffSidebarWidth: 600,
};

export function usePanelResize() {
  const [sizes, setSizes] = useLocalStorage<PanelSizes>('forky-panel-sizes', DEFAULT_SIZES);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sizesRef = useRef(sizes);

  // Keep sizesRef in sync
  useEffect(() => {
    sizesRef.current = sizes;
  }, [sizes]);

  const startResize = useCallback((panel: string) => {
    setIsResizing(panel);
  }, []);

  const stopResize = useCallback(() => {
    setIsResizing(null);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    const currentSizes = sizesRef.current;

    switch (isResizing) {
      case 'sidebar': {
        const newWidth = Math.min(
          MAX_SIZES.sidebarWidth,
          Math.max(MIN_SIZES.sidebarWidth, e.clientX)
        );
        setSizes({ ...currentSizes, sidebarWidth: newWidth });
        break;
      }
      case 'commitPanel': {
        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const percentage = ((e.clientY - rect.top) / rect.height) * 100;
          const newHeight = Math.min(
            MAX_SIZES.commitPanelHeight,
            Math.max(MIN_SIZES.commitPanelHeight, percentage)
          );
          setSizes({ ...currentSizes, commitPanelHeight: newHeight });
        }
        break;
      }
      case 'diffSidebar': {
        const container = containerRef.current;
        if (container) {
          const newWidth = Math.min(
            MAX_SIZES.diffSidebarWidth,
            Math.max(MIN_SIZES.diffSidebarWidth, e.clientX - currentSizes.sidebarWidth)
          );
          setSizes({ ...currentSizes, diffSidebarWidth: newWidth });
        }
        break;
      }
    }
  }, [isResizing, setSizes]);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', stopResize);
      document.body.style.cursor = isResizing === 'commitPanel' ? 'row-resize' : 'col-resize';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', stopResize);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, handleMouseMove, stopResize]);

  return {
    sizes,
    isResizing,
    startResize,
    containerRef,
  };
}
