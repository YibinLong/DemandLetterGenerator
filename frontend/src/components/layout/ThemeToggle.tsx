import { useTheme } from '../../contexts/ThemeContext';

interface ThemeToggleProps {
  showLabel?: boolean;
}

export function ThemeToggle({ showLabel = false }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();

  return (
    <div className="theme-toggle">
      {showLabel && (
        <span className="theme-label">Theme</span>
      )}
      <div className="toggle-buttons">
        <button
          onClick={() => setTheme('light')}
          className={`toggle-btn ${theme === 'light' ? 'active' : ''}`}
          title="Light mode"
          aria-label="Light mode"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        </button>
        <button
          onClick={() => setTheme('dark')}
          className={`toggle-btn ${theme === 'dark' ? 'active' : ''}`}
          title="Dark mode"
          aria-label="Dark mode"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>
        <button
          onClick={() => setTheme('system')}
          className={`toggle-btn ${theme === 'system' ? 'active' : ''}`}
          title={`System (${resolvedTheme})`}
          aria-label="System theme"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </button>
      </div>

      <style>{`
        .theme-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .theme-label {
          font-size: 13px;
          color: var(--text-secondary, #6b7280);
        }

        .toggle-buttons {
          display: flex;
          background: var(--bg-secondary, #f3f4f6);
          border-radius: 8px;
          padding: 2px;
        }

        .toggle-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          padding: 0;
          background: transparent;
          border: none;
          border-radius: 6px;
          color: var(--text-secondary, #6b7280);
          cursor: pointer;
          transition: all 0.15s;
        }

        .toggle-btn:hover {
          color: var(--text-primary, #111827);
        }

        .toggle-btn.active {
          background: var(--bg-primary, #ffffff);
          color: var(--color-primary, #3b82f6);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
      `}</style>
    </div>
  );
}

export default ThemeToggle;
