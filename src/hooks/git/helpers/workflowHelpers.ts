import type { GitOperationConfig } from '../useGitOperation';
import type { MergeType, GitFlowType } from '../../../types/git';

/**
 * Helper functions that create GitOperationConfig for workflow operations.
 * These are pure functions that can be easily tested and tree-shaken.
 */

/**
 * Creates config for merge operation
 */
export const mergeOperation = (sourceBranch: string, mergeType: MergeType): GitOperationConfig => {
  const mergeFlags: Record<MergeType, string> = {
    default: '',
    'no-ff': '--no-ff',
    squash: '--squash',
  };
  const flag = mergeFlags[mergeType] || '';
  const command = `git merge ${flag} ${sourceBranch}`.trim();

  return {
    operationType: 'Merge',
    operationTarget: sourceBranch,
    logDescription: `Merge '${sourceBranch}'${flag ? ` (${mergeType})` : ''}`,
    command,
    successAlertKey: 'alerts.mergeSuccess',
    errorAlertKey: 'alerts.mergeFailed',
  };
};

/**
 * Creates config for rebase operation
 */
export const rebaseOperation = (
  ontoBranch: string,
  preserveMerges?: boolean,
  autostash?: boolean
): GitOperationConfig => {
  let command = 'git rebase';
  if (preserveMerges) command += ' --rebase-merges';
  if (autostash) command += ' --autostash';
  command += ` ${ontoBranch}`;

  return {
    operationType: 'Other',
    operationTarget: ontoBranch,
    logDescription: `Rebase onto '${ontoBranch}'`,
    command,
    successAlertKey: 'alerts.rebaseSuccess',
    errorAlertKey: 'alerts.rebaseFailed',
  };
};

/**
 * Creates config for interactive rebase operation
 */
export const interactiveRebaseOperation = (
  targetBranch: string,
  autostash?: boolean
): GitOperationConfig => {
  let command = 'git rebase -i';
  if (autostash) command += ' --autostash';
  command += ` ${targetBranch}`;

  return {
    operationType: 'Other',
    operationTarget: `Interactive rebase onto ${targetBranch}`,
    logDescription: `Interactive rebase onto '${targetBranch}'`,
    command,
    successAlertKey: 'alerts.rebaseSuccess',
    errorAlertKey: 'alerts.rebaseFailed',
  };
};

/**
 * Creates config for Git Flow init
 */
export const gitFlowInitOperation = (
  masterBranch: string,
  developBranch: string
): GitOperationConfig => ({
  operationType: 'Other',
  operationTarget: 'Initialize Git Flow',
  logDescription: `Initialize Git Flow (master: ${masterBranch}, develop: ${developBranch})`,
  command: `git flow init -d`,
  successAlertKey: 'alerts.gitFlowInitSuccess',
  errorAlertKey: 'alerts.gitFlowInitFailed',
});

/**
 * Creates config for Git Flow start (feature/release/hotfix)
 */
export const gitFlowStartOperation = (
  flowType: GitFlowType,
  name: string,
  baseBranch?: string
): GitOperationConfig => {
  const baseInfo = baseBranch ? ` from '${baseBranch}'` : '';
  return {
    operationType: 'Branch',
    operationTarget: `${flowType}/${name}`,
    logDescription: `Start ${flowType} '${name}'${baseInfo}`,
    command: `git flow ${flowType} start ${name}${baseBranch ? ` ${baseBranch}` : ''}`,
    successAlertKey: 'alerts.gitFlowStartSuccess',
    errorAlertKey: 'alerts.gitFlowStartFailed',
  };
};

/**
 * Creates config for Git Flow finish (feature/release/hotfix)
 */
export const gitFlowFinishOperation = (
  flowType: GitFlowType,
  name: string
): GitOperationConfig => ({
  operationType: 'Merge',
  operationTarget: `Finish ${flowType} '${name}'`,
  logDescription: `Finish ${flowType} '${name}'`,
  command: `git flow ${flowType} finish ${name}`,
  successAlertKey: 'alerts.gitFlowFinishSuccess',
  errorAlertKey: 'alerts.gitFlowFinishFailed',
});

/**
 * Creates config for creating a tag
 */
export const createTagOperation = (
  tagName: string,
  message: string | null,
  commitSha: string | null,
  pushToRemote: boolean,
  remoteName: string | null
): GitOperationConfig => {
  let command = message ? `git tag -a ${tagName} -m "${message}"` : `git tag ${tagName}`;

  if (commitSha) {
    command += ` ${commitSha}`;
  }

  if (pushToRemote && remoteName) {
    command += ` && git push ${remoteName} ${tagName}`;
  }

  return {
    operationType: 'Other',
    operationTarget: tagName,
    logDescription: `Create tag '${tagName}'${pushToRemote ? ' and push' : ''}`,
    command,
    successAlertKey: 'alerts.createTagSuccess',
    errorAlertKey: 'alerts.createTagFailed',
  };
};
