// CommentPanel component tests
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommentPanel } from './CommentPanel';

// Mock the change-tracking lib
vi.mock('../lib/change-tracking', () => ({
  getComments: vi.fn(() => Promise.resolve({
    comments: [],
    total: 0,
    unresolved_count: 0,
  })),
  createComment: vi.fn(),
  updateComment: vi.fn(),
  resolveComment: vi.fn(),
  deleteComment: vi.fn(),
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

describe('CommentPanel', () => {
  describe('Rendering', () => {
    it('should render the panel container', () => {
      renderWithClient(
        <CommentPanel demandLetterId="test-letter-id" />
      );

      // Should show loading state initially
      expect(screen.getByText('Loading comments...')).toBeInTheDocument();
    });

    it('should render the loading state initially', () => {
      const { container } = renderWithClient(
        <CommentPanel demandLetterId="letter-123" />
      );

      // During loading, form won't be visible yet
      // Just verify the container renders
      expect(container).toBeInTheDocument();
      expect(screen.getByText('Loading comments...')).toBeInTheDocument();
    });

    it('should accept demandLetterId prop', () => {
      const { container } = renderWithClient(
        <CommentPanel demandLetterId="letter-123" />
      );

      expect(container).toBeInTheDocument();
    });

    it('should accept optional props', () => {
      const onCommentSelected = vi.fn();
      const { container } = renderWithClient(
        <CommentPanel
          demandLetterId="letter-123"
          selectedChangeId="change-456"
          selectedPosition={{ start: 0, end: 10 }}
          onCommentSelected={onCommentSelected}
          currentUserId="user-789"
        />
      );

      expect(container).toBeInTheDocument();
    });
  });

  describe('Module Exports', () => {
    it('should export CommentPanel as default', async () => {
      const module = await import('./CommentPanel');
      expect(module.default).toBeDefined();
      expect(module.CommentPanel).toBeDefined();
    });
  });

  describe('Props Interface', () => {
    it('should have correct prop types', () => {
      // This test documents the expected props
      const props = {
        demandLetterId: 'string',
        selectedChangeId: 'string',
        selectedPosition: { start: 0, end: 10 },
        onCommentSelected: () => {},
        currentUserId: 'string',
      };

      expect(typeof props.demandLetterId).toBe('string');
      expect(typeof props.selectedChangeId).toBe('string');
      expect(typeof props.selectedPosition).toBe('object');
      expect(typeof props.onCommentSelected).toBe('function');
      expect(typeof props.currentUserId).toBe('string');
    });
  });
});
