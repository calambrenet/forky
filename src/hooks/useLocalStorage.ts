import { useState, useEffect, useRef, useCallback } from 'react';

const DEBOUNCE_DELAY = 300;

const requestIdleCallbackPolyfill =
  typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? window.requestIdleCallback
    : (cb: IdleRequestCallback) =>
        setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 1);

const cancelIdleCallbackPolyfill =
  typeof window !== 'undefined' && 'cancelIdleCallback' in window
    ? window.cancelIdleCallback
    : (id: number) => clearTimeout(id);

function readStorage<T>(key: string, defaultValue: T): T {
  if (!key) return defaultValue;
  try {
    const stored = localStorage.getItem(key);
    return stored !== null ? (JSON.parse(stored) as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function writeStorage<T>(key: string, value: T): void {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Error saving to localStorage:', error);
  }
}

export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const defaultValueRef = useRef(defaultValue);
  defaultValueRef.current = defaultValue;

  const [value, setValue] = useState<T>(() => readStorage(key, defaultValue));

  const prevKeyRef = useRef<string>(key);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleCallbackRef = useRef<number | null>(null);
  const hasPendingWriteRef = useRef(false);
  const pendingKeyRef = useRef<string>(key);
  const pendingValueRef = useRef<T>(value);

  const flushPending = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (idleCallbackRef.current !== null) {
      cancelIdleCallbackPolyfill(idleCallbackRef.current);
      idleCallbackRef.current = null;
    }
    if (hasPendingWriteRef.current) {
      hasPendingWriteRef.current = false;
      writeStorage(pendingKeyRef.current, pendingValueRef.current);
    }
  }, []);

  // Reload state when `key` changes (e.g. switching repository tabs) without overwriting the new key
  useEffect(() => {
    if (prevKeyRef.current !== key) {
      flushPending();
      prevKeyRef.current = key;
      setValue(readStorage(key, defaultValueRef.current));
    }
  }, [key, flushPending]);

  // Flush any pending write on unmount so recent changes are never lost
  useEffect(() => {
    return () => {
      flushPending();
    };
  }, [flushPending]);

  const setValueMemoized = useCallback(
    (newValue: T) => {
      setValue(newValue);

      if (!key) return;

      pendingKeyRef.current = key;
      pendingValueRef.current = newValue;
      hasPendingWriteRef.current = true;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (idleCallbackRef.current !== null) {
        cancelIdleCallbackPolyfill(idleCallbackRef.current);
        idleCallbackRef.current = null;
      }

      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        idleCallbackRef.current = requestIdleCallbackPolyfill(
          () => {
            idleCallbackRef.current = null;
            if (hasPendingWriteRef.current) {
              hasPendingWriteRef.current = false;
              writeStorage(pendingKeyRef.current, pendingValueRef.current);
            }
          },
          { timeout: 1000 }
        );
      }, DEBOUNCE_DELAY);
    },
    [key]
  );

  return [value, setValueMemoized];
}
