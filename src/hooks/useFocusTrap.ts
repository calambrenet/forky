import { useEffect, useRef, useCallback } from 'react';

// Selector para elementos focusables - constante fuera del hook para evitar recreación
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
export function useFocusTrap<T extends HTMLElement>(
  options: UseFocusTrapOptions
) {
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

    // Sort by tab index (positive numbers first, then 0)
    return elements.sort((a, b) => {
      const aIndex = a.tabIndex;
      const bIndex = b.tabIndex;

      // Elements with tabindex=0 or no tabindex go last
      if (aIndex === 0 && bIndex === 0) return 0;
      if (aIndex === 0) return 1;
      if (bIndex === 0) return -1;

      // Both have positive tabindex - sort numerically
      return aIndex - bIndex;
    });
  }, []);

  /**
   * Handle Tab and Shift+Tab to trap focus
   */
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        // Shift+Tab on first element -> jump to last
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab on last element -> jump to first
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isActive, getFocusableElements]);

  /**
   * Save previous focus and focus first element when activated
   * Restore focus when deactivated
   */
  useEffect(() => {
    if (!isActive) return;

    // Save current focus
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Focus first element after render
    let cleanedUp = false;

    const rafId = requestAnimationFrame(() => {
      if (cleanedUp) return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      } else if (containerRef.current) {
        // No focusable elements - focus container if it has tabindex
        containerRef.current.focus();
      }
    });

    return () => {
      cleanedUp = true;
      cancelAnimationFrame(rafId);

      // Restore focus safely
      try {
        // Check if element still exists in DOM
        if (previousFocusRef.current?.isConnected) {
          previousFocusRef.current.focus();
        }
      } catch {
        // Element no longer focusable, fallback to body
        document.body.focus();
      }
    };
  }, [isActive, getFocusableElements]);

  return containerRef;
}
