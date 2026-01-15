import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../lib/api';
import { formatFileSize } from '../lib/documents';
import type { Document } from '../types/document';

interface DocumentPreviewProps {
  document: Document;
  onClose: () => void;
  onDownload: () => void;
}

export function DocumentPreview({ document: doc, onClose, onDownload }: DocumentPreviewProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Fetch document content for preview
  useEffect(() => {
    let isMounted = true;

    const fetchContent = async () => {
      setLoading(true);
      setError(null);
      setContent(null);
      setPdfUrl(null);

      // Cleanup previous blob URL
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }

      try {
        const response = await apiClient.get(`/api/documents/${doc.id}/preview`, {
          responseType: 'blob',
        });

        if (!isMounted) return;

        const blob = response.data as Blob;

        if (doc.file_type === 'txt') {
          // Text files - convert blob to text and show content
          const text = await blob.text();
          if (isMounted) {
            setContent(text);
          }
        } else if (doc.file_type === 'pdf') {
          // PDF files - create blob URL for iframe
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          if (isMounted) {
            setPdfUrl(url);
          }
        } else if (doc.file_type === 'docx') {
          // DOCX files - show info message (can't preview directly in browser)
          if (isMounted) {
            setContent(null);
          }
        }
      } catch (err) {
        console.error('Preview fetch error:', err);
        if (isMounted) {
          setError('Failed to load document preview');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchContent();

    // Cleanup blob URL on unmount
    return () => {
      isMounted = false;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [doc.id, doc.file_type]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    const originalOverflow = globalThis.document.body.style.overflow;
    globalThis.document.body.style.overflow = 'hidden';
    return () => {
      globalThis.document.body.style.overflow = originalOverflow || '';
    };
  }, []);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getFileTypeLabel = (type: string) => {
    switch (type) {
      case 'pdf': return 'PDF Document';
      case 'docx': return 'Word Document';
      case 'txt': return 'Text File';
      default: return type.toUpperCase();
    }
  };

  return (
    <div className="preview-overlay" onClick={handleBackdropClick}>
      <div className="preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title">
        {/* Header */}
        <div className="preview-header">
          <div className="preview-title-section">
            <h2 id="preview-title" className="preview-title">{doc.original_filename}</h2>
            <div className="preview-meta">
              <span>{getFileTypeLabel(doc.file_type)}</span>
              <span className="meta-separator">•</span>
              <span>{formatFileSize(doc.file_size)}</span>
              <span className="meta-separator">•</span>
              <span>{formatDate(doc.created_at)}</span>
            </div>
          </div>
          <div className="preview-actions">
            <button
              onClick={onDownload}
              className="preview-button download"
              aria-label="Download document"
            >
              ⬇️ Download
            </button>
            <button
              onClick={onClose}
              className="preview-button close"
              aria-label="Close preview"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Document Info */}
        {(doc.case_reference || doc.description) && (
          <div className="preview-info">
            {doc.case_reference && (
              <div className="info-item">
                <span className="info-label">Case Reference:</span>
                <span className="info-value">{doc.case_reference}</span>
              </div>
            )}
            {doc.description && (
              <div className="info-item">
                <span className="info-label">Description:</span>
                <span className="info-value">{doc.description}</span>
              </div>
            )}
          </div>
        )}

        {/* Content Area */}
        <div className="preview-content">
          {loading && (
            <div className="preview-loading">
              <div className="loading-spinner" />
              <span>Loading preview...</span>
            </div>
          )}

          {error && (
            <div className="preview-error">
              <div className="error-icon">⚠️</div>
              <p>{error}</p>
              <button onClick={onDownload} className="error-download-button">
                Download file instead
              </button>
            </div>
          )}

          {!loading && !error && doc.file_type === 'txt' && content !== null && (
            <div className="text-preview">
              <pre>{content}</pre>
            </div>
          )}

          {!loading && !error && doc.file_type === 'pdf' && pdfUrl && (
            <div className="pdf-preview">
              <iframe
                src={pdfUrl}
                title={`Preview of ${doc.original_filename}`}
                className="pdf-iframe"
              />
            </div>
          )}

          {!loading && !error && doc.file_type === 'docx' && (
            <div className="docx-preview">
              <div className="docx-icon">📄</div>
              <h3>Word Document Preview</h3>
              <p>
                Word documents (.docx) cannot be previewed directly in the browser.
              </p>
              <p>
                Please download the file to view its contents.
              </p>
              <button onClick={onDownload} className="docx-download-button">
                ⬇️ Download Document
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .preview-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .preview-modal {
          background: white;
          border-radius: 12px;
          width: 100%;
          max-width: 1000px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }

        .preview-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid #e5e7eb;
          flex-shrink: 0;
        }

        .preview-title-section {
          flex: 1;
          min-width: 0;
        }

        .preview-title {
          margin: 0 0 4px;
          font-size: 18px;
          font-weight: 600;
          color: #111827;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .preview-meta {
          font-size: 13px;
          color: #6b7280;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 4px;
        }

        .meta-separator {
          margin: 0 4px;
        }

        .preview-actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
          margin-left: 16px;
        }

        .preview-button {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .preview-button.download {
          background: #3b82f6;
          border: none;
          color: white;
        }

        .preview-button.download:hover {
          background: #2563eb;
        }

        .preview-button.close {
          background: white;
          border: 1px solid #d1d5db;
          color: #374151;
          padding: 8px 12px;
        }

        .preview-button.close:hover {
          background: #f9fafb;
        }

        .preview-info {
          padding: 12px 24px;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          gap: 24px;
          flex-wrap: wrap;
          flex-shrink: 0;
        }

        .info-item {
          display: flex;
          gap: 8px;
          font-size: 14px;
        }

        .info-label {
          color: #6b7280;
        }

        .info-value {
          color: #111827;
        }

        .preview-content {
          flex: 1;
          overflow: auto;
          min-height: 300px;
        }

        .preview-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          min-height: 300px;
          gap: 16px;
          color: #6b7280;
        }

        .loading-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #e5e7eb;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .preview-error {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          min-height: 300px;
          padding: 24px;
          text-align: center;
        }

        .error-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .preview-error p {
          color: #6b7280;
          margin: 0 0 16px;
        }

        .error-download-button {
          padding: 10px 20px;
          background: #3b82f6;
          border: none;
          border-radius: 6px;
          color: white;
          cursor: pointer;
          font-size: 14px;
        }

        .error-download-button:hover {
          background: #2563eb;
        }

        .text-preview {
          padding: 24px;
          height: 100%;
          overflow: auto;
        }

        .text-preview pre {
          margin: 0;
          font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
          font-size: 14px;
          line-height: 1.6;
          white-space: pre-wrap;
          word-wrap: break-word;
          color: #374151;
        }

        .pdf-preview {
          height: 100%;
          min-height: 500px;
        }

        .pdf-iframe {
          width: 100%;
          height: 100%;
          min-height: 500px;
          border: none;
        }

        .docx-preview {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          min-height: 300px;
          padding: 48px 24px;
          text-align: center;
        }

        .docx-icon {
          font-size: 64px;
          margin-bottom: 16px;
        }

        .docx-preview h3 {
          margin: 0 0 12px;
          color: #111827;
        }

        .docx-preview p {
          margin: 0 0 8px;
          color: #6b7280;
          max-width: 400px;
        }

        .docx-download-button {
          margin-top: 16px;
          padding: 12px 24px;
          background: #3b82f6;
          border: none;
          border-radius: 6px;
          color: white;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .docx-download-button:hover {
          background: #2563eb;
        }
      `}</style>
    </div>
  );
}

export default DocumentPreview;
