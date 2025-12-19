import { useState, useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { TitleBar } from './components/titlebar/TitleBar';
import { TabBar } from './components/tabbar/TabBar';
import { Toolbar } from './components/toolbar/Toolbar';
import { Sidebar } from './components/sidebar/Sidebar';
import { LocalChangesView } from './components/local-changes';
import { AllCommitsView } from './components/all-commits/AllCommitsView';
import { Resizer } from './components/resizer/Resizer';
import { FetchModal, PullModal, PushModal, SshHostVerificationModal, GitCredentialModal } from './components/git-modals';
import type { FetchOptions, PullOptions, PushOptions, SshHostInfo, CredentialRequest } from './components/git-modals';
import { AlertContainer, AlertData } from './components/alert';
import { usePanelResize } from './hooks/usePanelResize';
import { useRepositoryTabs } from './hooks/useRepositoryTabs';
import { useTheme } from './hooks/useTheme';
import { BranchInfo, ViewMode, GitOperationResult, GitOptionsStorage } from './types/git';
import './styles/global.css';
import './App.css';

type ModalType = 'fetch' | 'pull' | 'push' | null;

function App() {
  const {
    tabs,
    activeTab,
    activeTabId,
    activeTabState,
    isRestoring,
    openRepository,
    selectTab,
    closeTab,
    updateTabState,
  } = useRepositoryTabs();

  const { sizes, isResizing, startResize, containerRef } = usePanelResize();

  // Theme management
  const { theme, setTheme } = useTheme();

  // Git operation loading state
  const [isGitLoading, setIsGitLoading] = useState(false);

  // Modal state
  const [openModal, setOpenModal] = useState<ModalType>(null);

  // SSH verification state
  const [sshVerification, setSshVerification] = useState<{
    isOpen: boolean;
    hostInfo: SshHostInfo | null;
    pendingOperation: (() => Promise<void>) | null;
  }>({ isOpen: false, hostInfo: null, pendingOperation: null });
  const [isSshLoading, setIsSshLoading] = useState(false);

  // Credential modal state
  const [credentialModal, setCredentialModal] = useState<{
    isOpen: boolean;
    request: CredentialRequest | null;
    pendingOperation: ((credential: string) => Promise<void>) | null;
  }>({ isOpen: false, request: null, pendingOperation: null });

  // Alerts state
  const [alerts, setAlerts] = useState<AlertData[]>([]);

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
      setSshVerification({
        isOpen: true,
        hostInfo: { host, keyType: key_type, fingerprint },
        pendingOperation: retryOperation,
      });
      return true;
    }
    return false;
  }, []);

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
        // Close modal and retry the operation
        const pendingOp = sshVerification.pendingOperation;
        setSshVerification({ isOpen: false, hostInfo: null, pendingOperation: null });
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
  }, [sshVerification]);

  // Reject SSH host
  const handleRejectSshHost = useCallback(() => {
    setSshVerification({ isOpen: false, hostInfo: null, pendingOperation: null });
  }, []);

  // Add alert
  const addAlert = useCallback((type: AlertData['type'], title: string, message: string, duration = 8000) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setAlerts((prev) => [...prev, { id, type, title, message, duration }]);
  }, []);

  // Remove alert
  const removeAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id));
  }, []);

  // Handle git operation result - show errors to user
  const handleGitResult = useCallback((result: GitOperationResult, operationName: string) => {
    if (result.success) {
      // Show success message for non-trivial results
      if (result.message && !result.message.includes('Already up to date') && !result.message.includes('Everything up-to-date')) {
        addAlert('success', `${operationName} Completed`, result.message, 5000);
      }
      return true;
    }

    // Handle SSH verification requirement
    if (result.requires_ssh_verification) {
      // This is handled by handleSshVerificationRequired
      return false;
    }

    // Show error to user
    const errorTitle = getErrorTitle(result.error_type, operationName);
    addAlert('error', errorTitle, result.message);
    return false;
  }, [addAlert]);

  // Get user-friendly error title based on error type
  const getErrorTitle = (errorType: string | undefined, operationName: string): string => {
    switch (errorType) {
      case 'ssh_host_verification_failed':
        return 'SSH Host Verification Failed';
      case 'authentication_failed':
        return 'Authentication Failed';
      case 'remote_access_failed':
        return 'Remote Access Failed';
      case 'connection_refused':
        return 'Connection Refused';
      case 'connection_timeout':
        return 'Connection Timeout';
      case 'host_not_found':
        return 'Host Not Found';
      case 'git_error':
        return `${operationName} Failed`;
      default:
        return `${operationName} Failed`;
    }
  };

  // Handle credential modal submit
  const handleCredentialSubmit = useCallback(async (value: string) => {
    const pendingOp = credentialModal.pendingOperation;
    setCredentialModal({ isOpen: false, request: null, pendingOperation: null });
    if (pendingOp) {
      await pendingOp(value);
    }
  }, [credentialModal]);

  // Handle credential modal cancel
  const handleCredentialCancel = useCallback(() => {
    setCredentialModal({ isOpen: false, request: null, pendingOperation: null });
  }, []);

  const handleOpenRepo = async () => {
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
  };

  const handleBranchSelect = (branch: BranchInfo) => {
    console.log('Selected branch:', branch);
  };

  const handleViewModeChange = (mode: ViewMode) => {
    if (activeTabId) {
      updateTabState(activeTabId, { viewMode: mode });
    }
  };

  const handleNavigateToCommit = (commitSha: string) => {
    if (activeTabId) {
      updateTabState(activeTabId, { selectedCommitId: commitSha });
    }
  };

  // Open modals (triggered from toolbar)
  const handleOpenFetchModal = () => setOpenModal('fetch');
  const handleOpenPullModal = () => setOpenModal('pull');
  const handleOpenPushModal = () => setOpenModal('push');
  const handleCloseModal = () => setOpenModal(null);

  // Execute fetch with options (triggered from modal)
  const handleFetchWithOptions = async (options: FetchOptions) => {
    if (!activeTab?.path || isGitLoading) return;

    // Save options for next time
    saveOptions({ fetch: options });

    const doFetch = async () => {
      setIsGitLoading(true);
      try {
        const result = await invoke<GitOperationResult>('git_fetch_with_options', {
          remote: options.all ? null : options.remote,
          all: options.all,
        });

        // Check for SSH verification requirement
        if (handleSshVerificationRequired(result, () => doFetch())) {
          return;
        }

        handleGitResult(result, 'Fetch');
      } catch (error) {
        console.error('Error fetching:', error);
        addAlert('error', 'Fetch Error', String(error));
      } finally {
        setIsGitLoading(false);
      }
    };

    await doFetch();
  };

  // Execute pull with options (triggered from modal)
  const handlePullWithOptions = async (options: PullOptions) => {
    if (!activeTab?.path || isGitLoading) return;

    // Save options for next time
    saveOptions({ pull: options });

    const doPull = async () => {
      setIsGitLoading(true);
      try {
        const result = await invoke<GitOperationResult>('git_pull_with_options', {
          remote: options.remote,
          branch: options.branch,
          rebase: options.rebase,
          autostash: options.autostash,
        });

        // Check for SSH verification requirement
        if (handleSshVerificationRequired(result, () => doPull())) {
          return;
        }

        handleGitResult(result, 'Pull');
      } catch (error) {
        console.error('Error pulling:', error);
        addAlert('error', 'Pull Error', String(error));
      } finally {
        setIsGitLoading(false);
      }
    };

    await doPull();
  };

  // Execute push with options (triggered from modal)
  const handlePushWithOptions = async (options: PushOptions) => {
    if (!activeTab?.path || isGitLoading) return;

    // Save options for next time
    saveOptions({ push: { remote: options.remote, pushTags: options.pushTags, forceWithLease: options.forceWithLease } });

    const doPush = async () => {
      setIsGitLoading(true);
      try {
        const result = await invoke<GitOperationResult>('git_push_with_options', {
          branch: options.branch,
          remote: options.remote,
          remoteBranch: options.remoteBranch,
          pushTags: options.pushTags,
          forceWithLease: options.forceWithLease,
        });

        // Check for SSH verification requirement
        if (handleSshVerificationRequired(result, () => doPush())) {
          return;
        }

        handleGitResult(result, 'Push');
      } catch (error) {
        console.error('Error pushing:', error);
        addAlert('error', 'Push Error', String(error));
      } finally {
        setIsGitLoading(false);
      }
    };

    await doPush();
  };

  const hasOpenRepos = tabs.length > 0;
  const localChangesCount = activeTabState?.fileStatuses.length ?? 0;

  if (isRestoring) {
    return (
      <div className="app">
        <TitleBar>
          <Toolbar
            onOpenRepo={handleOpenRepo}
            onThemeChange={setTheme}
            currentTheme={theme}
            onFetch={handleOpenFetchModal}
            onPull={handleOpenPullModal}
            onPush={handleOpenPushModal}
            isLoading={isGitLoading}
          />
        </TitleBar>
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="loading-spinner" />
            <p>Restoring repositories...</p>
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
          currentBranch={activeTab?.currentBranch ?? undefined}
          onThemeChange={setTheme}
          currentTheme={theme}
          onFetch={handleOpenFetchModal}
          onPull={handleOpenPullModal}
          onPush={handleOpenPushModal}
          isLoading={isGitLoading}
        />
      </TitleBar>
      {hasOpenRepos && (
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onTabSelect={selectTab}
          onTabClose={closeTab}
          onAddTab={handleOpenRepo}
        />
      )}
      {hasOpenRepos && activeTabState ? (
        <div className="app-content" ref={containerRef}>
          <div className="sidebar-container" style={{ width: sizes.sidebarWidth }}>
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
            />
          </div>
          <Resizer
            direction="horizontal"
            onMouseDown={() => startResize('sidebar')}
            isResizing={isResizing === 'sidebar'}
          />
          {activeTabState.viewMode === 'local-changes' ? (
            <LocalChangesView repoPath={activeTab?.path ?? ''} />
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
            <h1>Forky</h1>
            <p>Free fast and friendly Git client</p>
            <button className="open-repo-btn" onClick={handleOpenRepo}>
              Open Repository
            </button>
          </div>
        </div>
      )}

      {/* Git Operation Modals */}
      <FetchModal
        isOpen={openModal === 'fetch'}
        onClose={handleCloseModal}
        onFetch={handleFetchWithOptions}
        remotes={activeTabState?.remotes ?? []}
        savedOptions={getStoredOptions().fetch}
      />
      <PullModal
        isOpen={openModal === 'pull'}
        onClose={handleCloseModal}
        onPull={handlePullWithOptions}
        remotes={activeTabState?.remotes ?? []}
        branches={activeTabState?.branches ?? []}
        currentBranch={activeTab?.currentBranch ?? null}
        savedOptions={getStoredOptions().pull}
      />
      <PushModal
        isOpen={openModal === 'push'}
        onClose={handleCloseModal}
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

      {/* SSH Host Verification Modal */}
      <SshHostVerificationModal
        isOpen={sshVerification.isOpen}
        onClose={() => setSshVerification({ isOpen: false, hostInfo: null, pendingOperation: null })}
        onAccept={handleAcceptSshHost}
        onReject={handleRejectSshHost}
        hostInfo={sshVerification.hostInfo}
        isLoading={isSshLoading}
      />

      {/* Git Credential Modal */}
      <GitCredentialModal
        isOpen={credentialModal.isOpen}
        onClose={() => setCredentialModal({ isOpen: false, request: null, pendingOperation: null })}
        onSubmit={handleCredentialSubmit}
        onCancel={handleCredentialCancel}
        request={credentialModal.request}
      />

      {/* Alert Container */}
      <AlertContainer alerts={alerts} onDismiss={removeAlert} />
    </div>
  );
}

export default App;
