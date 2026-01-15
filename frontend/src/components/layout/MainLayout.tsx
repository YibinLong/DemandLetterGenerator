import { useState } from 'react';
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="main-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} />

      <main className="main-content">
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
