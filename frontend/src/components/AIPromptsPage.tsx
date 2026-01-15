import { useState, useEffect } from 'react';
import {
  listAIPrompts,
  getAIPrompt,
  createAIPrompt,
  updateAIPrompt,
  deleteAIPrompt,
  duplicateAIPrompt,
  seedDefaultAIPrompts,
  formatPromptType,
  getPromptTypeColor,
  getCategoryColor,
} from '../lib/ai-prompts';
import type {
  AIPromptTemplate,
  AIPromptTemplateListItem,
  PromptType,
  PromptCategory,
  CreateAIPromptRequest,
  UpdateAIPromptRequest,
} from '../types/ai-prompt';
import AIPromptEditor from './AIPromptEditor';
import AIPromptTester from './AIPromptTester';

const PROMPT_TYPES: PromptType[] = ['refinement', 'generation', 'analysis'];
const PROMPT_CATEGORIES: PromptCategory[] = [
  'Tone & Style',
  'Content Enhancement',
  'Legal Specific',
  'Formatting',
  'Summarization',
  'Custom',
];

export default function AIPromptsPage() {
  const [prompts, setPrompts] = useState<AIPromptTemplateListItem[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<AIPromptTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showTester, setShowTester] = useState(false);
  const [editMode, setEditMode] = useState<'create' | 'edit'>('create');
  const [filterType, setFilterType] = useState<PromptType | ''>('');
  const [filterCategory, setFilterCategory] = useState<PromptCategory | ''>('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadPrompts();
  }, [filterType, filterCategory, searchQuery]);

  const loadPrompts = async () => {
    try {
      setLoading(true);
      const response = await listAIPrompts({
        prompt_type: filterType || undefined,
        category: filterCategory || undefined,
        search: searchQuery || undefined,
        include_defaults: true,
      });
      setPrompts(response.prompts);
      setError(null);
    } catch (err) {
      setError('Failed to load AI prompt templates');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPrompt = async (id: string) => {
    try {
      const prompt = await getAIPrompt(id);
      setSelectedPrompt(prompt);
    } catch (err) {
      setError('Failed to load prompt details');
      console.error(err);
    }
  };

  const handleCreatePrompt = () => {
    setSelectedPrompt(null);
    setEditMode('create');
    setShowEditor(true);
  };

  const handleEditPrompt = (prompt: AIPromptTemplate) => {
    setSelectedPrompt(prompt);
    setEditMode('edit');
    setShowEditor(true);
  };

  const handleDuplicatePrompt = async (prompt: AIPromptTemplateListItem) => {
    try {
      await duplicateAIPrompt(prompt.id);
      loadPrompts();
    } catch (err) {
      setError('Failed to duplicate prompt');
      console.error(err);
    }
  };

  const handleDeletePrompt = async (id: string) => {
    if (!confirm('Are you sure you want to delete this prompt template?')) return;

    try {
      await deleteAIPrompt(id);
      if (selectedPrompt?.id === id) {
        setSelectedPrompt(null);
      }
      loadPrompts();
    } catch (err) {
      setError('Failed to delete prompt');
      console.error(err);
    }
  };

  const handleSavePrompt = async (data: CreateAIPromptRequest | UpdateAIPromptRequest) => {
    try {
      if (editMode === 'create') {
        await createAIPrompt(data as CreateAIPromptRequest);
      } else if (selectedPrompt) {
        await updateAIPrompt(selectedPrompt.id, data as UpdateAIPromptRequest);
      }
      setShowEditor(false);
      loadPrompts();
    } catch (err) {
      throw err;
    }
  };

  const handleTestPrompt = (prompt: AIPromptTemplate) => {
    setSelectedPrompt(prompt);
    setShowTester(true);
  };

  const handleSeedDefaults = async () => {
    if (!confirm('This will create default AI prompt templates. Continue?')) return;

    try {
      const result = await seedDefaultAIPrompts();
      alert(`Created ${result.total_created} templates, skipped ${result.total_skipped}`);
      loadPrompts();
    } catch (err) {
      setError('Failed to seed default templates');
      console.error(err);
    }
  };

  return (
    <div className="ai-prompts-page">
      <div className="ai-prompts-header">
        <h1>AI Prompt Templates</h1>
        <p>Create and manage custom prompts for refining demand letters</p>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="ai-prompts-toolbar">
        <div className="ai-prompts-filters">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as PromptType | '')}
          >
            <option value="">All Types</option>
            {PROMPT_TYPES.map((type) => (
              <option key={type} value={type}>
                {formatPromptType(type)}
              </option>
            ))}
          </select>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as PromptCategory | '')}
          >
            <option value="">All Categories</option>
            {PROMPT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Search prompts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="ai-prompts-actions">
          <button onClick={handleSeedDefaults} className="btn-secondary">
            Seed Defaults
          </button>
          <button onClick={handleCreatePrompt} className="btn-primary">
            Create Prompt
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading prompts...</div>
      ) : prompts.length === 0 ? (
        <div className="empty-state">
          <p>No AI prompt templates found.</p>
          <button onClick={handleCreatePrompt}>Create your first prompt</button>
        </div>
      ) : (
        <div className="ai-prompts-grid">
          {prompts.map((prompt) => (
            <div
              key={prompt.id}
              className={`ai-prompt-card ${selectedPrompt?.id === prompt.id ? 'selected' : ''}`}
              onClick={() => handleSelectPrompt(prompt.id)}
            >
              <div className="ai-prompt-card-header">
                <h3>{prompt.name}</h3>
                <div className="ai-prompt-badges">
                  {prompt.is_default && <span className="badge badge-default">Default</span>}
                  {prompt.is_shared && <span className="badge badge-shared">Shared</span>}
                  {prompt.is_approved && <span className="badge badge-approved">Approved</span>}
                </div>
              </div>

              <p className="ai-prompt-description">
                {prompt.description || 'No description'}
              </p>

              <div className="ai-prompt-meta">
                <span
                  className="prompt-type-tag"
                  style={{ backgroundColor: getPromptTypeColor(prompt.prompt_type) }}
                >
                  {formatPromptType(prompt.prompt_type)}
                </span>
                {prompt.category && (
                  <span
                    className="prompt-category-tag"
                    style={{ backgroundColor: getCategoryColor(prompt.category) }}
                  >
                    {prompt.category}
                  </span>
                )}
              </div>

              <div className="ai-prompt-stats">
                <span>v{prompt.current_version}</span>
                <span>{prompt.usage_count} uses</span>
                <span>{prompt.variables.length} variables</span>
              </div>

              <div className="ai-prompt-card-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleSelectPrompt(prompt.id).then(() => {
                    if (selectedPrompt) handleTestPrompt(selectedPrompt);
                  })}
                  title="Test prompt"
                >
                  Test
                </button>
                {!prompt.is_default && (
                  <>
                    <button
                      onClick={async () => {
                        const p = await getAIPrompt(prompt.id);
                        handleEditPrompt(p);
                      }}
                      title="Edit prompt"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeletePrompt(prompt.id)}
                      title="Delete prompt"
                      className="btn-danger"
                    >
                      Delete
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleDuplicatePrompt(prompt)}
                  title="Duplicate prompt"
                >
                  Duplicate
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showEditor && (
        <AIPromptEditor
          prompt={editMode === 'edit' ? selectedPrompt : null}
          onSave={handleSavePrompt}
          onClose={() => setShowEditor(false)}
        />
      )}

      {showTester && selectedPrompt && (
        <AIPromptTester
          prompt={selectedPrompt}
          onClose={() => setShowTester(false)}
        />
      )}

      <style>{`
        .ai-prompts-page {
          padding: 24px;
          max-width: 1400px;
          margin: 0 auto;
        }

        .ai-prompts-header {
          margin-bottom: 24px;
        }

        .ai-prompts-header h1 {
          margin: 0 0 8px 0;
          font-size: 28px;
        }

        .ai-prompts-header p {
          margin: 0;
          color: #666;
        }

        .error-message {
          background: #fee2e2;
          border: 1px solid #ef4444;
          color: #dc2626;
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .ai-prompts-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          gap: 16px;
          flex-wrap: wrap;
        }

        .ai-prompts-filters {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .ai-prompts-filters select,
        .ai-prompts-filters input {
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
        }

        .ai-prompts-filters input {
          min-width: 200px;
        }

        .ai-prompts-actions {
          display: flex;
          gap: 12px;
        }

        .btn-primary {
          background: #3b82f6;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        }

        .btn-primary:hover {
          background: #2563eb;
        }

        .btn-secondary {
          background: #f3f4f6;
          color: #374151;
          border: 1px solid #d1d5db;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        }

        .btn-secondary:hover {
          background: #e5e7eb;
        }

        .loading-state,
        .empty-state {
          text-align: center;
          padding: 48px;
          color: #666;
        }

        .empty-state button {
          margin-top: 16px;
          background: #3b82f6;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          cursor: pointer;
        }

        .ai-prompts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 20px;
        }

        .ai-prompt-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 20px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .ai-prompt-card:hover {
          border-color: #3b82f6;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
        }

        .ai-prompt-card.selected {
          border-color: #3b82f6;
          background: #eff6ff;
        }

        .ai-prompt-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
        }

        .ai-prompt-card-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .ai-prompt-badges {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }

        .badge {
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 500;
        }

        .badge-default {
          background: #dbeafe;
          color: #1d4ed8;
        }

        .badge-shared {
          background: #dcfce7;
          color: #166534;
        }

        .badge-approved {
          background: #fef3c7;
          color: #92400e;
        }

        .ai-prompt-description {
          color: #666;
          font-size: 14px;
          margin: 0 0 12px 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .ai-prompt-meta {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }

        .prompt-type-tag,
        .prompt-category-tag {
          font-size: 11px;
          padding: 3px 8px;
          border-radius: 4px;
          color: white;
          font-weight: 500;
        }

        .ai-prompt-stats {
          display: flex;
          gap: 16px;
          font-size: 12px;
          color: #666;
          margin-bottom: 16px;
        }

        .ai-prompt-card-actions {
          display: flex;
          gap: 8px;
          padding-top: 12px;
          border-top: 1px solid #e5e7eb;
        }

        .ai-prompt-card-actions button {
          flex: 1;
          padding: 6px 12px;
          font-size: 12px;
          border: 1px solid #d1d5db;
          background: white;
          border-radius: 4px;
          cursor: pointer;
        }

        .ai-prompt-card-actions button:hover {
          background: #f3f4f6;
        }

        .ai-prompt-card-actions button.btn-danger {
          color: #dc2626;
          border-color: #fca5a5;
        }

        .ai-prompt-card-actions button.btn-danger:hover {
          background: #fee2e2;
        }
      `}</style>
    </div>
  );
}
