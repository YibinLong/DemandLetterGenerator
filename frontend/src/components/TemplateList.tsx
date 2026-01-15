import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listTemplates,
  deleteTemplate,
  duplicateTemplate,
  approveTemplate,
  formatCategory,
} from '../lib/templates';
import { formatRelativeTime } from '../lib/demand-letters';
import type { TemplateListItem, TemplateListResponse } from '../types/template';
import { TEMPLATE_CATEGORIES } from '../types/template';

interface TemplateListProps {
  onSelect?: (template: TemplateListItem) => void;
  onCreateNew?: () => void;
  onEdit?: (template: TemplateListItem) => void;
  isAdmin?: boolean;
}

export function TemplateList({ onSelect, onCreateNew, onEdit, isAdmin = false }: TemplateListProps) {
  const queryClient = useQueryClient();

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [sharedFilter, setSharedFilter] = useState<string>('');
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
  }, [debouncedSearch, categoryFilter, sharedFilter]);

  // Fetch templates
  const { data, isLoading, error } = useQuery<TemplateListResponse>({
    queryKey: ['templates', {
      search: debouncedSearch,
      category: categoryFilter,
      is_shared: sharedFilter === 'shared' ? true : sharedFilter === 'private' ? false : undefined,
      limit: pageSize,
      offset: page * pageSize,
    }],
    queryFn: () => listTemplates({
      search: debouncedSearch || undefined,
      category: categoryFilter || undefined,
      is_shared: sharedFilter === 'shared' ? true : sharedFilter === 'private' ? false : undefined,
      limit: pageSize,
      offset: page * pageSize,
    }),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  // Duplicate mutation
  const duplicateMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => duplicateTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  // Approve mutation (admin only)
  const approveMutation = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      approveTemplate(id, approved),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  const handleDelete = useCallback((template: TemplateListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${template.name}"?`)) {
      deleteMutation.mutate(template.id);
    }
  }, [deleteMutation]);

  const handleDuplicate = useCallback((template: TemplateListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    duplicateMutation.mutate({ id: template.id });
  }, [duplicateMutation]);

  const handleApprove = useCallback((template: TemplateListItem, approved: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    approveMutation.mutate({ id: template.id, approved });
  }, [approveMutation]);

  const handleEdit = useCallback((template: TemplateListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(template);
  }, [onEdit]);

  const totalPages = Math.ceil((data?.total || 0) / pageSize);

  return (
    <div className="template-list">
      {/* Header */}
      <div className="list-header">
        <h2>Templates</h2>
        {onCreateNew && (
          <button onClick={onCreateNew} className="create-button">
            + New Template
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="list-toolbar">
        <input
          type="text"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="filter-select"
        >
          <option value="">All Categories</option>
          {TEMPLATE_CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <select
          value={sharedFilter}
          onChange={(e) => setSharedFilter(e.target.value)}
          className="filter-select"
        >
          <option value="">All Templates</option>
          <option value="shared">Shared Only</option>
          <option value="private">Private Only</option>
        </select>
      </div>

      {/* Stats */}
      {data && (
        <div className="list-stats">
          {data.total} template{data.total !== 1 ? 's' : ''}
          {(debouncedSearch || categoryFilter || sharedFilter) && ' (filtered)'}
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
          Failed to load templates. Please try again.
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && data?.templates.length === 0 && (
        <div className="list-empty">
          <div className="empty-icon">📋</div>
          <h3>No templates found</h3>
          {debouncedSearch || categoryFilter || sharedFilter ? (
            <p>Try adjusting your search or filters.</p>
          ) : (
            <>
              <p>Create your first template to get started.</p>
              {onCreateNew && (
                <button onClick={onCreateNew} className="empty-create-button">
                  Create Template
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* List */}
      {!isLoading && !error && data && data.templates.length > 0 && (
        <>
          <div className="templates-grid">
            {data.templates.map(template => (
              <div
                key={template.id}
                className="template-card"
                onClick={() => onSelect?.(template)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onSelect?.(template);
                  }
                }}
              >
                <div className="card-header">
                  <div className="badges">
                    {template.category && (
                      <span className="category-badge">
                        {formatCategory(template.category)}
                      </span>
                    )}
                    {template.is_shared && (
                      <span className="shared-badge">Shared</span>
                    )}
                    {template.is_approved && (
                      <span className="approved-badge">Approved</span>
                    )}
                  </div>
                  <span className="placeholder-count">
                    {template.placeholders.length} placeholder{template.placeholders.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <h3 className="card-title" title={template.name}>
                  {template.name}
                </h3>

                {template.description && (
                  <p className="card-description">
                    {template.description}
                  </p>
                )}

                <div className="card-meta">
                  <div className="meta-item">
                    <span className="meta-label">Created by:</span>
                    <span>{template.creator.name}</span>
                  </div>
                </div>

                <div className="card-footer">
                  <span className="updated-at">
                    Updated {formatRelativeTime(template.updated_at)}
                  </span>
                  <div className="card-actions">
                    {onEdit && (
                      <button
                        className="action-button edit-button"
                        onClick={(e) => handleEdit(template, e)}
                        title="Edit"
                      >
                        ✏️
                      </button>
                    )}
                    <button
                      className="action-button duplicate-button"
                      onClick={(e) => handleDuplicate(template, e)}
                      title="Duplicate"
                      disabled={duplicateMutation.isPending}
                    >
                      📋
                    </button>
                    {isAdmin && template.is_shared && (
                      <button
                        className={`action-button approve-button ${template.is_approved ? 'approved' : ''}`}
                        onClick={(e) => handleApprove(template, !template.is_approved, e)}
                        title={template.is_approved ? 'Unapprove' : 'Approve'}
                        disabled={approveMutation.isPending}
                      >
                        {template.is_approved ? '✓' : '○'}
                      </button>
                    )}
                    <button
                      className="action-button delete-button"
                      onClick={(e) => handleDelete(template, e)}
                      title="Delete"
                      disabled={deleteMutation.isPending}
                    >
                      🗑️
                    </button>
                  </div>
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
        .template-list {
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

        .templates-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }

        .template-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 20px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .template-card:hover {
          border-color: #3b82f6;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }

        .template-card:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
          gap: 8px;
        }

        .badges {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .category-badge {
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 500;
          background: #eff6ff;
          color: #2563eb;
        }

        .shared-badge {
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 500;
          background: #fef3c7;
          color: #d97706;
        }

        .approved-badge {
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 500;
          background: #d1fae5;
          color: #059669;
        }

        .placeholder-count {
          font-size: 12px;
          color: #6b7280;
          background: #f3f4f6;
          padding: 4px 8px;
          border-radius: 4px;
          white-space: nowrap;
        }

        .card-title {
          margin: 0 0 8px;
          font-size: 16px;
          font-weight: 600;
          color: #111827;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .card-description {
          margin: 0 0 12px;
          font-size: 13px;
          color: #6b7280;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
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

        .card-actions {
          display: flex;
          gap: 4px;
        }

        .action-button {
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

        .action-button:hover {
          background: #f3f4f6;
        }

        .action-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .edit-button:hover {
          background: #eff6ff;
        }

        .duplicate-button:hover {
          background: #fef3c7;
        }

        .approve-button:hover {
          background: #d1fae5;
        }

        .approve-button.approved {
          background: #d1fae5;
          color: #059669;
        }

        .delete-button:hover {
          background: #fef2f2;
          border-color: #fecaca;
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

          .templates-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default TemplateList;
