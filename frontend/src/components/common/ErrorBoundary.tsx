import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary">
          <div className="error-content">
            <div className="error-icon">!</div>
            <h2>Something went wrong</h2>
            <p>We encountered an unexpected error. Please try again.</p>
            {this.state.error && (
              <details className="error-details">
                <summary>Error details</summary>
                <pre>{this.state.error.message}</pre>
              </details>
            )}
            <div className="error-actions">
              <button onClick={this.handleRetry} className="retry-button">
                Try Again
              </button>
              <button onClick={() => window.location.reload()} className="reload-button">
                Reload Page
              </button>
            </div>
          </div>

          <style>{`
            .error-boundary {
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 400px;
              padding: 24px;
            }

            .error-content {
              text-align: center;
              max-width: 400px;
            }

            .error-icon {
              width: 64px;
              height: 64px;
              background: #fef2f2;
              color: #dc2626;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 32px;
              font-weight: bold;
              margin: 0 auto 24px;
            }

            .error-content h2 {
              margin: 0 0 12px;
              font-size: 24px;
              color: var(--text-primary, #111827);
            }

            .error-content p {
              margin: 0 0 24px;
              color: var(--text-secondary, #6b7280);
            }

            .error-details {
              text-align: left;
              margin-bottom: 24px;
              padding: 12px;
              background: var(--bg-secondary, #f9fafb);
              border-radius: 8px;
            }

            .error-details summary {
              cursor: pointer;
              color: var(--text-secondary, #6b7280);
              font-size: 14px;
            }

            .error-details pre {
              margin: 12px 0 0;
              padding: 12px;
              background: var(--bg-tertiary, #f3f4f6);
              border-radius: 4px;
              overflow-x: auto;
              font-size: 12px;
              color: #dc2626;
            }

            .error-actions {
              display: flex;
              gap: 12px;
              justify-content: center;
            }

            .retry-button,
            .reload-button {
              padding: 10px 20px;
              border-radius: 6px;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.15s;
            }

            .retry-button {
              background: var(--color-primary, #3b82f6);
              color: white;
              border: none;
            }

            .retry-button:hover {
              background: var(--color-primary-hover, #2563eb);
            }

            .reload-button {
              background: var(--bg-primary, white);
              color: var(--text-primary, #374151);
              border: 1px solid var(--border-primary, #d1d5db);
            }

            .reload-button:hover {
              background: var(--bg-secondary, #f9fafb);
            }
          `}</style>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
