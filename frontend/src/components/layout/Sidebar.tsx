import { NavLink, useLocation } from 'react-router-dom';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { path: '/demand-letters', label: 'Demand Letters', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { path: '/documents', label: 'Documents', icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4' },
  { path: '/templates', label: 'Templates', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
  { path: '/prompts', label: 'AI Prompts', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="sidebar-overlay" onClick={onClose} />
      )}

      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="var(--color-primary, #3b82f6)" />
              <path d="M8 10h16M8 16h12M8 22h14" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="logo-text">DemandLetter<span className="logo-highlight">Gen</span></span>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) =>
                `nav-item ${isActive || (item.path !== '/' && location.pathname.startsWith(item.path)) ? 'active' : ''}`
              }
              end={item.path === '/'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <a href="https://steno.com" target="_blank" rel="noopener noreferrer" className="powered-by">
            Powered by <strong>Steno</strong>
          </a>
        </div>

        <style>{`
          .sidebar-overlay {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 40;
          }

          .sidebar {
            position: fixed;
            top: 0;
            left: 0;
            height: 100vh;
            width: 260px;
            background: var(--bg-primary, #ffffff);
            border-right: 1px solid var(--border-primary, #e5e7eb);
            display: flex;
            flex-direction: column;
            z-index: 50;
            transition: transform 0.3s ease;
          }

          .sidebar-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 20px;
            border-bottom: 1px solid var(--border-secondary, #f3f4f6);
          }

          .logo {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .logo-text {
            font-size: 18px;
            font-weight: 700;
            color: var(--text-primary, #111827);
          }

          .logo-highlight {
            color: var(--color-primary, #3b82f6);
          }

          .close-btn {
            display: none;
            padding: 8px;
            background: transparent;
            border: none;
            color: var(--text-secondary, #6b7280);
            cursor: pointer;
            border-radius: 6px;
          }

          .close-btn:hover {
            background: var(--bg-secondary, #f3f4f6);
          }

          .sidebar-nav {
            flex: 1;
            padding: 16px 12px;
            overflow-y: auto;
          }

          .nav-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            color: var(--text-secondary, #6b7280);
            text-decoration: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.15s;
            margin-bottom: 4px;
          }

          .nav-item:hover {
            background: var(--bg-secondary, #f3f4f6);
            color: var(--text-primary, #111827);
          }

          .nav-item.active {
            background: var(--color-primary-light, #eff6ff);
            color: var(--color-primary, #3b82f6);
          }

          .nav-item svg {
            flex-shrink: 0;
          }

          .sidebar-footer {
            padding: 16px 20px;
            border-top: 1px solid var(--border-secondary, #f3f4f6);
          }

          .powered-by {
            font-size: 12px;
            color: var(--text-tertiary, #9ca3af);
            text-decoration: none;
          }

          .powered-by:hover {
            color: var(--text-secondary, #6b7280);
          }

          .powered-by strong {
            color: var(--color-primary, #3b82f6);
          }

          @media (max-width: 1024px) {
            .sidebar-overlay {
              display: block;
            }

            .sidebar {
              transform: translateX(-100%);
            }

            .sidebar.open {
              transform: translateX(0);
            }

            .close-btn {
              display: block;
            }
          }
        `}</style>
      </aside>
    </>
  );
}

export default Sidebar;
