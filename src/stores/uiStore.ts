import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PanelSizes } from '../types/git';

// Alert types (replicated from component to avoid circular imports)
export type AlertType = 'error' | 'success' | 'warning' | 'info';

export interface AlertData {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  duration?: number;
}

type Theme = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

const DEFAULT_PANEL_SIZES: PanelSizes = {
  sidebarWidth: 260,
  commitPanelHeight: 50,
  diffSidebarWidth: 300,
};

const MIN_SIZES = {
  sidebarWidth: 180,
  commitPanelHeight: 20,
  diffSidebarWidth: 150,
};

const MAX_SIZES = {
  sidebarWidth: 500,
  commitPanelHeight: 80,
  diffSidebarWidth: 600,
};

// Activity Log Panel constants
const ACTIVITY_PANEL_DEFAULT_HEIGHT = 250;
const ACTIVITY_PANEL_MIN_HEIGHT = 150;
const ACTIVITY_PANEL_MAX_HEIGHT_PERCENT = 0.6; // 60% of viewport

interface UIStore {
  // Theme state
  theme: Theme;
  systemTheme: ResolvedTheme;
  resolvedTheme: ResolvedTheme;

  // Alert state
  alerts: AlertData[];

  // Panel sizes
  panelSizes: PanelSizes;
  isResizing: string | null;

  // Activity Log Panel state
  activityLogPanelOpen: boolean;
  activityLogPanelHeight: number;

  // Theme actions
  setTheme: (theme: Theme) => void;
  setSystemTheme: (theme: ResolvedTheme) => void;

  // Alert actions
  addAlert: (type: AlertType, title: string, message: string, duration?: number) => void;
  removeAlert: (id: string) => void;
  clearAlerts: () => void;

  // Panel size actions
  setPanelSize: (panel: keyof PanelSizes, size: number) => void;
  setPanelSizes: (sizes: Partial<PanelSizes>) => void;
  setIsResizing: (resizing: string | null) => void;
  resetPanelSizes: () => void;

  // Activity Log Panel actions
  setActivityLogPanelOpen: (open: boolean) => void;
  toggleActivityLogPanel: () => void;
  setActivityLogPanelHeight: (height: number) => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      // Initial state
      theme: 'system',
      systemTheme: 'dark',
      get resolvedTheme() {
        const state = get();
        return state.theme === 'system' ? state.systemTheme : state.theme;
      },
      alerts: [],
      panelSizes: DEFAULT_PANEL_SIZES,
      isResizing: null,
      activityLogPanelOpen: false,
      activityLogPanelHeight: ACTIVITY_PANEL_DEFAULT_HEIGHT,

      // Theme actions
      setTheme: (theme) => set({ theme }),

      setSystemTheme: (systemTheme) => set({ systemTheme }),

      // Alert actions
      addAlert: (type, title, message, duration = 8000) => {
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const alert: AlertData = { id, type, title, message, duration };

        set((state) => ({
          alerts: [...state.alerts, alert],
        }));

        // Auto-remove after duration (if not persistent)
        if (duration > 0) {
          setTimeout(() => {
            get().removeAlert(id);
          }, duration);
        }

        return id;
      },

      removeAlert: (id) => {
        set((state) => ({
          alerts: state.alerts.filter((alert) => alert.id !== id),
        }));
      },

      clearAlerts: () => set({ alerts: [] }),

      // Panel size actions
      setPanelSize: (panel, size) => {
        const minSize = MIN_SIZES[panel];
        const maxSize = MAX_SIZES[panel];
        const clampedSize = Math.min(maxSize, Math.max(minSize, size));

        set((state) => ({
          panelSizes: {
            ...state.panelSizes,
            [panel]: clampedSize,
          },
        }));
      },

      setPanelSizes: (sizes) => {
        set((state) => ({
          panelSizes: {
            ...state.panelSizes,
            ...sizes,
          },
        }));
      },

      setIsResizing: (resizing) => set({ isResizing: resizing }),

      resetPanelSizes: () => set({ panelSizes: DEFAULT_PANEL_SIZES }),

      // Activity Log Panel actions
      setActivityLogPanelOpen: (open) => set({ activityLogPanelOpen: open }),

      toggleActivityLogPanel: () =>
        set((state) => ({ activityLogPanelOpen: !state.activityLogPanelOpen })),

      setActivityLogPanelHeight: (height) => {
        const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
        const maxHeight = viewportHeight * ACTIVITY_PANEL_MAX_HEIGHT_PERCENT;
        const clampedHeight = Math.min(maxHeight, Math.max(ACTIVITY_PANEL_MIN_HEIGHT, height));
        set({ activityLogPanelHeight: clampedHeight });
      },
    }),
    {
      name: 'forky:ui-settings',
      partialize: (state) => ({
        // Only persist theme, panel sizes, and activity log panel state
        theme: state.theme,
        panelSizes: state.panelSizes,
        activityLogPanelOpen: state.activityLogPanelOpen,
        activityLogPanelHeight: state.activityLogPanelHeight,
      }),
    }
  )
);

// Selector hooks for optimized re-renders
export const useTheme = () => useUIStore((state) => state.theme);
export const useSystemTheme = () => useUIStore((state) => state.systemTheme);
export const useResolvedTheme = () => {
  const theme = useUIStore((state) => state.theme);
  const systemTheme = useUIStore((state) => state.systemTheme);
  return theme === 'system' ? systemTheme : theme;
};
export const useAlerts = () => useUIStore((state) => state.alerts);
export const usePanelSizes = () => useUIStore((state) => state.panelSizes);
export const useIsResizing = () => useUIStore((state) => state.isResizing);

// Activity Log Panel selector hooks
export const useActivityLogPanelOpen = () => useUIStore((state) => state.activityLogPanelOpen);
export const useActivityLogPanelHeight = () => useUIStore((state) => state.activityLogPanelHeight);

// Constants export
export {
  MIN_SIZES,
  MAX_SIZES,
  DEFAULT_PANEL_SIZES,
  ACTIVITY_PANEL_MIN_HEIGHT,
  ACTIVITY_PANEL_MAX_HEIGHT_PERCENT,
  ACTIVITY_PANEL_DEFAULT_HEIGHT,
};
