import { create } from 'zustand';
import { persist, subscribeWithSelector, type StorageValue } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import type {
  RepositoryTab,
  RepositoryInfo,
  RepositorySnapshot,
  BranchInfo,
  StashInfo,
  FileStatus,
  FileStatusSeparated,
  TabState,
  ViewMode,
} from '../types/git';

interface PersistedTabData {
  viewMode: ViewMode;
  selectedCommitId: string | null;
}

interface PersistedRepositorySlice {
  tabs: RepositoryTab[];
  activeTabId: string | null;
  persistedTabs?: Record<string, PersistedTabData>;
  // Legacy format support for seamless migration
  tabStates?: Record<string, Partial<TabState>>;
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
  refreshTabStatus: (tabId: string) => Promise<FileStatusSeparated | null>;
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

const createEmptyTabState = (persisted?: Partial<PersistedTabData>): TabState => ({
  branches: [],
  branchHeads: [],
  tags: [],
  stashes: [],
  remotes: [],
  remoteUrls: {},
  unstaged: [],
  staged: [],
  fileStatuses: [],
  selectedCommitId: persisted?.selectedCommitId ?? null,
  selectedFile: null,
  viewMode: persisted?.viewMode ?? 'local-changes',
  loaded: false,
});

// Per-tab monotonic generation counters to discard out-of-order IPC resolutions
const loadGenerationByTab: Record<string, number> = {};
const statusGenerationByTab: Record<string, number> = {};

let restorationStarted = false;

// Debounced localStorage adapter that skips identical payloads (avoids synchronous writes on in-memory refreshes)
const createDebouncedStorage = (delayMs: number) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingKey: string | null = null;
  let pendingSerialized: string | null = null;
  let lastWritten: string | null = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingKey !== null && pendingSerialized !== null) {
      if (pendingSerialized !== lastWritten) {
        try {
          localStorage.setItem(pendingKey, pendingSerialized);
          lastWritten = pendingSerialized;
        } catch (error) {
          console.error('Failed to persist repositories:', error);
        }
      }
      pendingKey = null;
      pendingSerialized = null;
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush);
  }

  return {
    getItem: (name: string): StorageValue<PersistedRepositorySlice> | null => {
      const raw = localStorage.getItem(name);
      lastWritten = raw;
      if (!raw) return null;
      try {
        return JSON.parse(raw) as StorageValue<PersistedRepositorySlice>;
      } catch {
        return null;
      }
    },
    setItem: (name: string, value: StorageValue<PersistedRepositorySlice>) => {
      const serialized = JSON.stringify(value);
      if (serialized === lastWritten || serialized === pendingSerialized) {
        return;
      }
      pendingKey = name;
      pendingSerialized = serialized;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    removeItem: (name: string) => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pendingKey = null;
      pendingSerialized = null;
      lastWritten = null;
      localStorage.removeItem(name);
    },
  };
};

export const useRepositoryStore = create<RepositoryStore>()(
  subscribeWithSelector(
    persist(
      (set, get) => {
        const ensureTabLoaded = (tabId: string | null) => {
          if (!tabId) return;
          const state = get();
          const tab = state.tabs.find((t) => t.id === tabId);
          if (!tab) return;
          const tabState = state.tabStates[tabId];
          if (tabState?.loaded || loadGenerationByTab[tabId]) return;
          const persistedData: PersistedTabData | undefined = tabState
            ? {
                viewMode: tabState.viewMode,
                selectedCommitId: tabState.selectedCommitId,
              }
            : undefined;
          void state._loadRepositoryData(tab.id, tab.path, persistedData);
        };

        return {
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
            ensureTabLoaded(tabId);
          },

          closeTab: (tabId: string) => {
            delete loadGenerationByTab[tabId];
            delete statusGenerationByTab[tabId];
            let nextActiveId: string | null = null;
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

              nextActiveId = newActiveId;
              return {
                tabs: newTabs,
                activeTabId: newActiveId,
                tabStates: newTabStates,
              };
            });
            ensureTabLoaded(nextActiveId);
          },

          closeOtherTabs: (tabId: string) => {
            const state = get();
            const tabToKeep = state.tabs.find((t) => t.id === tabId);
            if (!tabToKeep) return;

            for (const t of state.tabs) {
              if (t.id !== tabId) {
                delete loadGenerationByTab[t.id];
                delete statusGenerationByTab[t.id];
              }
            }

            const newTabStates: Record<string, TabState> = {
              [tabId]: state.tabStates[tabId] || createEmptyTabState(),
            };

            set({
              tabs: [tabToKeep],
              activeTabId: tabId,
              tabStates: newTabStates,
            });
            ensureTabLoaded(tabId);
          },

          closeAllTabs: () => {
            for (const key of Object.keys(loadGenerationByTab)) {
              delete loadGenerationByTab[key];
            }
            for (const key of Object.keys(statusGenerationByTab)) {
              delete statusGenerationByTab[key];
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
              delete statusGenerationByTab[tab.id];
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
            ensureTabLoaded(newActiveId);
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
              delete statusGenerationByTab[tab.id];
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
            ensureTabLoaded(newActiveId);
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

          refreshTabStatus: async (tabId: string): Promise<FileStatusSeparated | null> => {
            const tab = get().tabs.find((t) => t.id === tabId);
            if (!tab) return null;

            const generation = (statusGenerationByTab[tabId] ?? 0) + 1;
            statusGenerationByTab[tabId] = generation;

            try {
              const result = await invoke<FileStatusSeparated>('get_file_status_separated', {
                repoPath: tab.path,
              });

              if (statusGenerationByTab[tabId] !== generation) return null;

              const allFiles = [...result.unstaged, ...result.staged];
              const hasPendingChanges = allFiles.length > 0;

              set((state) => {
                if (!state.tabs.some((t) => t.id === tabId)) return state;
                const current = state.tabStates[tabId] || createEmptyTabState();
                return {
                  tabs: state.tabs.map((t) =>
                    t.id === tabId && t.hasPendingChanges !== hasPendingChanges
                      ? { ...t, hasPendingChanges }
                      : t
                  ),
                  tabStates: {
                    ...state.tabStates,
                    [tabId]: {
                      ...current,
                      unstaged: result.unstaged,
                      staged: result.staged,
                      fileStatuses: allFiles,
                    },
                  },
                };
              });

              return result;
            } catch (error) {
              if (statusGenerationByTab[tabId] !== generation) return null;
              console.error('Error refreshing tab status:', error);
              return null;
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
            set((state) => {
              const target = state.tabs.find((t) => t.id === tabId);
              if (!target || target.hasPendingChanges === hasPendingChanges) return state;
              return {
                tabs: state.tabs.map((tab) =>
                  tab.id === tabId ? { ...tab, hasPendingChanges } : tab
                ),
              };
            });
          },

          setTabCurrentBranch: (tabId: string, branchName: string) => {
            set((state) => {
              const target = state.tabs.find((t) => t.id === tabId);
              if (!target || target.currentBranch === branchName) return state;
              return {
                tabs: state.tabs.map((tab) =>
                  tab.id === tabId ? { ...tab, currentBranch: branchName } : tab
                ),
              };
            });
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
              const snapshot = await invoke<RepositorySnapshot>('get_repository_snapshot', {
                repoPath,
              });

              // Drop stale responses or responses for closed tabs
              if (loadGenerationByTab[tabId] !== generation) return;

              const headBranch = snapshot.branches.find((b) => b.is_head)?.name ?? null;
              const allFiles = [...snapshot.unstaged, ...snapshot.staged];
              const hasPendingChanges = allFiles.length > 0;

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
                      branches: snapshot.branches,
                      branchHeads: snapshot.branch_heads,
                      tags: snapshot.tags,
                      stashes: snapshot.stashes,
                      remotes: snapshot.remotes,
                      remoteUrls: snapshot.remote_urls ?? {},
                      unstaged: snapshot.unstaged,
                      staged: snapshot.staged,
                      fileStatuses: allFiles,
                      selectedCommitId:
                        existingState?.selectedCommitId ?? persistedData?.selectedCommitId ?? null,
                      selectedFile: existingState?.selectedFile ?? null,
                      viewMode:
                        existingState?.viewMode ?? persistedData?.viewMode ?? 'local-changes',
                      loaded: true,
                    },
                  },
                };
              });
            } catch (error) {
              console.error('Error loading repository data:', error);
            }
          },

          _restoreRepositories: async () => {
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

              // Prune invalid tabs and orphaned tabStates before loading data (inactive tabs stay lazy)
              const prunedTabStates: Record<string, TabState> = {};
              for (const tab of validTabs) {
                const existing = initialTabStates[tab.id];
                prunedTabStates[tab.id] = createEmptyTabState(
                  existing
                    ? {
                        viewMode: existing.viewMode,
                        selectedCommitId: existing.selectedCommitId,
                      }
                    : undefined
                );
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

              // Load only the active tab eagerly; inactive tabs load lazily on selectTab
              const activeTab = validTabs.find((t) => t.id === activeTabId);
              if (activeTab) {
                const existingState = prunedTabStates[activeTab.id];
                await get()._loadRepositoryData(activeTab.id, activeTab.path, {
                  viewMode: existingState.viewMode,
                  selectedCommitId: existingState.selectedCommitId,
                });
              }
            } finally {
              set({ isRestoring: false });
            }
          },
        };
      },
      {
        name: 'forky-repositories',
        storage: createDebouncedStorage(300),
        partialize: (state): PersistedRepositorySlice => ({
          tabs: state.tabs.map((tab) => ({
            id: tab.id,
            path: tab.path,
            name: tab.name,
            currentBranch: tab.currentBranch,
            hasPendingChanges: false,
          })),
          activeTabId: state.activeTabId,
          persistedTabs: Object.fromEntries(
            Object.entries(state.tabStates).map(([id, tabState]) => [
              id,
              {
                viewMode: tabState.viewMode,
                selectedCommitId: tabState.selectedCommitId,
              },
            ])
          ),
        }),
        merge: (persistedState, currentState) => {
          const persisted = persistedState as PersistedRepositorySlice | undefined;
          if (!persisted) return currentState;

          const tabStates: Record<string, TabState> = {};
          const tabs = persisted.tabs ?? [];
          for (const tab of tabs) {
            const saved =
              persisted.persistedTabs?.[tab.id] ??
              (persisted.tabStates?.[tab.id]
                ? {
                    viewMode: persisted.tabStates[tab.id].viewMode ?? 'local-changes',
                    selectedCommitId: persisted.tabStates[tab.id].selectedCommitId ?? null,
                  }
                : undefined);
            tabStates[tab.id] = createEmptyTabState(saved);
          }

          return {
            ...currentState,
            tabs,
            activeTabId: persisted.activeTabId ?? null,
            tabStates,
          };
        },
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

const EMPTY_BRANCHES: BranchInfo[] = [];
const EMPTY_REMOTES: string[] = [];
const EMPTY_FILE_STATUSES: FileStatus[] = [];
const EMPTY_STASHES: StashInfo[] = [];

// Atomic selector hooks
export const useTabs = () => useRepositoryStore((state) => state.tabs);
export const useActiveTabId = () => useRepositoryStore((state) => state.activeTabId);
export const useIsRestoring = () => useRepositoryStore((state) => state.isRestoring);

export const useActiveTab = () =>
  useRepositoryStore((state) =>
    state.activeTabId ? (state.tabs.find((t) => t.id === state.activeTabId) ?? null) : null
  );

export const useActiveTabState = () =>
  useRepositoryStore((state) =>
    state.activeTabId ? (state.tabStates[state.activeTabId] ?? null) : null
  );

export const useActiveTabBranches = () =>
  useRepositoryStore(
    (s) => (s.activeTabId ? s.tabStates[s.activeTabId]?.branches : undefined) ?? EMPTY_BRANCHES
  );

export const useActiveTabRemotes = () =>
  useRepositoryStore(
    (s) => (s.activeTabId ? s.tabStates[s.activeTabId]?.remotes : undefined) ?? EMPTY_REMOTES
  );

export const useActiveTabFileStatuses = () =>
  useRepositoryStore(
    (s) =>
      (s.activeTabId ? s.tabStates[s.activeTabId]?.fileStatuses : undefined) ?? EMPTY_FILE_STATUSES
  );

export const useActiveTabUnstaged = () =>
  useRepositoryStore(
    (s) => (s.activeTabId ? s.tabStates[s.activeTabId]?.unstaged : undefined) ?? EMPTY_FILE_STATUSES
  );

export const useActiveTabStaged = () =>
  useRepositoryStore(
    (s) => (s.activeTabId ? s.tabStates[s.activeTabId]?.staged : undefined) ?? EMPTY_FILE_STATUSES
  );

export const useLocalChangesCount = () =>
  useRepositoryStore((s) => {
    const ts = s.activeTabId ? s.tabStates[s.activeTabId] : undefined;
    return ts ? ts.unstaged.length + ts.staged.length : 0;
  });

export const useActiveTabStashes = () =>
  useRepositoryStore(
    (s) => (s.activeTabId ? s.tabStates[s.activeTabId]?.stashes : undefined) ?? EMPTY_STASHES
  );
