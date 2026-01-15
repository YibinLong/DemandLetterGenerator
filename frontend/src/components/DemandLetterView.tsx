import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getDemandLetter,
  updateDemandLetter,
  getDemandLetterVersions,
  getDemandLetterVersion,
  restoreDemandLetterVersion,
  formatStatus,
  getStatusColor,
  formatDate,
} from '../lib/demand-letters';
import type {
  DemandLetter,
  DemandLetterStatus,
  DemandLetterVersion,
  RefineResponse,
} from '../types/demand-letter';
import { RefinementPanel } from './RefinementPanel';
import { ExportDialog } from './ExportDialog';

interface DemandLetterViewProps {
  letterId: string;
  onBack?: () => void;
  onDeleted?: () => void;
}

type ViewTab = 'content' | 'details' | 'versions';

export function DemandLetterView({ letterId, onBack }: DemandLetterViewProps) {
  const queryClient = useQueryClient();

  // UI state
  const [activeTab, setActiveTab] = useState<ViewTab>('content');
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [showRefinementPanel, setShowRefinementPanel] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Fetch demand letter
  const { data: letter, isLoading, error } = useQuery<DemandLetter>({
    queryKey: ['demandLetter', letterId],
    queryFn: () => getDemandLetter(letterId),
  });

  // Fetch versions
  const { data: versionsData } = useQuery({
    queryKey: ['demandLetterVersions', letterId],
    queryFn: () => getDemandLetterVersions(letterId),
    enabled: activeTab === 'versions',
  });

  // Fetch specific version content
  const { data: selectedVersion } = useQuery<DemandLetterVersion>({
    queryKey: ['demandLetterVersion', letterId, selectedVersionId],
    queryFn: () => getDemandLetterVersion(letterId, selectedVersionId!),
    enabled: !!selectedVersionId,
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: { content?: string; status?: DemandLetterStatus }) =>
      updateDemandLetter(letterId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demandLetter', letterId] });
      queryClient.invalidateQueries({ queryKey: ['demandLetterVersions', letterId] });
      setIsEditing(false);
    },
  });

  // Handle refinement completion
  const handleRefined = useCallback((_response: RefineResponse) => {
    queryClient.invalidateQueries({ queryKey: ['demandLetter', letterId] });
    queryClient.invalidateQueries({ queryKey: ['demandLetterVersions', letterId] });
  }, [queryClient, letterId]);

  // Restore version mutation
  const restoreMutation = useMutation({
    mutationFn: (versionId: string) =>
      restoreDemandLetterVersion(letterId, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demandLetter', letterId] });
      queryClient.invalidateQueries({ queryKey: ['demandLetterVersions', letterId] });
      setSelectedVersionId(null);
    },
  });

  // Handlers
  const handleStartEdit = useCallback(() => {
    if (letter) {
      setEditedContent(letter.content);
      setIsEditing(true);
    }
  }, [letter]);

  const handleSaveEdit = useCallback(() => {
    updateMutation.mutate({ content: editedContent });
  }, [editedContent, updateMutation]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditedContent('');
  }, []);

  const handleStatusChange = useCallback((status: DemandLetterStatus) => {
    updateMutation.mutate({ status });
  }, [updateMutation]);

  const toggleRefinementPanel = useCallback(() => {
    setShowRefinementPanel(prev => !prev);
  }, []);

  const handleRestoreVersion = useCallback((versionId: string) => {
    if (window.confirm('Are you sure you want to restore this version? This will create a new version with the restored content.')) {
      restoreMutation.mutate(versionId);
    }
  }, [restoreMutation]);

  // Copy to clipboard
  const copyToClipboard = useCallback(() => {
    if (letter) {
      navigator.clipboard.writeText(letter.content);
    }
  }, [letter]);

  if (isLoading) {
    return (
      <div className="letter-view loading">
        <div className="spinner" />
        Loading...
      </div>
    );
  }

  if (error || !letter) {
    return (
      <div className="letter-view error">
        <p>Failed to load demand letter.</p>
        {onBack && (
          <button onClick={onBack} className="back-button">
            Go Back
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`letter-view ${showRefinementPanel ? 'with-panel' : ''}`}>
      <div className="letter-view-main">
      {/* Header */}
      <div className="view-header">
        <div className="header-left">
          {onBack && (
            <button onClick={onBack} className="back-button">
              ← Back
            </button>
          )}
          <div className="header-info">
            <h1>{letter.title}</h1>
            <div className="header-meta">
              <span
                className="status-badge"
                style={{ backgroundColor: getStatusColor(letter.status) }}
              >
                {formatStatus(letter.status)}
              </span>
              <span className="version-info">Version {letter.version}</span>
              <span className="updated-info">
                Updated {formatDate(letter.updated_at)}
              </span>
            </div>
          </div>
        </div>

        <div className="header-actions">
          <select
            value={letter.status}
            onChange={(e) => handleStatusChange(e.target.value as DemandLetterStatus)}
            className="status-select"
            disabled={updateMutation.isPending}
          >
            <option value="draft">Draft</option>
            <option value="in_review">In Review</option>
            <option value="approved">Approved</option>
            <option value="sent">Sent</option>
            <option value="archived">Archived</option>
          </select>

          <button
            onClick={toggleRefinementPanel}
            className={`refine-button ${showRefinementPanel ? 'active' : ''}`}
          >
            {showRefinementPanel ? '✕ Close Panel' : '✨ Refine with AI'}
          </button>

          <button
            onClick={() => setShowExportDialog(true)}
            className="export-button"
            title="Export to Word"
          >
            Export
          </button>

          <button onClick={copyToClipboard} className="copy-button" title="Copy to clipboard">
            📋
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="view-tabs">
        <button
          className={`tab ${activeTab === 'content' ? 'active' : ''}`}
          onClick={() => setActiveTab('content')}
        >
          Content
        </button>
        <button
          className={`tab ${activeTab === 'details' ? 'active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          Details
        </button>
        <button
          className={`tab ${activeTab === 'versions' ? 'active' : ''}`}
          onClick={() => setActiveTab('versions')}
        >
          Versions ({letter.version_count})
        </button>
      </div>

      {/* Content Tab */}
      {activeTab === 'content' && (
        <div className="tab-content content-tab">
          <div className="content-header">
            {!isEditing ? (
              <button onClick={handleStartEdit} className="edit-button">
                ✏️ Edit
              </button>
            ) : (
              <div className="edit-actions">
                <button
                  onClick={handleCancelEdit}
                  className="cancel-edit-button"
                  disabled={updateMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="save-edit-button"
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>

          {isEditing ? (
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="content-editor"
              placeholder="Enter demand letter content..."
            />
          ) : (
            <div className="content-display">
              {letter.content}
            </div>
          )}
        </div>
      )}

      {/* Details Tab */}
      {activeTab === 'details' && (
        <div className="tab-content details-tab">
          <div className="details-grid">
            <div className="detail-item">
              <label>Client Name</label>
              <span>{letter.client_name || '—'}</span>
            </div>
            <div className="detail-item">
              <label>Case Reference</label>
              <span>{letter.case_reference || '—'}</span>
            </div>
            <div className="detail-item">
              <label>Recipient</label>
              <span>{letter.recipient_name || '—'}</span>
            </div>
            <div className="detail-item">
              <label>Incident Date</label>
              <span>{letter.incident_date ? new Date(letter.incident_date).toLocaleDateString() : '—'}</span>
            </div>
            <div className="detail-item">
              <label>Demand Amount</label>
              <span>{letter.demand_amount ? `$${letter.demand_amount.toLocaleString()}` : '—'}</span>
            </div>
            <div className="detail-item">
              <label>Created</label>
              <span>{formatDate(letter.created_at)}</span>
            </div>
          </div>

          {letter.source_documents && letter.source_documents.length > 0 && (
            <div className="source-documents">
              <h3>Source Documents</h3>
              <div className="documents-list">
                {letter.source_documents.map(doc => (
                  <div key={doc.id} className="document-item">
                    <span className="doc-icon">
                      {doc.file_type === 'pdf' ? '📄' : doc.file_type === 'docx' ? '📝' : '📃'}
                    </span>
                    <span className="doc-name">{doc.filename || doc.original_filename}</span>
                    <span className="doc-type">{doc.file_type.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Versions Tab */}
      {activeTab === 'versions' && (
        <div className="tab-content versions-tab">
          <div className="versions-layout">
            <div className="versions-list">
              <h3>Version History</h3>
              {versionsData?.versions.map(version => (
                <div
                  key={version.id}
                  className={`version-item ${selectedVersionId === version.id ? 'selected' : ''}`}
                  onClick={() => setSelectedVersionId(version.id)}
                >
                  <div className="version-number">v{version.version_number}</div>
                  <div className="version-info">
                    <div className="version-summary">
                      {version.change_summary || 'No description'}
                    </div>
                    <div className="version-meta">
                      <span>{version.changed_by.name}</span>
                      <span>•</span>
                      <span>{formatDate(version.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="version-preview">
              {selectedVersion ? (
                <>
                  <div className="preview-header">
                    <h3>Version {selectedVersion.version_number}</h3>
                    {selectedVersion.version_number !== letter.version && (
                      <button
                        onClick={() => handleRestoreVersion(selectedVersion.id)}
                        className="restore-button"
                        disabled={restoreMutation.isPending}
                      >
                        {restoreMutation.isPending ? 'Restoring...' : 'Restore This Version'}
                      </button>
                    )}
                  </div>
                  <div className="preview-content">
                    {selectedVersion.content}
                  </div>
                </>
              ) : (
                <div className="no-selection">
                  Select a version to preview its content
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      </div>

      {/* Refinement Panel (Side Panel) */}
      {showRefinementPanel && (
        <div className="refinement-panel-container">
          <RefinementPanel
            letterId={letterId}
            currentContent={letter.content}
            currentVersion={letter.version || 1}
            onRefined={handleRefined}
          />
        </div>
      )}

      {/* Export Dialog */}
      <ExportDialog
        letterId={letterId}
        letterTitle={letter.title}
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
      />

      <style>{`
        .letter-view {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .letter-view.with-panel {
          display: flex;
          height: calc(100vh - 100px);
          overflow: hidden;
        }

        .letter-view-main {
          flex: 1;
          overflow-y: auto;
          padding-right: 20px;
        }

        .letter-view.with-panel .letter-view-main {
          flex: 1;
          min-width: 0;
        }

        .refinement-panel-container {
          width: 380px;
          flex-shrink: 0;
          height: 100%;
          overflow: hidden;
        }

        .letter-view.loading,
        .letter-view.error {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          gap: 16px;
          color: #6b7280;
        }

        .spinner {
          width: 24px;
          height: 24px;
          border: 2px solid #e5e7eb;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Header */
        .view-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 1px solid #e5e7eb;
        }

        .header-left {
          display: flex;
          align-items: flex-start;
          gap: 16px;
        }

        .back-button {
          padding: 8px 12px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          white-space: nowrap;
        }

        .back-button:hover {
          background: #f9fafb;
        }

        .header-info h1 {
          margin: 0 0 8px;
          font-size: 24px;
          color: #111827;
        }

        .header-meta {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 14px;
          color: #6b7280;
        }

        .status-badge {
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
          color: white;
        }

        .header-actions {
          display: flex;
          gap: 8px;
        }

        .status-select {
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          background: white;
        }

        .refine-button {
          padding: 8px 16px;
          background: #8b5cf6;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
        }

        .refine-button:hover {
          background: #7c3aed;
        }

        .refine-button.active {
          background: #6d28d9;
        }

        .export-button {
          padding: 8px 16px;
          background: #10b981;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
        }

        .export-button:hover {
          background: #059669;
        }

        .copy-button {
          padding: 8px 12px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
        }

        .copy-button:hover {
          background: #f9fafb;
        }

        /* Tabs */
        .view-tabs {
          display: flex;
          gap: 4px;
          margin-bottom: 20px;
        }

        .tab {
          padding: 10px 20px;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          font-size: 14px;
          font-weight: 500;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.15s;
        }

        .tab:hover {
          color: #374151;
        }

        .tab.active {
          color: #3b82f6;
          border-bottom-color: #3b82f6;
        }

        /* Content Tab */
        .content-tab {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          overflow: hidden;
        }

        .content-header {
          display: flex;
          justify-content: flex-end;
          padding: 12px 16px;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
        }

        .edit-button {
          padding: 6px 12px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 13px;
          cursor: pointer;
        }

        .edit-actions {
          display: flex;
          gap: 8px;
        }

        .cancel-edit-button {
          padding: 6px 12px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 13px;
          cursor: pointer;
        }

        .save-edit-button {
          padding: 6px 12px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 13px;
          cursor: pointer;
        }

        .save-edit-button:disabled {
          opacity: 0.7;
        }

        .content-editor {
          width: 100%;
          min-height: 500px;
          padding: 20px;
          border: none;
          font-size: 14px;
          line-height: 1.8;
          font-family: inherit;
          resize: vertical;
        }

        .content-editor:focus {
          outline: none;
        }

        .content-display {
          padding: 20px;
          font-size: 14px;
          line-height: 1.8;
          white-space: pre-wrap;
          color: #374151;
        }

        /* Details Tab */
        .details-tab {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 24px;
        }

        .details-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }

        .detail-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .detail-item label {
          font-size: 12px;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .detail-item span {
          font-size: 14px;
          color: #111827;
        }

        .source-documents {
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid #e5e7eb;
        }

        .source-documents h3 {
          margin: 0 0 12px;
          font-size: 14px;
          color: #374151;
        }

        .documents-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .document-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px;
          background: #f9fafb;
          border-radius: 6px;
          font-size: 14px;
        }

        .doc-name {
          flex: 1;
          color: #111827;
        }

        .doc-type {
          font-size: 12px;
          color: #6b7280;
          background: white;
          padding: 2px 8px;
          border-radius: 4px;
        }

        /* Versions Tab */
        .versions-tab {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          overflow: hidden;
        }

        .versions-layout {
          display: grid;
          grid-template-columns: 300px 1fr;
          min-height: 400px;
        }

        .versions-list {
          border-right: 1px solid #e5e7eb;
          padding: 16px;
          overflow-y: auto;
        }

        .versions-list h3 {
          margin: 0 0 16px;
          font-size: 14px;
          color: #374151;
        }

        .version-item {
          display: flex;
          gap: 12px;
          padding: 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.15s;
        }

        .version-item:hover {
          background: #f9fafb;
        }

        .version-item.selected {
          background: #eff6ff;
        }

        .version-number {
          font-size: 13px;
          font-weight: 600;
          color: #3b82f6;
          background: #eff6ff;
          padding: 4px 8px;
          border-radius: 4px;
          height: fit-content;
        }

        .version-info {
          flex: 1;
        }

        .version-summary {
          font-size: 14px;
          color: #111827;
          margin-bottom: 4px;
        }

        .version-meta {
          font-size: 12px;
          color: #6b7280;
          display: flex;
          gap: 6px;
        }

        .version-preview {
          padding: 16px;
        }

        .preview-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .preview-header h3 {
          margin: 0;
          font-size: 14px;
          color: #374151;
        }

        .restore-button {
          padding: 6px 12px;
          background: #f59e0b;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 13px;
          cursor: pointer;
        }

        .restore-button:hover:not(:disabled) {
          background: #d97706;
        }

        .restore-button:disabled {
          opacity: 0.7;
        }

        .preview-content {
          padding: 16px;
          background: #f9fafb;
          border-radius: 8px;
          font-size: 13px;
          line-height: 1.6;
          white-space: pre-wrap;
          max-height: 350px;
          overflow-y: auto;
        }

        .no-selection {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 200px;
          color: #6b7280;
        }

        /* Modal */
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
          max-width: 500px;
        }

        .modal-content h2 {
          margin: 0 0 8px;
          font-size: 18px;
          color: #111827;
        }

        .modal-description {
          color: #6b7280;
          font-size: 14px;
          margin: 0 0 16px;
        }

        .refine-input {
          width: 100%;
          padding: 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
          resize: vertical;
        }

        .refine-input:focus {
          outline: none;
          border-color: #3b82f6;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 16px;
        }

        .modal-cancel {
          padding: 10px 20px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
        }

        .modal-submit {
          padding: 10px 20px;
          background: #8b5cf6;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
        }

        .modal-submit:hover:not(:disabled) {
          background: #7c3aed;
        }

        .modal-submit:disabled {
          opacity: 0.7;
        }

        .modal-error {
          margin-top: 12px;
          padding: 10px;
          background: #fef2f2;
          border-radius: 6px;
          color: #dc2626;
          font-size: 14px;
        }

        @media (max-width: 1200px) {
          .refinement-panel-container {
            width: 320px;
          }
        }

        @media (max-width: 768px) {
          .letter-view.with-panel {
            flex-direction: column;
          }

          .refinement-panel-container {
            width: 100%;
            height: 400px;
            order: -1;
          }

          .view-header {
            flex-direction: column;
            gap: 16px;
          }

          .header-actions {
            width: 100%;
            flex-wrap: wrap;
          }

          .details-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .versions-layout {
            grid-template-columns: 1fr;
          }

          .versions-list {
            border-right: none;
            border-bottom: 1px solid #e5e7eb;
            max-height: 200px;
          }
        }
      `}</style>
    </div>
  );
}

export default DemandLetterView;
