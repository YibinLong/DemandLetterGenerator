import { useState, useEffect, useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createTemplate,
  updateTemplate,
  extractPlaceholders,
  getPlaceholderDisplayName,
} from '../lib/templates';
import type { Template, CreateTemplateRequest, UpdateTemplateRequest } from '../types/template';
import { TEMPLATE_CATEGORIES } from '../types/template';

interface TemplateEditorProps {
  template?: Template | null;
  onSave?: (template: Template) => void;
  onCancel?: () => void;
}

export function TemplateEditor({ template, onSave, onCancel }: TemplateEditorProps) {
  const queryClient = useQueryClient();
  const isEditing = !!template;

  // Form state
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [content, setContent] = useState(template?.content || '');
  const [category, setCategory] = useState(template?.category || '');
  const [isShared, setIsShared] = useState(template?.is_shared || false);
  const [error, setError] = useState<string | null>(null);

  // Extract placeholders from content
  const placeholders = useMemo(() => extractPlaceholders(content), [content]);

  // Reset form when template changes
  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description || '');
      setContent(template.content);
      setCategory(template.category || '');
      setIsShared(template.is_shared);
    } else {
      setName('');
      setDescription('');
      setContent('');
      setCategory('');
      setIsShared(false);
    }
    setError(null);
  }, [template]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateTemplateRequest) => createTemplate(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      onSave?.(data);
    },
    onError: (err: Error & { response?: { data?: { error?: string } } }) => {
      setError(err.response?.data?.error || err.message || 'Failed to create template');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTemplateRequest }) =>
      updateTemplate(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      onSave?.(data);
    },
    onError: (err: Error & { response?: { data?: { error?: string } } }) => {
      setError(err.response?.data?.error || err.message || 'Failed to update template');
    },
  });

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }

    if (!content.trim()) {
      setError('Template content is required');
      return;
    }

    const data = {
      name: name.trim(),
      description: description.trim() || undefined,
      content: content,
      category: category || undefined,
      is_shared: isShared,
    };

    if (isEditing && template) {
      updateMutation.mutate({ id: template.id, data });
    } else {
      createMutation.mutate(data);
    }
  }, [name, description, content, category, isShared, isEditing, template, createMutation, updateMutation]);

  const insertPlaceholder = useCallback((placeholder: string) => {
    const textarea = document.getElementById('template-content') as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = content.substring(0, start);
      const after = content.substring(end);
      const newContent = `${before}{{${placeholder}}}${after}`;
      setContent(newContent);
      // Set cursor position after inserted placeholder
      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = start + placeholder.length + 4;
        textarea.selectionEnd = start + placeholder.length + 4;
      }, 0);
    }
  }, [content]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  // Common placeholders for quick insert
  const commonPlaceholders = [
    'current_date',
    'client_name',
    'recipient_name',
    'recipient_address',
    'case_reference',
    'incident_date',
    'demand_amount',
    'attorney_name',
    'firm_name',
  ];

  return (
    <div className="template-editor">
      <div className="editor-header">
        <h2>{isEditing ? 'Edit Template' : 'Create New Template'}</h2>
        {onCancel && (
          <button onClick={onCancel} className="cancel-button" type="button">
            Cancel
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="editor-form">
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="form-row">
          <div className="form-group flex-1">
            <label htmlFor="template-name">Template Name *</label>
            <input
              id="template-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Personal Injury Demand Letter"
              maxLength={200}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="template-category">Category</label>
            <select
              id="template-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Select category...</option>
              {TEMPLATE_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="template-description">Description</label>
          <input
            id="template-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of when to use this template"
          />
        </div>

        <div className="form-group content-group">
          <label htmlFor="template-content">Template Content *</label>
          <div className="content-toolbar">
            <span className="toolbar-label">Insert placeholder:</span>
            {commonPlaceholders.map(p => (
              <button
                key={p}
                type="button"
                className="placeholder-button"
                onClick={() => insertPlaceholder(p)}
                title={`Insert {{${p}}}`}
              >
                {getPlaceholderDisplayName(p)}
              </button>
            ))}
          </div>
          <textarea
            id="template-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`Enter your template content here. Use {{placeholder_name}} syntax for dynamic fields.

Example:
Dear {{recipient_name}},

This firm represents {{client_name}} regarding injuries sustained on {{incident_date}}...`}
            rows={20}
            required
          />
          <div className="content-footer">
            <span className="char-count">{content.length} characters</span>
          </div>
        </div>

        {placeholders.length > 0 && (
          <div className="placeholders-preview">
            <h4>Detected Placeholders ({placeholders.length})</h4>
            <div className="placeholder-tags">
              {placeholders.map(p => (
                <span key={p} className="placeholder-tag">
                  {getPlaceholderDisplayName(p)}
                  <span className="placeholder-code">{'{{' + p + '}}'}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="form-group checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={isShared}
              onChange={(e) => setIsShared(e.target.checked)}
            />
            <span>Share with firm</span>
          </label>
          <p className="checkbox-help">
            Shared templates are visible to all members of your firm.
            {isShared && !isEditing && ' An admin must approve the template before it can be used firm-wide.'}
          </p>
        </div>

        <div className="form-actions">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="secondary-button"
              disabled={isPending}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="primary-button"
            disabled={isPending}
          >
            {isPending ? (
              <>
                <span className="spinner" />
                {isEditing ? 'Saving...' : 'Creating...'}
              </>
            ) : (
              isEditing ? 'Save Changes' : 'Create Template'
            )}
          </button>
        </div>
      </form>

      <style>{`
        .template-editor {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 900px;
          margin: 0 auto;
        }

        .editor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .editor-header h2 {
          margin: 0;
          font-size: 24px;
          color: #111827;
        }

        .cancel-button {
          padding: 8px 16px;
          background: transparent;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          color: #6b7280;
          font-size: 14px;
          cursor: pointer;
        }

        .cancel-button:hover {
          background: #f9fafb;
        }

        .editor-form {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 24px;
        }

        .error-message {
          padding: 12px 16px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 6px;
          color: #dc2626;
          font-size: 14px;
          margin-bottom: 20px;
        }

        .form-row {
          display: flex;
          gap: 16px;
          margin-bottom: 20px;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group.flex-1 {
          flex: 1;
        }

        .form-group label {
          display: block;
          margin-bottom: 6px;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
        }

        .form-group input[type="text"],
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: 10px 14px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
          box-sizing: border-box;
        }

        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .content-group {
          margin-bottom: 0;
        }

        .content-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 12px;
          background: #f9fafb;
          border: 1px solid #d1d5db;
          border-bottom: none;
          border-radius: 6px 6px 0 0;
          align-items: center;
        }

        .toolbar-label {
          font-size: 12px;
          color: #6b7280;
          margin-right: 4px;
        }

        .placeholder-button {
          padding: 4px 8px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 12px;
          color: #374151;
          cursor: pointer;
        }

        .placeholder-button:hover {
          background: #eff6ff;
          border-color: #3b82f6;
          color: #2563eb;
        }

        .content-group textarea {
          border-radius: 0;
          border-top: none;
          font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
          font-size: 13px;
          line-height: 1.6;
          resize: vertical;
          min-height: 300px;
        }

        .content-footer {
          display: flex;
          justify-content: flex-end;
          padding: 8px 12px;
          background: #f9fafb;
          border: 1px solid #d1d5db;
          border-top: none;
          border-radius: 0 0 6px 6px;
        }

        .char-count {
          font-size: 12px;
          color: #9ca3af;
        }

        .placeholders-preview {
          margin-bottom: 20px;
          padding: 16px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 6px;
        }

        .placeholders-preview h4 {
          margin: 0 0 12px;
          font-size: 14px;
          font-weight: 500;
          color: #166534;
        }

        .placeholder-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .placeholder-tag {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          background: white;
          border: 1px solid #86efac;
          border-radius: 6px;
          font-size: 13px;
          color: #15803d;
        }

        .placeholder-code {
          font-family: monospace;
          font-size: 11px;
          color: #6b7280;
          background: #f3f4f6;
          padding: 2px 4px;
          border-radius: 3px;
        }

        .checkbox-group {
          padding: 16px;
          background: #f9fafb;
          border-radius: 6px;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          font-weight: 500;
        }

        .checkbox-label input {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .checkbox-help {
          margin: 8px 0 0 28px;
          font-size: 13px;
          color: #6b7280;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
        }

        .secondary-button {
          padding: 10px 20px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
        }

        .secondary-button:hover:not(:disabled) {
          background: #f9fafb;
        }

        .secondary-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .primary-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 24px;
          background: #3b82f6;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          color: white;
          cursor: pointer;
        }

        .primary-button:hover:not(:disabled) {
          background: #2563eb;
        }

        .primary-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 640px) {
          .form-row {
            flex-direction: column;
          }

          .editor-header {
            flex-direction: column;
            gap: 12px;
            align-items: stretch;
          }

          .form-actions {
            flex-direction: column;
          }

          .primary-button,
          .secondary-button {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}

export default TemplateEditor;
