import { useRef, useCallback } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import type { Theme } from '../../contexts/ThemeContext';

interface ThemeToggleProps {
  showLabel?: boolean;
}

const themes: { value: Theme; label: string; icon: string }[] = [
  {
    value: 'light',
    label: 'Light mode',
    icon: 'M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 7a5 5 0 100 10 5 5 0 000-10z',
  },
  {
    value: 'dark',
    label: 'Dark mode',
    icon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  },
  {
    value: 'system',
    label: 'Use system theme',
    icon: 'M2 5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm6 16h8m-4-4v4',
  },
];

export function ThemeToggle({ showLabel = false }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const groupRef = useRef<HTMLDivElement>(null);

  // Handle keyboard navigation for radio group
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIndex = themes.findIndex((t) => t.value === theme);
      let newIndex = currentIndex;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          newIndex = (currentIndex + 1) % themes.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          newIndex = (currentIndex - 1 + themes.length) % themes.length;
          break;
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = themes.length - 1;
          break;
        default:
          return;
      }

      if (newIndex !== currentIndex) {
        setTheme(themes[newIndex].value);
        // Focus the new button
        const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('button');
        buttons?.[newIndex]?.focus();
      }
    },
    [theme, setTheme]
  );

  return (
    <div className="theme-toggle">
      {showLabel && (
        <span className="theme-label" id="theme-toggle-label">
          Theme
        </span>
      )}
      <div
        ref={groupRef}
        className="toggle-buttons"
        role="radiogroup"
        aria-label={showLabel ? undefined : 'Theme selection'}
        aria-labelledby={showLabel ? 'theme-toggle-label' : undefined}
        onKeyDown={handleKeyDown}
      >
        {themes.map((t) => {
          const isSelected = theme === t.value;
          const displayLabel =
            t.value === 'system' ? `${t.label} (currently ${resolvedTheme})` : t.label;

          return (
            <button
              key={t.value}
              onClick={() => setTheme(t.value)}
              className={`toggle-btn ${isSelected ? 'active' : ''}`}
              title={displayLabel}
              role="radio"
              aria-checked={isSelected}
              aria-label={displayLabel}
              tabIndex={isSelected ? 0 : -1}
              type="button"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={t.icon} />
              </svg>
            </button>
          );
        })}
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
