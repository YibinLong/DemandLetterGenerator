import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareDialog } from './ShareDialog';

// Mock the collaboration API functions with the correct function names
vi.mock('../lib/collaboration', () => ({
  searchFirmUsers: vi.fn().mockResolvedValue({
    users: [
      { id: 'user-1', email: 'user1@test.com', name: 'User One', role: 'attorney' },
      { id: 'user-2', email: 'user2@test.com', name: 'User Two', role: 'paralegal' },
    ],
  }),
  createCollaborationInvite: vi.fn().mockResolvedValue({
    id: 'invite-1',
    token: 'test-token-123',
    permission: 'edit',
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  }),
  getCollaborationInvites: vi.fn().mockResolvedValue({
    demand_letter_id: 'letter-123',
    invites: [
      {
        id: 'existing-invite-1',
        invited_email: 'existing@test.com',
        invited_name: 'Existing User',
        invited_by: 'John Attorney',
        permission: 'view',
        accepted: false,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
    ],
  }),
  revokeCollaborationInvite: vi.fn().mockResolvedValue(undefined),
  getActiveCollaborators: vi.fn().mockResolvedValue({
    demand_letter_id: 'letter-123',
    collaborators: [],
    count: 0,
  }),
}));

describe('ShareDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    demandLetterId: 'letter-123',
    demandLetterTitle: 'Test Demand Letter',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render dialog when open', () => {
      render(<ShareDialog {...defaultProps} />);

      expect(screen.getByText(/Share/i)).toBeInTheDocument();
    });

    it('should not render dialog when closed', () => {
      render(<ShareDialog {...defaultProps} isOpen={false} />);

      expect(screen.queryByText(/Share/i)).not.toBeInTheDocument();
    });

    it('should display document title', () => {
      render(<ShareDialog {...defaultProps} />);

      expect(screen.getByText(/Test Demand Letter/i)).toBeInTheDocument();
    });

    it('should render search input', () => {
      render(<ShareDialog {...defaultProps} />);

      expect(screen.getByPlaceholderText(/Search by name or email/i)).toBeInTheDocument();
    });

    it('should render permission select', () => {
      render(<ShareDialog {...defaultProps} />);

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
  });

  describe('Permission Options', () => {
    it('should have "Can edit" and "Can view" options', () => {
      render(<ShareDialog {...defaultProps} />);

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();

      // Check for options
      const options = select.querySelectorAll('option');
      const optionValues = Array.from(options).map(opt => opt.textContent);

      expect(optionValues).toContain('Can edit');
      expect(optionValues).toContain('Can view');
    });

    it('should default to "edit" permission', () => {
      render(<ShareDialog {...defaultProps} />);

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('edit');
    });
  });

  describe('Search Functionality', () => {
    it('should trigger search when typing in input', async () => {
      const { searchFirmUsers } = await import('../lib/collaboration');
      render(<ShareDialog {...defaultProps} />);

      const input = screen.getByPlaceholderText(/Search by name or email/i);
      await userEvent.type(input, 'user');

      // Wait for debounce
      await waitFor(() => {
        expect(searchFirmUsers).toHaveBeenCalled();
      }, { timeout: 1000 });
    });
  });

  describe('Pending Invites Section', () => {
    it('should load and display pending invites', async () => {
      render(<ShareDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Pending Invites')).toBeInTheDocument();
      });
    });
  });

  describe('Close Behavior', () => {
    it('should call onClose when close button is clicked', async () => {
      render(<ShareDialog {...defaultProps} />);

      // Find close button (it's the × button)
      const closeButton = screen.getByTitle('Close');
      fireEvent.click(closeButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const { searchFirmUsers } = await import('../lib/collaboration');
      (searchFirmUsers as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

      render(<ShareDialog {...defaultProps} />);

      const input = screen.getByPlaceholderText(/Search by name or email/i);
      await userEvent.type(input, 'test');

      // Should not crash and dialog should still be visible
      await waitFor(() => {
        expect(screen.getByText(/Share/i)).toBeInTheDocument();
      });
    });
  });

  describe('Tabs', () => {
    it('should display Invite People tab', () => {
      render(<ShareDialog {...defaultProps} />);

      expect(screen.getByText('Invite People')).toBeInTheDocument();
    });

    it('should display Active Now tab', () => {
      render(<ShareDialog {...defaultProps} />);

      expect(screen.getByText(/Active Now/i)).toBeInTheDocument();
    });

    it('should switch between tabs', async () => {
      render(<ShareDialog {...defaultProps} />);

      // Click on Active Now tab
      const activeTab = screen.getByText(/Active Now/i);
      fireEvent.click(activeTab);

      // Should show empty state message
      await waitFor(() => {
        expect(screen.getByText(/No one else is currently viewing/i)).toBeInTheDocument();
      });
    });
  });
});
