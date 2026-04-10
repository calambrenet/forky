import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import {
  useActiveTab,
  useIsGitLoading,
  useGitOperationStore,
  useRepositoryStore,
  useUIStore,
} from '../../stores';
import type { GitOperationResult } from '../../types/git';

/**
 * Configuration for a Git operation
 */
export interface GitOperationConfig {
  /** Operation type for logging (e.g., 'Pull', 'Push', 'Fetch', 'Other') */
  operationType: 'Fetch' | 'Pull' | 'Push' | 'Merge' | 'Branch' | 'Checkout' | 'Other';
  /** Description shown in status bar during operation */
  operationTarget: string;
  /** Description for activity log */
  logDescription: string;
  /** Git command string for activity log */
  command: string;
  /** Translation key for success alert (optional - no alert if not provided) */
  successAlertKey?: string;
  /** Translation key for error alert title */
  errorAlertKey?: string;
  /** Callback on success (before refreshActiveTab) */
  onSuccess?: (result: GitOperationResult) => void | Promise<void>;
  /** Callback on error */
  onError?: (result: GitOperationResult) => void;
  /** Skip refreshActiveTab on success (default: false) */
  skipRefresh?: boolean;
}

/**
 * Result of executeOperation
 */
export interface ExecuteOperationResult {
  /** The operation result from the backend */
  result: GitOperationResult | null;
  /** Whether the operation was skipped (no active tab or loading) */
  skipped: boolean;
}

/**
 * Hook that provides a unified way to execute Git operations
 *
 * This hook centralizes the common pattern used in all Git operations:
 * 1. Check if operation can run (active tab, not loading)
 * 2. Start operation (show in status bar)
 * 3. Invoke backend command
 * 4. Complete operation
 * 5. Log to activity log
 * 6. Handle success/error (alerts, refresh)
 *
 * @example
 * ```typescript
 * import { useGitOperation } from '@/hooks/git';
 * import { deleteBranchOperation } from '@/hooks/git/helpers';
 *
 * const { executeOperation } = useGitOperation();
 *
 * const handleDeleteBranch = async (branchName: string, force: boolean) => {
 *   await executeOperation(
 *     'git_delete_branch',
 *     { branchName, force },
 *     deleteBranchOperation(branchName, force)
 *   );
 * };
 * ```
 */
export const useGitOperation = () => {
  const { t } = useTranslation();
  const activeTab = useActiveTab();
  const isGitLoading = useIsGitLoading();
  const { startOperation, completeOperation, addLogEntry } = useGitOperationStore();
  const { refreshActiveTab } = useRepositoryStore();
  const { addAlert } = useUIStore();

  /**
   * Check if an operation can be executed
   */
  const canExecute = useCallback((): boolean => {
    return !!(activeTab?.path && !isGitLoading);
  }, [activeTab?.path, isGitLoading]);

  /**
   * Execute a Git operation with unified error handling and logging
   *
   * @param commandName - The Tauri command to invoke
   * @param params - Parameters to pass to the command
   * @param config - Operation configuration
   * @returns The operation result or null if skipped/failed
   */
  const executeOperation = useCallback(
    async <TParams extends Record<string, unknown>>(
      commandName: string,
      params: TParams,
      config: GitOperationConfig
    ): Promise<ExecuteOperationResult> => {
      // Check if we can execute
      if (!activeTab?.path || isGitLoading) {
        return { result: null, skipped: true };
      }

      const {
        operationType,
        operationTarget,
        logDescription,
        command,
        successAlertKey,
        errorAlertKey,
        onSuccess,
        onError,
        skipRefresh = false,
      } = config;

      // Start the operation
      startOperation(operationType, operationTarget);

      try {
        // Invoke the backend command
        const result = await invoke<GitOperationResult>(commandName, params);

        // Complete the operation
        completeOperation(result);

        // Log to activity log
        addLogEntry(
          activeTab.path,
          operationType,
          logDescription,
          command,
          result.message,
          result.success
        );

        if (result.success) {
          // Call success callback
          await onSuccess?.(result);

          // Refresh repository data unless skipped
          if (!skipRefresh) {
            await refreshActiveTab();
          }

          // Show success alert if configured
          if (successAlertKey) {
            addAlert('success', t(successAlertKey), result.message);
          }
        } else {
          // Call error callback
          onError?.(result);

          // Show error alert
          const errorTitle = errorAlertKey ? t(errorAlertKey) : t('alerts.gitError');
          addAlert('error', errorTitle, result.message);
        }

        return { result, skipped: false };
      } catch (error) {
        const errorMessage = String(error);
        console.error(`Error in ${commandName}:`, error);

        // Complete with error
        completeOperation({ success: false, message: errorMessage });

        // Log error to activity log
        addLogEntry(activeTab.path, operationType, logDescription, command, errorMessage, false);

        // Show error alert
        const errorTitle = errorAlertKey ? t(errorAlertKey) : t('alerts.gitError');
        addAlert('error', errorTitle, errorMessage);

        return { result: null, skipped: false };
      }
    },
    [
      activeTab?.path,
      isGitLoading,
      startOperation,
      completeOperation,
      addLogEntry,
      refreshActiveTab,
      addAlert,
      t,
    ]
  );

  return {
    /** Execute a Git operation */
    executeOperation,
    /** Check if an operation can be executed */
    canExecute,
    /** Current repository path */
    repoPath: activeTab?.path ?? null,
    /** Whether a Git operation is in progress */
    isLoading: isGitLoading,
  };
};
