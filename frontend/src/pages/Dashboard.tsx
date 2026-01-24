import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { listDemandLetters, formatStatus, getStatusColor, formatRelativeTime } from '../lib/demand-letters';
import { listDocuments } from '../lib/documents';
import { listTemplates } from '../lib/templates';
import { useAuth } from '../contexts/AuthContext';
import { DashboardSkeleton } from '../components/common/Skeleton';
import { ErrorMessage, getErrorMessage } from '../components/common/ErrorMessage';
import type { DemandLetterListItem } from '../types/demand-letter';

interface StatCardProps {
  label: string;
  value: number;
  icon: string;
  color: string;
  onClick?: () => void;
}

function StatCard({ label, value, icon, color, onClick }: StatCardProps) {
  // Handle keyboard activation for interactive cards
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className="stat-card"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${label}: ${value}. Click to view.` : undefined}
    >
      <div className="stat-icon" style={{ background: `${color}15`, color }} aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={icon} />
        </svg>
      </div>
      <div className="stat-info">
        <span className="stat-value" aria-hidden={onClick ? 'true' : undefined}>{value}</span>
        <span className="stat-label" aria-hidden={onClick ? 'true' : undefined}>{label}</span>
      </div>

      <style>{`
        .stat-card {
          background: var(--bg-primary, #ffffff);
          border: 1px solid var(--border-primary, #e5e7eb);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          transition: all 0.15s;
        }

        .stat-card[role="button"] {
          cursor: pointer;
        }

        .stat-card[role="button"]:hover {
          border-color: var(--color-primary, #3b82f6);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }

        .stat-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .stat-info {
          display: flex;
          flex-direction: column;
        }

        .stat-value {
          font-size: 28px;
          font-weight: 700;
          color: var(--text-primary, #111827);
          line-height: 1;
        }

        .stat-label {
          font-size: 14px;
          color: var(--text-secondary, #6b7280);
          margin-top: 4px;
        }
      `}</style>
    </div>
  );
}

interface QuickActionProps {
  label: string;
  description: string;
  icon: string;
  onClick: () => void;
}

function QuickAction({ label, description, icon, onClick }: QuickActionProps) {
  return (
    <button
      className="quick-action"
      onClick={onClick}
      aria-label={`${label}: ${description}`}
      type="button"
    >
      <div className="action-icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={icon} />
        </svg>
      </div>
      <div className="action-text">
        <span className="action-label" aria-hidden="true">{label}</span>
        <span className="action-desc" aria-hidden="true">{description}</span>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="action-arrow" aria-hidden="true">
        <polyline points="9 18 15 12 9 6" />
      </svg>

      <style>{`
        .quick-action {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 16px;
          background: var(--bg-primary, #ffffff);
          border: 1px solid var(--border-primary, #e5e7eb);
          border-radius: 12px;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s;
        }

        .quick-action:hover {
          border-color: var(--color-primary, #3b82f6);
          background: var(--color-primary-light, #eff6ff);
        }

        .action-icon {
          width: 40px;
          height: 40px;
          background: var(--bg-secondary, #f3f4f6);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-primary, #3b82f6);
          flex-shrink: 0;
        }

        .quick-action:hover .action-icon {
          background: var(--color-primary, #3b82f6);
          color: white;
        }

        .action-text {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .action-label {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary, #111827);
        }

        .action-desc {
          font-size: 12px;
          color: var(--text-secondary, #6b7280);
        }

        .action-arrow {
          color: var(--text-tertiary, #9ca3af);
          flex-shrink: 0;
        }
      `}</style>
    </button>
  );
}

function RecentLetterCard({ letter, onClick }: { letter: DemandLetterListItem; onClick: () => void }) {
  // Handle keyboard activation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  const cardLabel = `${letter.title}${letter.client_name ? ` for ${letter.client_name}` : ''}. Status: ${formatStatus(letter.status)}. Updated ${formatRelativeTime(letter.updated_at)}. Click to open.`;

  return (
    <article
      className="recent-letter-card"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={cardLabel}
    >
      <div className="letter-header" aria-hidden="true">
        <span className="letter-status" style={{ background: getStatusColor(letter.status) }}>
          {formatStatus(letter.status)}
        </span>
        <span className="letter-version">v{letter.version_count}</span>
      </div>
      <h4 className="letter-title" aria-hidden="true">{letter.title}</h4>
      {letter.client_name && <p className="letter-client" aria-hidden="true">{letter.client_name}</p>}
      <span className="letter-updated" aria-hidden="true">{formatRelativeTime(letter.updated_at)}</span>

      <style>{`
        .recent-letter-card {
          background: var(--bg-primary, #ffffff);
          border: 1px solid var(--border-primary, #e5e7eb);
          border-radius: 12px;
          padding: 16px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .recent-letter-card:hover {
          border-color: var(--color-primary, #3b82f6);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }

        .letter-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .letter-status {
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 500;
          color: white;
        }

        .letter-version {
          font-size: 12px;
          color: var(--text-tertiary, #9ca3af);
          background: var(--bg-secondary, #f3f4f6);
          padding: 2px 8px;
          border-radius: 4px;
        }

        .letter-title {
          margin: 0 0 4px;
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary, #111827);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .letter-client {
          margin: 0;
          font-size: 13px;
          color: var(--text-secondary, #6b7280);
        }

        .letter-updated {
          display: block;
          margin-top: 12px;
          font-size: 12px;
          color: var(--text-tertiary, #9ca3af);
        }
      `}</style>
    </article>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Fetch data for stats
  const { data: demandLettersData, isLoading: loadingLetters, error: lettersError } = useQuery({
    queryKey: ['demandLetters', { limit: 5 }],
    queryFn: () => listDemandLetters({ limit: 5 }),
  });

  const { data: documentsData, isLoading: loadingDocs, error: docsError } = useQuery({
    queryKey: ['documents', { limit: 1 }],
    queryFn: () => listDocuments({ limit: 1 }),
  });

  const { data: templatesData, isLoading: loadingTemplates, error: templatesError } = useQuery({
    queryKey: ['templates', { limit: 1 }],
    queryFn: () => listTemplates({ limit: 1 }),
  });

  const isLoading = loadingLetters || loadingDocs || loadingTemplates;
  const error = lettersError || docsError || templatesError;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <ErrorMessage
        title="Failed to load dashboard"
        message={getErrorMessage(error)}
        variant="card"
        onRetry={() => window.location.reload()}
      />
    );
  }

  const stats = {
    demandLetters: demandLettersData?.total || 0,
    documents: documentsData?.total || 0,
    templates: templatesData?.total || 0,
    drafts: demandLettersData?.demand_letters?.filter(l => l.status === 'draft').length || 0,
  };

  const recentLetters = demandLettersData?.demand_letters || [];

  return (
    <div className="dashboard">
      {/* Welcome section */}
      <div className="welcome-section">
        <h1>Welcome back, {user?.firstName || 'User'}</h1>
        <p>Here's what's happening with your demand letters today.</p>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <StatCard
          label="Demand Letters"
          value={stats.demandLetters}
          icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          color="#3b82f6"
          onClick={() => navigate('/demand-letters')}
        />
        <StatCard
          label="Documents"
          value={stats.documents}
          icon="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
          color="#10b981"
          onClick={() => navigate('/documents')}
        />
        <StatCard
          label="Templates"
          value={stats.templates}
          icon="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z"
          color="#8b5cf6"
          onClick={() => navigate('/templates')}
        />
        <StatCard
          label="Drafts"
          value={stats.drafts}
          icon="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          color="#f59e0b"
        />
      </div>

      {/* Main content grid */}
      <div className="content-grid">
        {/* Recent letters */}
        <div className="recent-section">
          <div className="section-header">
            <h2>Recent Demand Letters</h2>
            <button className="view-all-btn" onClick={() => navigate('/demand-letters')}>
              View all
            </button>
          </div>
          {recentLetters.length > 0 ? (
            <div className="recent-letters-grid">
              {recentLetters.map(letter => (
                <RecentLetterCard
                  key={letter.id}
                  letter={letter}
                  onClick={() => navigate(`/demand-letters/${letter.id}`)}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>No demand letters yet. Create your first one to get started.</p>
              <button className="create-btn" onClick={() => navigate('/demand-letters/new')}>
                Create Demand Letter
              </button>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="actions-section">
          <h2>Quick Actions</h2>
          <div className="actions-list">
            <QuickAction
              label="New Demand Letter"
              description="Generate an AI-powered demand letter"
              icon="M12 4v16m8-8H4"
              onClick={() => navigate('/demand-letters/new')}
            />
            <QuickAction
              label="Upload Documents"
              description="Add source documents for analysis"
              icon="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              onClick={() => navigate('/documents')}
            />
            <QuickAction
              label="Manage Templates"
              description="Create and edit letter templates"
              icon="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z"
              onClick={() => navigate('/templates')}
            />
            <QuickAction
              label="AI Prompts"
              description="Customize AI refinement prompts"
              icon="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              onClick={() => navigate('/prompts')}
            />
          </div>
        </div>
      </div>

      <style>{`
        .dashboard {
          max-width: 1400px;
          margin: 0 auto;
        }

        .welcome-section {
          margin-bottom: 24px;
        }

        .welcome-section h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 700;
          color: var(--text-primary, #111827);
        }

        .welcome-section p {
          margin: 8px 0 0;
          color: var(--text-secondary, #6b7280);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 32px;
        }

        .content-grid {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 24px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .section-header h2,
        .actions-section h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary, #111827);
        }

        .view-all-btn {
          padding: 8px 12px;
          background: transparent;
          border: none;
          color: var(--color-primary, #3b82f6);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }

        .view-all-btn:hover {
          text-decoration: underline;
        }

        .recent-letters-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 16px;
        }

        .empty-state {
          text-align: center;
          padding: 48px 24px;
          background: var(--bg-primary, #ffffff);
          border: 1px dashed var(--border-primary, #e5e7eb);
          border-radius: 12px;
        }

        .empty-state p {
          margin: 0 0 16px;
          color: var(--text-secondary, #6b7280);
        }

        .create-btn {
          padding: 10px 20px;
          background: var(--color-primary, #3b82f6);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }

        .create-btn:hover {
          background: var(--color-primary-hover, #2563eb);
        }

        .actions-section h2 {
          margin-bottom: 16px;
        }

        .actions-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        @media (max-width: 1024px) {
          .content-grid {
            grid-template-columns: 1fr;
          }

          .actions-section {
            order: -1;
          }

          .actions-list {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }
        }

        @media (max-width: 640px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .actions-list {
            grid-template-columns: 1fr;
          }

          .welcome-section h1 {
            font-size: 24px;
          }
        }
      `}</style>
    </div>
  );
}

export default Dashboard;
