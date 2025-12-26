import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GitOperationState, GitOperationResult, GitLogEntry } from '../types/git';

type OperationType =
  | 'Fetch'
  | 'Pull'
  | 'Push'
  | 'Commit'
  | 'Checkout'
  | 'Branch'
  | 'Merge'
  | 'Stash'
  | 'Other';

interface GitOperationStore {
  // State
  isLoading: boolean;
  currentOperation: GitOperationState | null;
  activityLog: GitLogEntry[];

  // Actions
  startOperation: (type: OperationType, target?: string) => void;
  completeOperation: (result: GitOperationResult) => void;
  clearOperation: () => void;
  addLogEntry: (
    operationType: GitLogEntry['operationType'],
    operationName: string,
    command: string,
    output: string,
    success: boolean,
    isBackground?: boolean
  ) => void;
  clearActivityLog: () => void;
}

// Auto-dismiss timeout reference
let dismissTimeout: ReturnType<typeof setTimeout> | null = null;

export const useGitOperationStore = create<GitOperationStore>()(
  persist(
    (set, get) => ({
      isLoading: false,
      currentOperation: null,
      activityLog: [],

      startOperation: (type, target) => {
        // Clear any pending dismiss timeout
        if (dismissTimeout) {
          clearTimeout(dismissTimeout);
          dismissTimeout = null;
        }

        const operationName = type as GitOperationState['operationName'];

        set({
          isLoading: true,
          currentOperation: {
            isActive: true,
            operationName: ['Fetch', 'Pull', 'Push', 'Commit'].includes(type)
              ? operationName
              : 'Commit', // Fallback for UI display
            operationTarget: target,
            statusMessage: type === 'Commit' ? 'committing...' : `${type.toLowerCase()}ing...`,
            isComplete: false,
            isError: false,
          },
        });
      },

      completeOperation: (result) => {
        const current = get().currentOperation;
        if (!current) return;

        set({
          isLoading: false,
          currentOperation: {
            ...current,
            isActive: false,
            statusMessage: result.message || (result.success ? 'Completed' : 'Failed'),
            isComplete: true,
            isError: !result.success,
          },
        });

        // Auto-dismiss after 5 seconds on success
        if (result.success) {
          dismissTimeout = setTimeout(() => {
            const currentOp = get().currentOperation;
            if (currentOp?.isComplete && !currentOp.isError) {
              set({ currentOperation: null });
            }
            dismissTimeout = null;
          }, 5000);
        }
      },

      clearOperation: () => {
        if (dismissTimeout) {
          clearTimeout(dismissTimeout);
          dismissTimeout = null;
        }
        set({ currentOperation: null, isLoading: false });
      },

      addLogEntry: (
        operationType,
        operationName,
        command,
        output,
        success,
        isBackground = false
      ) => {
        const entry: GitLogEntry = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
          operationType,
          operationName,
          command,
          output,
          success,
          isBackground,
        };

        set((state) => ({
          activityLog: [entry, ...state.activityLog].slice(0, 500), // Limit to 500 entries
        }));
      },

      clearActivityLog: () => {
        set({ activityLog: [] });
      },
    }),
    {
      name: 'forky:git-activity-log',
      partialize: (state) => ({
        // Only persist activity log, not current operation state
        activityLog: state.activityLog,
      }),
      // Handle Date serialization
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;

          try {
            const parsed = JSON.parse(str);
            // Convert timestamp strings back to Date objects
            if (parsed.state?.activityLog) {
              parsed.state.activityLog = parsed.state.activityLog.map(
                (entry: GitLogEntry & { timestamp: string }) => ({
                  ...entry,
                  timestamp: new Date(entry.timestamp),
                })
              );
            }
            return parsed;
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
    }
  )
);

// Selector hooks for optimized re-renders
export const useIsGitLoading = () => useGitOperationStore((state) => state.isLoading);
export const useCurrentOperation = () => useGitOperationStore((state) => state.currentOperation);
export const useActivityLog = () => useGitOperationStore((state) => state.activityLog);
