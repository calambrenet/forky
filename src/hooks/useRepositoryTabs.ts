import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type {
  RepositoryTab,
  RepositoryInfo,
  BranchInfo,
  BranchHead,
  TagInfo,
  CommitInfo,
  FileStatus,
  ViewMode,
} from '../types/git';
import { useLocalStorage } from './useLocalStorage';

export interface TabState {
  branches: BranchInfo[];
  branchHeads: BranchHead[];
  tags: TagInfo[];
  remotes: string[];
  commits: CommitInfo[];
  fileStatuses: FileStatus[];
  selectedCommitId: string | null;
  selectedFile: FileStatus | null;
  viewMode: ViewMode;
}

interface PersistedTabData {
  viewMode: ViewMode;
  selectedCommitId: string | null;
}

interface PersistedState {
  tabs: RepositoryTab[];
  activeTabId: string | null;
  tabData: Record<string, PersistedTabData>;
}

const DEFAULT_PERSISTED_STATE: PersistedState = {
  tabs: [],
  activeTabId: null,
  tabData: {},
};

const createEmptyTabState = (): TabState => ({
  branches: [],
  branchHeads: [],
  tags: [],
  remotes: [],
  commits: [],
  fileStatuses: [],
  selectedCommitId: null,
  selectedFile: null,
  viewMode: 'local-changes',
});

export function useRepositoryTabs() {
  const [persistedState, setPersistedState] = useLocalStorage<PersistedState>(
    'forky-repositories',
    DEFAULT_PERSISTED_STATE
  );

  const [tabs, setTabs] = useState<RepositoryTab[]>(persistedState.tabs);
  const [activeTabId, setActiveTabId] = useState<string | null>(persistedState.activeTabId);
  const [tabStates, setTabStates] = useState<Map<string, TabState>>(new Map());
  const [isRestoring, setIsRestoring] = useState(true);

  // Get active tab
  const activeTab = tabs.find((t) => t.id === activeTabId) || null;
  const activeTabState = activeTabId ? tabStates.get(activeTabId) : null;

  // Persist state whenever tabs, activeTabId, or tabStates changes
  useEffect(() => {
    if (!isRestoring) {
      // Build tabData from current tabStates
      const tabData: Record<string, PersistedTabData> = {};
      tabStates.forEach((state, tabId) => {
        tabData[tabId] = {
          viewMode: state.viewMode,
          selectedCommitId: state.selectedCommitId,
        };
      });
      setPersistedState({ tabs, activeTabId, tabData });
    }
  }, [tabs, activeTabId, tabStates, isRestoring, setPersistedState]);

  // Load repository data for a tab
  const loadRepositoryData = useCallback(
    async (tabId: string, persistedTabData?: PersistedTabData) => {
      try {
        const [branchesData, branchHeadsData, tagsData, remotesData, commitsData, statusData] =
          await Promise.all([
            invoke<BranchInfo[]>('get_branches'),
            invoke<BranchHead[]>('get_branch_heads'),
            invoke<TagInfo[]>('get_tags'),
            invoke<string[]>('get_remotes'),
            invoke<CommitInfo[]>('get_commits', { limit: 100 }),
            invoke<FileStatus[]>('get_file_status'),
          ]);

        setTabStates((prev) => {
          const newMap = new Map(prev);
          const existingState = newMap.get(tabId);
          newMap.set(tabId, {
            branches: branchesData,
            branchHeads: branchHeadsData,
            tags: tagsData,
            remotes: remotesData,
            commits: commitsData,
            fileStatuses: statusData,
            selectedCommitId:
              existingState?.selectedCommitId ?? persistedTabData?.selectedCommitId ?? null,
            selectedFile: existingState?.selectedFile ?? null,
            viewMode: existingState?.viewMode ?? persistedTabData?.viewMode ?? 'local-changes',
          });
          return newMap;
        });
      } catch (error) {
        console.error('Error loading repository data:', error);
      }
    },
    []
  );

  // Restore repositories on mount
  useEffect(() => {
    const restoreRepositories = async () => {
      if (persistedState.tabs.length === 0) {
        setIsRestoring(false);
        return;
      }

      const validTabs: RepositoryTab[] = [];

      for (const tab of persistedState.tabs) {
        try {
          const info = await invoke<RepositoryInfo>('open_repository', { path: tab.path });
          validTabs.push({
            ...tab,
            currentBranch: info.current_branch,
          });
          // Pass persisted tab data when loading
          const tabData = persistedState.tabData[tab.id];
          await loadRepositoryData(tab.id, tabData);
        } catch (error) {
          console.error(`Failed to restore repository: ${tab.path}`, error);
        }
      }

      setTabs(validTabs);

      // Set active tab if valid, otherwise use first tab
      const activeExists = validTabs.some((t) => t.id === persistedState.activeTabId);
      if (activeExists) {
        setActiveTabId(persistedState.activeTabId);
        // Re-open the active repository to set it as current in backend
        const activeTab = validTabs.find((t) => t.id === persistedState.activeTabId);
        if (activeTab) {
          await invoke('open_repository', { path: activeTab.path });
        }
      } else if (validTabs.length > 0) {
        setActiveTabId(validTabs[0].id);
        await invoke('open_repository', { path: validTabs[0].path });
      }

      setIsRestoring(false);
    };

    restoreRepositories();
  }, []); // Only run once on mount

  // Open a new repository
  const openRepository = useCallback(
    async (path: string): Promise<boolean> => {
      try {
        // Check if already open
        const existingTab = tabs.find((t) => t.path === path);
        if (existingTab) {
          setActiveTabId(existingTab.id);
          await invoke('open_repository', { path });
          return true;
        }

        const info = await invoke<RepositoryInfo>('open_repository', { path });

        const newTab: RepositoryTab = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          path: info.path,
          name: info.name,
          currentBranch: info.current_branch,
          hasPendingChanges: false,
        };

        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(newTab.id);
        setTabStates((prev) => {
          const newMap = new Map(prev);
          newMap.set(newTab.id, createEmptyTabState());
          return newMap;
        });

        await loadRepositoryData(newTab.id);
        return true;
      } catch (error) {
        console.error('Error opening repository:', error);
        return false;
      }
    },
    [tabs, loadRepositoryData]
  );

  // Select a tab
  const selectTab = useCallback(
    async (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (tab) {
        setActiveTabId(tabId);
        try {
          await invoke('open_repository', { path: tab.path });
        } catch (error) {
          console.error('Error switching repository:', error);
        }
      }
    },
    [tabs]
  );

  // Close a tab
  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const newTabs = prev.filter((t) => t.id !== tabId);

        // If closing active tab, switch to another
        if (activeTabId === tabId && newTabs.length > 0) {
          const closedIndex = prev.findIndex((t) => t.id === tabId);
          const newActiveIndex = Math.min(closedIndex, newTabs.length - 1);
          setActiveTabId(newTabs[newActiveIndex].id);

          // Switch to new active repository
          invoke('open_repository', { path: newTabs[newActiveIndex].path });
        } else if (newTabs.length === 0) {
          setActiveTabId(null);
        }

        return newTabs;
      });

      setTabStates((prev) => {
        const newMap = new Map(prev);
        newMap.delete(tabId);
        return newMap;
      });
    },
    [activeTabId]
  );

  // Update tab state (for commit/file selection)
  const updateTabState = useCallback((tabId: string, updates: Partial<TabState>) => {
    setTabStates((prev) => {
      const newMap = new Map(prev);
      const current = newMap.get(tabId) || createEmptyTabState();
      newMap.set(tabId, { ...current, ...updates });
      return newMap;
    });
  }, []);

  // Refresh current tab data
  const refreshActiveTab = useCallback(async () => {
    if (activeTabId) {
      await loadRepositoryData(activeTabId);
    }
  }, [activeTabId, loadRepositoryData]);

  return {
    tabs,
    activeTab,
    activeTabId,
    activeTabState,
    isRestoring,
    openRepository,
    selectTab,
    closeTab,
    updateTabState,
    refreshActiveTab,
  };
}
