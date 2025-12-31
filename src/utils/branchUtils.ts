import type { BranchInfo } from '../types/git';

/**
 * Extract remote name from branch upstream or use default
 * @example
 * getBranchRemote({ upstream: 'origin/main', ... }) // 'origin'
 * getBranchRemote({ upstream: null, ... }) // 'origin'
 */
export const getBranchRemote = (branch: BranchInfo, defaultRemote = 'origin'): string => {
  if (!branch.upstream) return defaultRemote;
  return branch.upstream.split('/')[0] || defaultRemote;
};

/**
 * Extract branch name from full reference (removes remote prefix)
 * @example
 * getBranchShortName('origin/feature/auth') // 'feature/auth'
 * getBranchShortName('main') // 'main'
 */
export const getBranchShortName = (fullName: string): string => {
  const parts = fullName.split('/');
  if (parts.length > 1) {
    // Remove the first part (remote name) and join the rest
    return parts.slice(1).join('/');
  }
  return fullName;
};

/**
 * Get display name for a branch (last part of path)
 * @example
 * getBranchDisplayName('feature/auth/login') // 'login'
 * getBranchDisplayName('main') // 'main'
 */
export const getBranchDisplayName = (branchName: string): string => {
  return branchName.split('/').pop() || branchName;
};
