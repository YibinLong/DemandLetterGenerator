import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MainLayout } from './MainLayout';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { AuthProvider } from '../../contexts/AuthContext';

// Mock the API calls
vi.mock('../../lib/api', () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ user: null }),
  getAccessToken: vi.fn().mockReturnValue(null),
  setAccessToken: vi.fn(),
  clearTokens: vi.fn(),
  logout: vi.fn(),
  login: vi.fn(),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

function renderWithProviders(children: React.ReactNode) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            {children}
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe('MainLayout', () => {
  describe('Rendering', () => {
    it('should render the main layout structure', () => {
      renderWithProviders(
        <MainLayout>
          <div data-testid="content">Test Content</div>
        </MainLayout>
      );

      expect(screen.getByTestId('content')).toBeInTheDocument();
    });

    it('should render children content', () => {
      renderWithProviders(
        <MainLayout>
          <h1>Main Content</h1>
        </MainLayout>
      );

      expect(screen.getByRole('heading', { name: 'Main Content' })).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should render sidebar navigation links', () => {
      renderWithProviders(
        <MainLayout>
          <div>Content</div>
        </MainLayout>
      );

      // Check for navigation items
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Demand Letters')).toBeInTheDocument();
      expect(screen.getByText('Documents')).toBeInTheDocument();
      expect(screen.getByText('Templates')).toBeInTheDocument();
      expect(screen.getByText('AI Prompts')).toBeInTheDocument();
    });

    it('should render the application logo', () => {
      renderWithProviders(
        <MainLayout>
          <div>Content</div>
        </MainLayout>
      );

      expect(screen.getByText(/DemandLetter/)).toBeInTheDocument();
    });
  });

  describe('Theme Toggle', () => {
    it('should render theme toggle buttons', () => {
      renderWithProviders(
        <MainLayout>
          <div>Content</div>
        </MainLayout>
      );

      // Check for theme toggle buttons (light, dark, system)
      expect(screen.getByTitle('Light mode')).toBeInTheDocument();
      expect(screen.getByTitle('Dark mode')).toBeInTheDocument();
    });
  });
});
