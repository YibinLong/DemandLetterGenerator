import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listDocuments,
  downloadDocument,
  deleteDocument,
  updateDocument,
  formatFileSize,
  getFileTypeIcon
} from '../lib/documents';
import type { Document, DocumentListResponse } from '../types/document';
import { DocumentPreview } from './DocumentPreview';

interface DocumentLibraryProps {
  /** Filter documents by case reference */
  initialCaseFilter?: string;
  /** Callback when a document is selected */
  onDocumentSelect?: (document: Document) => void;
  /** Whether to show the upload section */
  showUploadHint?: boolean;
}

type SortField = 'created_at' | 'original_filename' | 'file_size' | 'file_type';
type SortOrder = 'asc' | 'desc';

export function DocumentLibrary({
  initialCaseFilter,
  onDocumentSelect,
  showUploadHint = true,
}: DocumentLibraryProps) {
  const queryClient = useQueryClient();

  // Filter and search state
  const [searchQuery, setSearchQuery] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('');
  const [caseFilter, setCaseFilter] = useState(initialCaseFilter || '');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Pagination state
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);

  // UI state
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  const [editForm, setEditForm] = useState({ case_reference: '', description: '' });

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, fileTypeFilter, caseFilter]);

  // Fetch documents
  const { data, isLoading, error } = useQuery<DocumentListResponse>({
    queryKey: ['documents', {
      search: debouncedSearch,
      file_type: fileTypeFilter,
      case_reference: caseFilter,
      limit: pageSize,
      offset: page * pageSize,
    }],
    queryFn: () => listDocuments({
      search: debouncedSearch || undefined,
      file_type: fileTypeFilter || undefined,
      case_reference: caseFilter || undefined,
      limit: pageSize,
      offset: page * pageSize,
    }),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setSelectedDocument(null);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { case_reference?: string; description?: string } }) =>
      updateDocument(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setEditingDocument(null);
    },
  });

  // Sort documents client-side
  const sortedDocuments = useCallback(() => {
    if (!data?.documents) return [];
    return [...data.documents].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'original_filename':
          comparison = a.original_filename.localeCompare(b.original_filename);
          break;
        case 'file_size':
          comparison = a.file_size - b.file_size;
          break;
        case 'file_type':
          comparison = a.file_type.localeCompare(b.file_type);
          break;
        case 'created_at':
        default:
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [data?.documents, sortField, sortOrder]);

  // Get unique case references for filter dropdown
  const uniqueCases = useCallback(() => {
    if (!data?.documents) return [];
    const cases = data.documents
      .map(d => d.case_reference)
      .filter((c): c is string => c !== null && c !== undefined);
    return [...new Set(cases)].sort();
  }, [data?.documents]);

  // Handlers
  const handleDownload = useCallback(async (doc: Document) => {
    try {
      await downloadDocument(doc.id, doc.original_filename);
    } catch (err) {
      console.error('Download failed:', err);
    }
  }, []);

  const handleDelete = useCallback((doc: Document) => {
    if (window.confirm(`Are you sure you want to delete "${doc.original_filename}"?`)) {
      deleteMutation.mutate(doc.id);
    }
  }, [deleteMutation]);

  const handleEdit = useCallback((doc: Document) => {
    setEditingDocument(doc);
    setEditForm({
      case_reference: doc.case_reference || '',
      description: doc.description || '',
    });
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingDocument) return;
    updateMutation.mutate({
      id: editingDocument.id,
      data: {
        case_reference: editForm.case_reference || undefined,
        description: editForm.description || undefined,
      },
    });
  }, [editingDocument, editForm, updateMutation]);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  }, [sortField]);

  const handleDocumentClick = useCallback((doc: Document) => {
    setSelectedDocument(doc);
    onDocumentSelect?.(doc);
  }, [onDocumentSelect]);

  const totalPages = Math.ceil((data?.total || 0) / pageSize);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="document-library">
      {/* Search and Filter Bar */}
      <div className="library-toolbar">
        <div className="search-section">
          <input
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
            aria-label="Search documents"
          />
        </div>

        <div className="filter-section">
          <select
            value={fileTypeFilter}
            onChange={(e) => setFileTypeFilter(e.target.value)}
            className="filter-select"
            aria-label="Filter by file type"
          >
            <option value="">All Types</option>
            <option value="pdf">PDF</option>
            <option value="docx">Word</option>
            <option value="txt">Text</option>
          </select>

          <select
            value={caseFilter}
            onChange={(e) => setCaseFilter(e.target.value)}
            className="filter-select"
            aria-label="Filter by case"
          >
            <option value="">All Cases</option>
            {uniqueCases().map(caseRef => (
              <option key={caseRef} value={caseRef}>{caseRef}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Document Count */}
      <div className="library-stats">
        {data && (
          <span>
            {data.total} document{data.total !== 1 ? 's' : ''} found
            {(debouncedSearch || fileTypeFilter || caseFilter) && ' (filtered)'}
          </span>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="library-loading">
          <div className="loading-spinner" />
          <span>Loading documents...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="library-error" role="alert">
          Failed to load documents. Please try again.
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && data?.documents.length === 0 && (
        <div className="library-empty">
          <div className="empty-icon">📁</div>
          <h3>No documents found</h3>
          {(debouncedSearch || fileTypeFilter || caseFilter) ? (
            <p>Try adjusting your search or filters.</p>
          ) : showUploadHint ? (
            <p>Upload your first document to get started.</p>
          ) : (
            <p>No documents available.</p>
          )}
        </div>
      )}

      {/* Document Grid/List */}
      {!isLoading && !error && data && data.documents.length > 0 && (
        <>
          {/* Sort Controls */}
          <div className="sort-controls">
            <span>Sort by:</span>
            {(['created_at', 'original_filename', 'file_size', 'file_type'] as SortField[]).map(field => (
              <button
                key={field}
                onClick={() => handleSort(field)}
                className={`sort-button ${sortField === field ? 'active' : ''}`}
              >
                {field === 'created_at' ? 'Date' :
                 field === 'original_filename' ? 'Name' :
                 field === 'file_size' ? 'Size' : 'Type'}
                {sortField === field && (
                  <span className="sort-indicator">{sortOrder === 'asc' ? ' ↑' : ' ↓'}</span>
                )}
              </button>
            ))}
          </div>

          {/* Document List */}
          <div className="document-list">
            {sortedDocuments().map(doc => (
              <div
                key={doc.id}
                className={`document-card ${selectedDocument?.id === doc.id ? 'selected' : ''}`}
                onClick={() => handleDocumentClick(doc)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleDocumentClick(doc);
                  }
                }}
              >
                <div className="document-icon">
                  {getFileTypeIcon(doc.file_type)}
                </div>
                <div className="document-info">
                  <div className="document-name" title={doc.original_filename}>
                    {doc.original_filename}
                  </div>
                  <div className="document-meta">
                    <span className="meta-item">{doc.file_type.toUpperCase()}</span>
                    <span className="meta-separator">•</span>
                    <span className="meta-item">{formatFileSize(doc.file_size)}</span>
                    <span className="meta-separator">•</span>
                    <span className="meta-item">{formatDate(doc.created_at)}</span>
                  </div>
                  {doc.case_reference && (
                    <div className="document-case">
                      <span className="case-label">Case:</span> {doc.case_reference}
                    </div>
                  )}
                  {doc.description && (
                    <div className="document-description" title={doc.description}>
                      {doc.description}
                    </div>
                  )}
                </div>
                <div className="document-actions">
                  <button
                    onClick={(e) => { e.stopPropagation(); setPreviewDocument(doc); }}
                    className="action-button preview"
                    title="Preview"
                    aria-label={`Preview ${doc.original_filename}`}
                  >
                    👁️
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDownload(doc); }}
                    className="action-button download"
                    title="Download"
                    aria-label={`Download ${doc.original_filename}`}
                  >
                    ⬇️
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEdit(doc); }}
                    className="action-button edit"
                    title="Edit"
                    aria-label={`Edit ${doc.original_filename}`}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(doc); }}
                    className="action-button delete"
                    title="Delete"
                    aria-label={`Delete ${doc.original_filename}`}
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
                className="pagination-button"
                aria-label="First page"
              >
                ««
              </button>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="pagination-button"
                aria-label="Previous page"
              >
                «
              </button>
              <span className="pagination-info">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="pagination-button"
                aria-label="Next page"
              >
                »
              </button>
              <button
                onClick={() => setPage(totalPages - 1)}
                disabled={page >= totalPages - 1}
                className="pagination-button"
                aria-label="Last page"
              >
                »»
              </button>
            </div>
          )}
        </>
      )}

      {/* Edit Modal */}
      {editingDocument && (
        <div className="modal-overlay" onClick={() => setEditingDocument(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Edit Document</h3>
            <div className="modal-form">
              <label>
                Case Reference
                <input
                  type="text"
                  value={editForm.case_reference}
                  onChange={(e) => setEditForm(prev => ({ ...prev, case_reference: e.target.value }))}
                  placeholder="Enter case reference"
                />
              </label>
              <label>
                Description
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter description"
                  rows={3}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button onClick={() => setEditingDocument(null)} className="modal-button cancel">
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="modal-button save"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewDocument && (
        <DocumentPreview
          document={previewDocument}
          onClose={() => setPreviewDocument(null)}
          onDownload={() => handleDownload(previewDocument)}
        />
      )}

      <style>{`
        .document-library {
          width: 100%;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .library-toolbar {
          display: flex;
          gap: 16px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .search-section {
          flex: 1;
          min-width: 200px;
        }

        .search-input {
          width: 100%;
          padding: 10px 14px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
        }

        .search-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .filter-section {
          display: flex;
          gap: 8px;
        }

        .filter-select {
          padding: 10px 14px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          background: white;
          cursor: pointer;
          min-width: 120px;
        }

        .filter-select:focus {
          outline: none;
          border-color: #3b82f6;
        }

        .library-stats {
          color: #6b7280;
          font-size: 14px;
          margin-bottom: 12px;
        }

        .library-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 48px 0;
          color: #6b7280;
        }

        .loading-spinner {
          width: 24px;
          height: 24px;
          border: 3px solid #e5e7eb;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .library-error {
          padding: 16px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 6px;
          color: #dc2626;
          text-align: center;
        }

        .library-empty {
          text-align: center;
          padding: 48px 24px;
          color: #6b7280;
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .library-empty h3 {
          margin: 0 0 8px;
          color: #374151;
        }

        .library-empty p {
          margin: 0;
        }

        .sort-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          color: #6b7280;
          font-size: 14px;
        }

        .sort-button {
          padding: 6px 12px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          background: white;
          cursor: pointer;
          font-size: 13px;
          color: #374151;
        }

        .sort-button:hover {
          background: #f9fafb;
        }

        .sort-button.active {
          background: #eff6ff;
          border-color: #3b82f6;
          color: #3b82f6;
        }

        .sort-indicator {
          margin-left: 2px;
        }

        .document-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .document-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .document-card:hover {
          border-color: #3b82f6;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .document-card.selected {
          border-color: #3b82f6;
          background: #eff6ff;
        }

        .document-card:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .document-icon {
          font-size: 32px;
          flex-shrink: 0;
        }

        .document-info {
          flex: 1;
          min-width: 0;
        }

        .document-name {
          font-weight: 500;
          color: #111827;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 4px;
        }

        .document-meta {
          font-size: 13px;
          color: #6b7280;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
        }

        .meta-separator {
          margin: 0 6px;
        }

        .document-case {
          font-size: 13px;
          color: #4b5563;
          margin-top: 4px;
        }

        .case-label {
          color: #9ca3af;
        }

        .document-description {
          font-size: 13px;
          color: #6b7280;
          margin-top: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .document-actions {
          display: flex;
          gap: 4px;
          flex-shrink: 0;
        }

        .action-button {
          width: 36px;
          height: 36px;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          background: white;
          cursor: pointer;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }

        .action-button:hover {
          background: #f9fafb;
        }

        .action-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .action-button.preview:hover { background: #eff6ff; border-color: #3b82f6; }
        .action-button.download:hover { background: #f0fdf4; border-color: #22c55e; }
        .action-button.edit:hover { background: #fefce8; border-color: #eab308; }
        .action-button.delete:hover { background: #fef2f2; border-color: #ef4444; }

        .pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid #e5e7eb;
        }

        .pagination-button {
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          background: white;
          cursor: pointer;
          font-size: 14px;
        }

        .pagination-button:hover:not(:disabled) {
          background: #f9fafb;
        }

        .pagination-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pagination-info {
          color: #6b7280;
          font-size: 14px;
          padding: 0 8px;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: white;
          border-radius: 12px;
          padding: 24px;
          width: 90%;
          max-width: 480px;
          max-height: 90vh;
          overflow-y: auto;
        }

        .modal-content h3 {
          margin: 0 0 20px;
          color: #111827;
        }

        .modal-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .modal-form label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
        }

        .modal-form input,
        .modal-form textarea {
          padding: 10px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
        }

        .modal-form input:focus,
        .modal-form textarea:focus {
          outline: none;
          border-color: #3b82f6;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 24px;
        }

        .modal-button {
          padding: 10px 20px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }

        .modal-button.cancel {
          background: white;
          border: 1px solid #d1d5db;
          color: #374151;
        }

        .modal-button.cancel:hover {
          background: #f9fafb;
        }

        .modal-button.save {
          background: #3b82f6;
          border: none;
          color: white;
        }

        .modal-button.save:hover:not(:disabled) {
          background: #2563eb;
        }

        .modal-button.save:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

export default DocumentLibrary;
