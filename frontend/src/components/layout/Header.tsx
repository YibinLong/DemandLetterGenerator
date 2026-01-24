import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ThemeToggle } from './ThemeToggle';
import { useEscapeKey, useFocusTrap } from '../../lib/accessibility';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { user, logout, isAuthenticated } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Close menu handler
  const closeMenu = useCallback(() => {
    setShowUserMenu(false);
    // Return focus to the menu button when closing
    menuButtonRef.current?.focus();
  }, []);

  // Close menu with Escape key
  useEscapeKey(closeMenu, showUserMenu);

  // Focus trap for dropdown menu
  const dropdownRef = useFocusTrap<HTMLDivElement>(showUserMenu);

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

  // Handle keyboard navigation for menu button
  const handleMenuButtonKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setShowUserMenu(true);
    }
  };

  const userInitials = user
    ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || user.email[0].toUpperCase()
    : '';

  const userName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : '';

  return (
    <header className="app-header" role="banner">
      <div className="header-left">
        <button
          className="menu-btn"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          type="button"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
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
              ref={menuButtonRef}
              className="user-btn"
              onClick={() => setShowUserMenu(!showUserMenu)}
              onKeyDown={handleMenuButtonKeyDown}
              aria-expanded={showUserMenu}
              aria-haspopup="menu"
              aria-controls="user-menu"
              aria-label={`User menu for ${userName}`}
              id="user-menu-button"
              type="button"
            >
              <div className="user-avatar" aria-hidden="true">{userInitials}</div>
              <div className="user-info">
                <span className="user-name">{user.firstName} {user.lastName}</span>
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
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {showUserMenu && (
              <div
                ref={dropdownRef}
                className="user-menu"
                id="user-menu"
                role="menu"
                aria-labelledby="user-menu-button"
              >
                <div className="menu-header" role="presentation">
                  <span className="menu-email">{user.email}</span>
                </div>
                <div className="menu-divider" role="separator" aria-hidden="true" />
                <button
                  className="menu-item"
                  onClick={handleLogout}
                  role="menuitem"
                  type="button"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
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
