import { useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useWindowFocus } from './useWindowFocus';

interface FileChangeEvent {
  repo_path: string;
  timestamp: number;
}

interface UseFileWatcherOptions {
  /** Debounce delay in milliseconds for the callback */
  debounceMs?: number;
  /** Only trigger when window is visible */
  onlyWhenVisible?: boolean;
}

/**
 * Hook to watch for file changes in a repository.
 * Automatically starts/stops the watcher and handles window focus.
 */
export function useFileWatcher(
  repoPath: string | undefined,
  onFilesChanged: () => void,
  options: UseFileWatcherOptions = {}
): void {
  const { debounceMs = 300, onlyWhenVisible = true } = options;
  const { isVisible } = useWindowFocus();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCallRef = useRef<number>(0);

  // Debounced callback
  const debouncedCallback = useCallback(() => {
    const now = Date.now();

    // Clear existing timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Check if enough time has passed since last call
    const timeSinceLastCall = now - lastCallRef.current;
    if (timeSinceLastCall < debounceMs) {
      // Schedule for later
      debounceRef.current = setTimeout(() => {
        lastCallRef.current = Date.now();
        onFilesChanged();
      }, debounceMs - timeSinceLastCall);
    } else {
      // Execute immediately
      lastCallRef.current = now;
      onFilesChanged();
    }
  }, [onFilesChanged, debounceMs]);

  // Start/stop watcher when repoPath changes
  useEffect(() => {
    if (!repoPath) {
      return;
    }

    const startWatcher = async () => {
      try {
        await invoke('start_file_watcher', { path: repoPath });
      } catch (error) {
        console.error('Failed to start file watcher:', error);
      }
    };

    startWatcher();

    return () => {
      invoke('stop_file_watcher').catch((error) => {
        console.error('Failed to stop file watcher:', error);
      });
    };
  }, [repoPath]);

  // Listen for file change events
  useEffect(() => {
    if (!repoPath) {
      return;
    }

    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      unlisten = await listen<FileChangeEvent>('repo-files-changed', (event) => {
        // Only process if it's for our repo
        if (event.payload.repo_path !== repoPath) {
          return;
        }

        // Skip if window is not visible and option is enabled
        if (onlyWhenVisible && !isVisible) {
          return;
        }

        debouncedCallback();
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
      // Clear any pending debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [repoPath, isVisible, onlyWhenVisible, debouncedCallback]);

  // Refresh when window becomes visible (if there were changes while hidden)
  useEffect(() => {
    if (isVisible && repoPath && onlyWhenVisible) {
      // Small delay to avoid race conditions
      const timeout = setTimeout(() => {
        onFilesChanged();
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [isVisible, repoPath, onlyWhenVisible, onFilesChanged]);
}
