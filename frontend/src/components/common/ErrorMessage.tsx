interface ErrorMessageProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  variant?: 'inline' | 'card' | 'toast';
  onDismiss?: () => void;
}

export function ErrorMessage({
  title = 'Error',
  message,
  onRetry,
  variant = 'inline',
  onDismiss,
}: ErrorMessageProps) {
  return (
    <div className={`error-message error-message-${variant}`} role="alert">
      <div className="error-message-content">
        <div className="error-message-icon">!</div>
        <div className="error-message-text">
          {variant !== 'inline' && <strong className="error-title">{title}</strong>}
          <p className="error-text">{message}</p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="error-dismiss"
            aria-label="Dismiss error"
          >
            x
          </button>
        )}
      </div>
      {onRetry && (
        <button onClick={onRetry} className="error-retry">
          Try Again
        </button>
      )}

      <style>{`
        .error-message {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .error-message-inline {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 12px 16px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
        }

        .error-message-card {
          padding: 20px;
          background: var(--bg-primary, #ffffff);
          border: 1px solid #fecaca;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(220, 38, 38, 0.1);
        }

        .error-message-toast {
          position: fixed;
          bottom: 24px;
          right: 24px;
          max-width: 400px;
          padding: 16px;
          background: var(--bg-primary, #ffffff);
          border: 1px solid #fecaca;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
          z-index: 9999;
          animation: slideIn 0.3s ease;
        }

        @keyframes slideIn {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .error-message-content {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }

        .error-message-icon {
          flex-shrink: 0;
          width: 24px;
          height: 24px;
          background: #dc2626;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: bold;
        }

        .error-message-text {
          flex: 1;
        }

        .error-title {
          display: block;
          color: #991b1b;
          font-size: 14px;
          margin-bottom: 4px;
        }

        .error-text {
          margin: 0;
          color: #dc2626;
          font-size: 14px;
          line-height: 1.5;
        }

        .error-dismiss {
          flex-shrink: 0;
          width: 24px;
          height: 24px;
          padding: 0;
          background: transparent;
          border: none;
          color: #dc2626;
          font-size: 16px;
          cursor: pointer;
          opacity: 0.7;
          transition: opacity 0.15s;
        }

        .error-dismiss:hover {
          opacity: 1;
        }

        .error-retry {
          margin-top: 12px;
          padding: 8px 16px;
          background: #dc2626;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s;
        }

        .error-retry:hover {
          background: #b91c1c;
        }
      `}</style>
    </div>
  );
}

// Common error message mappings
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Handle axios errors
    const axiosError = error as { response?: { data?: { message?: string; error?: string }; status?: number } };
    if (axiosError.response?.data?.message) {
      return axiosError.response.data.message;
    }
    if (axiosError.response?.data?.error) {
      return axiosError.response.data.error;
    }
    if (axiosError.response?.status === 401) {
      return 'Your session has expired. Please log in again.';
    }
    if (axiosError.response?.status === 403) {
      return 'You do not have permission to perform this action.';
    }
    if (axiosError.response?.status === 404) {
      return 'The requested resource was not found.';
    }
    if (axiosError.response?.status === 500) {
      return 'An internal server error occurred. Please try again later.';
    }
    // Network errors
    if (error.message === 'Network Error') {
      return 'Unable to connect to the server. Please check your internet connection.';
    }
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unexpected error occurred. Please try again.';
}

export default ErrorMessage;
