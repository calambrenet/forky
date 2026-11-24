import { useCallback, useEffect, useRef, useState, lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
import { StatusBar } from './components/status-bar';
import { ActivityLogPanel } from './components/activity-log-panel';
import type { FetchOptions, PullOptions, PushOptions } from './components/git-modals';

// Lazy load modals for code splitting
const FetchModal = lazy(() =>
  import('./components/git-modals/FetchModal').then((m) => ({ default: m.FetchModal }))
);
const PullModal = lazy(() =>
  import('./components/git-modals/PullModal').then((m) => ({ default: m.PullModal }))
);
const PushModal = lazy(() =>
  import('./components/git-modals/PushModal').then((m) => ({ default: m.PushModal }))
);
const SshHostVerificationModal = lazy(() =>
  import('./components/git-modals/SshHostVerificationModal').then((m) => ({
    default: m.SshHostVerificationModal,
  }))
);
const GitCredentialModal = lazy(() =>
  import('./components/git-modals/GitCredentialModal').then((m) => ({
    default: m.GitCredentialModal,
  }))
);
const TrackRemoteBranchModal = lazy(() =>
  import('./components/git-modals/TrackRemoteBranchModal').then((m) => ({
    default: m.TrackRemoteBranchModal,
  }))
);
const CheckoutConflictModal = lazy(() =>
  import('./components/git-modals/CheckoutConflictModal').then((m) => ({
    default: m.CheckoutConflictModal,
  }))
);
const DivergentBranchesModal = lazy(() =>
  import('./components/git-modals/DivergentBranchesModal').then((m) => ({
    default: m.DivergentBranchesModal,
  }))
);
const AddRemoteModal = lazy(() =>
  import('./components/add-remote-modal').then((m) => ({ default: m.AddRemoteModal }))
);
const FeedbackModal = lazy(() =>
  import('./components/feedback-modal').then((m) => ({ default: m.FeedbackModal }))
);
const SaveStashModal = lazy(() =>
  import('./components/git-modals/SaveStashModal').then((m) => ({ default: m.SaveStashModal }))
);
const ApplyStashModal = lazy(() =>
  import('./components/git-modals/ApplyStashModal').then((m) => ({ default: m.ApplyStashModal }))
);
const GitNotInstalledModal = lazy(() =>
  import('./components/git-modals/GitNotInstalledModal').then((m) => ({
    default: m.GitNotInstalledModal,
  }))
);
const MergeModal = lazy(() =>
  import('./components/git-modals/MergeModal').then((m) => ({ default: m.MergeModal }))
);
const RebaseModal = lazy(() =>
  import('./components/git-modals/RebaseModal').then((m) => ({ default: m.RebaseModal }))
);
const InteractiveRebaseModal = lazy(() =>
  import('./components/git-modals/InteractiveRebaseModal').then((m) => ({
    default: m.InteractiveRebaseModal,
  }))
);
const GitFlowStartModal = lazy(() =>
  import('./components/git-modals/GitFlowStartModal').then((m) => ({
    default: m.GitFlowStartModal,
  }))
);
const GitFlowFinishModal = lazy(() =>
  import('./components/git-modals/GitFlowFinishModal').then((m) => ({
    default: m.GitFlowFinishModal,
  }))
);
const GitFlowInitModal = lazy(() =>
  import('./components/git-modals/GitFlowInitModal').then((m) => ({
    default: m.GitFlowInitModal,
  }))
);
const CreateBranchModal = lazy(() =>
  import('./components/git-modals/CreateBranchModal').then((m) => ({
    default: m.CreateBranchModal,
  }))
);
const AboutModal = lazy(() =>
  import('./components/about-modal').then((m) => ({ default: m.AboutModal }))
);
const SettingsModal = lazy(() =>
  import('./components/settings-modal').then((m) => ({ default: m.SettingsModal }))
);

// Zustand stores
import {
  useRepositoryStore,
  useTabs,
  useActiveTab,
  useActiveTabId,
  useActiveTabState,
  useActiveTabStashes,
  useIsRestoring,
  useLocalChangesCount,
  useGitOperationStore,
  useIsGitLoading,
  useCurrentOperation,
  useActivityLogForRepo,
  useModalStore,
  useActiveModal,
  useIsAddRemoteModalOpen,
  useSshVerification,
  useCredentialModal,
  useUIStore,
  useAlerts,
  usePanelSizes,
  useIsResizing,
  useActivityLogPanelOpen,
  MIN_SIZES,
  MAX_SIZES,
} from './stores';

import { useTheme } from './hooks/useTheme';
import {
  useGitOperation,
  // Branch helpers
  trackRemoteBranchOperation,
  createBranchOperation,
  renameBranchOperation,
  deleteBranchOperation,
  fastForwardOperation,
  // Stash helpers
  saveStashOperation,
  applyStashOperation,
  popStashOperation,
  dropStashOperation,
  // Workflow helpers
  mergeOperation,
  rebaseOperation,
  interactiveRebaseOperation,
  gitFlowInitOperation,
  gitFlowStartOperation,
  gitFlowFinishOperation,
  createTagOperation,
} from './hooks/git';
import { getBranchRemote } from './utils/branchUtils';
import type {
  BranchInfo,
  ViewMode,
  GitOperationResult,
  GitOptionsStorage,
  StashInfo,
  MergePreview,
  MergeType,
  RebasePreview,
  InteractiveRebaseEntry,
  GitFlowConfig,
  CurrentBranchFlowInfo,
  GitFlowType,
} from './types/git';
import './styles/global.css';
import './App.css';

const EMPTY_BRANCHES: BranchInfo[] = [];
const EMPTY_REMOTES: string[] = [];
const EMPTY_STASHES: StashInfo[] = [];

function App() {
  const { t } = useTranslation();

  // Helper function for error titles
  const getErrorTitle = useCallback(
    (errorType: string | undefined, _operationName: string): string => {
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
    },
    [t]
  );
  // Repository store (atomic state selectors + stable action references via getState)
  const tabs = useTabs();
  const activeTab = useActiveTab();
  const activeTabId = useActiveTabId();
  const activeTabState = useActiveTabState();
  const stashes = useActiveTabStashes();
  const isRestoring = useIsRestoring();
  const localChangesCount = useLocalChangesCount();
  const openRepository = useRepositoryStore((s) => s.openRepository);
  const selectTab = useRepositoryStore((s) => s.selectTab);
  const closeTab = useRepositoryStore((s) => s.closeTab);
  const closeOtherTabs = useRepositoryStore((s) => s.closeOtherTabs);
  const closeAllTabs = useRepositoryStore((s) => s.closeAllTabs);
  const closeTabsToRight = useRepositoryStore((s) => s.closeTabsToRight);
  const closeTabsToLeft = useRepositoryStore((s) => s.closeTabsToLeft);
  const updateTabState = useRepositoryStore((s) => s.updateTabState);
  const refreshActiveTab = useRepositoryStore((s) => s.refreshActiveTab);
  const setTabCurrentBranch = useRepositoryStore((s) => s.setTabCurrentBranch);

  // Git operation store
  const isGitLoading = useIsGitLoading();
  const currentOperation = useCurrentOperation();
  const activityLog = useActivityLogForRepo(activeTab?.path);
  const startOperation = useGitOperationStore((s) => s.startOperation);
  const completeOperation = useGitOperationStore((s) => s.completeOperation);
  const clearOperation = useGitOperationStore((s) => s.clearOperation);
  const addLogEntry = useGitOperationStore((s) => s.addLogEntry);

  // Modal store
  const activeModal = useActiveModal();
  const isAddRemoteModalOpen = useIsAddRemoteModalOpen();
  const sshVerification = useSshVerification();
  const credentialModal = useCredentialModal();
  const openFetchModal = useModalStore((s) => s.openFetchModal);
  const openPullModal = useModalStore((s) => s.openPullModal);
  const openPushModal = useModalStore((s) => s.openPushModal);
  const closeModal = useModalStore((s) => s.closeModal);
  const openAddRemoteModal = useModalStore((s) => s.openAddRemoteModal);
  const closeAddRemoteModal = useModalStore((s) => s.closeAddRemoteModal);
  const showSshVerification = useModalStore((s) => s.showSshVerification);
  const closeSshVerification = useModalStore((s) => s.closeSshVerification);
  const closeCredentialModal = useModalStore((s) => s.closeCredentialModal);

  // Activity Log Panel (from uiStore)
  const isActivityLogPanelOpen = useActivityLogPanelOpen();
  const clearActivityLog = useGitOperationStore((state) => state.clearActivityLog);

  // Memoized activity log stats to avoid recalculating on every render
  const activityLogStats = useMemo(
    () => ({
      total: activityLog.length,
      errors: activityLog.filter((e) => !e.success).length,
    }),
    [activityLog]
  );

  // Stable callback for clearing activity log
  const handleClearActivityLog = useCallback(() => {
    if (activeTab?.path) {
      clearActivityLog(activeTab.path);
    }
  }, [activeTab?.path, clearActivityLog]);

  // UI store (atomic selectors)
  const alerts = useAlerts();
  const panelSizes = usePanelSizes();
  const isResizing = useIsResizing();
  const settingsOpen = useUIStore((state) => state.settingsOpen);
  const settingsInitialPanel = useUIStore((state) => state.settingsInitialPanel);
  const openSettings = useUIStore((state) => state.openSettings);
  const closeSettings = useUIStore((state) => state.closeSettings);
  const addAlert = useUIStore((state) => state.addAlert);
  const removeAlert = useUIStore((state) => state.removeAlert);
  const setPanelSize = useUIStore((state) => state.setPanelSize);
  const setIsResizing = useUIStore((state) => state.setIsResizing);

  // Theme hook (for system theme detection)
  const { theme, setTheme } = useTheme();

  // Git operation hook (unified operation handling)
  const { executeOperation } = useGitOperation();

  // Panel resize logic
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sidebarContainerRef = useRef<HTMLDivElement | null>(null);
  const pendingSidebarWidthRef = useRef<number | null>(null);
  const sidebarRafRef = useRef<number | null>(null);
  const [isSshLoading, setIsSshLoading] = useState(false);

  // Recent repositories (loaded from Rust, persisted to disk)
  const [recentRepos, setRecentRepos] = useState<
    Array<{ path: string; name: string; last_opened: number }>
  >([]);

  // Track Remote Branch modal state
  const [trackBranchModalOpen, setTrackBranchModalOpen] = useState(false);
  const [selectedRemoteBranch, setSelectedRemoteBranch] = useState('');

  // Expand tags section (after creating a tag)
  const [expandTagsSection, setExpandTagsSection] = useState(false);

  // Feedback modal state
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);

  // About modal state
  const [aboutModalOpen, setAboutModalOpen] = useState(false);

  // Stash modal state
  const [saveStashModalOpen, setSaveStashModalOpen] = useState(false);
  const [isSnapshotMode, setIsSnapshotMode] = useState(false);
  const [applyStashModalOpen, setApplyStashModalOpen] = useState(false);
  const [selectedStash, setSelectedStash] = useState<StashInfo | null>(null);

  // Checkout conflict modal state
  const [checkoutConflictModalOpen, setCheckoutConflictModalOpen] = useState(false);
  const [checkoutConflictBranch, setCheckoutConflictBranch] = useState('');
  const [checkoutConflictFiles, setCheckoutConflictFiles] = useState<string[]>([]);
  const [isCheckoutWithStashLoading, setIsCheckoutWithStashLoading] = useState(false);

  // Git not installed modal state
  const [gitNotInstalledModalOpen, setGitNotInstalledModalOpen] = useState(false);

  // Merge modal state
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeBranch, setMergeBranch] = useState<BranchInfo | null>(null);
  const [mergePreview, setMergePreview] = useState<MergePreview | null>(null);

  // Rebase modal state
  const [rebaseModalOpen, setRebaseModalOpen] = useState(false);
  const [rebaseBranch, setRebaseBranch] = useState<BranchInfo | null>(null);
  const [rebasePreview, setRebasePreview] = useState<RebasePreview | null>(null);

  // Interactive rebase modal state
  const [interactiveRebaseModalOpen, setInteractiveRebaseModalOpen] = useState(false);
  const [interactiveRebaseBranch, setInteractiveRebaseBranch] = useState<BranchInfo | null>(null);
  const [interactiveRebaseCommits, setInteractiveRebaseCommits] = useState<
    InteractiveRebaseEntry[]
  >([]);
  const [isInteractiveRebaseLoading, setIsInteractiveRebaseLoading] = useState(false);

  // Git Flow state
  const [gitFlowConfig, setGitFlowConfig] = useState<GitFlowConfig | null>(null);
  const [currentBranchFlowInfo, setCurrentBranchFlowInfo] = useState<CurrentBranchFlowInfo | null>(
    null
  );
  const [gitFlowStartModalOpen, setGitFlowStartModalOpen] = useState(false);
  const [gitFlowStartType, setGitFlowStartType] = useState<GitFlowType>('feature');
  const [gitFlowFinishModalOpen, setGitFlowFinishModalOpen] = useState(false);
  const [gitFlowInitModalOpen, setGitFlowInitModalOpen] = useState(false);

  // Create Branch modal state (from Branch dropdown)
  const [createBranchModalOpen, setCreateBranchModalOpen] = useState(false);

  // Local changes refresh key - increment to force reload
  const [localChangesRefreshKey, setLocalChangesRefreshKey] = useState(0);

  // Divergent branches modal state
  const [divergentBranchesModalOpen, setDivergentBranchesModalOpen] = useState(false);
  const [pendingPullOptions, setPendingPullOptions] = useState<PullOptions | null>(null);

  // Branch context menu modal presets
  const [pullModalPreset, setPullModalPreset] = useState<{
    remote: string;
    branch: string;
  } | null>(null);
  const [pushModalPreset, setPushModalPreset] = useState<{
    branch: string;
    remote: string;
  } | null>(null);

  // Get stored git options for current repo
  const getStoredOptions = useCallback((): GitOptionsStorage => {
    if (!activeTab?.path) return {};
    const key = `forky:git-options:${activeTab.path}`;
    try {
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as GitOptionsStorage) : {};
    } catch {
      return {};
    }
  }, [activeTab?.path]);

  // Save git options for current repo
  const saveOptions = useCallback(
    (options: GitOptionsStorage) => {
      if (!activeTab?.path) return;
      const key = `forky:git-options:${activeTab.path}`;
      const current = getStoredOptions();
      try {
        localStorage.setItem(key, JSON.stringify({ ...current, ...options }));
      } catch (error) {
        console.error('Error saving git options:', error);
      }
    },
    [activeTab?.path, getStoredOptions]
  );

  // Handle SSH host verification from git operation result
  const handleSshVerificationRequired = useCallback(
    (result: GitOperationResult, retryOperation: () => Promise<void>): boolean => {
      if (result.requires_ssh_verification) {
        const { host, key_type, fingerprint } = result.requires_ssh_verification;
        showSshVerification({ host, keyType: key_type, fingerprint }, retryOperation);
        return true;
      }
      return false;
    },
    [showSshVerification]
  );

  // Reject/close SSH host verification and release the in-progress git loading lock
  const handleRejectSshHost = useCallback(() => {
    closeSshVerification();
    completeOperation({
      success: false,
      message: 'SSH host verification cancelled',
    });
  }, [closeSshVerification, completeOperation]);

  // Accept SSH host and add to known_hosts (verifying approved fingerprint)
  const handleAcceptSshHost = useCallback(async () => {
    if (!sshVerification.hostInfo) return;

    setIsSshLoading(true);
    try {
      const result = await invoke<GitOperationResult>('add_ssh_known_host', {
        host: sshVerification.hostInfo.host,
        expectedFingerprint: sshVerification.hostInfo.fingerprint,
      });

      if (result.success) {
        const pendingOp = sshVerification.pendingOperation;
        closeSshVerification();
        if (pendingOp) {
          await pendingOp();
        } else {
          completeOperation(result);
        }
      } else {
        console.error('Failed to add SSH host:', result.message);
        closeSshVerification();
        completeOperation(result);
        addAlert('error', t('alerts.gitError'), result.message);
      }
    } catch (error) {
      const errorMessage = String(error);
      console.error('Error adding SSH host:', error);
      closeSshVerification();
      completeOperation({ success: false, message: errorMessage });
      addAlert('error', t('alerts.gitError'), errorMessage);
    } finally {
      setIsSshLoading(false);
    }
  }, [sshVerification, closeSshVerification, completeOperation, addAlert, t]);

  // Handle credential modal submit
  const handleCredentialSubmit = useCallback(
    async (value: string) => {
      const pendingOp = credentialModal.pendingOperation;
      closeCredentialModal();
      if (pendingOp) {
        await pendingOp(value);
      }
    },
    [credentialModal, closeCredentialModal]
  );

  // Handle branch change from toolbar (git checkout)
  const handleBranchChange = useCallback(
    async (branchName: string) => {
      const targetTab = useRepositoryStore.getState().getActiveTab();
      if (!targetTab?.path || useGitOperationStore.getState().isLoading) return;

      // Don't checkout if already on this branch
      if (targetTab.currentBranch === branchName) return;

      const targetTabId = targetTab.id;
      const targetRepoPath = targetTab.path;
      const command = `git checkout ${branchName}`;
      startOperation('Checkout', branchName);

      try {
        const result = await invoke<GitOperationResult>('git_checkout', {
          repoPath: targetRepoPath,
          branchName,
        });

        completeOperation(result);
        addLogEntry(
          targetRepoPath,
          'Checkout',
          `Checkout '${branchName}'`,
          command,
          result.message,
          result.success
        );

        if (result.success) {
          setTabCurrentBranch(targetTabId, branchName);
          await useRepositoryStore.getState().refreshTab(targetTabId);
        } else if (result.error_type === 'checkout_would_overwrite') {
          setCheckoutConflictBranch(branchName);
          setCheckoutConflictFiles(result.conflicting_files || []);
          setCheckoutConflictModalOpen(true);
        } else {
          const errorTitle = getErrorTitle(result.error_type, 'Checkout');
          addAlert('error', errorTitle, result.message);
        }
      } catch (error) {
        console.error('Error checking out branch:', error);
        completeOperation({ success: false, message: String(error) });
        addLogEntry(
          targetRepoPath,
          'Checkout',
          `Checkout '${branchName}'`,
          command,
          String(error),
          false
        );
        addAlert('error', 'Checkout Error', String(error));
      }
    },
    [startOperation, completeOperation, addLogEntry, setTabCurrentBranch, addAlert, getErrorTitle]
  );

  // Handle checkout with stash (from conflict modal)
  const handleCheckoutWithStash = useCallback(
    async (restoreChanges: boolean) => {
      if (!activeTab?.path || !checkoutConflictBranch) return;

      const targetTab = useRepositoryStore.getState().getActiveTab();
      if (!targetTab?.path) return;
      const targetTabId = targetTab.id;
      const targetRepoPath = targetTab.path;

      setIsCheckoutWithStashLoading(true);
      const command = restoreChanges
        ? `git stash push -u && git checkout ${checkoutConflictBranch} && git stash pop`
        : `git stash push -u && git checkout ${checkoutConflictBranch}`;

      startOperation('Checkout', checkoutConflictBranch);

      try {
        const result = await invoke<GitOperationResult>('git_checkout_with_stash', {
          repoPath: targetRepoPath,
          branchName: checkoutConflictBranch,
          restoreChanges,
        });

        completeOperation(result);
        addLogEntry(
          targetRepoPath,
          'Checkout',
          `Checkout '${checkoutConflictBranch}' with stash`,
          command,
          result.message,
          result.success
        );

        if (result.success) {
          setTabCurrentBranch(targetTabId, checkoutConflictBranch);
          await useRepositoryStore.getState().refreshTab(targetTabId);
          setLocalChangesRefreshKey((k) => k + 1);

          // Matches backend `stash_pop_conflict` when stash restore hits conflicts
          if (result.error_type === 'stash_pop_conflict') {
            addAlert('warning', t('alerts.checkoutSuccess'), result.message);
          }
        } else {
          const errorTitle = getErrorTitle(result.error_type, 'Checkout');
          addAlert('error', errorTitle, result.message);
        }
      } catch (error) {
        console.error('Error checking out with stash:', error);
        completeOperation({ success: false, message: String(error) });
        addLogEntry(
          targetRepoPath,
          'Checkout',
          `Checkout '${checkoutConflictBranch}' with stash`,
          command,
          String(error),
          false
        );
        addAlert('error', 'Checkout Error', String(error));
      } finally {
        setIsCheckoutWithStashLoading(false);
        setCheckoutConflictModalOpen(false);
        setCheckoutConflictBranch('');
        setCheckoutConflictFiles([]);
      }
    },
    [
      activeTab?.path,
      checkoutConflictBranch,
      startOperation,
      completeOperation,
      addLogEntry,
      setTabCurrentBranch,
      addAlert,
      getErrorTitle,
      t,
    ]
  );

  // Handle opening track remote branch modal
  const handleOpenTrackBranchModal = useCallback((remoteBranchName: string) => {
    setSelectedRemoteBranch(remoteBranchName);
    setTrackBranchModalOpen(true);
  }, []);

  // Handle closing track remote branch modal
  const handleCloseTrackBranchModal = useCallback(() => {
    setTrackBranchModalOpen(false);
    setSelectedRemoteBranch('');
  }, []);

  // Handle tracking a remote branch (create local branch and checkout)
  const handleTrackRemoteBranch = useCallback(
    async (localBranchName: string, remoteBranchName: string) => {
      await executeOperation(
        'git_checkout_track',
        { localBranch: localBranchName, remoteBranch: remoteBranchName },
        {
          ...trackRemoteBranchOperation(remoteBranchName, localBranchName),
          onSuccess: () => {
            const activeTabId = useRepositoryStore.getState().activeTabId;
            if (activeTabId) {
              setTabCurrentBranch(activeTabId, localBranchName);
            }
          },
        }
      );
    },
    [executeOperation, setTabCurrentBranch]
  );

  // Handle creating a new branch
  const handleCreateBranch = useCallback(
    async (branchName: string, startPoint: string, checkout: boolean) => {
      await executeOperation(
        'git_create_branch',
        { branchName, startPoint, checkout },
        {
          ...createBranchOperation(branchName, startPoint, checkout),
          onSuccess: () => {
            if (checkout) {
              const activeTabId = useRepositoryStore.getState().activeTabId;
              if (activeTabId) {
                setTabCurrentBranch(activeTabId, branchName);
              }
            }
          },
        }
      );
    },
    [executeOperation, setTabCurrentBranch]
  );

  // Load recent repos from Rust on mount
  useEffect(() => {
    invoke<Array<{ path: string; name: string; last_opened: number }>>('get_recent_repos')
      .then(setRecentRepos)
      .catch(() => {});
  }, []);

  const refreshRecentRepos = useCallback(() => {
    invoke<Array<{ path: string; name: string; last_opened: number }>>('get_recent_repos')
      .then(setRecentRepos)
      .catch(() => {});
  }, []);

  // Open repository dialog
  const handleOpenRepo = useCallback(async () => {
    try {
      const selected = await invoke<string | null>('pick_folder');

      if (selected) {
        const opened = await openRepository(selected);
        if (opened) {
          refreshRecentRepos();
        } else {
          addAlert('error', t('alerts.gitError'), `Failed to open repository: ${selected}`);
        }
      }
    } catch (error) {
      console.error('Error opening repository:', error);
      addAlert('error', t('alerts.gitError'), String(error));
    }
  }, [openRepository, refreshRecentRepos, addAlert, t]);

  // Open a specific repository by path (used by recent repos dropdown and menu)
  const handleOpenRecentRepo = useCallback(
    async (path: string) => {
      try {
        const opened = await openRepository(path);
        if (opened) {
          refreshRecentRepos();
        } else {
          addAlert('error', t('alerts.gitError'), `Failed to open repository: ${path}`);
        }
      } catch (error) {
        console.error('Error opening recent repository:', error);
        addAlert('error', t('alerts.gitError'), String(error));
      }
    },
    [openRepository, refreshRecentRepos, addAlert, t]
  );

  const handleBranchSelect = useCallback((_branch: BranchInfo) => {
    // Branch selection handled by sidebar
  }, []);

  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      const activeTabId = useRepositoryStore.getState().activeTabId;
      if (activeTabId) {
        updateTabState(activeTabId, { viewMode: mode });
      }
    },
    [updateTabState]
  );

  const handleNavigateToCommit = useCallback(
    (commitSha: string) => {
      const activeTabId = useRepositoryStore.getState().activeTabId;
      if (activeTabId) {
        updateTabState(activeTabId, { selectedCommitId: commitSha });
      }
    },
    [updateTabState]
  );

  // Handle creating a new tag
  const handleCreateTag = useCallback(
    async (tagName: string, startPoint: string, message: string | null, pushToRemotes: boolean) => {
      if (!activeTabState) return;

      // Get the commit SHA for the startPoint branch before the operation
      const branchHead = activeTabState.branchHeads.find((bh) => bh.name === startPoint);
      const commitSha = branchHead?.commit_sha;

      const { result } = await executeOperation(
        'git_create_tag',
        { tagName, startPoint, message, pushToRemotes },
        {
          ...createTagOperation(tagName, message, startPoint, pushToRemotes, null),
          onSuccess: () => {
            // Expand the tags section and navigate to the commit
            setExpandTagsSection(true);
            setTimeout(() => setExpandTagsSection(false), 100);

            if (commitSha) {
              handleViewModeChange('all-commits');
              handleNavigateToCommit(commitSha);
            }
          },
          onError: (res) => {
            // Tag was created but push failed - still navigate
            if (res.error_type === 'push_failed') {
              setExpandTagsSection(true);
              setTimeout(() => setExpandTagsSection(false), 100);
              if (commitSha) {
                handleViewModeChange('all-commits');
                handleNavigateToCommit(commitSha);
              }
            }
          },
        }
      );

      // Handle push_failed case (tag created but push failed)
      if (result && !result.success && result.error_type === 'push_failed') {
        await refreshActiveTab();
      }
    },
    [
      activeTabState,
      executeOperation,
      refreshActiveTab,
      handleViewModeChange,
      handleNavigateToCommit,
    ]
  );

  // Handle renaming a branch
  const handleRenameBranch = useCallback(
    async (oldName: string, newName: string, renameRemote: boolean, remoteName: string | null) => {
      await executeOperation(
        'git_rename_branch',
        { oldName, newName, renameRemote, remoteName },
        {
          ...renameBranchOperation(oldName, newName),
          onSuccess: () => {
            // If we renamed the current branch, update the tab's current branch
            const activeTabId = useRepositoryStore.getState().activeTabId;
            const currentBranch = activeTab?.currentBranch;
            if (activeTabId && currentBranch === oldName) {
              setTabCurrentBranch(activeTabId, newName);
            }
          },
        }
      );
    },
    [executeOperation, activeTab?.currentBranch, setTabCurrentBranch]
  );

  // Handle deleting a branch
  const handleDeleteBranch = useCallback(
    async (
      branchName: string,
      force: boolean,
      deleteRemote: boolean,
      remoteName: string | null
    ) => {
      await executeOperation(
        'git_delete_branch',
        { branchName, force, deleteRemote, remoteName },
        deleteBranchOperation(branchName, force, deleteRemote, remoteName)
      );
    },
    [executeOperation]
  );

  // Add Remote handler
  const handleAddRemote = useCallback(
    async (name: string, url: string) => {
      const targetTab = useRepositoryStore.getState().getActiveTab();
      if (!targetTab?.path) {
        throw new Error('No active repository');
      }
      const targetTabId = targetTab.id;
      const targetRepoPath = targetTab.path;
      const command = `git remote add ${name} ${url}`;

      try {
        const result = await invoke<GitOperationResult>('git_add_remote', {
          repoPath: targetRepoPath,
          name,
          url,
        });
        addLogEntry(
          targetRepoPath,
          'Other',
          `Add remote '${name}'`,
          command,
          result.message,
          result.success
        );

        if (!result.success) {
          addAlert('error', 'Add Remote Failed', result.message);
          throw new Error(result.message);
        }

        await useRepositoryStore.getState().refreshTab(targetTabId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!(error instanceof Error)) {
          addLogEntry(
            targetRepoPath,
            'Other',
            `Add remote '${name}'`,
            command,
            errorMessage,
            false
          );
          addAlert('error', 'Add Remote Error', errorMessage);
        }
        throw error;
      }
    },
    [addLogEntry, addAlert]
  );

  // Stash handlers
  const handleOpenSaveStashModal = useCallback(() => {
    setIsSnapshotMode(false);
    setSaveStashModalOpen(true);
  }, []);

  const handleOpenSaveSnapshotModal = useCallback(() => {
    setIsSnapshotMode(true);
    setSaveStashModalOpen(true);
  }, []);

  const handleCloseSaveStashModal = useCallback(() => {
    setSaveStashModalOpen(false);
  }, []);

  const handleStashSelect = useCallback((stash: StashInfo) => {
    setSelectedStash(stash);
    setApplyStashModalOpen(true);
  }, []);

  const handleCloseApplyStashModal = useCallback(() => {
    setApplyStashModalOpen(false);
    setSelectedStash(null);
  }, []);

  const handleSaveStash = useCallback(
    async (message: string, includeUntracked: boolean, keepIndex: boolean) => {
      const { result } = await executeOperation(
        'git_stash_save',
        { message: message || null, includeUntracked, keepIndex },
        {
          ...saveStashOperation(message, includeUntracked),
          operationTarget: keepIndex ? 'Snapshot' : 'Stash',
          onSuccess: () => {
            setLocalChangesRefreshKey((k) => k + 1);
            setSaveStashModalOpen(false);
          },
        }
      );
      return result?.success ?? false;
    },
    [executeOperation, setLocalChangesRefreshKey]
  );

  const handleApplyStash = useCallback(async () => {
    if (!selectedStash) return;
    await executeOperation(
      'git_stash_apply',
      { stashIndex: selectedStash.index },
      {
        ...applyStashOperation(selectedStash.index),
        onSuccess: () => {
          setLocalChangesRefreshKey((k) => k + 1);
          handleCloseApplyStashModal();
        },
      }
    );
  }, [executeOperation, selectedStash, handleCloseApplyStashModal, setLocalChangesRefreshKey]);

  const handlePopStash = useCallback(async () => {
    if (!selectedStash) return;
    await executeOperation(
      'git_stash_pop',
      { stashIndex: selectedStash.index },
      {
        ...popStashOperation(selectedStash.index),
        onSuccess: () => {
          setLocalChangesRefreshKey((k) => k + 1);
          handleCloseApplyStashModal();
        },
      }
    );
  }, [executeOperation, selectedStash, handleCloseApplyStashModal, setLocalChangesRefreshKey]);

  const handleDropStash = useCallback(async () => {
    if (!selectedStash) return;
    await executeOperation(
      'git_stash_drop',
      { stashIndex: selectedStash.index },
      {
        ...dropStashOperation(selectedStash.index),
        onSuccess: () => {
          handleCloseApplyStashModal();
        },
      }
    );
  }, [executeOperation, selectedStash, handleCloseApplyStashModal]);

  // Merge handlers
  const handleMergeSelect = useCallback(
    async (branch: BranchInfo) => {
      if (!activeTab?.path || isGitLoading) return;

      const repoPath = activeTab.path;
      setMergeBranch(branch);
      setMergeModalOpen(true);

      try {
        const preview = await invoke<MergePreview>('get_merge_preview', {
          repoPath,
          sourceBranch: branch.name,
        });
        setMergePreview(preview);
      } catch (error) {
        console.error('Error getting merge preview:', error);
        addAlert('error', t('alerts.gitError'), String(error));
        setMergeModalOpen(false);
      }
    },
    [activeTab?.path, isGitLoading, addAlert, t]
  );

  const handleCloseMergeModal = useCallback(() => {
    setMergeModalOpen(false);
    setMergeBranch(null);
    setMergePreview(null);
  }, []);

  const handleMerge = useCallback(
    async (mergeType: MergeType) => {
      if (!mergeBranch) return;

      await executeOperation(
        'git_merge',
        { sourceBranch: mergeBranch.name, mergeType },
        {
          ...mergeOperation(mergeBranch.name, mergeType),
          onSuccess: () => {
            setLocalChangesRefreshKey((k) => k + 1);
            handleCloseMergeModal();
          },
          onError: (result) => {
            if (result.error_type === 'merge_conflicts') {
              setLocalChangesRefreshKey((k) => k + 1);
              handleCloseMergeModal();
            }
          },
        }
      );
    },
    [executeOperation, mergeBranch, handleCloseMergeModal, setLocalChangesRefreshKey]
  );

  // Rebase handlers
  const handleRebaseSelect = useCallback(
    async (branch: BranchInfo) => {
      if (!activeTab?.path || isGitLoading) return;

      const repoPath = activeTab.path;
      setRebaseBranch(branch);
      setRebaseModalOpen(true);

      try {
        const preview = await invoke<RebasePreview>('get_rebase_preview', {
          repoPath,
          targetBranch: branch.name,
        });
        setRebasePreview(preview);
      } catch (error) {
        console.error('Error getting rebase preview:', error);
        addAlert('error', t('alerts.gitError'), String(error));
        setRebaseModalOpen(false);
      }
    },
    [activeTab?.path, isGitLoading, addAlert, t]
  );

  const handleCloseRebaseModal = useCallback(() => {
    setRebaseModalOpen(false);
    setRebaseBranch(null);
    setRebasePreview(null);
  }, []);

  const handleRebase = useCallback(
    async (preserveMerges: boolean, autostash: boolean) => {
      if (!rebaseBranch) return;

      await executeOperation(
        'git_rebase',
        { targetBranch: rebaseBranch.name, preserveMerges, autostash },
        {
          ...rebaseOperation(rebaseBranch.name, preserveMerges, autostash),
          onSuccess: () => {
            setLocalChangesRefreshKey((k) => k + 1);
            handleCloseRebaseModal();
          },
          onError: (result) => {
            if (result.error_type === 'rebase_conflicts') {
              setLocalChangesRefreshKey((k) => k + 1);
              handleCloseRebaseModal();
            }
          },
        }
      );
    },
    [executeOperation, rebaseBranch, handleCloseRebaseModal, setLocalChangesRefreshKey]
  );

  // Interactive rebase handlers
  const handleInteractiveRebaseSelect = useCallback(
    async (branch: BranchInfo) => {
      if (!activeTab?.path || isGitLoading) return;

      const repoPath = activeTab.path;
      setInteractiveRebaseBranch(branch);
      setIsInteractiveRebaseLoading(true);
      setInteractiveRebaseModalOpen(true);

      try {
        const commits = await invoke<InteractiveRebaseEntry[]>('get_interactive_rebase_commits', {
          repoPath,
          targetBranch: branch.name,
        });
        setInteractiveRebaseCommits(commits);
      } catch (error) {
        console.error('Error getting commits for interactive rebase:', error);
        addAlert('error', t('alerts.gitError'), String(error));
        setInteractiveRebaseModalOpen(false);
      } finally {
        setIsInteractiveRebaseLoading(false);
      }
    },
    [activeTab?.path, isGitLoading, addAlert, t]
  );

  const handleCloseInteractiveRebaseModal = useCallback(() => {
    setInteractiveRebaseModalOpen(false);
    setInteractiveRebaseBranch(null);
    setInteractiveRebaseCommits([]);
  }, []);

  const handleInteractiveRebase = useCallback(
    async (entries: InteractiveRebaseEntry[], autostash: boolean) => {
      if (!interactiveRebaseBranch) return;

      await executeOperation(
        'git_interactive_rebase',
        { targetBranch: interactiveRebaseBranch.name, entries, autostash },
        {
          ...interactiveRebaseOperation(interactiveRebaseBranch.name, autostash),
          onSuccess: () => {
            setLocalChangesRefreshKey((k) => k + 1);
            handleCloseInteractiveRebaseModal();
          },
          onError: (result) => {
            if (result.error_type === 'rebase_conflicts' || result.error_type === 'rebase_paused') {
              setLocalChangesRefreshKey((k) => k + 1);
              handleCloseInteractiveRebaseModal();
            }
          },
        }
      );
    },
    [
      executeOperation,
      interactiveRebaseBranch,
      handleCloseInteractiveRebaseModal,
      setLocalChangesRefreshKey,
    ]
  );

  // Load Git Flow configuration for current repository
  const loadGitFlowConfig = useCallback(async (repoPathOverride?: string) => {
    const repoPath = repoPathOverride ?? useRepositoryStore.getState().getActiveTab()?.path;
    if (!repoPath) {
      setGitFlowConfig(null);
      setCurrentBranchFlowInfo(null);
      return;
    }

    try {
      const config = await invoke<GitFlowConfig>('get_gitflow_config', { repoPath });
      if (useRepositoryStore.getState().getActiveTab()?.path !== repoPath) return;
      setGitFlowConfig(config);

      if (config.initialized) {
        const flowInfo = await invoke<CurrentBranchFlowInfo>('get_current_branch_flow_info', {
          repoPath,
        });
        if (useRepositoryStore.getState().getActiveTab()?.path !== repoPath) return;
        setCurrentBranchFlowInfo(flowInfo);
      } else {
        setCurrentBranchFlowInfo(null);
      }
    } catch (error) {
      if (useRepositoryStore.getState().getActiveTab()?.path !== repoPath) return;
      console.error('Error loading git flow config:', error);
      setGitFlowConfig(null);
      setCurrentBranchFlowInfo(null);
    }
  }, []);

  // Load git flow config when active tab or its branch changes; clear when no tabs open
  useEffect(() => {
    if (!activeTab?.path) {
      setGitFlowConfig(null);
      setCurrentBranchFlowInfo(null);
      return;
    }
    loadGitFlowConfig(activeTab.path);
  }, [activeTab?.path, activeTab?.currentBranch, loadGitFlowConfig]);

  // Git Flow handlers for BranchDropdown
  const handleNewBranch = useCallback(() => {
    setCreateBranchModalOpen(true);
  }, []);

  const handleStartFeature = useCallback(() => {
    setGitFlowStartType('feature');
    setGitFlowStartModalOpen(true);
  }, []);

  const handleStartRelease = useCallback(() => {
    setGitFlowStartType('release');
    setGitFlowStartModalOpen(true);
  }, []);

  const handleStartHotfix = useCallback(() => {
    setGitFlowStartType('hotfix');
    setGitFlowStartModalOpen(true);
  }, []);

  const handleFinishBranch = useCallback(() => {
    if (
      currentBranchFlowInfo &&
      currentBranchFlowInfo.branch_type !== 'Other' &&
      currentBranchFlowInfo.branch_type !== 'Master' &&
      currentBranchFlowInfo.branch_type !== 'Develop'
    ) {
      setGitFlowFinishModalOpen(true);
    }
  }, [currentBranchFlowInfo]);

  // Handle Git Flow Init (open modal)
  const handleInitGitFlow = useCallback(() => {
    setGitFlowInitModalOpen(true);
  }, []);

  // Handle Git Flow Init (actual initialization)
  const handleGitFlowInit = useCallback(
    async (config: {
      masterBranch: string;
      developBranch: string;
      featurePrefix: string;
      releasePrefix: string;
      hotfixPrefix: string;
      versionTagPrefix: string;
    }) => {
      await executeOperation(
        'git_flow_init',
        {
          masterBranch: config.masterBranch,
          developBranch: config.developBranch,
          featurePrefix: config.featurePrefix,
          releasePrefix: config.releasePrefix,
          hotfixPrefix: config.hotfixPrefix,
          versionTagPrefix: config.versionTagPrefix,
        },
        {
          ...gitFlowInitOperation(config.masterBranch, config.developBranch),
          onSuccess: async () => {
            setGitFlowInitModalOpen(false);
            await loadGitFlowConfig();
          },
          onError: () => {
            setGitFlowInitModalOpen(false);
          },
        }
      );
    },
    [executeOperation, loadGitFlowConfig]
  );

  // Handle Git Flow Start
  const handleGitFlowStart = useCallback(
    async (name: string, baseBranch: string) => {
      const flowType = gitFlowStartType;
      const prefix = gitFlowConfig
        ? flowType === 'feature'
          ? gitFlowConfig.feature_prefix
          : flowType === 'release'
            ? gitFlowConfig.release_prefix
            : gitFlowConfig.hotfix_prefix
        : `${flowType}/`;
      const fullBranchName = `${prefix}${name}`;

      await executeOperation(
        'git_flow_start',
        { flowType, name, baseBranch },
        {
          ...gitFlowStartOperation(flowType, name, baseBranch),
          operationTarget: fullBranchName,
          onSuccess: async () => {
            const activeTabId = useRepositoryStore.getState().activeTabId;
            if (activeTabId) {
              setTabCurrentBranch(activeTabId, fullBranchName);
            }
            await loadGitFlowConfig();
            setGitFlowStartModalOpen(false);
          },
        }
      );
    },
    [executeOperation, gitFlowStartType, gitFlowConfig, setTabCurrentBranch, loadGitFlowConfig]
  );

  // Handle Git Flow Finish
  const handleGitFlowFinish = useCallback(
    async (deleteBranch: boolean) => {
      if (!currentBranchFlowInfo) return;

      const flowType = currentBranchFlowInfo.branch_type.toLowerCase() as GitFlowType;
      const name = currentBranchFlowInfo.name;

      await executeOperation(
        'git_flow_finish',
        { flowType, name, deleteBranch },
        {
          ...gitFlowFinishOperation(flowType, name),
          onSuccess: async () => {
            await loadGitFlowConfig();
            setGitFlowFinishModalOpen(false);
          },
        }
      );
    },
    [executeOperation, currentBranchFlowInfo, loadGitFlowConfig]
  );

  // Handle creating branch from dropdown (wrapper for handleCreateBranch)
  const handleCreateBranchFromModal = useCallback(
    async (branchName: string, startPoint: string, checkout: boolean) => {
      await handleCreateBranch(branchName, startPoint, checkout);
      setCreateBranchModalOpen(false);
    },
    [handleCreateBranch]
  );

  // Execute fetch with options
  const handleFetchWithOptions = useCallback(
    async (options: FetchOptions) => {
      const targetTab = useRepositoryStore.getState().getActiveTab();
      if (!targetTab?.path || useGitOperationStore.getState().isLoading) return;
      const targetTabId = targetTab.id;
      const targetRepoPath = targetTab.path;

      saveOptions({ fetch: options });

      const target = options.all ? 'all remotes' : options.remote;
      const command = options.all
        ? 'git fetch --all --prune'
        : `git fetch --prune ${options.remote}`;
      startOperation('Fetch', target);

      const doFetch = async () => {
        try {
          const result = await invoke<GitOperationResult>('git_fetch_with_options', {
            repoPath: targetRepoPath,
            remote: options.all ? null : options.remote,
            all: options.all,
          });

          if (handleSshVerificationRequired(result, () => doFetch())) {
            return;
          }

          completeOperation(result);
          addLogEntry(
            targetRepoPath,
            'Fetch',
            `Fetch ${target}`,
            command,
            result.message,
            result.success
          );
          closeModal();

          if (result.success) {
            await useRepositoryStore.getState().refreshTab(targetTabId);
          } else {
            const errorTitle = getErrorTitle(result.error_type, 'Fetch');
            addAlert('error', errorTitle, result.message);
          }
        } catch (error) {
          console.error('Error fetching:', error);
          completeOperation({ success: false, message: String(error) });
          addLogEntry(targetRepoPath, 'Fetch', `Fetch ${target}`, command, String(error), false);
          addAlert('error', 'Fetch Error', String(error));
          closeModal();
        }
      };

      await doFetch();
    },
    [
      saveOptions,
      startOperation,
      closeModal,
      completeOperation,
      addLogEntry,
      addAlert,
      handleSshVerificationRequired,
      getErrorTitle,
    ]
  );

  // Execute pull with options
  const handlePullWithOptions = useCallback(
    async (options: PullOptions) => {
      const targetTab = useRepositoryStore.getState().getActiveTab();
      if (!targetTab?.path || useGitOperationStore.getState().isLoading) return;
      const targetTabId = targetTab.id;
      const targetRepoPath = targetTab.path;

      saveOptions({ pull: options });

      const target = `${options.remote}/${options.branch}`;
      let command = `git pull ${options.remote} ${options.branch}`;
      if (options.rebase) command += ' --rebase';
      if (options.autostash) command += ' --autostash';
      startOperation('Pull', target);

      const doPull = async () => {
        try {
          const result = await invoke<GitOperationResult>('git_pull_with_options', {
            repoPath: targetRepoPath,
            remote: options.remote,
            branch: options.branch,
            rebase: options.rebase,
            autostash: options.autostash,
          });

          if (handleSshVerificationRequired(result, () => doPull())) {
            return;
          }

          completeOperation(result);
          addLogEntry(
            targetRepoPath,
            'Pull',
            `Pull ${target}`,
            command,
            result.message,
            result.success
          );

          if (result.success) {
            closeModal();
            await useRepositoryStore.getState().refreshTab(targetTabId);
            setLocalChangesRefreshKey((k) => k + 1);
          } else if (result.error_type === 'divergent_branches') {
            closeModal();
            setPendingPullOptions(options);
            setDivergentBranchesModalOpen(true);
          } else {
            closeModal();
            const errorTitle = getErrorTitle(result.error_type, 'Pull');
            addAlert('error', errorTitle, result.message);
          }
        } catch (error) {
          console.error('Error pulling:', error);
          completeOperation({ success: false, message: String(error) });
          addLogEntry(targetRepoPath, 'Pull', `Pull ${target}`, command, String(error), false);
          addAlert('error', 'Pull Error', String(error));
          closeModal();
        }
      };

      await doPull();
    },
    [
      saveOptions,
      startOperation,
      completeOperation,
      addLogEntry,
      closeModal,
      addAlert,
      handleSshVerificationRequired,
      setLocalChangesRefreshKey,
      getErrorTitle,
    ]
  );

  // Execute push with options
  const handlePushWithOptions = useCallback(
    async (options: PushOptions) => {
      const targetTab = useRepositoryStore.getState().getActiveTab();
      if (!targetTab?.path || useGitOperationStore.getState().isLoading) return;
      const targetTabId = targetTab.id;
      const targetRepoPath = targetTab.path;

      saveOptions({
        push: {
          remote: options.remote,
          pushTags: options.pushTags,
          forceWithLease: options.forceWithLease,
        },
      });

      const target = `${options.remote}/${options.remoteBranch}`;
      let command = `git push ${options.remote} ${options.branch}:${options.remoteBranch}`;
      if (options.pushTags) command += ' --tags';
      if (options.forceWithLease) command += ' --force-with-lease';
      startOperation('Push', target);

      const doPush = async () => {
        try {
          const result = await invoke<GitOperationResult>('git_push_with_options', {
            repoPath: targetRepoPath,
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
          addLogEntry(
            targetRepoPath,
            'Push',
            `Push to ${target}`,
            command,
            result.message,
            result.success
          );
          closeModal();

          if (result.success) {
            await useRepositoryStore.getState().refreshTab(targetTabId);
          } else {
            const errorTitle = getErrorTitle(result.error_type, 'Push');
            addAlert('error', errorTitle, result.message);
          }
        } catch (error) {
          console.error('Error pushing:', error);
          completeOperation({ success: false, message: String(error) });
          addLogEntry(targetRepoPath, 'Push', `Push to ${target}`, command, String(error), false);
          addAlert('error', 'Push Error', String(error));
          closeModal();
        }
      };

      await doPush();
    },
    [
      saveOptions,
      startOperation,
      completeOperation,
      closeModal,
      addLogEntry,
      addAlert,
      handleSshVerificationRequired,
      getErrorTitle,
    ]
  );

  // Handle divergent branches - merge option
  const handleDivergentMerge = useCallback(async () => {
    if (!pendingPullOptions) return;

    setDivergentBranchesModalOpen(false);
    // Retry pull with rebase: false (merge)
    const mergeOptions: PullOptions = {
      ...pendingPullOptions,
      rebase: false,
    };
    setPendingPullOptions(null);
    await handlePullWithOptions(mergeOptions);
  }, [pendingPullOptions, handlePullWithOptions]);

  // Handle divergent branches - rebase option
  const handleDivergentRebase = useCallback(async () => {
    if (!pendingPullOptions) return;

    setDivergentBranchesModalOpen(false);
    // Retry pull with rebase: true
    const rebaseOptions: PullOptions = {
      ...pendingPullOptions,
      rebase: true,
    };
    setPendingPullOptions(null);
    await handlePullWithOptions(rebaseOptions);
  }, [pendingPullOptions, handlePullWithOptions]);

  // Close divergent branches modal
  const handleCloseDivergentModal = useCallback(() => {
    setDivergentBranchesModalOpen(false);
    setPendingPullOptions(null);
  }, []);

  // Branch context menu handlers

  // Fast-forward a branch to its remote tracking branch
  const handleBranchFastForward = useCallback(
    async (branch: BranchInfo) => {
      const remoteName = getBranchRemote(branch);
      await executeOperation(
        'git_fast_forward',
        { branch: branch.name, remote: remoteName },
        fastForwardOperation(branch.name, remoteName)
      );
    },
    [executeOperation]
  );

  /**
   * Opens Pull modal with optional branch preset
   * - Without branch: uses current branch (from toolbar)
   * - With branch: preselects specified branch (from context menu)
   */
  const handleOpenPullModal = useCallback(
    (branch?: BranchInfo) => {
      if (branch) {
        const remoteName = getBranchRemote(branch);
        setPullModalPreset({ remote: remoteName, branch: branch.name });
      } else {
        setPullModalPreset(null);
      }
      openPullModal();
    },
    [openPullModal]
  );

  /**
   * Opens Push modal with optional branch preset
   * - Without branch: uses current branch (from toolbar)
   * - With branch: preselects specified branch (from context menu)
   */
  const handleOpenPushModal = useCallback(
    (branch?: BranchInfo) => {
      if (branch) {
        const remoteName = getBranchRemote(branch);
        setPushModalPreset({ branch: branch.name, remote: remoteName });
      } else {
        setPushModalPreset(null);
      }
      openPushModal();
    },
    [openPushModal]
  );

  // Close Pull modal and clear preset
  const handleClosePullModal = useCallback(() => {
    closeModal();
    setPullModalPreset(null);
  }, [closeModal]);

  // Close Push modal and clear preset
  const handleClosePushModal = useCallback(() => {
    closeModal();
    setPushModalPreset(null);
  }, [closeModal]);

  // Panel resize handlers (rAF DOM updates during drag; persist to uiStore once on mouseup)
  const startResize = useCallback(
    (panel: string) => {
      pendingSidebarWidthRef.current = null;
      setIsResizing(panel);
    },
    [setIsResizing]
  );

  const handleStartSidebarResize = useCallback(() => {
    startResize('sidebar');
  }, [startResize]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const clamped = Math.min(MAX_SIZES.sidebarWidth, Math.max(MIN_SIZES.sidebarWidth, e.clientX));
    pendingSidebarWidthRef.current = clamped;
    if (sidebarRafRef.current === null) {
      sidebarRafRef.current = requestAnimationFrame(() => {
        sidebarRafRef.current = null;
        if (sidebarContainerRef.current && pendingSidebarWidthRef.current !== null) {
          sidebarContainerRef.current.style.width = `${pendingSidebarWidthRef.current}px`;
        }
      });
    }
  }, []);

  const stopResize = useCallback(() => {
    if (sidebarRafRef.current !== null) {
      cancelAnimationFrame(sidebarRafRef.current);
      sidebarRafRef.current = null;
    }
    if (pendingSidebarWidthRef.current !== null) {
      setPanelSize('sidebarWidth', pendingSidebarWidthRef.current);
      pendingSidebarWidthRef.current = null;
    }
    setIsResizing(null);
  }, [setIsResizing, setPanelSize]);

  // Memoized Toolbar/Modal callbacks and derived branch slices to preserve React.memo
  const handleToolbarPull = useCallback(() => handleOpenPullModal(), [handleOpenPullModal]);
  const handleToolbarPush = useCallback(() => handleOpenPushModal(), [handleOpenPushModal]);
  const handleOpenFeedback = useCallback(() => setFeedbackModalOpen(true), []);
  const handleCloseFeedback = useCallback(() => setFeedbackModalOpen(false), []);
  const handleOpenAbout = useCallback(() => setAboutModalOpen(true), []);
  const handleCloseAbout = useCallback(() => setAboutModalOpen(false), []);
  const handleOpenSettingsModal = useCallback(() => openSettings(), [openSettings]);

  const activeBranches = activeTabState?.branches ?? EMPTY_BRANCHES;
  const activeRemotes = activeTabState?.remotes ?? EMPTY_REMOTES;
  const localBranches = useMemo(() => activeBranches.filter((b) => !b.is_remote), [activeBranches]);
  const headBranch = useMemo(() => activeBranches.find((b) => b.is_head) ?? null, [activeBranches]);

  // Add/remove resize event listeners (scoped to sidebar so it never collides with ActivityLogPanel)
  useEffect(() => {
    if (isResizing === 'sidebar') {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', stopResize);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', stopResize);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        if (sidebarRafRef.current !== null) {
          cancelAnimationFrame(sidebarRafRef.current);
          sidebarRafRef.current = null;
        }
      };
    }
  }, [isResizing, handleMouseMove, stopResize]);

  // File watcher: switch watched repo atomically (Rust stops previous watcher under lock)
  useEffect(() => {
    if (!activeTab?.path) {
      invoke('stop_file_watcher').catch((error) => {
        console.error('Failed to stop file watcher:', error);
      });
      return;
    }

    invoke('start_file_watcher', { path: activeTab.path }).catch((error) => {
      console.error('Failed to start file watcher:', error);
    });
  }, [activeTab?.path]);

  // Stop file watcher on app unmount
  useEffect(() => {
    return () => {
      invoke('stop_file_watcher').catch(() => {});
    };
  }, []);

  // File watcher: listen for file change events (single IPC refresh into store, no duplicate LocalChangesView fetch)
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    listen<{ repo_path: string; timestamp: number }>('repo-files-changed', async (event) => {
      const state = useRepositoryStore.getState();
      const matchingTab = state.tabs.find((tab) => tab.path === event.payload.repo_path);

      if (matchingTab) {
        await state.refreshTabStatus(matchingTab.id);
      }
    }).then((fn) => {
      if (disposed) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Branch watcher: listen for branch change events (when .git/HEAD or refs change)
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    listen<{ repo_path: string; timestamp: number }>('repo-branch-changed', async (event) => {
      const state = useRepositoryStore.getState();
      const matchingTab = state.tabs.find((tab) => tab.path === event.payload.repo_path);

      if (matchingTab) {
        await useRepositoryStore.getState().refreshTab(matchingTab.id);
        if (matchingTab.id === useRepositoryStore.getState().activeTabId) {
          setLocalChangesRefreshKey((k) => k + 1);
        }
      }
    }).then((fn) => {
      if (disposed) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Menu event: listen for "Open Repository" from native menu
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    listen('menu-open-repository', () => {
      handleOpenRepo();
    }).then((fn) => {
      if (disposed) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [handleOpenRepo]);

  // Menu event: listen for "About Forky" from native menu
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    listen('menu-about', () => {
      setAboutModalOpen(true);
    }).then((fn) => {
      if (disposed) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Menu event: listen for "Open Recent" from native menu
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    listen<string>('menu-open-recent-repo', (event) => {
      handleOpenRecentRepo(event.payload);
    }).then((fn) => {
      if (disposed) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [handleOpenRecentRepo]);

  // Check if Git is installed on startup
  useEffect(() => {
    const checkGitInstallation = async () => {
      try {
        const result = await invoke<{ installed: boolean; version: string | null }>(
          'check_git_installed'
        );
        if (!result.installed) {
          setGitNotInstalledModalOpen(true);
        }
      } catch (error) {
        console.error('Failed to check Git installation:', error);
        // If the check fails, assume Git is not installed
        setGitNotInstalledModalOpen(true);
      }
    };

    checkGitInstallation();
  }, []);

  const hasOpenRepos = tabs.length > 0;

  // Loading state
  if (isRestoring) {
    return (
      <div className="app">
        <TitleBar>
          <Toolbar
            onOpenRepo={handleOpenRepo}
            recentRepos={recentRepos}
            onOpenRecentRepo={handleOpenRecentRepo}
            onThemeChange={setTheme}
            currentTheme={theme}
            onFetch={openFetchModal}
            onPull={() => handleOpenPullModal()}
            onPush={() => handleOpenPushModal()}
            onStash={handleOpenSaveStashModal}
            onSaveSnapshot={handleOpenSaveSnapshotModal}
            onStashSelect={handleStashSelect}
            onMergeSelect={handleMergeSelect}
            stashes={EMPTY_STASHES}
            isLoading={isGitLoading}
            branches={EMPTY_BRANCHES}
            onBranchChange={handleBranchChange}
            gitOperation={currentOperation}
            onDismissOperation={clearOperation}
            onFeedback={handleOpenFeedback}
            onAbout={handleOpenAbout}
            onOpenSettings={handleOpenSettingsModal}
            gitFlowConfig={null}
            currentBranchFlowInfo={null}
            onNewBranch={handleNewBranch}
            onStartFeature={handleStartFeature}
            onStartRelease={handleStartRelease}
            onStartHotfix={handleStartHotfix}
            onFinishBranch={handleFinishBranch}
            onInitGitFlow={handleInitGitFlow}
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
          recentRepos={recentRepos}
          onOpenRecentRepo={handleOpenRecentRepo}
          repoName={activeTab?.name}
          repoPath={activeTab?.path}
          currentBranch={activeTab?.currentBranch ?? undefined}
          branches={activeBranches}
          stashes={stashes}
          onBranchChange={handleBranchChange}
          onThemeChange={setTheme}
          currentTheme={theme}
          onFetch={openFetchModal}
          onPull={handleToolbarPull}
          onPush={handleToolbarPush}
          onStash={handleOpenSaveStashModal}
          onSaveSnapshot={handleOpenSaveSnapshotModal}
          onStashSelect={handleStashSelect}
          onMergeSelect={handleMergeSelect}
          isLoading={isGitLoading}
          gitOperation={currentOperation}
          onDismissOperation={clearOperation}
          onFeedback={handleOpenFeedback}
          onAbout={handleOpenAbout}
          onOpenSettings={handleOpenSettingsModal}
          gitFlowConfig={gitFlowConfig}
          currentBranchFlowInfo={currentBranchFlowInfo}
          onNewBranch={handleNewBranch}
          onStartFeature={handleStartFeature}
          onStartRelease={handleStartRelease}
          onStartHotfix={handleStartHotfix}
          onFinishBranch={handleFinishBranch}
          onInitGitFlow={handleInitGitFlow}
        />
      </TitleBar>

      {hasOpenRepos && (
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onTabSelect={selectTab}
          onTabClose={closeTab}
          onCloseOthers={closeOtherTabs}
          onCloseAll={closeAllTabs}
          onCloseToRight={closeTabsToRight}
          onCloseToLeft={closeTabsToLeft}
          onAddTab={handleOpenRepo}
        />
      )}

      {hasOpenRepos && activeTabState ? (
        <div className="app-content" ref={containerRef}>
          <div
            className="sidebar-container"
            ref={sidebarContainerRef}
            style={{ width: panelSizes.sidebarWidth }}
          >
            <Sidebar
              repoName={activeTab?.name}
              repoPath={activeTab?.path}
              branches={activeTabState.branches}
              branchHeads={activeTabState.branchHeads}
              tags={activeTabState.tags}
              stashes={stashes}
              remotes={activeTabState.remotes}
              localChangesCount={localChangesCount}
              viewMode={activeTabState.viewMode}
              onViewModeChange={handleViewModeChange}
              onBranchSelect={handleBranchSelect}
              onBranchCheckout={handleBranchChange}
              onTrackRemoteBranch={handleOpenTrackBranchModal}
              onNavigateToCommit={handleNavigateToCommit}
              onAddRemote={openAddRemoteModal}
              onCreateBranch={handleCreateBranch}
              onCreateTag={handleCreateTag}
              onRenameBranch={handleRenameBranch}
              onDeleteBranch={handleDeleteBranch}
              onStashClick={handleStashSelect}
              onMergeInto={handleMergeSelect}
              onRebaseOn={handleRebaseSelect}
              onInteractiveRebase={handleInteractiveRebaseSelect}
              onFastForward={handleBranchFastForward}
              onBranchPull={handleOpenPullModal}
              onBranchPush={handleOpenPushModal}
              expandTagsSection={expandTagsSection}
            />
          </div>
          <Resizer
            direction="horizontal"
            onMouseDown={handleStartSidebarResize}
            isResizing={isResizing === 'sidebar'}
          />
          {activeTabState.viewMode === 'local-changes' ? (
            <LocalChangesView
              repoPath={activeTab?.path ?? ''}
              refreshKey={localChangesRefreshKey}
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
            onClose={handleClosePullModal}
            onPull={handlePullWithOptions}
            remotes={activeTabState?.remotes ?? []}
            branches={activeTabState?.branches ?? []}
            currentBranch={activeTab?.currentBranch ?? null}
            savedOptions={
              pullModalPreset
                ? {
                    remote: pullModalPreset.remote,
                    branch: pullModalPreset.branch,
                    rebase: false,
                    autostash: false,
                  }
                : getStoredOptions().pull
            }
          />
        )}
        {activeModal === 'push' && (
          <PushModal
            isOpen={true}
            onClose={handleClosePushModal}
            onPush={handlePushWithOptions}
            remotes={activeTabState?.remotes ?? []}
            branches={activeTabState?.branches ?? []}
            currentBranch={activeTab?.currentBranch ?? null}
            savedOptions={
              pushModalPreset
                ? {
                    branch: pushModalPreset.branch,
                    remote: pushModalPreset.remote,
                    remoteBranch: pushModalPreset.branch,
                    pushTags: false,
                    forceWithLease: false,
                  }
                : getStoredOptions().push
                  ? {
                      branch: activeTab?.currentBranch ?? 'main',
                      remote: getStoredOptions().push!.remote,
                      remoteBranch: activeTab?.currentBranch ?? 'main',
                      pushTags: getStoredOptions().push!.pushTags,
                      forceWithLease: getStoredOptions().push!.forceWithLease,
                    }
                  : undefined
            }
          />
        )}

        {/* SSH Host Verification Modal */}
        {sshVerification.isOpen && (
          <SshHostVerificationModal
            isOpen={true}
            onClose={handleRejectSshHost}
            onAccept={handleAcceptSshHost}
            onReject={handleRejectSshHost}
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
            existingRemotes={activeRemotes}
          />
        )}

        {/* Track Remote Branch Modal */}
        {trackBranchModalOpen && (
          <TrackRemoteBranchModal
            isOpen={true}
            onClose={handleCloseTrackBranchModal}
            onTrack={handleTrackRemoteBranch}
            remoteBranch={selectedRemoteBranch}
            localBranches={localBranches}
          />
        )}

        {/* Feedback Modal */}
        {feedbackModalOpen && <FeedbackModal isOpen={true} onClose={handleCloseFeedback} />}

        {/* About Modal */}
        {aboutModalOpen && <AboutModal isOpen={true} onClose={handleCloseAbout} />}
        {/* Settings Modal */}
        {settingsOpen && (
          <SettingsModal
            isOpen={true}
            initialPanel={settingsInitialPanel}
            onClose={closeSettings}
          />
        )}

        {/* Save Stash Modal */}
        {saveStashModalOpen && (
          <SaveStashModal
            isOpen={true}
            onClose={handleCloseSaveStashModal}
            onSave={handleSaveStash}
            isSnapshot={isSnapshotMode}
          />
        )}

        {/* Apply Stash Modal */}
        {applyStashModalOpen && selectedStash && (
          <ApplyStashModal
            isOpen={true}
            onClose={handleCloseApplyStashModal}
            onApply={handleApplyStash}
            onPop={handlePopStash}
            onDrop={handleDropStash}
            stash={selectedStash}
          />
        )}

        {/* Merge Modal */}
        {mergeModalOpen && (
          <MergeModal
            isOpen={true}
            onClose={handleCloseMergeModal}
            onMerge={handleMerge}
            sourceBranch={mergeBranch}
            targetBranch={headBranch?.name || ''}
            preview={mergePreview}
          />
        )}

        {/* Rebase Modal */}
        {rebaseModalOpen && (
          <RebaseModal
            isOpen={true}
            onClose={handleCloseRebaseModal}
            onRebase={handleRebase}
            targetBranch={rebaseBranch}
            currentBranch={headBranch?.name || ''}
            preview={rebasePreview}
          />
        )}

        {/* Interactive Rebase Modal */}
        {interactiveRebaseModalOpen && (
          <InteractiveRebaseModal
            isOpen={true}
            onClose={handleCloseInteractiveRebaseModal}
            onRebase={handleInteractiveRebase}
            targetBranch={interactiveRebaseBranch}
            currentBranch={headBranch?.name || ''}
            commits={interactiveRebaseCommits}
            isLoadingCommits={isInteractiveRebaseLoading}
          />
        )}

        {/* Checkout Conflict Modal */}
        {checkoutConflictModalOpen && (
          <CheckoutConflictModal
            isOpen={true}
            onClose={() => {
              setCheckoutConflictModalOpen(false);
              setCheckoutConflictBranch('');
              setCheckoutConflictFiles([]);
            }}
            onConfirm={handleCheckoutWithStash}
            targetBranch={checkoutConflictBranch}
            conflictingFiles={checkoutConflictFiles}
            isLoading={isCheckoutWithStashLoading}
          />
        )}

        {/* Divergent Branches Modal */}
        {divergentBranchesModalOpen && (
          <DivergentBranchesModal
            isOpen={true}
            onClose={handleCloseDivergentModal}
            onMerge={handleDivergentMerge}
            onRebase={handleDivergentRebase}
          />
        )}

        {/* Git Not Installed Modal */}
        {gitNotInstalledModalOpen && (
          <GitNotInstalledModal isOpen={true} onClose={() => setGitNotInstalledModalOpen(false)} />
        )}

        {/* Create Branch Modal (from Branch dropdown) */}
        {createBranchModalOpen && (
          <CreateBranchModal
            isOpen={true}
            onClose={() => setCreateBranchModalOpen(false)}
            onCreate={handleCreateBranchFromModal}
            sourceBranch={headBranch}
            localBranches={localBranches}
          />
        )}

        {/* Git Flow Start Modal */}
        {gitFlowStartModalOpen && gitFlowConfig && (
          <GitFlowStartModal
            isOpen={true}
            onClose={() => setGitFlowStartModalOpen(false)}
            onStart={handleGitFlowStart}
            flowType={gitFlowStartType}
            defaultBaseBranch={
              gitFlowStartType === 'hotfix'
                ? gitFlowConfig.master_branch
                : gitFlowConfig.develop_branch
            }
            branches={activeTabState?.branches ?? []}
            prefix={
              gitFlowStartType === 'feature'
                ? gitFlowConfig.feature_prefix
                : gitFlowStartType === 'release'
                  ? gitFlowConfig.release_prefix
                  : gitFlowConfig.hotfix_prefix
            }
          />
        )}

        {/* Git Flow Finish Modal */}
        {gitFlowFinishModalOpen && currentBranchFlowInfo && gitFlowConfig && (
          <GitFlowFinishModal
            isOpen={true}
            onClose={() => setGitFlowFinishModalOpen(false)}
            onFinish={handleGitFlowFinish}
            flowType={currentBranchFlowInfo.branch_type.toLowerCase() as GitFlowType}
            branchName={activeTab?.currentBranch || ''}
            featureName={currentBranchFlowInfo.name}
            masterBranch={gitFlowConfig.master_branch}
            developBranch={gitFlowConfig.develop_branch}
          />
        )}

        {/* Git Flow Init Modal */}
        {gitFlowInitModalOpen && (
          <GitFlowInitModal
            isOpen={true}
            onClose={() => setGitFlowInitModalOpen(false)}
            onInit={handleGitFlowInit}
            defaultMasterBranch={activeTab?.currentBranch || 'main'}
          />
        )}
      </Suspense>

      {/* Activity Log Panel */}
      {isActivityLogPanelOpen && (
        <ActivityLogPanel entries={activityLog} onClear={handleClearActivityLog} />
      )}

      {/* Status Bar */}
      <StatusBar entryCount={activityLogStats.total} errorCount={activityLogStats.errors} />

      {/* Alert Container - Not lazy loaded as it needs to be always ready */}
      <AlertContainer alerts={alerts} onDismiss={removeAlert} />
    </div>
  );
}

export default App;
