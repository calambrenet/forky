import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { TitleBar } from './components/titlebar/TitleBar';
import { TabBar } from './components/tabbar/TabBar';
import { Toolbar } from './components/toolbar/Toolbar';
import { Sidebar } from './components/sidebar/Sidebar';
import { LocalChangesView } from './components/local-changes';
import { AllCommitsView } from './components/all-commits/AllCommitsView';
import { Resizer } from './components/resizer/Resizer';
import { AlertContainer } from './components/alert';
import type { FetchOptions, PullOptions, PushOptions } from './components/git-modals';

// Lazy load modals for code splitting
const FetchModal = lazy(() => import('./components/git-modals/FetchModal').then(m => ({ default: m.FetchModal })));
const PullModal = lazy(() => import('./components/git-modals/PullModal').then(m => ({ default: m.PullModal })));
const PushModal = lazy(() => import('./components/git-modals/PushModal').then(m => ({ default: m.PushModal })));
const SshHostVerificationModal = lazy(() => import('./components/git-modals/SshHostVerificationModal').then(m => ({ default: m.SshHostVerificationModal })));
const GitCredentialModal = lazy(() => import('./components/git-modals/GitCredentialModal').then(m => ({ default: m.GitCredentialModal })));
const GitActivityLog = lazy(() => import('./components/git-activity-log').then(m => ({ default: m.GitActivityLog })));
const AddRemoteModal = lazy(() => import('./components/add-remote-modal').then(m => ({ default: m.AddRemoteModal })));

// Zustand stores
import {
  useRepositoryStore,
  useTabs,
  useActiveTab,
  useActiveTabState,
  useIsRestoring,
  useLocalChangesCount,
  useGitOperationStore,
  useIsGitLoading,
  useCurrentOperation,
  useActivityLog,
  useModalStore,
  useActiveModal,
  useIsAddRemoteModalOpen,
  useIsActivityLogOpen,
  useSshVerification,
  useCredentialModal,
  useUIStore,
  useAlerts,
  usePanelSizes,
  useIsResizing,
} from './stores';

import { useTheme } from './hooks/useTheme';
import { BranchInfo, ViewMode, GitOperationResult, GitOptionsStorage } from './types/git';
import './styles/global.css';
import './App.css';

function App() {
  const { t } = useTranslation();

  // Helper function for error titles
  const getErrorTitle = useCallback((errorType: string | undefined, _operationName: string): string => {
    switch (errorType) {
      case 'ssh_host_verification_failed':
        return t('alerts.sshHostVerificationFailed');
      case 'authentication_failed':
        return t('alerts.authenticationFailed');
      case 'remote_access_failed':
        return t('alerts.remoteAccessFailed');
      case 'connection_refused':
        return t('alerts.connectionRefused');
      case 'connection_timeout':
        return t('alerts.connectionTimeout');
      case 'host_not_found':
        return t('alerts.hostNotFound');
      case 'git_error':
        return t('alerts.gitError');
      default:
        return t('alerts.gitError');
    }
  }, [t]);
  // Repository store
  const tabs = useTabs();
  const activeTab = useActiveTab();
  const activeTabState = useActiveTabState();
  const isRestoring = useIsRestoring();
  const localChangesCount = useLocalChangesCount();
  const { openRepository, selectTab, closeTab, updateTabState, refreshActiveTab, setTabHasPendingChanges, setTabCurrentBranch } = useRepositoryStore();

  // Git operation store
  const isGitLoading = useIsGitLoading();
  const currentOperation = useCurrentOperation();
  const activityLog = useActivityLog();
  const { startOperation, completeOperation, clearOperation, addLogEntry } = useGitOperationStore();

  // Modal store
  const activeModal = useActiveModal();
  const isAddRemoteModalOpen = useIsAddRemoteModalOpen();
  const isActivityLogOpen = useIsActivityLogOpen();
  const sshVerification = useSshVerification();
  const credentialModal = useCredentialModal();
  const {
    openFetchModal,
    openPullModal,
    openPushModal,
    closeModal,
    openAddRemoteModal,
    closeAddRemoteModal,
    openActivityLog,
    closeActivityLog,
    showSshVerification,
    closeSshVerification,
    closeCredentialModal,
  } = useModalStore();

  // UI store
  const alerts = useAlerts();
  const panelSizes = usePanelSizes();
  const isResizing = useIsResizing();
  const { addAlert, removeAlert, setPanelSize, setIsResizing } = useUIStore();

  // Theme hook (for system theme detection)
  const { theme, setTheme } = useTheme();

  // Panel resize logic
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isSshLoading, setIsSshLoading] = useState(false);

  // Get stored git options for current repo
  const getStoredOptions = useCallback((): GitOptionsStorage => {
    if (!activeTab?.path) return {};
    const key = `forky:git-options:${activeTab.path}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : {};
  }, [activeTab?.path]);

  // Save git options for current repo
  const saveOptions = useCallback((options: GitOptionsStorage) => {
    if (!activeTab?.path) return;
    const key = `forky:git-options:${activeTab.path}`;
    const current = getStoredOptions();
    localStorage.setItem(key, JSON.stringify({ ...current, ...options }));
  }, [activeTab?.path, getStoredOptions]);

  // Handle SSH host verification from git operation result
  const handleSshVerificationRequired = useCallback((
    result: GitOperationResult,
    retryOperation: () => Promise<void>
  ): boolean => {
    if (result.requires_ssh_verification) {
      const { host, key_type, fingerprint } = result.requires_ssh_verification;
      showSshVerification({ host, keyType: key_type, fingerprint }, retryOperation);
      return true;
    }
    return false;
  }, [showSshVerification]);

  // Accept SSH host and add to known_hosts
  const handleAcceptSshHost = useCallback(async () => {
    if (!sshVerification.hostInfo) return;

    setIsSshLoading(true);
    try {
      const result = await invoke<GitOperationResult>('add_ssh_known_host', {
        host: sshVerification.hostInfo.host,
      });

      if (result.success) {
        console.log('SSH host added:', result.message);
        const pendingOp = sshVerification.pendingOperation;
        closeSshVerification();
        if (pendingOp) {
          await pendingOp();
        }
      } else {
        console.error('Failed to add SSH host:', result.message);
      }
    } catch (error) {
      console.error('Error adding SSH host:', error);
    } finally {
      setIsSshLoading(false);
    }
  }, [sshVerification, closeSshVerification]);

  // Handle credential modal submit
  const handleCredentialSubmit = useCallback(async (value: string) => {
    const pendingOp = credentialModal.pendingOperation;
    closeCredentialModal();
    if (pendingOp) {
      await pendingOp(value);
    }
  }, [credentialModal, closeCredentialModal]);

  // Handle branch change from toolbar (git checkout)
  const handleBranchChange = useCallback(async (branchName: string) => {
    if (!activeTab?.path || isGitLoading) return;

    // Don't checkout if already on this branch
    if (activeTab.currentBranch === branchName) return;

    const command = `git checkout ${branchName}`;
    startOperation('Checkout', branchName);

    try {
      const result = await invoke<GitOperationResult>('git_checkout', { branchName });

      completeOperation(result);
      addLogEntry('Checkout', `Checkout '${branchName}'`, command, result.message, result.success);

      if (result.success) {
        // Update the current branch in the tab
        const activeTabId = useRepositoryStore.getState().activeTabId;
        if (activeTabId) {
          setTabCurrentBranch(activeTabId, branchName);
        }
        // Refresh repository data to update commits, branches, etc.
        await refreshActiveTab();
      } else {
        const errorTitle = getErrorTitle(result.error_type, 'Checkout');
        addAlert('error', errorTitle, result.message);
      }
    } catch (error) {
      console.error('Error checking out branch:', error);
      completeOperation({ success: false, message: String(error) });
      addLogEntry('Checkout', `Checkout '${branchName}'`, command, String(error), false);
      addAlert('error', 'Checkout Error', String(error));
    }
  }, [activeTab?.path, activeTab?.currentBranch, isGitLoading, startOperation, completeOperation, addLogEntry, setTabCurrentBranch, refreshActiveTab, addAlert, getErrorTitle]);

  // Open repository dialog
  const handleOpenRepo = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Git Repository',
      });

      if (selected) {
        await openRepository(selected);
      }
    } catch (error) {
      console.error('Error opening repository:', error);
    }
  }, [openRepository]);

  const handleBranchSelect = useCallback((branch: BranchInfo) => {
    console.log('Selected branch:', branch);
  }, []);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    const activeTabId = useRepositoryStore.getState().activeTabId;
    if (activeTabId) {
      updateTabState(activeTabId, { viewMode: mode });
    }
  }, [updateTabState]);

  const handleNavigateToCommit = useCallback((commitSha: string) => {
    const activeTabId = useRepositoryStore.getState().activeTabId;
    if (activeTabId) {
      updateTabState(activeTabId, { selectedCommitId: commitSha });
    }
  }, [updateTabState]);

  // Add Remote handler
  const handleAddRemote = useCallback(async (name: string, url: string) => {
    const command = `git remote add ${name} ${url}`;

    try {
      const result = await invoke<GitOperationResult>('git_add_remote', { name, url });
      addLogEntry('Other', `Add remote '${name}'`, command, result.message, result.success);

      if (!result.success) {
        addAlert('error', 'Add Remote Failed', result.message);
      }
    } catch (error) {
      const errorMessage = String(error);
      addLogEntry('Other', `Add remote '${name}'`, command, errorMessage, false);
      addAlert('error', 'Add Remote Error', errorMessage);
      throw error;
    }
  }, [addLogEntry, addAlert]);

  // Execute fetch with options
  const handleFetchWithOptions = useCallback(async (options: FetchOptions) => {
    if (!activeTab?.path || isGitLoading) return;

    saveOptions({ fetch: options });

    const target = options.all ? 'all remotes' : options.remote;
    const command = options.all ? 'git fetch --all --prune' : `git fetch --prune ${options.remote}`;
    startOperation('Fetch', target);

    const doFetch = async () => {
      try {
        const result = await invoke<GitOperationResult>('git_fetch_with_options', {
          remote: options.all ? null : options.remote,
          all: options.all,
        });

        if (handleSshVerificationRequired(result, () => doFetch())) {
          return;
        }

        completeOperation(result);
        addLogEntry('Fetch', `Fetch ${target}`, command, result.message, result.success);

        if (!result.success) {
          const errorTitle = getErrorTitle(result.error_type, 'Fetch');
          addAlert('error', errorTitle, result.message);
        }
      } catch (error) {
        console.error('Error fetching:', error);
        completeOperation({ success: false, message: String(error) });
        addLogEntry('Fetch', `Fetch ${target}`, command, String(error), false);
        addAlert('error', 'Fetch Error', String(error));
      }
    };

    await doFetch();
  }, [activeTab?.path, isGitLoading, saveOptions, startOperation, completeOperation, addLogEntry, addAlert, handleSshVerificationRequired]);

  // Execute pull with options
  const handlePullWithOptions = useCallback(async (options: PullOptions) => {
    if (!activeTab?.path || isGitLoading) return;

    saveOptions({ pull: options });

    const target = `${options.remote}/${options.branch}`;
    let command = `git pull ${options.remote} ${options.branch}`;
    if (options.rebase) command += ' --rebase';
    if (options.autostash) command += ' --autostash';
    startOperation('Pull', target);

    const doPull = async () => {
      try {
        const result = await invoke<GitOperationResult>('git_pull_with_options', {
          remote: options.remote,
          branch: options.branch,
          rebase: options.rebase,
          autostash: options.autostash,
        });

        if (handleSshVerificationRequired(result, () => doPull())) {
          return;
        }

        completeOperation(result);
        addLogEntry('Pull', `Pull ${target}`, command, result.message, result.success);

        if (!result.success) {
          const errorTitle = getErrorTitle(result.error_type, 'Pull');
          addAlert('error', errorTitle, result.message);
        }
      } catch (error) {
        console.error('Error pulling:', error);
        completeOperation({ success: false, message: String(error) });
        addLogEntry('Pull', `Pull ${target}`, command, String(error), false);
        addAlert('error', 'Pull Error', String(error));
      }
    };

    await doPull();
  }, [activeTab?.path, isGitLoading, saveOptions, startOperation, completeOperation, addLogEntry, addAlert, handleSshVerificationRequired]);

  // Execute push with options
  const handlePushWithOptions = useCallback(async (options: PushOptions) => {
    if (!activeTab?.path || isGitLoading) return;

    saveOptions({ push: { remote: options.remote, pushTags: options.pushTags, forceWithLease: options.forceWithLease } });

    const target = `${options.remote}/${options.remoteBranch}`;
    let command = `git push ${options.remote} ${options.branch}:${options.remoteBranch}`;
    if (options.pushTags) command += ' --tags';
    if (options.forceWithLease) command += ' --force-with-lease';
    startOperation('Push', target);

    const doPush = async () => {
      try {
        const result = await invoke<GitOperationResult>('git_push_with_options', {
          branch: options.branch,
          remote: options.remote,
          remoteBranch: options.remoteBranch,
          pushTags: options.pushTags,
          forceWithLease: options.forceWithLease,
        });

        if (handleSshVerificationRequired(result, () => doPush())) {
          return;
        }

        completeOperation(result);
        addLogEntry('Push', `Push to ${target}`, command, result.message, result.success);

        if (!result.success) {
          const errorTitle = getErrorTitle(result.error_type, 'Push');
          addAlert('error', errorTitle, result.message);
        }
      } catch (error) {
        console.error('Error pushing:', error);
        completeOperation({ success: false, message: String(error) });
        addLogEntry('Push', `Push to ${target}`, command, String(error), false);
        addAlert('error', 'Push Error', String(error));
      }
    };

    await doPush();
  }, [activeTab?.path, isGitLoading, saveOptions, startOperation, completeOperation, addLogEntry, addAlert, handleSshVerificationRequired]);

  // Panel resize handlers
  const startResize = useCallback((panel: string) => {
    setIsResizing(panel);
  }, [setIsResizing]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    if (isResizing === 'sidebar') {
      setPanelSize('sidebarWidth', e.clientX);
    }
  }, [isResizing, setPanelSize]);

  const stopResize = useCallback(() => {
    setIsResizing(null);
  }, [setIsResizing]);

  // Add/remove resize event listeners
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', stopResize);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', stopResize);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, handleMouseMove, stopResize]);

  // File watcher: start when active tab changes
  useEffect(() => {
    if (!activeTab?.path) return;

    // Start watcher for active tab's repository
    invoke('start_file_watcher', { path: activeTab.path }).catch((error) => {
      console.error('Failed to start file watcher:', error);
    });

    return () => {
      invoke('stop_file_watcher').catch((error) => {
        console.error('Failed to stop file watcher:', error);
      });
    };
  }, [activeTab?.path]);

  // File watcher: listen for file change events
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<{ repo_path: string; timestamp: number }>(
        'repo-files-changed',
        (event) => {
          // Find the tab matching this repo path and mark it as having pending changes
          const state = useRepositoryStore.getState();
          const matchingTab = state.tabs.find((tab) => tab.path === event.payload.repo_path);
          if (matchingTab && !matchingTab.hasPendingChanges) {
            setTabHasPendingChanges(matchingTab.id, true);
          }
        }
      );
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [setTabHasPendingChanges]);

  const hasOpenRepos = tabs.length > 0;

  // Loading state
  if (isRestoring) {
    return (
      <div className="app">
        <TitleBar>
          <Toolbar
            onOpenRepo={handleOpenRepo}
            onThemeChange={setTheme}
            currentTheme={theme}
            onFetch={openFetchModal}
            onPull={openPullModal}
            onPush={openPushModal}
            isLoading={isGitLoading}
            branches={[]}
            onBranchChange={handleBranchChange}
            gitOperation={currentOperation}
            onDismissOperation={clearOperation}
            onOpenActivityLog={openActivityLog}
          />
        </TitleBar>
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="loading-spinner" />
            <p>{t('app.restoringRepos')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <TitleBar>
        <Toolbar
          onOpenRepo={handleOpenRepo}
          repoName={activeTab?.name}
          repoPath={activeTab?.path}
          currentBranch={activeTab?.currentBranch ?? undefined}
          branches={activeTabState?.branches ?? []}
          onBranchChange={handleBranchChange}
          onThemeChange={setTheme}
          currentTheme={theme}
          onFetch={openFetchModal}
          onPull={openPullModal}
          onPush={openPushModal}
          isLoading={isGitLoading}
          gitOperation={currentOperation}
          onDismissOperation={clearOperation}
          onOpenActivityLog={openActivityLog}
        />
      </TitleBar>

      {hasOpenRepos && (
        <TabBar
          tabs={tabs}
          activeTabId={useRepositoryStore.getState().activeTabId}
          onTabSelect={selectTab}
          onTabClose={closeTab}
          onAddTab={handleOpenRepo}
        />
      )}

      {hasOpenRepos && activeTabState ? (
        <div className="app-content" ref={containerRef}>
          <div className="sidebar-container" style={{ width: panelSizes.sidebarWidth }}>
            <Sidebar
              repoName={activeTab?.name}
              repoPath={activeTab?.path}
              branches={activeTabState.branches}
              branchHeads={activeTabState.branchHeads}
              tags={activeTabState.tags}
              remotes={activeTabState.remotes}
              localChangesCount={localChangesCount}
              viewMode={activeTabState.viewMode}
              onViewModeChange={handleViewModeChange}
              onBranchSelect={handleBranchSelect}
              onNavigateToCommit={handleNavigateToCommit}
              onAddRemote={openAddRemoteModal}
            />
          </div>
          <Resizer
            direction="horizontal"
            onMouseDown={() => startResize('sidebar')}
            isResizing={isResizing === 'sidebar'}
          />
          {activeTabState.viewMode === 'local-changes' ? (
            <LocalChangesView
              repoPath={activeTab?.path ?? ''}
              onRefreshRepository={refreshActiveTab}
            />
          ) : (
            <AllCommitsView
              repoPath={activeTab?.path ?? ''}
              selectedCommitId={activeTabState.selectedCommitId}
              onCommitSelect={handleNavigateToCommit}
            />
          )}
        </div>
      ) : (
        <div className="welcome-overlay">
          <div className="welcome-content">
            <h1>{t('welcome.title')}</h1>
            <p>{t('welcome.subtitle')}</p>
            <button className="open-repo-btn" onClick={handleOpenRepo}>
              {t('welcome.openRepository')}
            </button>
          </div>
        </div>
      )}

      {/* Git Operation Modals - Lazy loaded */}
      <Suspense fallback={null}>
        {activeModal === 'fetch' && (
          <FetchModal
            isOpen={true}
            onClose={closeModal}
            onFetch={handleFetchWithOptions}
            remotes={activeTabState?.remotes ?? []}
            savedOptions={getStoredOptions().fetch}
          />
        )}
        {activeModal === 'pull' && (
          <PullModal
            isOpen={true}
            onClose={closeModal}
            onPull={handlePullWithOptions}
            remotes={activeTabState?.remotes ?? []}
            branches={activeTabState?.branches ?? []}
            currentBranch={activeTab?.currentBranch ?? null}
            savedOptions={getStoredOptions().pull}
          />
        )}
        {activeModal === 'push' && (
          <PushModal
            isOpen={true}
            onClose={closeModal}
            onPush={handlePushWithOptions}
            remotes={activeTabState?.remotes ?? []}
            branches={activeTabState?.branches ?? []}
            currentBranch={activeTab?.currentBranch ?? null}
            savedOptions={getStoredOptions().push ? {
              branch: activeTab?.currentBranch ?? 'main',
              remote: getStoredOptions().push!.remote,
              remoteBranch: activeTab?.currentBranch ?? 'main',
              pushTags: getStoredOptions().push!.pushTags,
              forceWithLease: getStoredOptions().push!.forceWithLease,
            } : undefined}
          />
        )}

        {/* SSH Host Verification Modal */}
        {sshVerification.isOpen && (
          <SshHostVerificationModal
            isOpen={true}
            onClose={closeSshVerification}
            onAccept={handleAcceptSshHost}
            onReject={closeSshVerification}
            hostInfo={sshVerification.hostInfo}
            isLoading={isSshLoading}
          />
        )}

        {/* Git Credential Modal */}
        {credentialModal.isOpen && (
          <GitCredentialModal
            isOpen={true}
            onClose={closeCredentialModal}
            onSubmit={handleCredentialSubmit}
            onCancel={closeCredentialModal}
            request={credentialModal.request}
          />
        )}

        {/* Add Remote Modal */}
        {isAddRemoteModalOpen && (
          <AddRemoteModal
            isOpen={true}
            onClose={closeAddRemoteModal}
            onAdd={handleAddRemote}
            existingRemotes={activeTabState?.remotes ?? []}
          />
        )}

        {/* Git Activity Log */}
        {isActivityLogOpen && (
          <GitActivityLog
            entries={activityLog}
            isOpen={true}
            onClose={closeActivityLog}
          />
        )}
      </Suspense>

      {/* Alert Container - Not lazy loaded as it needs to be always ready */}
      <AlertContainer alerts={alerts} onDismiss={removeAlert} />
    </div>
  );
}

export default App;
