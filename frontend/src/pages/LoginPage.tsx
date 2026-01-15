import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ErrorMessage, getErrorMessage } from '../components/common/ErrorMessage';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="logo">
            <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#3b82f6" />
              <path d="M8 10h16M8 16h12M8 22h14" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h1>Welcome back</h1>
          <p>Sign in to your account to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <ErrorMessage
              message={error}
              onDismiss={() => setError(null)}
            />
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            className="login-btn"
            disabled={isLoading}
          >
            {isLoading ? (
              <LoadingSpinner size="small" />
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <div className="login-footer">
          <p>
            Demo credentials: <code>admin@lawfirm.com</code> / <code>password123</code>
          </p>
        </div>
      </div>

      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: var(--bg-secondary, #f9fafb);
        }

        .login-container {
          width: 100%;
          max-width: 400px;
          background: var(--bg-primary, #ffffff);
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
          padding: 40px;
        }

        .login-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .logo {
          margin-bottom: 24px;
        }

        .login-header h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 700;
          color: var(--text-primary, #111827);
        }

        .login-header p {
          margin: 8px 0 0;
          color: var(--text-secondary, #6b7280);
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group label {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary, #374151);
        }

        .form-group input {
          padding: 12px 16px;
          border: 1px solid var(--border-primary, #d1d5db);
          border-radius: 8px;
          font-size: 14px;
          transition: border-color 0.15s, box-shadow 0.15s;
          background: var(--bg-primary, #ffffff);
          color: var(--text-primary, #111827);
        }

        .form-group input:focus {
          outline: none;
          border-color: var(--color-primary, #3b82f6);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .form-group input::placeholder {
          color: var(--text-tertiary, #9ca3af);
        }

        .form-group input:disabled {
          background: var(--bg-secondary, #f3f4f6);
          cursor: not-allowed;
        }

        .login-btn {
          padding: 14px 24px;
          background: var(--color-primary, #3b82f6);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 48px;
        }

        .login-btn:hover:not(:disabled) {
          background: var(--color-primary-hover, #2563eb);
        }

        .login-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .login-footer {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid var(--border-secondary, #f3f4f6);
          text-align: center;
        }

        .login-footer p {
          margin: 0;
          font-size: 12px;
          color: var(--text-tertiary, #9ca3af);
        }

        .login-footer code {
          background: var(--bg-secondary, #f3f4f6);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
        }
      `}</style>
    </div>
  );
}

export default LoginPage;
