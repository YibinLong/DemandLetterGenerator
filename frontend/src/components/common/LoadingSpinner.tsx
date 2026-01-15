interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  text?: string;
  fullPage?: boolean;
  /** Custom aria-label for screen readers (defaults to text or "Loading") */
  'aria-label'?: string;
}

export function LoadingSpinner({
  size = 'medium',
  text,
  fullPage = false,
  'aria-label': ariaLabel,
}: LoadingSpinnerProps) {
  const sizeMap = {
    small: 16,
    medium: 24,
    large: 40,
  };

  const spinnerSize = sizeMap[size];
  const loadingLabel = ariaLabel || text || 'Loading';

  return (
    <div
      className={`loading-spinner ${fullPage ? 'full-page' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className="spinner"
        style={{
          width: spinnerSize,
          height: spinnerSize,
          borderWidth: size === 'small' ? 2 : 3,
        }}
        aria-hidden="true"
      />
      {text ? (
        <span className="loading-text">{text}</span>
      ) : (
        <span className="visually-hidden">{loadingLabel}</span>
      )}

      <style>{`
        .loading-spinner {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }

        .loading-spinner.full-page {
          position: fixed;
          inset: 0;
          background: var(--bg-primary, #ffffff);
          z-index: 9999;
        }

        .spinner {
          border: 3px solid var(--border-secondary, #e5e7eb);
          border-top-color: var(--color-primary, #3b82f6);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .loading-text {
          font-size: 14px;
          color: var(--text-secondary, #6b7280);
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

export default LoadingSpinner;
