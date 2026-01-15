import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getExportOptions,
  exportDemandLetterToWord,
  downloadBlob,
  sanitizeFilename,
} from '../lib/demand-letters';
import type { ExportOptions } from '../types/demand-letter';

interface ExportDialogProps {
  letterId: string;
  letterTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ExportDialog({ letterId, letterTitle, isOpen, onClose }: ExportDialogProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [options, setOptions] = useState<ExportOptions>({});

  // Fetch export options
  const { data: exportOptionsData } = useQuery({
    queryKey: ['exportOptions'],
    queryFn: getExportOptions,
    enabled: isOpen,
  });

  // Set defaults when data loads
  useEffect(() => {
    if (exportOptionsData?.defaults) {
      setOptions(exportOptionsData.defaults);
    }
  }, [exportOptionsData]);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setError(null);

    try {
      const blob = await exportDemandLetterToWord(letterId, options);
      const filename = sanitizeFilename(letterTitle) + '.docx';
      downloadBlob(blob, filename);
      onClose();
    } catch (err) {
      console.error('Export failed:', err);
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [letterId, letterTitle, options, onClose]);

  const updateOption = useCallback(<K extends keyof ExportOptions>(
    key: K,
    value: ExportOptions[K]
  ) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  }, []);

  if (!isOpen) return null;

  return (
    <div className="export-dialog-overlay" onClick={onClose}>
      <div className="export-dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Export to Word</h2>
          <button className="close-button" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="dialog-content">
          <p className="dialog-description">
            Export "{letterTitle}" as a Word document (.docx)
          </p>

          {/* Quick Options */}
          <div className="option-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={options.include_letterhead ?? false}
                onChange={e => updateOption('include_letterhead', e.target.checked)}
              />
              Include firm letterhead
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={options.include_page_numbers ?? true}
                onChange={e => updateOption('include_page_numbers', e.target.checked)}
              />
              Include page numbers
            </label>
          </div>

          {/* Advanced Options Toggle */}
          <button
            className="advanced-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? '▼' : '▶'} Advanced Options
          </button>

          {/* Advanced Options */}
          {showAdvanced && (
            <div className="advanced-options">
              <div className="option-row">
                <label>Font</label>
                <select
                  value={options.font_name ?? 'Times New Roman'}
                  onChange={e => updateOption('font_name', e.target.value)}
                >
                  {(exportOptionsData?.fonts ?? ['Times New Roman', 'Arial', 'Calibri']).map(font => (
                    <option key={font} value={font}>{font}</option>
                  ))}
                </select>
              </div>

              <div className="option-row">
                <label>Font Size</label>
                <select
                  value={options.font_size ?? 12}
                  onChange={e => updateOption('font_size', parseInt(e.target.value))}
                >
                  {(exportOptionsData?.font_sizes ?? [10, 11, 12, 14]).map(size => (
                    <option key={size} value={size}>{size} pt</option>
                  ))}
                </select>
              </div>

              <div className="option-row">
                <label>Line Spacing</label>
                <select
                  value={options.line_spacing ?? 1.0}
                  onChange={e => updateOption('line_spacing', parseFloat(e.target.value))}
                >
                  {(exportOptionsData?.line_spacing_options ?? [1.0, 1.15, 1.5, 2.0]).map(spacing => (
                    <option key={spacing} value={spacing}>
                      {spacing === 1.0 ? 'Single' :
                       spacing === 1.5 ? '1.5 lines' :
                       spacing === 2.0 ? 'Double' :
                       `${spacing}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="margin-options">
                <label>Margins (inches)</label>
                <div className="margin-grid">
                  <div className="margin-input">
                    <span>Top</span>
                    <input
                      type="number"
                      min={0.5}
                      max={2}
                      step={0.25}
                      value={options.margin_top ?? 1.0}
                      onChange={e => updateOption('margin_top', parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="margin-input">
                    <span>Bottom</span>
                    <input
                      type="number"
                      min={0.5}
                      max={2}
                      step={0.25}
                      value={options.margin_bottom ?? 1.0}
                      onChange={e => updateOption('margin_bottom', parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="margin-input">
                    <span>Left</span>
                    <input
                      type="number"
                      min={0.5}
                      max={2}
                      step={0.25}
                      value={options.margin_left ?? 1.0}
                      onChange={e => updateOption('margin_left', parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="margin-input">
                    <span>Right</span>
                    <input
                      type="number"
                      min={0.5}
                      max={2}
                      step={0.25}
                      value={options.margin_right ?? 1.0}
                      onChange={e => updateOption('margin_right', parseFloat(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              {/* Letterhead Options */}
              {options.include_letterhead && (
                <div className="letterhead-options">
                  <label>Letterhead Details</label>
                  {exportOptionsData?.firm_letterhead ? (
                    <div className="firm-info">
                      <p>Using firm information:</p>
                      <div className="firm-preview">
                        <strong>{exportOptionsData.firm_letterhead.firm_name}</strong>
                        {exportOptionsData.firm_letterhead.address && (
                          <span>{exportOptionsData.firm_letterhead.address}</span>
                        )}
                        {exportOptionsData.firm_letterhead.phone && (
                          <span>Tel: {exportOptionsData.firm_letterhead.phone}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="letterhead-inputs">
                      <input
                        type="text"
                        placeholder="Firm Name"
                        value={options.letterhead_firm_name ?? ''}
                        onChange={e => updateOption('letterhead_firm_name', e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="Address"
                        value={options.letterhead_address ?? ''}
                        onChange={e => updateOption('letterhead_address', e.target.value)}
                      />
                      <div className="contact-row">
                        <input
                          type="text"
                          placeholder="Phone"
                          value={options.letterhead_phone ?? ''}
                          onChange={e => updateOption('letterhead_phone', e.target.value)}
                        />
                        <input
                          type="text"
                          placeholder="Email"
                          value={options.letterhead_email ?? ''}
                          onChange={e => updateOption('letterhead_email', e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="export-error">
              {error}
            </div>
          )}
        </div>

        <div className="dialog-actions">
          <button onClick={onClose} className="cancel-button" disabled={isExporting}>
            Cancel
          </button>
          <button onClick={handleExport} className="export-button" disabled={isExporting}>
            {isExporting ? 'Exporting...' : 'Export to Word'}
          </button>
        </div>

        <style>{`
          .export-dialog-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }

          .export-dialog {
            background: white;
            border-radius: 12px;
            width: 90%;
            max-width: 480px;
            max-height: 90vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }

          .dialog-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 20px;
            border-bottom: 1px solid #e5e7eb;
          }

          .dialog-header h2 {
            margin: 0;
            font-size: 18px;
            color: #111827;
          }

          .close-button {
            width: 32px;
            height: 32px;
            border: none;
            background: transparent;
            font-size: 24px;
            color: #6b7280;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
          }

          .close-button:hover {
            background: #f3f4f6;
          }

          .dialog-content {
            padding: 20px;
            overflow-y: auto;
            flex: 1;
          }

          .dialog-description {
            margin: 0 0 20px;
            color: #6b7280;
            font-size: 14px;
          }

          .option-group {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 20px;
          }

          .checkbox-label {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 14px;
            color: #374151;
            cursor: pointer;
          }

          .checkbox-label input {
            width: 18px;
            height: 18px;
            cursor: pointer;
          }

          .advanced-toggle {
            width: 100%;
            padding: 10px 0;
            background: transparent;
            border: none;
            font-size: 14px;
            color: #6b7280;
            cursor: pointer;
            text-align: left;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .advanced-toggle:hover {
            color: #374151;
          }

          .advanced-options {
            margin-top: 16px;
            padding: 16px;
            background: #f9fafb;
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .option-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
          }

          .option-row label {
            font-size: 14px;
            color: #374151;
          }

          .option-row select {
            padding: 8px 12px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
            background: white;
            min-width: 150px;
          }

          .margin-options label {
            display: block;
            font-size: 14px;
            color: #374151;
            margin-bottom: 8px;
          }

          .margin-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
          }

          .margin-input {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .margin-input span {
            font-size: 12px;
            color: #6b7280;
          }

          .margin-input input {
            padding: 6px 8px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            font-size: 14px;
            width: 100%;
          }

          .letterhead-options {
            margin-top: 8px;
          }

          .letterhead-options > label {
            display: block;
            font-size: 14px;
            color: #374151;
            margin-bottom: 8px;
          }

          .firm-info {
            padding: 12px;
            background: white;
            border-radius: 6px;
            border: 1px solid #e5e7eb;
          }

          .firm-info p {
            margin: 0 0 8px;
            font-size: 12px;
            color: #6b7280;
          }

          .firm-preview {
            display: flex;
            flex-direction: column;
            gap: 2px;
            font-size: 14px;
            color: #374151;
          }

          .letterhead-inputs {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .letterhead-inputs input {
            padding: 8px 12px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
          }

          .contact-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
          }

          .export-error {
            margin-top: 16px;
            padding: 12px;
            background: #fef2f2;
            border-radius: 6px;
            color: #dc2626;
            font-size: 14px;
          }

          .dialog-actions {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            padding: 16px 20px;
            border-top: 1px solid #e5e7eb;
          }

          .cancel-button {
            padding: 10px 20px;
            background: white;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
            cursor: pointer;
          }

          .cancel-button:hover:not(:disabled) {
            background: #f9fafb;
          }

          .export-button {
            padding: 10px 24px;
            background: #10b981;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
          }

          .export-button:hover:not(:disabled) {
            background: #059669;
          }

          .export-button:disabled,
          .cancel-button:disabled {
            opacity: 0.7;
            cursor: not-allowed;
          }

          @media (max-width: 480px) {
            .export-dialog {
              width: 100%;
              max-width: 100%;
              max-height: 100%;
              border-radius: 0;
            }

            .margin-grid {
              grid-template-columns: repeat(2, 1fr);
            }
          }
        `}</style>
      </div>
    </div>
  );
}

export default ExportDialog;
