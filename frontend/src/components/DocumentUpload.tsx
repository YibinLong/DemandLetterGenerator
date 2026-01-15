import { useState, useCallback, useRef } from 'react';
import { uploadDocument, uploadMultipleDocuments, validateFile, formatFileSize } from '../lib/documents';
import type { UploadProgress } from '../types/document';

interface DocumentUploadProps {
  onUploadComplete?: (documentIds: string[]) => void;
  case_reference?: string;
  description?: string;
  multiple?: boolean;
  maxFiles?: number;
}

export function DocumentUpload({
  onUploadComplete,
  case_reference,
  description,
  multiple = true,
  maxFiles = 10,
}: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null);
      const fileArray = Array.from(files).slice(0, maxFiles);

      // Validate all files
      const validationResults = fileArray.map((file) => ({
        file,
        ...validateFile(file),
      }));

      const invalidFiles = validationResults.filter((r) => !r.valid);
      if (invalidFiles.length > 0) {
        setError(invalidFiles.map((f) => `${f.file.name}: ${f.error}`).join('\n'));
        return;
      }

      // Initialize upload progress
      const newUploads: UploadProgress[] = fileArray.map((file) => ({
        file,
        progress: 0,
        status: 'pending',
      }));
      setUploads(newUploads);
      setIsUploading(true);

      const uploadedIds: string[] = [];

      if (multiple && fileArray.length > 1) {
        // Use bulk upload endpoint
        try {
          setUploads((prev) =>
            prev.map((u) => ({ ...u, status: 'uploading' as const }))
          );

          const result = await uploadMultipleDocuments(fileArray, {
            case_reference,
            description,
            onProgress: (progress) => {
              setUploads((prev) =>
                prev.map((u) => ({ ...u, progress }))
              );
            },
          });

          setUploads((prev) =>
            prev.map((u, idx) => ({
              ...u,
              status: 'completed' as const,
              progress: 100,
              documentId: result.documents[idx]?.id,
            }))
          );

          uploadedIds.push(...result.documents.map((d) => d.id));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Upload failed';
          setUploads((prev) =>
            prev.map((u) => ({
              ...u,
              status: 'error' as const,
              error: message,
            }))
          );
          setError(message);
        }
      } else {
        // Upload files individually
        for (let i = 0; i < fileArray.length; i++) {
          const file = fileArray[i];
          try {
            setUploads((prev) =>
              prev.map((u, idx) =>
                idx === i ? { ...u, status: 'uploading' as const } : u
              )
            );

            const result = await uploadDocument(file, {
              case_reference,
              description,
              onProgress: (progress) => {
                setUploads((prev) =>
                  prev.map((u, idx) =>
                    idx === i ? { ...u, progress } : u
                  )
                );
              },
            });

            setUploads((prev) =>
              prev.map((u, idx) =>
                idx === i
                  ? {
                      ...u,
                      status: 'completed' as const,
                      progress: 100,
                      documentId: result.id,
                    }
                  : u
              )
            );

            uploadedIds.push(result.id);
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Upload failed';
            setUploads((prev) =>
              prev.map((u, idx) =>
                idx === i
                  ? { ...u, status: 'error' as const, error: message }
                  : u
              )
            );
          }
        }
      }

      setIsUploading(false);

      if (uploadedIds.length > 0 && onUploadComplete) {
        onUploadComplete(uploadedIds);
      }
    },
    [case_reference, description, maxFiles, multiple, onUploadComplete]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFiles(files);
      }
    },
    [handleFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFiles(files);
      }
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [handleFiles]
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const clearUploads = useCallback(() => {
    setUploads([]);
    setError(null);
  }, []);

  const getProgressBarColor = (status: UploadProgress['status']) => {
    switch (status) {
      case 'completed':
        return '#22c55e';
      case 'error':
        return '#ef4444';
      case 'uploading':
        return '#3b82f6';
      default:
        return '#9ca3af';
    }
  };

  return (
    <div className="document-upload">
      <div
        className={`upload-dropzone ${isDragging ? 'dragging' : ''} ${isUploading ? 'uploading' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={!isUploading ? handleClick : undefined}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleClick();
          }
        }}
        aria-label="Upload documents"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple={multiple}
          accept=".pdf,.docx,.txt"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          disabled={isUploading}
        />

        <div className="dropzone-content">
          <div className="dropzone-icon">
            {isUploading ? '...' : isDragging ? '+' : '...'}
          </div>
          <div className="dropzone-text">
            {isUploading ? (
              <span>Uploading...</span>
            ) : isDragging ? (
              <span>Drop files here</span>
            ) : (
              <>
                <span className="dropzone-primary">
                  Drag and drop files here, or click to select
                </span>
                <span className="dropzone-secondary">
                  Supported formats: PDF, DOCX, TXT (max 50MB each)
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="upload-error" role="alert">
          {error}
        </div>
      )}

      {uploads.length > 0 && (
        <div className="upload-progress-list">
          <div className="progress-header">
            <span>Uploads ({uploads.filter((u) => u.status === 'completed').length}/{uploads.length})</span>
            {!isUploading && (
              <button onClick={clearUploads} className="clear-button">
                Clear
              </button>
            )}
          </div>

          {uploads.map((upload, index) => (
            <div key={index} className="upload-progress-item">
              <div className="progress-info">
                <span className="progress-filename">{upload.file.name}</span>
                <span className="progress-size">{formatFileSize(upload.file.size)}</span>
              </div>
              <div className="progress-bar-container">
                <div
                  className="progress-bar"
                  style={{
                    width: `${upload.progress}%`,
                    backgroundColor: getProgressBarColor(upload.status),
                  }}
                />
              </div>
              <div className="progress-status">
                {upload.status === 'pending' && 'Waiting...'}
                {upload.status === 'uploading' && `${upload.progress}%`}
                {upload.status === 'completed' && 'Completed'}
                {upload.status === 'error' && (
                  <span className="error-text">{upload.error}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .document-upload {
          width: 100%;
        }

        .upload-dropzone {
          border: 2px dashed #d1d5db;
          border-radius: 8px;
          padding: 40px 20px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
          background-color: #f9fafb;
        }

        .upload-dropzone:hover:not(.uploading) {
          border-color: #3b82f6;
          background-color: #eff6ff;
        }

        .upload-dropzone.dragging {
          border-color: #3b82f6;
          background-color: #dbeafe;
        }

        .upload-dropzone.uploading {
          cursor: not-allowed;
          opacity: 0.7;
        }

        .dropzone-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .dropzone-icon {
          font-size: 48px;
        }

        .dropzone-text {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .dropzone-primary {
          font-size: 16px;
          font-weight: 500;
          color: #374151;
        }

        .dropzone-secondary {
          font-size: 14px;
          color: #6b7280;
        }

        .upload-error {
          margin-top: 12px;
          padding: 12px;
          background-color: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 6px;
          color: #dc2626;
          font-size: 14px;
          white-space: pre-line;
        }

        .upload-progress-list {
          margin-top: 16px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          overflow: hidden;
        }

        .progress-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background-color: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
        }

        .clear-button {
          background: none;
          border: none;
          color: #6b7280;
          cursor: pointer;
          font-size: 14px;
        }

        .clear-button:hover {
          color: #374151;
        }

        .upload-progress-item {
          padding: 12px 16px;
          border-bottom: 1px solid #e5e7eb;
        }

        .upload-progress-item:last-child {
          border-bottom: none;
        }

        .progress-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .progress-filename {
          font-size: 14px;
          color: #374151;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 70%;
        }

        .progress-size {
          font-size: 12px;
          color: #6b7280;
        }

        .progress-bar-container {
          height: 6px;
          background-color: #e5e7eb;
          border-radius: 3px;
          overflow: hidden;
        }

        .progress-bar {
          height: 100%;
          transition: width 0.3s ease;
        }

        .progress-status {
          margin-top: 4px;
          font-size: 12px;
          color: #6b7280;
        }

        .error-text {
          color: #dc2626;
        }
      `}</style>
    </div>
  );
}

export default DocumentUpload;
