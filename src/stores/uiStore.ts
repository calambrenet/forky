import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PanelSizes } from '../types/git';

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
    }),
    {
      name: 'forky:ui-settings',
      partialize: (state) => ({
        // Only persist theme and panel sizes
        theme: state.theme,
        panelSizes: state.panelSizes,
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

// Constants export
export { MIN_SIZES, MAX_SIZES, DEFAULT_PANEL_SIZES };
