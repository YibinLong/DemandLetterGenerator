import { useNavigate } from 'react-router-dom';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="not-found-page">
      <div className="not-found-content">
        <div className="error-code">404</div>
        <h1>Page not found</h1>
        <p>Sorry, we couldn't find the page you're looking for.</p>
        <div className="actions">
          <button onClick={() => navigate(-1)} className="back-btn">
            Go back
          </button>
          <button onClick={() => navigate('/')} className="home-btn">
            Go to Dashboard
          </button>
        </div>
      </div>

      <style>{`
        .not-found-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: var(--bg-secondary, #f9fafb);
        }

        .not-found-content {
          text-align: center;
        }

        .error-code {
          font-size: 120px;
          font-weight: 700;
          color: var(--border-primary, #e5e7eb);
          line-height: 1;
          margin-bottom: 16px;
        }

        .not-found-content h1 {
          margin: 0 0 8px;
          font-size: 24px;
          font-weight: 600;
          color: var(--text-primary, #111827);
        }

        .not-found-content p {
          margin: 0 0 32px;
          color: var(--text-secondary, #6b7280);
        }

        .actions {
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        .back-btn,
        .home-btn {
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }

        .back-btn {
          background: var(--bg-primary, white);
          border: 1px solid var(--border-primary, #d1d5db);
          color: var(--text-primary, #374151);
        }

        .back-btn:hover {
          background: var(--bg-secondary, #f9fafb);
        }

        .home-btn {
          background: var(--color-primary, #3b82f6);
          border: none;
          color: white;
        }

        .home-btn:hover {
          background: var(--color-primary-hover, #2563eb);
        }
      `}</style>
    </div>
  );
}

export default NotFoundPage;
