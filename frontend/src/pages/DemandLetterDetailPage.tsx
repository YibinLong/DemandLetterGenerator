import { useParams, useNavigate } from 'react-router-dom';
import { DemandLetterView } from '../components/DemandLetterView';

export function DemandLetterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) {
    navigate('/demand-letters');
    return null;
  }

  return (
    <div className="demand-letter-detail-page">
      <button
        className="back-btn"
        onClick={() => navigate('/demand-letters')}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back to List
      </button>

      <DemandLetterView
        letterId={id}
        onBack={() => navigate('/demand-letters')}
      />

      <style>{`
        .demand-letter-detail-page {
          max-width: 1200px;
          margin: 0 auto;
        }

        .back-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 20px;
          padding: 8px 16px;
          background: var(--bg-primary, #ffffff);
          border: 1px solid var(--border-primary, #e5e7eb);
          border-radius: 8px;
          font-size: 14px;
          color: var(--text-secondary, #6b7280);
          cursor: pointer;
          transition: all 0.15s;
        }

        .back-btn:hover {
          border-color: var(--color-primary, #3b82f6);
          color: var(--text-primary, #111827);
        }
      `}</style>
    </div>
  );
}

export default DemandLetterDetailPage;
