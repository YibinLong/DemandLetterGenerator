/**
 * Accessibility utilities for the application
 * Provides hooks, helpers, and utilities for implementing WCAG 2.1 AA compliance
 */

import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook to trap focus within a container (e.g., modals, dialogs)
 * @param isActive - Whether the focus trap is active
 * @returns ref to attach to the container element
 */
export function useFocusTrap<T extends HTMLElement>(isActive: boolean) {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = getFocusableElements(container);

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Focus first element when trap activates
    firstElement.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);

  return containerRef;
}

/**
 * Hook to handle escape key press (e.g., to close modals)
 * @param onEscape - Callback when escape is pressed
 * @param isActive - Whether the handler is active
 */
export function useEscapeKey(onEscape: () => void, isActive: boolean = true) {
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscape();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onEscape, isActive]);
}

/**
 * Hook to manage roving tabindex for arrow key navigation
 * Useful for toolbars, menus, and tab lists
 */
export function useRovingTabIndex<T extends HTMLElement>(
  _itemCount: number, // Reserved for potential future use
  orientation: 'horizontal' | 'vertical' | 'both' = 'horizontal'
) {
  const containerRef = useRef<T>(null);
  const currentIndexRef = useRef(0);

  const setCurrentIndex = useCallback((index: number) => {
    currentIndexRef.current = index;
    if (containerRef.current) {
      const items = getFocusableElements(containerRef.current);
      items[index]?.focus();
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    const handleKeyDown = (e: KeyboardEvent) => {
      const items = getFocusableElements(container);
      if (items.length === 0) return;

      let newIndex = currentIndexRef.current;
      let handled = false;

      switch (e.key) {
        case 'ArrowRight':
          if (orientation === 'horizontal' || orientation === 'both') {
            newIndex = (currentIndexRef.current + 1) % items.length;
            handled = true;
          }
          break;
        case 'ArrowLeft':
          if (orientation === 'horizontal' || orientation === 'both') {
            newIndex = (currentIndexRef.current - 1 + items.length) % items.length;
            handled = true;
          }
          break;
        case 'ArrowDown':
          if (orientation === 'vertical' || orientation === 'both') {
            newIndex = (currentIndexRef.current + 1) % items.length;
            handled = true;
          }
          break;
        case 'ArrowUp':
          if (orientation === 'vertical' || orientation === 'both') {
            newIndex = (currentIndexRef.current - 1 + items.length) % items.length;
            handled = true;
          }
          break;
        case 'Home':
          newIndex = 0;
          handled = true;
          break;
        case 'End':
          newIndex = items.length - 1;
          handled = true;
          break;
      }

      if (handled) {
        e.preventDefault();
        setCurrentIndex(newIndex);
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [orientation, setCurrentIndex]);

  return { containerRef, currentIndex: currentIndexRef.current, setCurrentIndex };
}

/**
 * Hook to restore focus to a previous element when a component unmounts
 * Useful for modals and dialogs
 */
export function useRestoreFocus(shouldRestore: boolean = true) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (shouldRestore) {
      previousFocusRef.current = document.activeElement as HTMLElement;

      return () => {
        previousFocusRef.current?.focus();
      };
    }
  }, [shouldRestore]);
}

/**
 * Hook to announce messages to screen readers
 */
export function useAnnounce() {
  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', priority);
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'visually-hidden';
    announcement.textContent = message;

    document.body.appendChild(announcement);

    // Remove after announcement is read
    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }, []);

  return announce;
}

/**
 * Get all focusable elements within a container
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable]',
  ].join(', ');

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors)).filter(
    (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
  );
}

/**
 * Generate a unique ID for accessibility attributes
 */
let idCounter = 0;
export function generateId(prefix: string = 'a11y'): string {
  return `${prefix}-${++idCounter}`;
}

/**
 * Check if an element is visible to screen readers
 */
export function isAccessible(element: HTMLElement): boolean {
  if (element.getAttribute('aria-hidden') === 'true') return false;
  if (getComputedStyle(element).display === 'none') return false;
  if (getComputedStyle(element).visibility === 'hidden') return false;
  return true;
}

/**
 * Props helper for keyboard-interactive non-button elements
 * Makes divs and other elements keyboard-accessible like buttons
 */
export function getInteractiveProps(onClick: () => void, label?: string) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    },
    ...(label ? { 'aria-label': label } : {}),
  };
}

/**
 * WCAG 2.1 AA contrast ratio requirements
 * Normal text: 4.5:1
 * Large text (18pt or 14pt bold): 3:1
 */
export const CONTRAST_RATIOS = {
  normalText: 4.5,
  largeText: 3,
  uiComponents: 3,
} as const;

/**
 * Calculate relative luminance of a color
 * @param r - Red component (0-255)
 * @param g - Green component (0-255)
 * @param b - Blue component (0-255)
 */
export function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors
 */
export function getContrastRatio(color1: [number, number, number], color2: [number, number, number]): number {
  const lum1 = getLuminance(...color1);
  const lum2 = getLuminance(...color2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Parse hex color to RGB
 */
export function hexToRgb(hex: string): [number, number, number] | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : null;
}

/**
 * Check if colors meet WCAG contrast requirements
 */
export function meetsContrastRequirements(
  foreground: string,
  background: string,
  isLargeText: boolean = false
): boolean {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);

  if (!fg || !bg) return false;

  const ratio = getContrastRatio(fg, bg);
  const requiredRatio = isLargeText ? CONTRAST_RATIOS.largeText : CONTRAST_RATIOS.normalText;

  return ratio >= requiredRatio;
}
