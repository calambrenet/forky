import { useState, useEffect, useRef, useCallback } from 'react';

// Debounce delay for localStorage writes (ms)
const DEBOUNCE_DELAY = 300;

// Polyfill for requestIdleCallback
const requestIdleCallbackPolyfill =
  typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? window.requestIdleCallback
    : (cb: IdleRequestCallback) =>
        setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 1);

const cancelIdleCallbackPolyfill =
  typeof window !== 'undefined' && 'cancelIdleCallback' in window
    ? window.cancelIdleCallback
    : (id: number) => clearTimeout(id);

export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  // Refs for debouncing
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleCallbackRef = useRef<number | null>(null);
  const pendingValueRef = useRef<T | null>(null);

  // Persist to localStorage with debounce and requestIdleCallback
  useEffect(() => {
    // Store the pending value
    pendingValueRef.current = value;

    // Clear any existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Cancel any pending idle callback
    if (idleCallbackRef.current) {
      cancelIdleCallbackPolyfill(idleCallbackRef.current);
    }

    // Set up debounced write
    debounceTimerRef.current = setTimeout(() => {
      // Use requestIdleCallback for non-blocking write
      idleCallbackRef.current = requestIdleCallbackPolyfill(
        () => {
          try {
            if (pendingValueRef.current !== null) {
              localStorage.setItem(key, JSON.stringify(pendingValueRef.current));
            }
          } catch (error) {
            console.error('Error saving to localStorage:', error);
          }
        },
        { timeout: 1000 }
      ); // Max wait 1 second
    }, DEBOUNCE_DELAY);

    // Cleanup on unmount or key change
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (idleCallbackRef.current) {
        cancelIdleCallbackPolyfill(idleCallbackRef.current);
      }
    };
  }, [key, value]);

  // Memoized setter to prevent unnecessary re-renders
  const setValueMemoized = useCallback((newValue: T) => {
    setValue(newValue);
  }, []);

  return [value, setValueMemoized];
}
