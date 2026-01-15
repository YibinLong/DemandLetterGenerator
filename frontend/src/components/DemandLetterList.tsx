import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listDemandLetters,
  deleteDemandLetter,
  formatStatus,
  getStatusColor,
  formatRelativeTime,
} from '../lib/demand-letters';
import { queryKeys, staleTime, gcTime } from '../lib/queryClient';
import type { DemandLetterListItem, DemandLetterListResponse } from '../types/demand-letter';

interface DemandLetterListProps {
  onSelect?: (letter: DemandLetterListItem) => void;
  onCreateNew?: () => void;
}

export function DemandLetterList({ onSelect, onCreateNew }: DemandLetterListProps) {
  const queryClient = useQueryClient();

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, statusFilter]);

  // Build query filters
  const filters = {
    search: debouncedSearch,
    status: statusFilter,
    limit: pageSize,
    offset: page * pageSize,
  };

  // Fetch demand letters with optimized caching
  const { data, isLoading, error } = useQuery<DemandLetterListResponse>({
    queryKey: queryKeys.demandLetters.list(filters),
    queryFn: () => listDemandLetters({
      search: debouncedSearch || undefined,
      status: statusFilter || undefined,
      limit: pageSize,
      offset: page * pageSize,
    }),
    // Optimized cache settings
    staleTime: staleTime.list,
    gcTime: gcTime.list,
    // Keep previous data while fetching new page
    placeholderData: (previousData) => previousData,
  });

  // Delete mutation with optimistic updates
  const deleteMutation = useMutation({
    mutationFn: deleteDemandLetter,
    onSuccess: () => {
      // Invalidate all demand letter queries
      queryClient.invalidateQueries({ queryKey: queryKeys.demandLetters.all });
    },
  });

  const handleDelete = useCallback((letter: DemandLetterListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${letter.title}"?`)) {
      deleteMutation.mutate(letter.id);
    }
  }, [deleteMutation]);

  const totalPages = Math.ceil((data?.total || 0) / pageSize);

  return (
    <div className="demand-letter-list">
      {/* Header */}
      <div className="list-header">
        <h2>Demand Letters</h2>
        {onCreateNew && (
          <button onClick={onCreateNew} className="create-button">
            + New Demand Letter
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="list-toolbar">
        <input
          type="text"
          placeholder="Search demand letters..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="filter-select"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="in_review">In Review</option>
          <option value="approved">Approved</option>
          <option value="sent">Sent</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Stats */}
      {data && (
        <div className="list-stats">
          {data.total} demand letter{data.total !== 1 ? 's' : ''}
          {(debouncedSearch || statusFilter) && ' (filtered)'}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="list-loading">
          <div className="spinner" />
          Loading...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="list-error">
          Failed to load demand letters. Please try again.
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && data?.demand_letters.length === 0 && (
        <div className="list-empty">
          <div className="empty-icon">📝</div>
          <h3>No demand letters found</h3>
          {debouncedSearch || statusFilter ? (
            <p>Try adjusting your search or filters.</p>
          ) : (
            <>
              <p>Create your first demand letter to get started.</p>
              {onCreateNew && (
                <button onClick={onCreateNew} className="empty-create-button">
                  Create Demand Letter
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* List */}
      {!isLoading && !error && data && data.demand_letters.length > 0 && (
        <>
          <div className="letters-grid">
            {data.demand_letters.map(letter => (
              <div
                key={letter.id}
                className="letter-card"
                onClick={() => onSelect?.(letter)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onSelect?.(letter);
                  }
                }}
              >
                <div className="card-header">
                  <span
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(letter.status) }}
                  >
                    {formatStatus(letter.status)}
                  </span>
                  <span className="version-badge">v{letter.version_count}</span>
                </div>

                <h3 className="card-title" title={letter.title}>
                  {letter.title}
                </h3>

                <div className="card-meta">
                  {letter.client_name && (
                    <div className="meta-item">
                      <span className="meta-label">Client:</span>
                      <span>{letter.client_name}</span>
                    </div>
                  )}
                  {letter.case_reference && (
                    <div className="meta-item">
                      <span className="meta-label">Case:</span>
                      <span>{letter.case_reference}</span>
                    </div>
                  )}
                  {letter.incident_date && (
                    <div className="meta-item">
                      <span className="meta-label">Incident:</span>
                      <span>{new Date(letter.incident_date).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                <div className="card-footer">
                  <span className="updated-at">
                    Updated {formatRelativeTime(letter.updated_at)}
                  </span>
                  <button
                    className="delete-button"
                    onClick={(e) => handleDelete(letter, e)}
                    title="Delete"
                    disabled={deleteMutation.isPending}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() => setPage(0)}
                disabled={page === 0}
                className="page-button"
              >
                ««
              </button>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="page-button"
              >
                «
              </button>
              <span className="page-info">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="page-button"
              >
                »
              </button>
              <button
                onClick={() => setPage(totalPages - 1)}
                disabled={page >= totalPages - 1}
                className="page-button"
              >
                »»
              </button>
            </div>
          )}
        </>
      )}

      <style>{`
        .demand-letter-list {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .list-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .list-header h2 {
          margin: 0;
          font-size: 24px;
          color: #111827;
        }

        .create-button {
          padding: 10px 20px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }

        .create-button:hover {
          background: #2563eb;
        }

        .list-toolbar {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
        }

        .search-input {
          flex: 1;
          padding: 10px 14px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
        }

        .search-input:focus {
          outline: none;
          border-color: #3b82f6;
        }

        .filter-select {
          padding: 10px 14px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          background: white;
          min-width: 140px;
        }

        .list-stats {
          font-size: 14px;
          color: #6b7280;
          margin-bottom: 16px;
        }

        .list-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 48px;
          color: #6b7280;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid #e5e7eb;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .list-error {
          padding: 16px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 6px;
          color: #dc2626;
          text-align: center;
        }

        .list-empty {
          text-align: center;
          padding: 48px 24px;
          color: #6b7280;
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .list-empty h3 {
          margin: 0 0 8px;
          color: #374151;
        }

        .list-empty p {
          margin: 0 0 16px;
        }

        .empty-create-button {
          padding: 10px 20px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
        }

        .letters-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
        }

        .letter-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 20px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .letter-card:hover {
          border-color: #3b82f6;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }

        .letter-card:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .status-badge {
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
          color: white;
        }

        .version-badge {
          font-size: 12px;
          color: #6b7280;
          background: #f3f4f6;
          padding: 4px 8px;
          border-radius: 4px;
        }

        .card-title {
          margin: 0 0 12px;
          font-size: 16px;
          font-weight: 600;
          color: #111827;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .card-meta {
          font-size: 13px;
          color: #6b7280;
        }

        .meta-item {
          margin-bottom: 4px;
        }

        .meta-label {
          color: #9ca3af;
          margin-right: 4px;
        }

        .card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid #f3f4f6;
        }

        .updated-at {
          font-size: 12px;
          color: #9ca3af;
        }

        .delete-button {
          width: 32px;
          height: 32px;
          border: 1px solid transparent;
          border-radius: 6px;
          background: transparent;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }

        .delete-button:hover {
          background: #fef2f2;
          border-color: #fecaca;
        }

        .delete-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid #e5e7eb;
        }

        .page-button {
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          background: white;
          cursor: pointer;
          font-size: 14px;
        }

        .page-button:hover:not(:disabled) {
          background: #f9fafb;
        }

        .page-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .page-info {
          font-size: 14px;
          color: #6b7280;
          padding: 0 12px;
        }

        @media (max-width: 640px) {
          .list-header {
            flex-direction: column;
            gap: 12px;
            align-items: stretch;
          }

          .list-toolbar {
            flex-direction: column;
          }

          .letters-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default DemandLetterList;
