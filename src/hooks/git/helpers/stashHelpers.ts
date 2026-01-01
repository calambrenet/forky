import type { GitOperationConfig } from '../useGitOperation';

/**
 * Helper functions that create GitOperationConfig for stash operations.
 * These are pure functions that can be easily tested and tree-shaken.
 */

/**
 * Creates config for saving a stash
 */
export const saveStashOperation = (
  message: string,
  includeUntracked: boolean
): GitOperationConfig => {
  const untrackedFlag = includeUntracked ? ' -u' : '';
  const messageFlag = message ? ` -m "${message}"` : '';
  const command = `git stash push${untrackedFlag}${messageFlag}`;

  return {
    operationType: 'Other',
    operationTarget: message || 'Save stash',
    logDescription: message ? `Stash: ${message}` : 'Save stash',
    command,
    successAlertKey: 'alerts.stashSaved',
    errorAlertKey: 'alerts.stashFailed',
  };
};

/**
 * Creates config for applying a stash
 */
export const applyStashOperation = (stashIndex: number): GitOperationConfig => ({
  operationType: 'Other',
  operationTarget: `Apply stash@{${stashIndex}}`,
  logDescription: `Apply stash@{${stashIndex}}`,
  command: `git stash apply stash@{${stashIndex}}`,
  successAlertKey: 'alerts.stashApplied',
  errorAlertKey: 'alerts.stashApplyFailed',
});

/**
 * Creates config for popping a stash
 */
export const popStashOperation = (stashIndex: number): GitOperationConfig => ({
  operationType: 'Other',
  operationTarget: `Pop stash@{${stashIndex}}`,
  logDescription: `Pop stash@{${stashIndex}}`,
  command: `git stash pop stash@{${stashIndex}}`,
  successAlertKey: 'alerts.stashPopped',
  errorAlertKey: 'alerts.stashPopFailed',
});

/**
 * Creates config for dropping a stash
 */
export const dropStashOperation = (stashIndex: number): GitOperationConfig => ({
  operationType: 'Other',
  operationTarget: `Drop stash@{${stashIndex}}`,
  logDescription: `Drop stash@{${stashIndex}}`,
  command: `git stash drop stash@{${stashIndex}}`,
  successAlertKey: 'alerts.stashDropped',
  errorAlertKey: 'alerts.stashDropFailed',
});
