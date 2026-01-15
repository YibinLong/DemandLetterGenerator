import { useState, useMemo, useCallback } from 'react';
import { getPlaceholderDisplayName, replacePlaceholders } from '../lib/templates';
import type { Template } from '../types/template';

interface TemplatePreviewProps {
  template: Template;
  onClose?: () => void;
  onUseTemplate?: (template: Template) => void;
}

export function TemplatePreview({ template, onClose, onUseTemplate }: TemplatePreviewProps) {
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);

  // Calculate filled/missing placeholders
  const filledPlaceholders = useMemo(() => {
    return template.placeholders.filter(p => placeholderValues[p]?.trim());
  }, [template.placeholders, placeholderValues]);

  const missingPlaceholders = useMemo(() => {
    return template.placeholders.filter(p => !placeholderValues[p]?.trim());
  }, [template.placeholders, placeholderValues]);

  // Local preview (no API call needed for basic preview)
  const previewContent = useMemo(() => {
    if (!showPreview) return template.content;
    return replacePlaceholders(template.content, placeholderValues);
  }, [template.content, placeholderValues, showPreview]);

  const handleValueChange = useCallback((placeholder: string, value: string) => {
    setPlaceholderValues(prev => ({
      ...prev,
      [placeholder]: value,
    }));
  }, []);

  const clearAllValues = useCallback(() => {
    setPlaceholderValues({});
  }, []);

  const fillSampleValues = useCallback(() => {
    const sampleValues: Record<string, string> = {
      current_date: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      client_name: 'John Smith',
      recipient_name: 'Jane Doe',
      recipient_address: '123 Main Street, Suite 400\nNew York, NY 10001',
      case_reference: 'CASE-2026-001',
      incident_date: 'January 15, 2026',
      demand_amount: '150,000.00',
      attorney_name: 'Sarah Jones, Esq.',
      firm_name: 'Anderson & Associates Law Firm',
      claim_number: 'CLM-2026-00123',
      insurance_company: 'ABC Insurance Co.',
      adjuster_name: 'Michael Brown',
      insurance_address: '456 Corporate Blvd\nLos Angeles, CA 90001',
      at_fault_party: 'Robert Williams',
      accident_description: 'On the above date, our client was traveling westbound on Main Street when the defendant failed to stop at a red light, striking our client\'s vehicle on the driver\'s side.',
      injuries_description: 'As a direct result of this collision, our client sustained: cervical strain, lumbar strain, left shoulder contusion, and post-traumatic stress.',
      malpractice_description: 'The defendant physician failed to diagnose a clear case of appendicitis, resulting in rupture and subsequent peritonitis.',
      damages_description: 'Medical expenses totaling $45,000, lost wages of $25,000, and significant pain and suffering.',
      hospital_name: 'City General Hospital',
      medical_expenses: '45,000.00',
      lost_wages: '25,000.00',
      pain_and_suffering: '80,000.00',
      incident_description: 'The incident occurred when the defendant\'s employee negligently failed to maintain safe premises, resulting in our client\'s fall.',
      liability_analysis: 'The defendant breached their duty of care by failing to maintain safe conditions, directly causing our client\'s injuries.',
    };

    const values: Record<string, string> = {};
    for (const placeholder of template.placeholders) {
      if (sampleValues[placeholder]) {
        values[placeholder] = sampleValues[placeholder];
      } else {
        values[placeholder] = `[${getPlaceholderDisplayName(placeholder)}]`;
      }
    }
    setPlaceholderValues(values);
  }, [template.placeholders]);

  return (
    <div className="template-preview">
      <div className="preview-header">
        <div>
          <h2>{template.name}</h2>
          {template.description && (
            <p className="template-description">{template.description}</p>
          )}
        </div>
        <div className="header-actions">
          {onUseTemplate && (
            <button onClick={() => onUseTemplate(template)} className="use-button">
              Use This Template
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="close-button">
              Close
            </button>
          )}
        </div>
      </div>

      <div className="preview-layout">
        {/* Placeholder values panel */}
        <div className="values-panel">
          <div className="panel-header">
            <h3>Placeholder Values</h3>
            <div className="panel-actions">
              <button onClick={fillSampleValues} className="sample-button">
                Fill Sample
              </button>
              <button onClick={clearAllValues} className="clear-button">
                Clear All
              </button>
            </div>
          </div>

          {template.placeholders.length === 0 ? (
            <div className="no-placeholders">
              This template has no placeholders.
            </div>
          ) : (
            <div className="placeholders-form">
              {template.placeholders.map(placeholder => (
                <div key={placeholder} className="placeholder-field">
                  <label htmlFor={`ph-${placeholder}`}>
                    {getPlaceholderDisplayName(placeholder)}
                    <span className="placeholder-code">{'{{' + placeholder + '}}'}</span>
                  </label>
                  {placeholder.includes('description') || placeholder.includes('address') ? (
                    <textarea
                      id={`ph-${placeholder}`}
                      value={placeholderValues[placeholder] || ''}
                      onChange={(e) => handleValueChange(placeholder, e.target.value)}
                      placeholder={`Enter ${getPlaceholderDisplayName(placeholder).toLowerCase()}...`}
                      rows={3}
                    />
                  ) : (
                    <input
                      id={`ph-${placeholder}`}
                      type="text"
                      value={placeholderValues[placeholder] || ''}
                      onChange={(e) => handleValueChange(placeholder, e.target.value)}
                      placeholder={`Enter ${getPlaceholderDisplayName(placeholder).toLowerCase()}...`}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="placeholder-stats">
            <span className="stat filled">
              {filledPlaceholders.length} filled
            </span>
            <span className="stat missing">
              {missingPlaceholders.length} missing
            </span>
          </div>
        </div>

        {/* Preview content panel */}
        <div className="content-panel">
          <div className="panel-header">
            <h3>Preview</h3>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showPreview}
                onChange={(e) => setShowPreview(e.target.checked)}
              />
              <span>Apply placeholder values</span>
            </label>
          </div>

          <div className="content-display">
            <pre>{previewContent}</pre>
          </div>
        </div>
      </div>

      <style>{`
        .template-preview {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .preview-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 20px;
          border-bottom: 1px solid #e5e7eb;
          background: white;
        }

        .preview-header h2 {
          margin: 0 0 4px;
          font-size: 20px;
          color: #111827;
        }

        .template-description {
          margin: 0;
          font-size: 14px;
          color: #6b7280;
        }

        .header-actions {
          display: flex;
          gap: 12px;
        }

        .use-button {
          padding: 10px 20px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }

        .use-button:hover {
          background: #2563eb;
        }

        .close-button {
          padding: 10px 20px;
          background: transparent;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          color: #6b7280;
          font-size: 14px;
          cursor: pointer;
        }

        .close-button:hover {
          background: #f9fafb;
        }

        .preview-layout {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .values-panel {
          width: 350px;
          border-right: 1px solid #e5e7eb;
          background: #f9fafb;
          display: flex;
          flex-direction: column;
        }

        .content-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: white;
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid #e5e7eb;
        }

        .panel-header h3 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
        }

        .panel-actions {
          display: flex;
          gap: 8px;
        }

        .sample-button,
        .clear-button {
          padding: 6px 12px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
        }

        .sample-button:hover {
          background: #eff6ff;
          border-color: #3b82f6;
          color: #2563eb;
        }

        .clear-button:hover {
          background: #fef2f2;
          border-color: #fecaca;
          color: #dc2626;
        }

        .no-placeholders {
          padding: 24px 20px;
          text-align: center;
          color: #6b7280;
          font-size: 14px;
        }

        .placeholders-form {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
        }

        .placeholder-field {
          margin-bottom: 16px;
        }

        .placeholder-field label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
          font-size: 13px;
          font-weight: 500;
          color: #374151;
        }

        .placeholder-code {
          font-family: monospace;
          font-size: 10px;
          color: #9ca3af;
          background: #e5e7eb;
          padding: 2px 6px;
          border-radius: 3px;
        }

        .placeholder-field input,
        .placeholder-field textarea {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 13px;
          font-family: inherit;
          box-sizing: border-box;
        }

        .placeholder-field input:focus,
        .placeholder-field textarea:focus {
          outline: none;
          border-color: #3b82f6;
        }

        .placeholder-field textarea {
          resize: vertical;
          min-height: 60px;
        }

        .placeholder-stats {
          display: flex;
          justify-content: center;
          gap: 16px;
          padding: 12px 20px;
          border-top: 1px solid #e5e7eb;
          background: white;
        }

        .stat {
          font-size: 13px;
          padding: 4px 12px;
          border-radius: 12px;
        }

        .stat.filled {
          background: #d1fae5;
          color: #059669;
        }

        .stat.missing {
          background: #fef3c7;
          color: #d97706;
        }

        .toggle-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #6b7280;
          cursor: pointer;
        }

        .toggle-label input {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }

        .content-display {
          flex: 1;
          overflow: auto;
          padding: 20px;
        }

        .content-display pre {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: #374151;
          white-space: pre-wrap;
          word-wrap: break-word;
        }

        @media (max-width: 768px) {
          .preview-layout {
            flex-direction: column;
          }

          .values-panel {
            width: 100%;
            border-right: none;
            border-bottom: 1px solid #e5e7eb;
            max-height: 40vh;
          }

          .preview-header {
            flex-direction: column;
            gap: 12px;
          }

          .header-actions {
            width: 100%;
          }

          .use-button,
          .close-button {
            flex: 1;
          }
        }
      `}</style>
    </div>
  );
}

export default TemplatePreview;
