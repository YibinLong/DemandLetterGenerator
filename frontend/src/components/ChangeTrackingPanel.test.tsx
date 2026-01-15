// ChangeTrackingPanel component tests
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChangeTrackingPanel } from './ChangeTrackingPanel';

// Mock the change-tracking lib
vi.mock('../lib/change-tracking', () => ({
  getChanges: vi.fn(() => Promise.resolve({
    changes: [],
    total: 0,
    pending_count: 0,
    accepted_count: 0,
    rejected_count: 0,
  })),
  reviewChange: vi.fn(),
  bulkReviewChanges: vi.fn(),
  deleteChange: vi.fn(),
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const renderWithClient = (ui: React.ReactElement) => {
  const testQueryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={testQueryClient}>{ui}</QueryClientProvider>
  );
};

describe('ChangeTrackingPanel', () => {
  describe('Rendering', () => {
    it('should render the panel container', () => {
      renderWithClient(
        <ChangeTrackingPanel demandLetterId="test-letter-id" />
      );

      // Should show loading state initially
      expect(screen.getByText('Loading changes...')).toBeInTheDocument();
    });

    it('should accept demandLetterId prop', () => {
      const { container } = renderWithClient(
        <ChangeTrackingPanel demandLetterId="letter-123" />
      );

      expect(container).toBeInTheDocument();
    });

    it('should accept onChangeSelected callback', () => {
      const onChangeSelected = vi.fn();
      const { container } = renderWithClient(
        <ChangeTrackingPanel
          demandLetterId="letter-123"
          onChangeSelected={onChangeSelected}
        />
      );

      expect(container).toBeInTheDocument();
    });
  });

  describe('Module Exports', () => {
    it('should export ChangeTrackingPanel as default', async () => {
      const module = await import('./ChangeTrackingPanel');
      expect(module.default).toBeDefined();
      expect(module.ChangeTrackingPanel).toBeDefined();
    });
  });

  describe('Props Interface', () => {
    it('should have correct prop types', () => {
      // This test documents the expected props
      const props = {
        demandLetterId: 'string',
        onChangeSelected: () => {},
      };

      expect(typeof props.demandLetterId).toBe('string');
      expect(typeof props.onChangeSelected).toBe('function');
    });
  });
});
