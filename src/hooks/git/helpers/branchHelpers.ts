import type { GitOperationConfig } from '../useGitOperation';

/**
 * Helper functions that create GitOperationConfig for branch operations.
 * These are pure functions that can be easily tested and tree-shaken.
 */

/**
 * Creates config for tracking a remote branch
 */
export const trackRemoteBranchOperation = (
  remoteBranch: string,
  localBranchName: string
): GitOperationConfig => ({
  operationType: 'Checkout',
  operationTarget: localBranchName,
  logDescription: `Track remote branch '${remoteBranch}' as '${localBranchName}'`,
  command: `git checkout --track -b ${localBranchName} ${remoteBranch}`,
  successAlertKey: 'alerts.checkoutSuccess',
  errorAlertKey: 'alerts.checkoutFailed',
});

/**
 * Creates config for creating a new branch
 */
export const createBranchOperation = (
  branchName: string,
  startPoint: string | null,
  checkout: boolean
): GitOperationConfig => {
  const checkoutFlag = checkout ? '-b' : '';
  const baseCmd = checkout ? 'git checkout' : 'git branch';
  const command = startPoint
    ? `${baseCmd} ${checkoutFlag} ${branchName} ${startPoint}`.trim()
    : `${baseCmd} ${checkoutFlag} ${branchName}`.trim();

  return {
    operationType: 'Branch',
    operationTarget: branchName,
    logDescription: `Create branch '${branchName}'${startPoint ? ` from '${startPoint}'` : ''}`,
    command,
    successAlertKey: 'alerts.createBranchSuccess',
    errorAlertKey: 'alerts.createBranchFailed',
  };
};

/**
 * Creates config for renaming a branch
 */
export const renameBranchOperation = (oldName: string, newName: string): GitOperationConfig => ({
  operationType: 'Branch',
  operationTarget: `${oldName} → ${newName}`,
  logDescription: `Rename branch '${oldName}' to '${newName}'`,
  command: `git branch -m ${oldName} ${newName}`,
  successAlertKey: 'alerts.renameBranchSuccess',
  errorAlertKey: 'alerts.renameBranchFailed',
});

/**
 * Creates config for deleting a branch
 */
export const deleteBranchOperation = (
  branchName: string,
  force: boolean,
  deleteRemote: boolean,
  remoteName: string | null
): GitOperationConfig => {
  const deleteFlag = force ? '-D' : '-d';
  const command =
    deleteRemote && remoteName
      ? `git branch ${deleteFlag} ${branchName} && git push ${remoteName} --delete ${branchName}`
      : `git branch ${deleteFlag} ${branchName}`;

  return {
    operationType: 'Branch',
    operationTarget: branchName,
    logDescription: `Delete branch '${branchName}'${deleteRemote ? ' (including remote)' : ''}`,
    command,
    successAlertKey: 'alerts.deleteBranchSuccess',
    errorAlertKey: 'alerts.deleteBranchFailed',
  };
};

/**
 * Creates config for fast-forward a branch
 */
export const fastForwardOperation = (
  branchName: string,
  remoteName: string
): GitOperationConfig => ({
  operationType: 'Pull',
  operationTarget: `Fast-forward ${branchName}`,
  logDescription: `Fast-forward '${branchName}' from '${remoteName}'`,
  command: `git fetch ${remoteName} ${branchName}:${branchName}`,
  successAlertKey: 'alerts.fastForwardSuccess',
  errorAlertKey: 'alerts.fastForwardFailed',
});
