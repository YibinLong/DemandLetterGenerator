/**
 * LiveRegion component for announcing dynamic content changes to screen readers
 * Implements ARIA live regions for WCAG 2.1 AA compliance (Success Criterion 4.1.3)
 */

import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

interface LiveRegionContextValue {
  /** Announce a message to screen readers */
  announce: (message: string, priority?: 'polite' | 'assertive') => void;
}

const LiveRegionContext = createContext<LiveRegionContextValue | null>(null);

interface LiveRegionProviderProps {
  children: ReactNode;
}

/**
 * Provider component that manages live region announcements
 * Wrap your app with this provider to enable screen reader announcements
 */
export function LiveRegionProvider({ children }: LiveRegionProviderProps) {
  const [politeMessage, setPoliteMessage] = useState('');
  const [assertiveMessage, setAssertiveMessage] = useState('');

  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (priority === 'assertive') {
      // Clear and re-set to ensure announcement
      setAssertiveMessage('');
      setTimeout(() => setAssertiveMessage(message), 100);
    } else {
      setPoliteMessage('');
      setTimeout(() => setPoliteMessage(message), 100);
    }
  }, []);

  return (
    <LiveRegionContext.Provider value={{ announce }}>
      {children}

      {/* Polite live region - for non-urgent updates */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="visually-hidden"
      >
        {politeMessage}
      </div>

      {/* Assertive live region - for urgent updates */}
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="visually-hidden"
      >
        {assertiveMessage}
      </div>
    </LiveRegionContext.Provider>
  );
}

/**
 * Hook to announce messages to screen readers
 * Must be used within a LiveRegionProvider
 */
export function useLiveRegion() {
  const context = useContext(LiveRegionContext);
  if (!context) {
    throw new Error('useLiveRegion must be used within a LiveRegionProvider');
  }
  return context;
}

/**
 * Standalone live region for simple status messages
 */
interface StatusAnnouncerProps {
  message: string;
  priority?: 'polite' | 'assertive';
}

export function StatusAnnouncer({ message, priority = 'polite' }: StatusAnnouncerProps) {
  return (
    <div
      role={priority === 'assertive' ? 'alert' : 'status'}
      aria-live={priority}
      aria-atomic="true"
      className="visually-hidden"
    >
      {message}
    </div>
  );
}

export default LiveRegionProvider;
