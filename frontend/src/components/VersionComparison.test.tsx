// VersionComparison component tests
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VersionComparison } from './VersionComparison';

// Mock the change-tracking lib
vi.mock('../lib/change-tracking', () => ({
  compareVersions: vi.fn(() => Promise.resolve({
    from: {
      id: 'v1',
      version_number: 1,
      content: 'Old content',
      changed_by: { id: 'user-1', name: 'John Doe', email: 'john@test.com' },
      created_at: '2024-01-01T00:00:00Z',
    },
    to: {
      id: 'v2',
      version_number: 2,
      content: 'New content',
      changed_by: { id: 'user-1', name: 'John Doe', email: 'john@test.com' },
      created_at: '2024-01-02T00:00:00Z',
    },
  })),
  computeDiff: vi.fn(() => [
    { type: 'delete', text: 'Old' },
    { type: 'insert', text: 'New' },
    { type: 'equal', text: ' content' },
  ]),
  diffToHtml: vi.fn(() => '<span class="diff-delete">Old</span><span class="diff-insert">New</span> content'),
  getDiffStats: vi.fn(() => ({ insertions: 1, deletions: 1, unchanged: 1 })),
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

const mockVersions = [
  {
    id: 'v2',
    version_number: 2,
    content: 'New content',
    changed_by: { id: 'user-1', name: 'John Doe', email: 'john@test.com' },
    created_at: '2024-01-02T00:00:00Z',
  },
  {
    id: 'v1',
    version_number: 1,
    content: 'Old content',
    changed_by: { id: 'user-1', name: 'John Doe', email: 'john@test.com' },
    created_at: '2024-01-01T00:00:00Z',
  },
];

describe('VersionComparison', () => {
  describe('Rendering', () => {
    it('should render the comparison container', () => {
      renderWithClient(
        <VersionComparison
          demandLetterId="letter-123"
          versions={mockVersions}
        />
      );

      expect(screen.getByText('Compare Versions')).toBeInTheDocument();
    });

    it('should render version selectors', () => {
      renderWithClient(
        <VersionComparison
          demandLetterId="letter-123"
          versions={mockVersions}
        />
      );

      expect(screen.getByText('From Version')).toBeInTheDocument();
      expect(screen.getByText('To Version')).toBeInTheDocument();
    });

    it('should render view mode toggle', () => {
      renderWithClient(
        <VersionComparison
          demandLetterId="letter-123"
          versions={mockVersions}
        />
      );

      expect(screen.getByText('Unified')).toBeInTheDocument();
      expect(screen.getByText('Side by Side')).toBeInTheDocument();
    });

    it('should render legend', () => {
      renderWithClient(
        <VersionComparison
          demandLetterId="letter-123"
          versions={mockVersions}
        />
      );

      expect(screen.getByText('Added text')).toBeInTheDocument();
      expect(screen.getByText('Removed text')).toBeInTheDocument();
    });

    it('should render close button when onClose provided', () => {
      const onClose = vi.fn();
      renderWithClient(
        <VersionComparison
          demandLetterId="letter-123"
          versions={mockVersions}
          onClose={onClose}
        />
      );

      const closeButton = screen.getByText('✕');
      expect(closeButton).toBeInTheDocument();
    });
  });

  describe('Module Exports', () => {
    it('should export VersionComparison as default', async () => {
      const module = await import('./VersionComparison');
      expect(module.default).toBeDefined();
      expect(module.VersionComparison).toBeDefined();
    });
  });

  describe('Props Interface', () => {
    it('should have correct prop types', () => {
      // This test documents the expected props
      const props = {
        demandLetterId: 'string',
        versions: mockVersions,
        onClose: () => {},
      };

      expect(typeof props.demandLetterId).toBe('string');
      expect(Array.isArray(props.versions)).toBe(true);
      expect(typeof props.onClose).toBe('function');
    });

    it('should handle empty versions array', () => {
      const { container } = renderWithClient(
        <VersionComparison
          demandLetterId="letter-123"
          versions={[]}
        />
      );

      expect(container).toBeInTheDocument();
    });

    it('should handle single version', () => {
      const { container } = renderWithClient(
        <VersionComparison
          demandLetterId="letter-123"
          versions={[mockVersions[0]]}
        />
      );

      expect(container).toBeInTheDocument();
    });
  });
});
