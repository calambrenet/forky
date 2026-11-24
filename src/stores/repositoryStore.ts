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
  refreshTab: (tabId: string) => Promise<void>;
  refreshActiveTab: () => Promise<void>;
  setIsRestoring: (isRestoring: boolean) => void;
  setTabHasPendingChanges: (tabId: string, hasPendingChanges: boolean) => void;
  setTabCurrentBranch: (tabId: string, branchName: string) => void;

  // Internal actions
  _loadRepositoryData: (
    tabId: string,
    repoPath: string,
    persistedData?: PersistedTabData
  ) => Promise<void>;
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

// Per-tab monotonic generation counter to discard out-of-order `_loadRepositoryData` resolutions
const loadGenerationByTab: Record<string, number> = {};

let restorationStarted = false;

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

          const existingBefore = state.tabs.find((t) => t.path === path);
          if (existingBefore) {
            await get().selectTab(existingBefore.id);
            return true;
          }

          try {
            const info = await invoke<RepositoryInfo>('open_repository', { path });

            // Re-check against the canonical path returned by Rust (prevents duplicates via trailing slash / subdir)
            const existingCanonical = get().tabs.find((t) => t.path === info.path);
            if (existingCanonical) {
              await get().selectTab(existingCanonical.id);
              return true;
            }

            const newTab: RepositoryTab = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
              path: info.path,
              name: info.name,
              currentBranch: info.current_branch,
              hasPendingChanges: false,
            };

            set((curr) => ({
              tabs: [...curr.tabs, newTab],
              activeTabId: newTab.id,
              tabStates: {
                ...curr.tabStates,
                [newTab.id]: createEmptyTabState(),
              },
            }));

            await get()._loadRepositoryData(newTab.id, newTab.path);
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
        },

        closeTab: (tabId: string) => {
          delete loadGenerationByTab[tabId];
          set((state) => {
            const newTabs = state.tabs.filter((t) => t.id !== tabId);
            const newTabStates = { ...state.tabStates };
            delete newTabStates[tabId];

            let newActiveId = state.activeTabId;

            if (state.activeTabId === tabId && newTabs.length > 0) {
              const closedIndex = state.tabs.findIndex((t) => t.id === tabId);
              const newActiveIndex = Math.min(closedIndex, newTabs.length - 1);
              newActiveId = newTabs[newActiveIndex].id;
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

          for (const t of state.tabs) {
            if (t.id !== tabId) delete loadGenerationByTab[t.id];
          }

          const newTabStates: Record<string, TabState> = {
            [tabId]: state.tabStates[tabId] || createEmptyTabState(),
          };

          set({
            tabs: [tabToKeep],
            activeTabId: tabId,
            tabStates: newTabStates,
          });
        },

        closeAllTabs: () => {
          for (const key of Object.keys(loadGenerationByTab)) {
            delete loadGenerationByTab[key];
          }
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

          const newTabStates = { ...state.tabStates };
          tabsToClose.forEach((tab) => {
            delete newTabStates[tab.id];
            delete loadGenerationByTab[tab.id];
          });

          let newActiveId = state.activeTabId;
          const activeTabIndex = state.tabs.findIndex((t) => t.id === state.activeTabId);
          if (activeTabIndex > tabIndex) {
            newActiveId = tabsToKeep[tabsToKeep.length - 1].id;
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

          const newTabStates = { ...state.tabStates };
          tabsToClose.forEach((tab) => {
            delete newTabStates[tab.id];
            delete loadGenerationByTab[tab.id];
          });

          let newActiveId = state.activeTabId;
          const activeTabIndex = state.tabs.findIndex((t) => t.id === state.activeTabId);
          if (activeTabIndex < tabIndex) {
            newActiveId = tabsToKeep[0].id;
          }

          set({
            tabs: tabsToKeep,
            activeTabId: newActiveId,
            tabStates: newTabStates,
          });
        },

        updateTabState: (tabId: string, updates: Partial<TabState>) => {
          set((state) => {
            if (!state.tabs.some((t) => t.id === tabId)) return state;
            const current = state.tabStates[tabId] || createEmptyTabState();
            return {
              tabStates: {
                ...state.tabStates,
                [tabId]: { ...current, ...updates },
              },
            };
          });
        },

        refreshTab: async (tabId: string) => {
          const tab = get().tabs.find((t) => t.id === tabId);
          if (tab) {
            await get()._loadRepositoryData(tab.id, tab.path);
          }
        },

        refreshActiveTab: async () => {
          const activeTab = get().getActiveTab();
          if (activeTab) {
            await get()._loadRepositoryData(activeTab.id, activeTab.path);
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
        _loadRepositoryData: async (
          tabId: string,
          repoPath: string,
          persistedData?: PersistedTabData
        ) => {
          const generation = (loadGenerationByTab[tabId] ?? 0) + 1;
          loadGenerationByTab[tabId] = generation;

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
              invoke<BranchInfo[]>('get_branches', { repoPath }),
              invoke<BranchHead[]>('get_branch_heads', { repoPath }),
              invoke<TagInfo[]>('get_tags', { repoPath }),
              invoke<StashInfo[]>('get_stashes', { repoPath }),
              invoke<string[]>('get_remotes', { repoPath }),
              invoke<CommitInfo[]>('get_commits', { repoPath, limit: 100 }),
              invoke<FileStatus[]>('get_file_status', { repoPath }),
            ]);

            // Drop stale responses or responses for closed tabs
            if (loadGenerationByTab[tabId] !== generation) return;

            const headBranch = branchesData.find((b) => b.is_head)?.name ?? null;
            const hasPendingChanges = statusData.length > 0;

            set((state) => {
              if (!state.tabs.some((t) => t.id === tabId)) return state;
              const existingState = state.tabStates[tabId];
              return {
                tabs: state.tabs.map((tab) =>
                  tab.id === tabId
                    ? {
                        ...tab,
                        hasPendingChanges,
                        currentBranch: headBranch ?? tab.currentBranch,
                      }
                    : tab
                ),
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
          } catch (error) {
            console.error('Error loading repository data:', error);
          }
        },

        _restoreRepositories: async () => {
          let backgroundLoads: Promise<void>[] = [];

          try {
            const initialTabs = get().tabs;
            const initialTabStates = get().tabStates;

            if (initialTabs.length === 0) {
              return;
            }

            // Validate saved tabs in parallel without rewriting recent_repos.json or rebuilding the OS menu
            const results = await Promise.all(
              initialTabs.map(async (tab) => {
                try {
                  const info = await invoke<RepositoryInfo>('open_repository', {
                    path: tab.path,
                    recordRecent: false,
                  });
                  return {
                    ...tab,
                    path: info.path,
                    name: info.name,
                    currentBranch: info.current_branch,
                    hasPendingChanges: false,
                  } as RepositoryTab;
                } catch (error) {
                  console.error(`Failed to restore repository: ${tab.path}`, error);
                  return null;
                }
              })
            );

            const validTabs = results.filter((t): t is RepositoryTab => t !== null);
            const validTabIds = new Set(validTabs.map((t) => t.id));

            // Prune invalid tabs and orphaned tabStates before loading data
            const prunedTabStates: Record<string, TabState> = {};
            for (const tab of validTabs) {
              prunedTabStates[tab.id] = initialTabStates[tab.id] || createEmptyTabState();
            }

            let activeTabId = get().activeTabId;
            if (!activeTabId || !validTabIds.has(activeTabId)) {
              activeTabId = validTabs.length > 0 ? validTabs[0].id : null;
            }

            set({
              tabs: validTabs,
              activeTabId,
              tabStates: prunedTabStates,
            });

            const loadTab = (tab: RepositoryTab) => {
              const existingState = prunedTabStates[tab.id];
              const persistedData: PersistedTabData | undefined = existingState
                ? {
                    viewMode: existingState.viewMode,
                    selectedCommitId: existingState.selectedCommitId,
                  }
                : undefined;
              return get()._loadRepositoryData(tab.id, tab.path, persistedData);
            };

            // Load active tab eagerly before showing UI; load inactive tabs in parallel in background
            const activeTab = validTabs.find((t) => t.id === activeTabId);
            if (activeTab) {
              await loadTab(activeTab);
            }

            backgroundLoads = validTabs.filter((t) => t.id !== activeTabId).map(loadTab);
          } finally {
            set({ isRestoring: false });
          }

          if (backgroundLoads.length > 0) {
            await Promise.all(backgroundLoads);
          }
        },
      }),
      {
        name: 'forky-repositories',
        partialize: (state) => ({
          tabs: state.tabs,
          activeTabId: state.activeTabId,
          tabStates: Object.fromEntries(
            Object.entries(state.tabStates).map(([id, tabState]) => [
              id,
              {
                viewMode: tabState.viewMode,
                selectedCommitId: tabState.selectedCommitId,
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
        onRehydrateStorage: () => (rehydratedState) => {
          if (restorationStarted) return;
          restorationStarted = true;
          if (rehydratedState && rehydratedState.tabs.length > 0) {
            void rehydratedState._restoreRepositories();
          } else {
            useRepositoryStore.getState().setIsRestoring(false);
          }
        },
      }
    )
  )
);

// Fallback in case localStorage is empty/unavailable and onRehydrateStorage wasn't triggered with tabs
if (!restorationStarted) {
  queueMicrotask(() => {
    if (!restorationStarted) {
      restorationStarted = true;
      const state = useRepositoryStore.getState();
      if (state.tabs.length > 0 && state.isRestoring) {
        void state._restoreRepositories();
      } else {
        state.setIsRestoring(false);
      }
    }
  });
}

// Selector hooks
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

const EMPTY_BRANCHES: BranchInfo[] = [];
const EMPTY_REMOTES: string[] = [];
const EMPTY_FILE_STATUSES: FileStatus[] = [];
const EMPTY_STASHES: StashInfo[] = [];

export const useActiveTabBranches = () => {
  const tabState = useActiveTabState();
  return tabState?.branches ?? EMPTY_BRANCHES;
};

export const useActiveTabRemotes = () => {
  const tabState = useActiveTabState();
  return tabState?.remotes ?? EMPTY_REMOTES;
};

export const useActiveTabFileStatuses = () => {
  const tabState = useActiveTabState();
  return tabState?.fileStatuses ?? EMPTY_FILE_STATUSES;
};

export const useLocalChangesCount = () => {
  const tabState = useActiveTabState();
  return tabState?.fileStatuses.length ?? 0;
};

export const useActiveTabStashes = () => {
  const tabState = useActiveTabState();
  return tabState?.stashes ?? EMPTY_STASHES;
};
