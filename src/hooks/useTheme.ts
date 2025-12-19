import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useLocalStorage } from './useLocalStorage';

export type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface SystemTheme {
  theme: string;
  source: string;
}

// Polling interval in milliseconds (check every 2 seconds)
const THEME_POLL_INTERVAL = 2000;

export function useTheme() {
  const [userTheme, setUserTheme] = useLocalStorage<Theme>('forky-theme', 'system');
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>('light');
  const lastThemeRef = useRef<string>('light');

  // Detect system theme using Rust command (works reliably on Linux)
  const detectSystemTheme = useCallback(async (): Promise<ResolvedTheme> => {
    try {
      const result = await invoke<SystemTheme>('get_system_theme');
      return result.theme === 'dark' ? 'dark' : 'light';
    } catch (e) {
      console.warn('Failed to get system theme from Rust, using fallback:', e);

      // Fallback to media query
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'dark' : 'light';
    }
  }, []);

  // Initial theme detection and polling setup
  useEffect(() => {
    let pollInterval: number | undefined;
    let mounted = true;

    const checkTheme = async () => {
      if (!mounted) return;

      const detectedTheme = await detectSystemTheme();

      // Only update if theme actually changed
      if (detectedTheme !== lastThemeRef.current) {
        lastThemeRef.current = detectedTheme;
        setSystemTheme(detectedTheme);
      }
    };

    // Initial check
    checkTheme();

    // Start polling for theme changes
    pollInterval = window.setInterval(checkTheme, THEME_POLL_INTERVAL);

    // Also listen for media query changes (backup for non-Linux systems)
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      const newTheme = e.matches ? 'dark' : 'light';
      if (newTheme !== lastThemeRef.current) {
        lastThemeRef.current = newTheme;
        setSystemTheme(newTheme);
      }
    };
    mediaQuery.addEventListener('change', handleMediaChange);

    return () => {
      mounted = false;
      if (pollInterval) {
        window.clearInterval(pollInterval);
      }
      mediaQuery.removeEventListener('change', handleMediaChange);
    };
  }, [detectSystemTheme]);

  // Resolve the actual theme to use
  const resolvedTheme: ResolvedTheme = userTheme === 'system' ? systemTheme : userTheme;

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  // Set theme function
  const setTheme = useCallback((theme: Theme) => {
    setUserTheme(theme);
  }, [setUserTheme]);

  // Toggle between light and dark (skipping system)
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
