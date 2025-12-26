import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import type {
  RepositoryTab,
  RepositoryInfo,
  BranchInfo,
  BranchHead,
  TagInfo,
  StashInfo,
  CommitInfo,
  FileStatus,
  TabState,
  ViewMode,
} from '../types/git';

interface PersistedTabData {
  viewMode: ViewMode;
  selectedCommitId: string | null;
}

interface RepositoryStore {
  // State
  tabs: RepositoryTab[];
  activeTabId: string | null;
  tabStates: Record<string, TabState>;
  isRestoring: boolean;

  // Computed getters (as methods for Zustand)
  getActiveTab: () => RepositoryTab | null;
  getActiveTabState: () => TabState | null;

  // Actions
  openRepository: (path: string) => Promise<boolean>;
  selectTab: (tabId: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeAllTabs: () => void;
  closeTabsToRight: (tabIndex: number) => void;
  closeTabsToLeft: (tabIndex: number) => void;
  updateTabState: (tabId: string, updates: Partial<TabState>) => void;
  refreshActiveTab: () => Promise<void>;
  setIsRestoring: (isRestoring: boolean) => void;
  setTabHasPendingChanges: (tabId: string, hasPendingChanges: boolean) => void;
  setTabCurrentBranch: (tabId: string, branchName: string) => void;

  // Internal actions
  _loadRepositoryData: (tabId: string, persistedData?: PersistedTabData) => Promise<void>;
  _restoreRepositories: () => Promise<void>;
}

const createEmptyTabState = (): TabState => ({
  branches: [],
  branchHeads: [],
  tags: [],
  stashes: [],
  remotes: [],
  commits: [],
  fileStatuses: [],
  selectedCommitId: null,
  selectedFile: null,
  viewMode: 'local-changes',
});

export const useRepositoryStore = create<RepositoryStore>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        // Initial state
        tabs: [],
        activeTabId: null,
        tabStates: {},
        isRestoring: true,

        // Computed getters
        getActiveTab: () => {
          const state = get();
          return state.tabs.find((t) => t.id === state.activeTabId) || null;
        },

        getActiveTabState: () => {
          const state = get();
          return state.activeTabId ? state.tabStates[state.activeTabId] || null : null;
        },

        // Actions
        openRepository: async (path: string) => {
          const state = get();

          // Check if already open
          const existing = state.tabs.find((t) => t.path === path);
          if (existing) {
            await get().selectTab(existing.id);
            return true;
          }

          try {
            const info = await invoke<RepositoryInfo>('open_repository', { path });

            const newTab: RepositoryTab = {
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              path: info.path,
              name: info.name,
              currentBranch: info.current_branch,
              hasPendingChanges: false,
            };

            set((state) => ({
              tabs: [...state.tabs, newTab],
              activeTabId: newTab.id,
              tabStates: {
                ...state.tabStates,
                [newTab.id]: createEmptyTabState(),
              },
            }));

            await get()._loadRepositoryData(newTab.id);
            return true;
          } catch (error) {
            console.error('Error opening repository:', error);
            return false;
          }
        },

        selectTab: async (tabId: string) => {
          const state = get();
          const tab = state.tabs.find((t) => t.id === tabId);
          if (!tab) return;

          set({ activeTabId: tabId });

          try {
            await invoke('open_repository', { path: tab.path });
          } catch (error) {
            console.error('Error switching repository:', error);
          }
        },

        closeTab: (tabId: string) => {
          set((state) => {
            const newTabs = state.tabs.filter((t) => t.id !== tabId);
            const newTabStates = { ...state.tabStates };
            delete newTabStates[tabId];

            let newActiveId = state.activeTabId;

            if (state.activeTabId === tabId && newTabs.length > 0) {
              const closedIndex = state.tabs.findIndex((t) => t.id === tabId);
              const newActiveIndex = Math.min(closedIndex, newTabs.length - 1);
              newActiveId = newTabs[newActiveIndex].id;

              // Switch to new active repository
              invoke('open_repository', { path: newTabs[newActiveIndex].path }).catch(
                console.error
              );
            } else if (newTabs.length === 0) {
              newActiveId = null;
            }

            return {
              tabs: newTabs,
              activeTabId: newActiveId,
              tabStates: newTabStates,
            };
          });
        },

        closeOtherTabs: (tabId: string) => {
          const state = get();
          const tabToKeep = state.tabs.find((t) => t.id === tabId);
          if (!tabToKeep) return;

          // Remove tabStates for closed tabs
          const newTabStates: Record<string, TabState> = {};
          newTabStates[tabId] = state.tabStates[tabId] || createEmptyTabState();

          // Switch to the kept tab if it's not already active
          if (state.activeTabId !== tabId) {
            invoke('open_repository', { path: tabToKeep.path }).catch(console.error);
          }

          set({
            tabs: [tabToKeep],
            activeTabId: tabId,
            tabStates: newTabStates,
          });
        },

        closeAllTabs: () => {
          set({
            tabs: [],
            activeTabId: null,
            tabStates: {},
          });
        },

        closeTabsToRight: (tabIndex: number) => {
          const state = get();
          if (tabIndex < 0 || tabIndex >= state.tabs.length - 1) return;

          const tabsToKeep = state.tabs.slice(0, tabIndex + 1);
          const tabsToClose = state.tabs.slice(tabIndex + 1);

          // Remove tabStates for closed tabs
          const newTabStates = { ...state.tabStates };
          tabsToClose.forEach((tab) => {
            delete newTabStates[tab.id];
          });

          // If active tab is being closed, switch to the rightmost remaining tab
          let newActiveId = state.activeTabId;
          const activeTabIndex = state.tabs.findIndex((t) => t.id === state.activeTabId);
          if (activeTabIndex > tabIndex) {
            newActiveId = tabsToKeep[tabsToKeep.length - 1].id;
            invoke('open_repository', { path: tabsToKeep[tabsToKeep.length - 1].path }).catch(
              console.error
            );
          }

          set({
            tabs: tabsToKeep,
            activeTabId: newActiveId,
            tabStates: newTabStates,
          });
        },

        closeTabsToLeft: (tabIndex: number) => {
          const state = get();
          if (tabIndex <= 0 || tabIndex >= state.tabs.length) return;

          const tabsToClose = state.tabs.slice(0, tabIndex);
          const tabsToKeep = state.tabs.slice(tabIndex);

          // Remove tabStates for closed tabs
          const newTabStates = { ...state.tabStates };
          tabsToClose.forEach((tab) => {
            delete newTabStates[tab.id];
          });

          // If active tab is being closed, switch to the leftmost remaining tab
          let newActiveId = state.activeTabId;
          const activeTabIndex = state.tabs.findIndex((t) => t.id === state.activeTabId);
          if (activeTabIndex < tabIndex) {
            newActiveId = tabsToKeep[0].id;
            invoke('open_repository', { path: tabsToKeep[0].path }).catch(console.error);
          }

          set({
            tabs: tabsToKeep,
            activeTabId: newActiveId,
            tabStates: newTabStates,
          });
        },

        updateTabState: (tabId: string, updates: Partial<TabState>) => {
          set((state) => {
            const current = state.tabStates[tabId] || createEmptyTabState();
            return {
              tabStates: {
                ...state.tabStates,
                [tabId]: { ...current, ...updates },
              },
            };
          });
        },

        refreshActiveTab: async () => {
          const activeTabId = get().activeTabId;
          if (activeTabId) {
            await get()._loadRepositoryData(activeTabId);
          }
        },

        setIsRestoring: (isRestoring: boolean) => set({ isRestoring }),

        setTabHasPendingChanges: (tabId: string, hasPendingChanges: boolean) => {
          set((state) => ({
            tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, hasPendingChanges } : tab)),
          }));
        },

        setTabCurrentBranch: (tabId: string, branchName: string) => {
          set((state) => ({
            tabs: state.tabs.map((tab) =>
              tab.id === tabId ? { ...tab, currentBranch: branchName } : tab
            ),
          }));
        },

        // Internal actions
        _loadRepositoryData: async (tabId: string, persistedData?: PersistedTabData) => {
          try {
            const [
              branchesData,
              branchHeadsData,
              tagsData,
              stashesData,
              remotesData,
              commitsData,
              statusData,
            ] = await Promise.all([
              invoke<BranchInfo[]>('get_branches'),
              invoke<BranchHead[]>('get_branch_heads'),
              invoke<TagInfo[]>('get_tags'),
              invoke<StashInfo[]>('get_stashes'),
              invoke<string[]>('get_remotes'),
              invoke<CommitInfo[]>('get_commits', { limit: 100 }),
              invoke<FileStatus[]>('get_file_status'),
            ]);

            set((state) => {
              const existingState = state.tabStates[tabId];
              return {
                tabStates: {
                  ...state.tabStates,
                  [tabId]: {
                    branches: branchesData,
                    branchHeads: branchHeadsData,
                    tags: tagsData,
                    stashes: stashesData,
                    remotes: remotesData,
                    commits: commitsData,
                    fileStatuses: statusData,
                    selectedCommitId:
                      existingState?.selectedCommitId ?? persistedData?.selectedCommitId ?? null,
                    selectedFile: existingState?.selectedFile ?? null,
                    viewMode: existingState?.viewMode ?? persistedData?.viewMode ?? 'local-changes',
                  },
                },
              };
            });

            // Mark tab as having pending changes if there are file changes
            if (statusData.length > 0) {
              get().setTabHasPendingChanges(tabId, true);
            }
          } catch (error) {
            console.error('Error loading repository data:', error);
          }
        },

        _restoreRepositories: async () => {
          const state = get();

          if (state.tabs.length === 0) {
            set({ isRestoring: false });
            return;
          }

          const validTabs: RepositoryTab[] = [];

          for (const tab of state.tabs) {
            try {
              const info = await invoke<RepositoryInfo>('open_repository', { path: tab.path });
              validTabs.push({
                ...tab,
                currentBranch: info.current_branch,
                hasPendingChanges: false,
              });

              // Get persisted tab data if available
              const existingState = state.tabStates[tab.id];
              const persistedData: PersistedTabData | undefined = existingState
                ? {
                    viewMode: existingState.viewMode,
                    selectedCommitId: existingState.selectedCommitId,
                  }
                : undefined;

              await get()._loadRepositoryData(tab.id, persistedData);
            } catch (error) {
              console.error(`Failed to restore repository: ${tab.path}`, error);
            }
          }

          // Determine active tab
          let activeTabId = state.activeTabId;
          const activeExists = validTabs.some((t) => t.id === activeTabId);

          if (!activeExists && validTabs.length > 0) {
            activeTabId = validTabs[0].id;
          } else if (validTabs.length === 0) {
            activeTabId = null;
          }

          // Re-open the active repository to set it as current in backend
          if (activeTabId) {
            const activeTab = validTabs.find((t) => t.id === activeTabId);
            if (activeTab) {
              await invoke('open_repository', { path: activeTab.path });
            }
          }

          set({
            tabs: validTabs,
            activeTabId,
            isRestoring: false,
          });
        },
      }),
      {
        name: 'forky-repositories',
        partialize: (state) => ({
          tabs: state.tabs,
          activeTabId: state.activeTabId,
          // Only persist viewMode and selectedCommitId for each tab
          tabStates: Object.fromEntries(
            Object.entries(state.tabStates).map(([id, tabState]) => [
              id,
              {
                viewMode: tabState.viewMode,
                selectedCommitId: tabState.selectedCommitId,
                // Don't persist runtime data
                branches: [],
                branchHeads: [],
                tags: [],
                stashes: [],
                remotes: [],
                commits: [],
                fileStatuses: [],
                selectedFile: null,
              },
            ])
          ),
        }),
      }
    )
  )
);

// Trigger restoration on store initialization
// This runs once when the module loads
const initializeStore = () => {
  const state = useRepositoryStore.getState();
  if (state.tabs.length > 0 && state.isRestoring) {
    state._restoreRepositories();
  } else {
    state.setIsRestoring(false);
  }
};

// Call initialization after a small delay to ensure store is ready
setTimeout(initializeStore, 0);

// Selector hooks for optimized re-renders
export const useTabs = () => useRepositoryStore((state) => state.tabs);
export const useActiveTabId = () => useRepositoryStore((state) => state.activeTabId);
export const useIsRestoring = () => useRepositoryStore((state) => state.isRestoring);

export const useActiveTab = () => {
  const tabs = useRepositoryStore((state) => state.tabs);
  const activeTabId = useRepositoryStore((state) => state.activeTabId);
  return tabs.find((t) => t.id === activeTabId) || null;
};

export const useActiveTabState = () => {
  const tabStates = useRepositoryStore((state) => state.tabStates);
  const activeTabId = useRepositoryStore((state) => state.activeTabId);
  return activeTabId ? tabStates[activeTabId] || null : null;
};

// Specific data selectors for fine-grained subscriptions
export const useActiveTabBranches = () => {
  const tabState = useActiveTabState();
  return tabState?.branches ?? [];
};

export const useActiveTabRemotes = () => {
  const tabState = useActiveTabState();
  return tabState?.remotes ?? [];
};

export const useActiveTabFileStatuses = () => {
  const tabState = useActiveTabState();
  return tabState?.fileStatuses ?? [];
};

export const useLocalChangesCount = () => {
  const tabState = useActiveTabState();
  return tabState?.fileStatuses.length ?? 0;
};

export const useActiveTabStashes = () => {
  const tabState = useActiveTabState();
  return tabState?.stashes ?? [];
};
