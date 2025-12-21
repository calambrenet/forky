import { useState, useEffect, useCallback } from 'react';

interface WindowFocusState {
  isFocused: boolean;
  isVisible: boolean;
}

/**
 * Hook to track window focus and visibility state.
 * Used to pause/resume file watching when the app is in background.
 */
export function useWindowFocus(): WindowFocusState {
  const [state, setState] = useState<WindowFocusState>({
    isFocused: document.hasFocus(),
    isVisible: document.visibilityState === 'visible',
  });

  const handleFocus = useCallback(() => {
    setState((prev) => ({ ...prev, isFocused: true }));
  }, []);

  const handleBlur = useCallback(() => {
    setState((prev) => ({ ...prev, isFocused: false }));
  }, []);

  const handleVisibilityChange = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isVisible: document.visibilityState === 'visible',
    }));
  }, []);

  useEffect(() => {
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleFocus, handleBlur, handleVisibilityChange]);

  return state;
}
