import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { user, logout, isAuthenticated } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setShowUserMenu(false);
    await logout();
  };

  const userInitials = user
    ? `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() || user.email[0].toUpperCase()
    : '';

  return (
    <header className="app-header">
      <div className="header-left">
        <button className="menu-btn" onClick={onMenuClick} aria-label="Open menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      <div className="header-right">
        <ThemeToggle />

        {isAuthenticated && user && (
          <div className="user-menu-container" ref={menuRef}>
            <button
              className="user-btn"
              onClick={() => setShowUserMenu(!showUserMenu)}
              aria-expanded={showUserMenu}
              aria-haspopup="true"
            >
              <div className="user-avatar">{userInitials}</div>
              <div className="user-info">
                <span className="user-name">{user.first_name} {user.last_name}</span>
                <span className="user-role">{user.role}</span>
              </div>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`chevron ${showUserMenu ? 'open' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {showUserMenu && (
              <div className="user-menu">
                <div className="menu-header">
                  <span className="menu-email">{user.email}</span>
                </div>
                <div className="menu-divider" />
                <button className="menu-item" onClick={handleLogout}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .app-header {
          position: fixed;
          top: 0;
          left: 260px;
          right: 0;
          height: 64px;
          background: var(--bg-primary, #ffffff);
          border-bottom: 1px solid var(--border-primary, #e5e7eb);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          z-index: 30;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .menu-btn {
          display: none;
          padding: 8px;
          background: transparent;
          border: none;
          color: var(--text-secondary, #6b7280);
          cursor: pointer;
          border-radius: 6px;
        }

        .menu-btn:hover {
          background: var(--bg-secondary, #f3f4f6);
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .user-menu-container {
          position: relative;
        }

        .user-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .user-btn:hover {
          background: var(--bg-secondary, #f3f4f6);
        }

        .user-avatar {
          width: 36px;
          height: 36px;
          background: var(--color-primary, #3b82f6);
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 600;
        }

        .user-info {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          text-align: left;
        }

        .user-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary, #111827);
        }

        .user-role {
          font-size: 12px;
          color: var(--text-tertiary, #9ca3af);
          text-transform: capitalize;
        }

        .chevron {
          color: var(--text-tertiary, #9ca3af);
          transition: transform 0.2s;
        }

        .chevron.open {
          transform: rotate(180deg);
        }

        .user-menu {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 8px;
          min-width: 200px;
          background: var(--bg-primary, #ffffff);
          border: 1px solid var(--border-primary, #e5e7eb);
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
          overflow: hidden;
          animation: fadeIn 0.15s ease;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .menu-header {
          padding: 12px 16px;
        }

        .menu-email {
          font-size: 13px;
          color: var(--text-secondary, #6b7280);
        }

        .menu-divider {
          height: 1px;
          background: var(--border-secondary, #f3f4f6);
        }

        .menu-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 12px 16px;
          background: transparent;
          border: none;
          color: var(--text-primary, #374151);
          font-size: 14px;
          cursor: pointer;
          text-align: left;
          transition: background 0.15s;
        }

        .menu-item:hover {
          background: var(--bg-secondary, #f3f4f6);
        }

        .menu-item svg {
          color: var(--text-tertiary, #9ca3af);
        }

        @media (max-width: 1024px) {
          .app-header {
            left: 0;
          }

          .menu-btn {
            display: block;
          }

          .user-info {
            display: none;
          }
        }

        @media (max-width: 640px) {
          .app-header {
            padding: 0 16px;
          }

          .user-btn {
            padding: 8px;
          }

          .chevron {
            display: none;
          }
        }
      `}</style>
    </header>
  );
}

export default Header;
