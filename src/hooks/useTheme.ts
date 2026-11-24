import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useLocalStorage } from './useLocalStorage';

export type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface SystemTheme {
  theme: string;
  source: string;
}

function getMediaSystemTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

function readStoredUserTheme(): Theme {
  try {
    const raw = localStorage.getItem('forky-theme');
    if (!raw) return 'system';
    const parsed = JSON.parse(raw);
    return parsed === 'light' || parsed === 'dark' || parsed === 'system' ? parsed : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Apply `data-theme` synchronously before React mounts so the first frame uses
 * the right light/dark palette without a white flash.
 */
export function applyInitialTheme(): void {
  const userTheme = readStoredUserTheme();
  const resolved: ResolvedTheme = userTheme === 'system' ? getMediaSystemTheme() : userTheme;
  document.documentElement.setAttribute('data-theme', resolved);
}

export function useTheme() {
  const [userTheme, setUserTheme] = useLocalStorage<Theme>('forky-theme', 'system');
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getMediaSystemTheme);
  const lastThemeRef = useRef<ResolvedTheme>(systemTheme);

  const updateSystemTheme = useCallback((next: ResolvedTheme) => {
    if (next !== lastThemeRef.current) {
      lastThemeRef.current = next;
      setSystemTheme(next);
    }
  }, []);

  const detectSystemTheme = useCallback(async (): Promise<ResolvedTheme> => {
    try {
      const result = await invoke<SystemTheme>('get_system_theme');
      return result.theme === 'dark' ? 'dark' : 'light';
    } catch (e) {
      console.warn('Failed to get system theme from Rust, using fallback:', e);
      return getMediaSystemTheme();
    }
  }, []);

  // Listen to WebView media query and native Tauri window theme events (covers macOS Auto day/night transitions)
  useEffect(() => {
    let cancelled = false;
    let unlistenTauriTheme: (() => void) | undefined;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      updateSystemTheme(e.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', handleMediaChange);

    try {
      getCurrentWindow()
        .onThemeChanged(({ payload }) => {
          if (!cancelled && (payload === 'dark' || payload === 'light')) {
            updateSystemTheme(payload);
          }
        })
        .then((unlisten) => {
          if (cancelled) {
            unlisten();
          } else {
            unlistenTauriTheme = unlisten;
          }
        })
        .catch(() => {});
    } catch {
      // Ignore outside Tauri runtime
    }

    return () => {
      cancelled = true;
      mediaQuery.removeEventListener('change', handleMediaChange);
      unlistenTauriTheme?.();
    };
  }, [updateSystemTheme]);

  // Sync with OS theme on mount (StrictMode-safe), when switching to 'system', and on window focus
  useEffect(() => {
    if (userTheme !== 'system') return;

    let cancelled = false;

    const syncTheme = async () => {
      const detected = await detectSystemTheme();
      if (!cancelled) {
        updateSystemTheme(detected);
      }
    };

    void syncTheme();
    window.addEventListener('focus', syncTheme);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', syncTheme);
    };
  }, [userTheme, detectSystemTheme, updateSystemTheme]);

  const resolvedTheme: ResolvedTheme = userTheme === 'system' ? systemTheme : userTheme;

  // Apply synchronously before browser paint
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback(
    (theme: Theme) => {
      setUserTheme(theme);
    },
    [setUserTheme]
  );

  const toggleTheme = useCallback(() => {
    const newTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
    setUserTheme(newTheme);
  }, [resolvedTheme, setUserTheme]);

  return {
    theme: userTheme,
    resolvedTheme,
    systemTheme,
    setTheme,
    toggleTheme,
  };
}
