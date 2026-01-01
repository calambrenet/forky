import { useEffect, useRef, useCallback } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface UseFocusTrapOptions {
  /** Whether the focus trap is active */
  isActive: boolean;
}

/**
 * Custom hook to trap focus within a container element.
 *
 * Features:
 * - Traps Tab/Shift+Tab within container
 * - Auto-focuses first element when activated
 * - Restores focus when deactivated
 * - Handles tab index ordering correctly
 * - Prevents memory leaks with proper cleanup
 *
 * @param options - Configuration options
 * @returns Ref to attach to container element
 *
 * @example
 * ```tsx
 * const dialogRef = useFocusTrap({ isActive: isOpen });
 *
 * return (
 *   <div ref={dialogRef} role="dialog">
 *     <button>First focusable</button>
 *     <input />
 *     <button>Last focusable</button>
 *   </div>
 * );
 * ```
 */
export function useFocusTrap<T extends HTMLElement>(options: UseFocusTrapOptions) {
  const { isActive } = options;
  const containerRef = useRef<T>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  /**
   * Get all focusable elements in correct tab order
   */
  const getFocusableElements = useCallback((): HTMLElement[] => {
    if (!containerRef.current) return [];

    const elements = Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    );

    return elements.sort((a, b) => {
      const aIndex = a.tabIndex;
      const bIndex = b.tabIndex;

      if (aIndex === 0 && bIndex === 0) return 0;
      if (aIndex === 0) return 1;
      if (bIndex === 0) return -1;

      return aIndex - bIndex;
    });
  }, []);

  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isActive, getFocusableElements]);

  useEffect(() => {
    if (!isActive) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    let cleanedUp = false;

    const rafId = requestAnimationFrame(() => {
      if (cleanedUp) return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      } else if (containerRef.current) {
        containerRef.current.focus();
      }
    });

    return () => {
      cleanedUp = true;
      cancelAnimationFrame(rafId);

      try {
        if (previousFocusRef.current?.isConnected) {
          previousFocusRef.current.focus();
        }
      } catch {
        document.body.focus();
      }
    };
  }, [isActive, getFocusableElements]);

  return containerRef;
}
