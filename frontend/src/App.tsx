import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { MainLayout } from './components/layout/MainLayout';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { LiveRegionProvider } from './components/common/LiveRegion';
import { TourProvider } from './components/common/OnboardingTour';
import { HelpProvider, HelpButton } from './components/common/HelpPanel';
import {
  Dashboard,
  DemandLettersPage,
  DemandLetterDetailPage,
  DocumentsPage,
  TemplatesPage,
  PromptsPage,
  LoginPage,
  NotFoundPage,
  HelpPage,
} from './pages';
import { queryClient } from './lib/queryClient';
import './index.css';

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingSpinner fullPage text="Loading..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

// Public route wrapper (redirects to dashboard if already logged in)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner fullPage text="Loading..." />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// Main app routes
function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />

      {/* Protected routes with main layout */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout>
              <Dashboard />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/demand-letters"
        element={
          <ProtectedRoute>
            <MainLayout>
              <DemandLettersPage />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/demand-letters/new"
        element={
          <ProtectedRoute>
            <MainLayout>
              <DemandLettersPage />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/demand-letters/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <DemandLetterDetailPage />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/documents"
        element={
          <ProtectedRoute>
            <MainLayout>
              <DocumentsPage />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/templates"
        element={
          <ProtectedRoute>
            <MainLayout>
              <TemplatesPage />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/prompts"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PromptsPage />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Help page */}
      <Route
        path="/help"
        element={
          <ProtectedRoute>
            <MainLayout>
              <HelpPage />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* 404 page */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <LiveRegionProvider>
            <TourProvider>
              <HelpProvider>
                <BrowserRouter>
                  <AuthProvider>
                    <AppRoutes />
                    <HelpButton />
                  </AuthProvider>
                </BrowserRouter>
              </HelpProvider>
            </TourProvider>
          </LiveRegionProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
