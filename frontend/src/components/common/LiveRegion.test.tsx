/**
 * Tests for LiveRegion accessibility components
 */

import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { LiveRegionProvider, useLiveRegion, StatusAnnouncer } from './LiveRegion';

// Test component that uses the useLiveRegion hook
function TestComponent() {
  const { announce } = useLiveRegion();

  return (
    <div>
      <button onClick={() => announce('Polite message', 'polite')}>
        Announce Polite
      </button>
      <button onClick={() => announce('Assertive message', 'assertive')}>
        Announce Assertive
      </button>
    </div>
  );
}

describe('LiveRegion', () => {
  describe('LiveRegionProvider', () => {
    it('should render children', () => {
      render(
        <LiveRegionProvider>
          <div data-testid="child">Test content</div>
        </LiveRegionProvider>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('should render live regions with correct roles', () => {
      render(
        <LiveRegionProvider>
          <div>Content</div>
        </LiveRegionProvider>
      );

      // Should have a status region for polite announcements
      expect(screen.getByRole('status')).toBeInTheDocument();

      // Should have an alert region for assertive announcements
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should have proper aria-live attributes', () => {
      render(
        <LiveRegionProvider>
          <div>Content</div>
        </LiveRegionProvider>
      );

      const statusRegion = screen.getByRole('status');
      const alertRegion = screen.getByRole('alert');

      expect(statusRegion).toHaveAttribute('aria-live', 'polite');
      expect(alertRegion).toHaveAttribute('aria-live', 'assertive');
    });
  });

  describe('useLiveRegion', () => {
    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const originalError = console.error;
      console.error = () => {};

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useLiveRegion must be used within a LiveRegionProvider');

      console.error = originalError;
    });
  });

  describe('StatusAnnouncer', () => {
    it('should render with polite priority by default', () => {
      render(<StatusAnnouncer message="Test message" />);

      const region = screen.getByRole('status');
      expect(region).toHaveAttribute('aria-live', 'polite');
      expect(region).toHaveTextContent('Test message');
    });

    it('should render with assertive priority when specified', () => {
      render(<StatusAnnouncer message="Urgent message" priority="assertive" />);

      const region = screen.getByRole('alert');
      expect(region).toHaveAttribute('aria-live', 'assertive');
      expect(region).toHaveTextContent('Urgent message');
    });

    it('should have aria-atomic attribute', () => {
      render(<StatusAnnouncer message="Test" />);

      const region = screen.getByRole('status');
      expect(region).toHaveAttribute('aria-atomic', 'true');
    });

    it('should be visually hidden', () => {
      render(<StatusAnnouncer message="Test" />);

      const region = screen.getByRole('status');
      expect(region).toHaveClass('visually-hidden');
    });
  });
});
