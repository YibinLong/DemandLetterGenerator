import { useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { SkipLink } from '../common/SkipLink';
import { useEscapeKey } from '../../lib/accessibility';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  // Close sidebar with Escape key (mobile)
  useEscapeKey(closeSidebar, sidebarOpen);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  return (
    <div className="main-layout">
      {/* Skip link for keyboard navigation - WCAG 2.4.1 */}
      <SkipLink targetId="main-content" />

      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />
      <Header onMenuClick={openSidebar} />

      <main
        id="main-content"
        className="main-content"
        role="main"
        tabIndex={-1}
        aria-label="Main content"
      >
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>

      <style>{`
        .main-layout {
          min-height: 100vh;
          background: var(--bg-secondary, #f9fafb);
        }

        .main-content {
          margin-left: 260px;
          margin-top: 64px;
          min-height: calc(100vh - 64px);
          padding: 24px;
        }

        @media (max-width: 1024px) {
          .main-content {
            margin-left: 0;
          }
        }

        @media (max-width: 640px) {
          .main-content {
            padding: 16px;
          }
        }
      `}</style>
    </div>
  );
}

export default MainLayout;
