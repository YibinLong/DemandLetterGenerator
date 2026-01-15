/**
 * Tests for HelpPanel components
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HelpProvider, useHelp, HelpButton } from './HelpPanel';

// Test component that uses the help context
function TestComponent() {
  const { isOpen, openHelp, closeHelp, currentArticle, setCurrentArticle } = useHelp();

  return (
    <div>
      <div data-testid="status">{isOpen ? 'Help Open' : 'Help Closed'}</div>
      <div data-testid="article">{currentArticle || 'None'}</div>
      <button onClick={() => openHelp()}>Open Help</button>
      <button onClick={() => openHelp('getting-started')}>Open Getting Started</button>
      <button onClick={closeHelp}>Close Help</button>
      <button onClick={() => setCurrentArticle('templates')}>Go to Templates</button>
    </div>
  );
}

describe('HelpProvider', () => {
  it('should render children', () => {
    render(
      <HelpProvider>
        <div data-testid="child">Child content</div>
      </HelpProvider>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('should provide help context', () => {
    render(
      <HelpProvider>
        <TestComponent />
      </HelpProvider>
    );

    expect(screen.getByTestId('status')).toHaveTextContent('Help Closed');
  });
});

describe('useHelp', () => {
  it('should throw error when used outside HelpProvider', () => {
    const originalError = console.error;
    console.error = () => {};

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useHelp must be used within a HelpProvider');

    console.error = originalError;
  });

  it('should open help panel when openHelp is called', async () => {
    render(
      <HelpProvider>
        <TestComponent />
      </HelpProvider>
    );

    expect(screen.getByTestId('status')).toHaveTextContent('Help Closed');

    fireEvent.click(screen.getByText('Open Help'));

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('Help Open');
    });
  });

  it('should show help panel overlay', async () => {
    render(
      <HelpProvider>
        <TestComponent />
      </HelpProvider>
    );

    fireEvent.click(screen.getByText('Open Help'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    expect(screen.getByText('Help & Documentation')).toBeInTheDocument();
  });

  it('should close help panel when closeHelp is called', async () => {
    render(
      <HelpProvider>
        <TestComponent />
      </HelpProvider>
    );

    fireEvent.click(screen.getByText('Open Help'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Close Help'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('should open to specific article when specified', async () => {
    render(
      <HelpProvider>
        <TestComponent />
      </HelpProvider>
    );

    fireEvent.click(screen.getByText('Open Getting Started'));

    await waitFor(() => {
      expect(screen.getByTestId('article')).toHaveTextContent('getting-started');
    });
  });

  it('should show search input', async () => {
    render(
      <HelpProvider>
        <TestComponent />
      </HelpProvider>
    );

    fireEvent.click(screen.getByText('Open Help'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search help articles...')).toBeInTheDocument();
    });
  });

  it('should filter articles when searching', async () => {
    render(
      <HelpProvider>
        <TestComponent />
      </HelpProvider>
    );

    fireEvent.click(screen.getByText('Open Help'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search help articles...');
    fireEvent.change(searchInput, { target: { value: 'upload' } });

    await waitFor(() => {
      expect(screen.getByText('Search Results (1)')).toBeInTheDocument();
    });
  });

  it('should show no results message for empty search', async () => {
    render(
      <HelpProvider>
        <TestComponent />
      </HelpProvider>
    );

    fireEvent.click(screen.getByText('Open Help'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search help articles...');
    fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } });

    await waitFor(() => {
      expect(screen.getByText(/No articles found/)).toBeInTheDocument();
    });
  });

  it('should close help panel when close button is clicked', async () => {
    render(
      <HelpProvider>
        <TestComponent />
      </HelpProvider>
    );

    fireEvent.click(screen.getByText('Open Help'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Close help panel'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('should show article content when article is selected', async () => {
    render(
      <HelpProvider>
        <TestComponent />
      </HelpProvider>
    );

    fireEvent.click(screen.getByText('Open Getting Started'));

    await waitFor(() => {
      // Should show the article title
      expect(screen.getByRole('heading', { level: 3, name: 'Getting Started' })).toBeInTheDocument();
    });
  });

  it('should have back button in article view', async () => {
    render(
      <HelpProvider>
        <TestComponent />
      </HelpProvider>
    );

    fireEvent.click(screen.getByText('Open Getting Started'));

    await waitFor(() => {
      expect(screen.getByText('Back to articles')).toBeInTheDocument();
    });
  });
});

describe('HelpButton', () => {
  it('should render floating help button', () => {
    render(
      <HelpProvider>
        <HelpButton />
      </HelpProvider>
    );

    expect(screen.getByLabelText('Open help documentation')).toBeInTheDocument();
  });

  it('should have help-button class', () => {
    render(
      <HelpProvider>
        <HelpButton />
      </HelpProvider>
    );

    const button = screen.getByLabelText('Open help documentation');
    expect(button).toHaveClass('help-button');
  });

  it('should position correctly based on position prop', () => {
    const { rerender } = render(
      <HelpProvider>
        <HelpButton position="bottom-right" />
      </HelpProvider>
    );

    let button = screen.getByLabelText('Open help documentation');
    expect(button).toHaveClass('help-button--bottom-right');

    rerender(
      <HelpProvider>
        <HelpButton position="bottom-left" />
      </HelpProvider>
    );

    button = screen.getByLabelText('Open help documentation');
    expect(button).toHaveClass('help-button--bottom-left');
  });

  it('should open help panel when clicked', async () => {
    render(
      <HelpProvider>
        <HelpButton />
        <TestComponent />
      </HelpProvider>
    );

    fireEvent.click(screen.getByLabelText('Open help documentation'));

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('Help Open');
    });
  });

  it('should apply custom className', () => {
    render(
      <HelpProvider>
        <HelpButton className="custom-class" />
      </HelpProvider>
    );

    const button = screen.getByLabelText('Open help documentation');
    expect(button).toHaveClass('custom-class');
  });
});
