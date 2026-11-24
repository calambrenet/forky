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
  /** Callback on success (before refreshTab) */
  onSuccess?: (result: GitOperationResult) => void | Promise<void>;
  /** Callback on error */
  onError?: (result: GitOperationResult) => void;
  /** Skip refreshTab on success (default: false) */
  skipRefresh?: boolean;
}

export interface ExecuteOperationResult {
  result: GitOperationResult | null;
  skipped: boolean;
}

export const useGitOperation = () => {
  const { t } = useTranslation();
  const activeTab = useActiveTab();
  const isGitLoading = useIsGitLoading();

  const canExecute = useCallback((): boolean => {
    const repoTab = useRepositoryStore.getState().getActiveTab();
    const loading = useGitOperationStore.getState().isLoading;
    return !!(repoTab?.path && !loading);
  }, []);

  const executeOperation = useCallback(
    async <TParams extends Record<string, unknown>>(
      commandName: string,
      params: TParams,
      config: GitOperationConfig
    ): Promise<ExecuteOperationResult> => {
      // Read live state synchronously to prevent double-submit and cross-tab mismatch
      const targetTab = useRepositoryStore.getState().getActiveTab();
      const { isLoading, startOperation, completeOperation, addLogEntry } =
        useGitOperationStore.getState();

      if (!targetTab?.path || isLoading) {
        return { result: null, skipped: true };
      }

      const targetTabId = targetTab.id;
      const targetRepoPath = targetTab.path;
      const { refreshTab } = useRepositoryStore.getState();
      const { addAlert } = useUIStore.getState();

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

      startOperation(operationType, operationTarget);

      try {
        const result = await invoke<GitOperationResult>(commandName, {
          repoPath: targetRepoPath,
          ...params,
        });

        completeOperation(result);

        addLogEntry(
          targetRepoPath,
          operationType,
          logDescription,
          command,
          result.message,
          result.success
        );

        if (result.success) {
          await onSuccess?.(result);

          if (!skipRefresh) {
            await refreshTab(targetTabId);
          }

          if (successAlertKey) {
            addAlert('success', t(successAlertKey), result.message);
          }
        } else {
          onError?.(result);

          const errorTitle = errorAlertKey ? t(errorAlertKey) : t('alerts.gitError');
          addAlert('error', errorTitle, result.message);
        }

        return { result, skipped: false };
      } catch (error) {
        const errorMessage = String(error);
        console.error(`Error in ${commandName}:`, error);

        const failedResult: GitOperationResult = { success: false, message: errorMessage };
        completeOperation(failedResult);
        addLogEntry(targetRepoPath, operationType, logDescription, command, errorMessage, false);
        onError?.(failedResult);

        const errorTitle = errorAlertKey ? t(errorAlertKey) : t('alerts.gitError');
        addAlert('error', errorTitle, errorMessage);

        return { result: null, skipped: false };
      }
    },
    [t]
  );

  return {
    executeOperation,
    canExecute,
    repoPath: activeTab?.path ?? null,
    isLoading: isGitLoading,
  };
};
