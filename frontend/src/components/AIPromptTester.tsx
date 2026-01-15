import { useState } from 'react';
import { testAIPrompt } from '../lib/ai-prompts';
import type { AIPromptTemplate, TestPromptResponse, PromptVariable } from '../types/ai-prompt';

interface AIPromptTesterProps {
  prompt: AIPromptTemplate;
  onClose: () => void;
}

export default function AIPromptTester({ prompt, onClose }: AIPromptTesterProps) {
  const [variableValues, setVariableValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    prompt.variables.forEach((v: PromptVariable) => {
      if (v.default_value) {
        initial[v.name] = v.default_value;
      }
    });
    return initial;
  });
  const [sampleContent, setSampleContent] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestPromptResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVariableChange = (name: string, value: string) => {
    setVariableValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleTest = async () => {
    setError(null);
    setTesting(true);

    try {
      const response = await testAIPrompt(prompt.id, {
        variable_values: variableValues,
        sample_content: sampleContent || undefined,
      });
      setResult(response);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to test prompt';
      setError(errorMessage);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content prompt-tester-modal">
        <div className="modal-header">
          <h2>Test: {prompt.name}</h2>
          <button onClick={onClose} className="close-btn">&times;</button>
        </div>

        <div className="tester-content">
          <div className="tester-sidebar">
            <h3>Variables</h3>
            {prompt.variables.length === 0 ? (
              <p className="no-variables">No variables defined</p>
            ) : (
              <div className="variables-form">
                {prompt.variables.map((variable) => (
                  <div key={variable.name} className="variable-input">
                    <label>
                      {`{{${variable.name}}}`}
                      {variable.required && <span className="required">*</span>}
                    </label>
                    {variable.description && (
                      <span className="variable-desc">{variable.description}</span>
                    )}
                    <textarea
                      value={variableValues[variable.name] || ''}
                      onChange={(e) => handleVariableChange(variable.name, e.target.value)}
                      rows={3}
                      placeholder={variable.default_value || `Enter ${variable.name}`}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="sample-content-section">
              <h3>Sample Content (Optional)</h3>
              <p className="hint">Provide sample text to test the prompt with actual content</p>
              <textarea
                value={sampleContent}
                onChange={(e) => setSampleContent(e.target.value)}
                rows={5}
                placeholder="Enter sample demand letter content..."
              />
            </div>

            <button
              onClick={handleTest}
              disabled={testing}
              className="test-button"
            >
              {testing ? 'Testing...' : 'Run Test'}
            </button>
          </div>

          <div className="tester-main">
            {error && (
              <div className="error-message">{error}</div>
            )}

            {result && (
              <div className="test-results">
                <div className="result-section">
                  <h4>Preview - System Prompt</h4>
                  <pre className="prompt-preview">{result.preview.system_prompt}</pre>
                </div>

                <div className="result-section">
                  <h4>Preview - User Prompt</h4>
                  <pre className="prompt-preview">{result.preview.user_prompt}</pre>
                </div>

                <div className="result-section variables-status">
                  <h4>Variable Status</h4>
                  <div className="variable-status-grid">
                    {result.variables.missing.length > 0 && (
                      <div className="status-group status-missing">
                        <span className="status-label">Missing:</span>
                        <span>{result.variables.missing.join(', ')}</span>
                      </div>
                    )}
                    {result.variables.provided.length > 0 && (
                      <div className="status-group status-provided">
                        <span className="status-label">Provided:</span>
                        <span>{result.variables.provided.join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>

                {result.ai_response && (
                  <div className="result-section ai-response">
                    <h4>AI Response</h4>
                    {result.ai_response.error ? (
                      <div className="error-message">{result.ai_response.error}</div>
                    ) : (
                      <>
                        <pre className="ai-output">{result.ai_response.generated_text}</pre>
                        <div className="response-meta">
                          <span>Model: {result.ai_response.model}</span>
                          <span>Tokens: {result.ai_response.tokens_used}</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {!result && !error && (
              <div className="empty-results">
                <p>Configure variables and click "Run Test" to preview the prompt</p>
              </div>
            )}
          </div>
        </div>

        <style>{`
          .prompt-tester-modal {
            width: 95%;
            max-width: 1200px;
            height: 85vh;
            display: flex;
            flex-direction: column;
          }

          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 24px;
            border-bottom: 1px solid #e5e7eb;
            flex-shrink: 0;
          }

          .modal-header h2 {
            margin: 0;
            font-size: 18px;
          }

          .close-btn {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #666;
          }

          .tester-content {
            display: flex;
            flex: 1;
            overflow: hidden;
          }

          .tester-sidebar {
            width: 350px;
            border-right: 1px solid #e5e7eb;
            padding: 20px;
            overflow-y: auto;
            flex-shrink: 0;
          }

          .tester-sidebar h3 {
            margin: 0 0 16px 0;
            font-size: 14px;
            color: #374151;
          }

          .no-variables {
            color: #666;
            font-size: 14px;
          }

          .variables-form {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .variable-input {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .variable-input label {
            font-family: monospace;
            font-size: 13px;
            color: #3b82f6;
          }

          .variable-input .required {
            color: #ef4444;
            margin-left: 4px;
          }

          .variable-desc {
            font-size: 11px;
            color: #666;
          }

          .variable-input textarea {
            padding: 8px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            font-size: 13px;
            font-family: inherit;
            resize: vertical;
          }

          .sample-content-section {
            margin-top: 24px;
          }

          .sample-content-section .hint {
            font-size: 12px;
            color: #666;
            margin: 4px 0 8px 0;
          }

          .sample-content-section textarea {
            width: 100%;
            padding: 8px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            font-size: 13px;
            font-family: inherit;
            resize: vertical;
          }

          .test-button {
            width: 100%;
            margin-top: 20px;
            padding: 12px;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            cursor: pointer;
          }

          .test-button:hover:not(:disabled) {
            background: #2563eb;
          }

          .test-button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .tester-main {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
          }

          .error-message {
            background: #fee2e2;
            border: 1px solid #ef4444;
            color: #dc2626;
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 16px;
          }

          .test-results {
            display: flex;
            flex-direction: column;
            gap: 20px;
          }

          .result-section {
            background: #f9fafb;
            border-radius: 8px;
            padding: 16px;
          }

          .result-section h4 {
            margin: 0 0 12px 0;
            font-size: 14px;
            color: #374151;
          }

          .prompt-preview {
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 4px;
            padding: 12px;
            font-size: 12px;
            font-family: monospace;
            white-space: pre-wrap;
            word-wrap: break-word;
            max-height: 200px;
            overflow-y: auto;
            margin: 0;
          }

          .variable-status-grid {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .status-group {
            display: flex;
            gap: 8px;
            font-size: 13px;
          }

          .status-label {
            font-weight: 500;
          }

          .status-missing {
            color: #dc2626;
          }

          .status-provided {
            color: #16a34a;
          }

          .ai-response .ai-output {
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 4px;
            padding: 12px;
            font-size: 13px;
            font-family: inherit;
            white-space: pre-wrap;
            word-wrap: break-word;
            max-height: 300px;
            overflow-y: auto;
            margin: 0 0 12px 0;
          }

          .response-meta {
            display: flex;
            gap: 16px;
            font-size: 12px;
            color: #666;
          }

          .empty-results {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: #666;
            text-align: center;
          }
        `}</style>
      </div>
    </div>
  );
}
