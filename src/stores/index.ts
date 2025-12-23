// Git Operation Store
export {
  useGitOperationStore,
  useIsGitLoading,
  useCurrentOperation,
  useActivityLog,
} from './gitOperationStore';

// Modal Store
export {
  useModalStore,
  useActiveModal,
  useIsAddRemoteModalOpen,
  useIsActivityLogOpen,
  useSshVerification,
  useCredentialModal,
} from './modalStore';

// UI Store
export {
  useUIStore,
  useTheme,
  useSystemTheme,
  useResolvedTheme,
  useAlerts,
  usePanelSizes,
  useIsResizing,
  MIN_SIZES,
  MAX_SIZES,
  DEFAULT_PANEL_SIZES,
} from './uiStore';
export type { AlertType, AlertData } from './uiStore';

// Repository Store
export {
  useRepositoryStore,
  useTabs,
  useActiveTabId,
  useIsRestoring,
  useActiveTab,
  useActiveTabState,
  useActiveTabBranches,
  useActiveTabRemotes,
  useActiveTabStashes,
  useActiveTabFileStatuses,
  useLocalChangesCount,
} from './repositoryStore';
