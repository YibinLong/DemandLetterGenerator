import { useState, useEffect } from 'react';
import type {
  AIPromptTemplate,
  PromptType,
  PromptCategory,
  PromptVariable,
  CreateAIPromptRequest,
  UpdateAIPromptRequest,
} from '../types/ai-prompt';

const PROMPT_TYPES: PromptType[] = ['refinement', 'generation', 'analysis'];
const PROMPT_CATEGORIES: PromptCategory[] = [
  'Tone & Style',
  'Content Enhancement',
  'Legal Specific',
  'Formatting',
  'Summarization',
  'Custom',
];

interface AIPromptEditorProps {
  prompt: AIPromptTemplate | null;
  onSave: (data: CreateAIPromptRequest | UpdateAIPromptRequest) => Promise<void>;
  onClose: () => void;
}

export default function AIPromptEditor({ prompt, onSave, onClose }: AIPromptEditorProps) {
  const isEditing = !!prompt;

  const [name, setName] = useState(prompt?.name || '');
  const [description, setDescription] = useState(prompt?.description || '');
  const [promptType, setPromptType] = useState<PromptType>(prompt?.prompt_type || 'refinement');
  const [category, setCategory] = useState<PromptCategory | ''>(prompt?.category || '');
  const [systemPrompt, setSystemPrompt] = useState(prompt?.system_prompt || '');
  const [userPromptTemplate, setUserPromptTemplate] = useState(prompt?.user_prompt_template || '');
  const [variables, setVariables] = useState<PromptVariable[]>(prompt?.variables || []);
  const [isShared, setIsShared] = useState(prompt?.is_shared || false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extract variables from prompts
  useEffect(() => {
    const extractedVars = extractVariables(systemPrompt, userPromptTemplate);
    const existingMap = new Map(variables.map((v) => [v.name, v]));

    const newVariables = extractedVars.map((name) => {
      if (existingMap.has(name)) {
        return existingMap.get(name)!;
      }
      return { name, description: '', required: true };
    });

    setVariables(newVariables);
  }, [systemPrompt, userPromptTemplate]);

  const extractVariables = (system: string, user: string): string[] => {
    const regex = /\{\{([^}]+)\}\}/g;
    const vars = new Set<string>();
    let match;
    while ((match = regex.exec(system)) !== null) vars.add(match[1].trim());
    while ((match = regex.exec(user)) !== null) vars.add(match[1].trim());
    return Array.from(vars);
  };

  const handleVariableChange = (index: number, field: keyof PromptVariable, value: string | boolean) => {
    const updated = [...variables];
    updated[index] = { ...updated[index], [field]: value };
    setVariables(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!systemPrompt.trim()) {
      setError('System prompt is required');
      return;
    }
    if (!userPromptTemplate.trim()) {
      setError('User prompt template is required');
      return;
    }

    try {
      setSaving(true);
      const data: CreateAIPromptRequest | UpdateAIPromptRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        prompt_type: promptType,
        system_prompt: systemPrompt,
        user_prompt_template: userPromptTemplate,
        variables,
        category: category || undefined,
        is_shared: isShared,
      };
      await onSave(data);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save prompt';
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content prompt-editor-modal">
        <div className="modal-header">
          <h2>{isEditing ? 'Edit Prompt Template' : 'Create Prompt Template'}</h2>
          <button onClick={onClose} className="close-btn">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="prompt-editor-form">
          {error && (
            <div className="error-message">{error}</div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Make More Assertive"
                maxLength={200}
              />
            </div>

            <div className="form-group">
              <label>Type *</label>
              <select value={promptType} onChange={(e) => setPromptType(e.target.value as PromptType)}>
                {PROMPT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as PromptCategory | '')}>
                <option value="">Select category</option>
                {PROMPT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this prompt does"
            />
          </div>

          <div className="form-group">
            <label>System Prompt *</label>
            <div className="prompt-hint">
              Defines the AI's role and guidelines. Use {'{{variable_name}}'} for placeholders.
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={8}
              placeholder="You are an expert legal writing assistant..."
            />
          </div>

          <div className="form-group">
            <label>User Prompt Template *</label>
            <div className="prompt-hint">
              The prompt sent to the AI. Use {'{{current_draft}}'}, {'{{instructions}}'}, etc.
            </div>
            <textarea
              value={userPromptTemplate}
              onChange={(e) => setUserPromptTemplate(e.target.value)}
              rows={8}
              placeholder="Please refine the following demand letter..."
            />
          </div>

          {variables.length > 0 && (
            <div className="variables-section">
              <h3>Variables ({variables.length})</h3>
              <div className="variables-list">
                {variables.map((variable, index) => (
                  <div key={variable.name} className="variable-item">
                    <span className="variable-name">{`{{${variable.name}}}`}</span>
                    <input
                      type="text"
                      placeholder="Description"
                      value={variable.description}
                      onChange={(e) => handleVariableChange(index, 'description', e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Default value"
                      value={variable.default_value || ''}
                      onChange={(e) => handleVariableChange(index, 'default_value', e.target.value)}
                    />
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={variable.required}
                        onChange={(e) => handleVariableChange(index, 'required', e.target.checked)}
                      />
                      Required
                    </label>
                  </div>
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
              Share with firm members
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : isEditing ? 'Update Prompt' : 'Create Prompt'}
            </button>
          </div>
        </form>

        <style>{`
          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }

          .modal-content {
            background: white;
            border-radius: 12px;
            width: 90%;
            max-width: 900px;
            max-height: 90vh;
            overflow-y: auto;
          }

          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 24px;
            border-bottom: 1px solid #e5e7eb;
          }

          .modal-header h2 {
            margin: 0;
            font-size: 20px;
          }

          .close-btn {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #666;
          }

          .prompt-editor-form {
            padding: 24px;
          }

          .error-message {
            background: #fee2e2;
            border: 1px solid #ef4444;
            color: #dc2626;
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 16px;
          }

          .form-row {
            display: grid;
            grid-template-columns: 1fr 150px 180px;
            gap: 16px;
            margin-bottom: 16px;
          }

          .form-group {
            margin-bottom: 16px;
          }

          .form-group label {
            display: block;
            font-weight: 500;
            margin-bottom: 6px;
            font-size: 14px;
          }

          .form-group input[type="text"],
          .form-group select,
          .form-group textarea {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
            font-family: inherit;
          }

          .form-group textarea {
            font-family: monospace;
            resize: vertical;
          }

          .prompt-hint {
            font-size: 12px;
            color: #666;
            margin-bottom: 8px;
          }

          .variables-section {
            background: #f9fafb;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 16px;
          }

          .variables-section h3 {
            margin: 0 0 12px 0;
            font-size: 14px;
          }

          .variables-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .variable-item {
            display: grid;
            grid-template-columns: 140px 1fr 140px auto;
            gap: 12px;
            align-items: center;
          }

          .variable-name {
            font-family: monospace;
            font-size: 13px;
            color: #3b82f6;
          }

          .variable-item input[type="text"] {
            padding: 6px 10px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            font-size: 13px;
          }

          .checkbox-group {
            margin-bottom: 24px;
          }

          .checkbox-label {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            font-size: 14px;
          }

          .modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            padding-top: 16px;
            border-top: 1px solid #e5e7eb;
          }

          .btn-primary {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
          }

          .btn-primary:hover:not(:disabled) {
            background: #2563eb;
          }

          .btn-primary:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .btn-secondary {
            background: white;
            color: #374151;
            border: 1px solid #d1d5db;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
          }

          .btn-secondary:hover {
            background: #f3f4f6;
          }
        `}</style>
      </div>
    </div>
  );
}
