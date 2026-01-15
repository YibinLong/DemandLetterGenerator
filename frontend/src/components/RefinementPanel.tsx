import { useState, useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  refineDemandLetter,
  getDemandLetterAIHistory,
  getDemandLetterVersions,
  restoreDemandLetterVersion,
  getAvailableModels,
  formatDate,
} from '../lib/demand-letters';
import { listAIPrompts, getCategoryColor } from '../lib/ai-prompts';
import type {
  RefineResponse,
  AIGenerationHistoryItem,
} from '../types/demand-letter';
import type { AIPromptTemplateListItem } from '../types/ai-prompt';

interface RefinementPanelProps {
  letterId: string;
  currentContent?: string;
  currentVersion?: number;
  onRefined: (response: RefineResponse) => void;
  onUndo?: () => void;
}

interface QuickAction {
  label: string;
  instruction: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Make more assertive', instruction: 'Make the tone more assertive and demanding while remaining professional.' },
  { label: 'Shorten', instruction: 'Condense this letter while keeping all essential information and legal arguments.' },
  { label: 'Add more detail', instruction: 'Expand on the key facts and damages with more specific detail.' },
  { label: 'Formal tone', instruction: 'Revise to use more formal legal language throughout.' },
  { label: 'Clarify damages', instruction: 'Provide a clearer breakdown and explanation of the damages claimed.' },
  { label: 'Strengthen liability', instruction: 'Strengthen the arguments for defendant liability with clearer reasoning.' },
];

type PanelTab = 'refine' | 'history' | 'versions' | 'prompts';

export function RefinementPanel({
  letterId,
  onRefined,
}: RefinementPanelProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<PanelTab>('refine');
  const [instructions, setInstructions] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  const [showModelSelect, setShowModelSelect] = useState(false);
  const [refinementCount, setRefinementCount] = useState(0);
  const [selectedPromptTemplate, setSelectedPromptTemplate] = useState<AIPromptTemplateListItem | null>(null);

  // Fetch available models
  const { data: modelsData } = useQuery({
    queryKey: ['aiModels'],
    queryFn: getAvailableModels,
    staleTime: 300000, // 5 minutes
  });

  // Fetch AI history
  const { data: historyData, refetch: refetchHistory } = useQuery({
    queryKey: ['demandLetterAIHistory', letterId],
    queryFn: () => getDemandLetterAIHistory(letterId),
    enabled: activeTab === 'history',
  });

  // Fetch versions for undo
  const { data: versionsData, refetch: refetchVersions } = useQuery({
    queryKey: ['demandLetterVersions', letterId],
    queryFn: () => getDemandLetterVersions(letterId),
    enabled: activeTab === 'versions',
  });

  // Fetch AI prompt templates
  const { data: promptsData } = useQuery({
    queryKey: ['aiPromptTemplates', 'refinement'],
    queryFn: () => listAIPrompts({ prompt_type: 'refinement', include_defaults: true }),
    staleTime: 300000, // 5 minutes
    enabled: activeTab === 'prompts',
  });

  // Count refinements from history
  useEffect(() => {
    if (historyData) {
      const count = historyData.history.filter(h => h.generation_type === 'refinement').length;
      setRefinementCount(count);
    }
  }, [historyData]);

  // Refine mutation
  const refineMutation = useMutation({
    mutationFn: (data: { instructions: string; model?: string }) =>
      refineDemandLetter(letterId, data),
    onSuccess: (response) => {
      onRefined(response);
      setInstructions('');
      setRefinementCount(prev => prev + 1);
      refetchHistory();
      refetchVersions();
      queryClient.invalidateQueries({ queryKey: ['demandLetter', letterId] });
      queryClient.invalidateQueries({ queryKey: ['demandLetterVersions', letterId] });
    },
  });

  // Restore version mutation (for undo)
  const restoreMutation = useMutation({
    mutationFn: (versionId: string) => restoreDemandLetterVersion(letterId, versionId),
    onSuccess: () => {
      refetchVersions();
      refetchHistory();
      queryClient.invalidateQueries({ queryKey: ['demandLetter', letterId] });
    },
  });

  // Handle refinement submission
  const handleRefine = useCallback(() => {
    if (!instructions.trim()) return;

    refineMutation.mutate({
      instructions: instructions.trim(),
      model: selectedModel,
    });
  }, [instructions, selectedModel, refineMutation]);

  // Handle quick action
  const handleQuickAction = useCallback((action: QuickAction) => {
    setInstructions(action.instruction);
    setSelectedPromptTemplate(null);
  }, []);

  // Handle prompt template selection
  const handlePromptTemplateSelect = useCallback((prompt: AIPromptTemplateListItem) => {
    setSelectedPromptTemplate(prompt);
    // If template has a simple instruction pattern, use it
    // Otherwise, the user can modify the instructions
    const instructionMatch = prompt.name.toLowerCase();
    if (instructionMatch.includes('assertive')) {
      setInstructions('Make the tone more assertive and demanding while remaining professional.');
    } else if (instructionMatch.includes('shorten') || instructionMatch.includes('condense')) {
      setInstructions('Condense this letter while keeping all essential information and legal arguments.');
    } else if (instructionMatch.includes('detail')) {
      setInstructions('Expand on the key facts and damages with more specific detail.');
    } else if (instructionMatch.includes('formal')) {
      setInstructions('Revise to use more formal legal language throughout.');
    } else if (instructionMatch.includes('damage')) {
      setInstructions('Provide a clearer breakdown and explanation of the damages claimed.');
    } else if (instructionMatch.includes('liability')) {
      setInstructions('Strengthen the arguments for defendant liability with clearer reasoning.');
    } else {
      // Use the prompt description or a generic instruction
      setInstructions(prompt.description || `Apply the "${prompt.name}" prompt template.`);
    }
    setActiveTab('refine');
  }, []);

  // Handle undo (restore previous version)
  const handleUndo = useCallback(() => {
    if (!versionsData?.versions || versionsData.versions.length < 2) return;

    // Find the version before the current one
    const sortedVersions = [...versionsData.versions].sort(
      (a, b) => b.version_number - a.version_number
    );
    const previousVersion = sortedVersions[1]; // Second most recent

    if (previousVersion && window.confirm('Undo the last change? This will restore the previous version.')) {
      restoreMutation.mutate(previousVersion.id);
    }
  }, [versionsData, restoreMutation]);

  // Re-apply previous refinement
  const handleReapply = useCallback((historyItem: AIGenerationHistoryItem) => {
    setInstructions(historyItem.prompt);
    setActiveTab('refine');
  }, []);

  const canUndo = versionsData?.versions && versionsData.versions.length > 1;

  return (
    <div className="refinement-panel">
      {/* Header with tabs */}
      <div className="panel-header">
        <div className="panel-tabs">
          <button
            className={`panel-tab ${activeTab === 'refine' ? 'active' : ''}`}
            onClick={() => setActiveTab('refine')}
          >
            Refine
          </button>
          <button
            className={`panel-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            History ({refinementCount})
          </button>
          <button
            className={`panel-tab ${activeTab === 'versions' ? 'active' : ''}`}
            onClick={() => setActiveTab('versions')}
          >
            Versions
          </button>
          <button
            className={`panel-tab ${activeTab === 'prompts' ? 'active' : ''}`}
            onClick={() => setActiveTab('prompts')}
          >
            Prompts
          </button>
        </div>

        {canUndo && (
          <button
            className="undo-button"
            onClick={handleUndo}
            disabled={restoreMutation.isPending}
            title="Undo last change"
          >
            ↩ Undo
          </button>
        )}
      </div>

      {/* Refine Tab */}
      {activeTab === 'refine' && (
        <div className="refine-tab">
          {/* Quick Actions */}
          <div className="quick-actions">
            <label>Quick Actions:</label>
            <div className="action-buttons">
              {QUICK_ACTIONS.map((action, idx) => (
                <button
                  key={idx}
                  className="quick-action-btn"
                  onClick={() => handleQuickAction(action)}
                  disabled={refineMutation.isPending}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          {/* Instructions Input */}
          <div className="instructions-input">
            <label htmlFor="refine-instructions">
              Refinement Instructions:
              <span className="refinement-count">Round #{refinementCount + 1}</span>
            </label>
            <textarea
              id="refine-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Describe how you'd like to refine this demand letter..."
              rows={4}
              disabled={refineMutation.isPending}
            />
          </div>

          {/* Model Selection */}
          <div className="model-selection">
            <button
              className="model-toggle"
              onClick={() => setShowModelSelect(!showModelSelect)}
              type="button"
            >
              Model: {selectedModel} {showModelSelect ? '▲' : '▼'}
            </button>

            {showModelSelect && modelsData && (
              <div className="model-options">
                {modelsData.models.map((model) => (
                  <button
                    key={model.id}
                    className={`model-option ${selectedModel === model.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedModel(model.id);
                      setShowModelSelect(false);
                    }}
                  >
                    <span className="model-name">{model.id}</span>
                    <span className="model-price">
                      ${(model.input_price_per_1k * 1000).toFixed(2)}/1M input
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="submit-section">
            <button
              className="refine-submit"
              onClick={handleRefine}
              disabled={!instructions.trim() || refineMutation.isPending}
            >
              {refineMutation.isPending ? (
                <>
                  <span className="spinner-small" />
                  Refining...
                </>
              ) : (
                '✨ Refine Letter'
              )}
            </button>
          </div>

          {/* Error Display */}
          {refineMutation.isError && (
            <div className="error-message">
              Failed to refine letter. Please try again.
            </div>
          )}

          {/* Success Message */}
          {refineMutation.isSuccess && (
            <div className="success-message">
              Letter refined successfully! Version {refineMutation.data.version} created.
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="history-tab">
          {historyData?.history && historyData.history.length > 0 ? (
            <div className="history-list">
              {historyData.history.map((item) => (
                <div
                  key={item.id}
                  className={`history-item ${item.generation_type}`}
                >
                  <div className="history-header">
                    <span className={`type-badge ${item.generation_type}`}>
                      {item.generation_type === 'initial' ? 'Initial' : 'Refinement'}
                    </span>
                    <span className="history-date">{formatDate(item.created_at)}</span>
                  </div>

                  <div className="history-prompt">
                    {item.generation_type === 'initial'
                      ? 'Initial AI generation'
                      : item.prompt}
                  </div>

                  <div className="history-meta">
                    <span>By {item.user.name}</span>
                    {item.model_used && <span>• {item.model_used}</span>}
                    {item.tokens_used && <span>• {item.tokens_used} tokens</span>}
                  </div>

                  {item.generation_type === 'refinement' && (
                    <button
                      className="reapply-button"
                      onClick={() => handleReapply(item)}
                    >
                      Re-apply
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              No refinement history yet. Use the Refine tab to make changes.
            </div>
          )}
        </div>
      )}

      {/* Versions Tab */}
      {activeTab === 'versions' && (
        <div className="versions-tab">
          {versionsData?.versions && versionsData.versions.length > 0 ? (
            <div className="versions-list">
              {versionsData.versions.map((version, idx) => (
                <div
                  key={version.id}
                  className={`version-item ${idx === 0 ? 'current' : ''}`}
                >
                  <div className="version-header">
                    <span className="version-number">v{version.version_number}</span>
                    {idx === 0 && <span className="current-badge">Current</span>}
                  </div>

                  <div className="version-summary">
                    {version.change_summary || 'No description'}
                  </div>

                  <div className="version-meta">
                    <span>{version.changed_by.name}</span>
                    <span>•</span>
                    <span>{formatDate(version.created_at)}</span>
                  </div>

                  {idx !== 0 && (
                    <button
                      className="restore-button"
                      onClick={() => {
                        if (window.confirm(`Restore version ${version.version_number}?`)) {
                          restoreMutation.mutate(version.id);
                        }
                      }}
                      disabled={restoreMutation.isPending}
                    >
                      Restore
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              No version history available.
            </div>
          )}
        </div>
      )}

      {/* Prompts Tab */}
      {activeTab === 'prompts' && (
        <div className="prompts-tab">
          <p className="prompts-description">
            Select a custom prompt template to use for refining this letter.
          </p>
          {promptsData?.prompts && promptsData.prompts.length > 0 ? (
            <div className="prompts-list">
              {promptsData.prompts.map((prompt) => (
                <div
                  key={prompt.id}
                  className={`prompt-item ${selectedPromptTemplate?.id === prompt.id ? 'selected' : ''}`}
                  onClick={() => handlePromptTemplateSelect(prompt)}
                >
                  <div className="prompt-item-header">
                    <span className="prompt-name">{prompt.name}</span>
                    {prompt.is_default && <span className="default-badge">Default</span>}
                  </div>
                  <p className="prompt-description">{prompt.description || 'No description'}</p>
                  <div className="prompt-item-meta">
                    {prompt.category && (
                      <span
                        className="category-tag"
                        style={{ backgroundColor: getCategoryColor(prompt.category) }}
                      >
                        {prompt.category}
                      </span>
                    )}
                    <span className="usage-count">{prompt.usage_count} uses</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              No prompt templates available. Create one in the AI Prompts page.
            </div>
          )}
        </div>
      )}

      <style>{`
        .refinement-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #fafafa;
          border-left: 1px solid #e5e7eb;
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: white;
          border-bottom: 1px solid #e5e7eb;
        }

        .panel-tabs {
          display: flex;
          gap: 4px;
        }

        .panel-tab {
          padding: 8px 16px;
          background: transparent;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.15s;
        }

        .panel-tab:hover {
          background: #f3f4f6;
          color: #374151;
        }

        .panel-tab.active {
          background: #eff6ff;
          color: #3b82f6;
        }

        .undo-button {
          padding: 6px 12px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 13px;
          color: #374151;
          cursor: pointer;
        }

        .undo-button:hover:not(:disabled) {
          background: #fef3c7;
          border-color: #f59e0b;
        }

        .undo-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Refine Tab */
        .refine-tab {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          overflow-y: auto;
        }

        .quick-actions label {
          display: block;
          font-size: 12px;
          font-weight: 500;
          color: #6b7280;
          margin-bottom: 8px;
        }

        .action-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .quick-action-btn {
          padding: 6px 10px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 16px;
          font-size: 12px;
          color: #374151;
          cursor: pointer;
          transition: all 0.15s;
        }

        .quick-action-btn:hover:not(:disabled) {
          background: #f3f4f6;
          border-color: #9ca3af;
        }

        .quick-action-btn:disabled {
          opacity: 0.5;
        }

        .instructions-input label {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          font-weight: 500;
          color: #374151;
          margin-bottom: 6px;
        }

        .refinement-count {
          font-weight: normal;
          color: #6b7280;
        }

        .instructions-input textarea {
          width: 100%;
          padding: 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          font-family: inherit;
          resize: vertical;
          min-height: 100px;
        }

        .instructions-input textarea:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .instructions-input textarea:disabled {
          background: #f9fafb;
        }

        .model-selection {
          position: relative;
        }

        .model-toggle {
          width: 100%;
          padding: 10px 12px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 13px;
          text-align: left;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
        }

        .model-options {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          margin-top: 4px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          z-index: 10;
        }

        .model-option {
          width: 100%;
          padding: 10px 12px;
          background: transparent;
          border: none;
          text-align: left;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .model-option:hover {
          background: #f3f4f6;
        }

        .model-option.selected {
          background: #eff6ff;
        }

        .model-name {
          font-size: 13px;
          color: #374151;
        }

        .model-price {
          font-size: 11px;
          color: #6b7280;
        }

        .submit-section {
          margin-top: auto;
        }

        .refine-submit {
          width: 100%;
          padding: 12px;
          background: #8b5cf6;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: background 0.15s;
        }

        .refine-submit:hover:not(:disabled) {
          background: #7c3aed;
        }

        .refine-submit:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .spinner-small {
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

        .error-message {
          padding: 12px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 6px;
          color: #dc2626;
          font-size: 13px;
        }

        .success-message {
          padding: 12px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 6px;
          color: #16a34a;
          font-size: 13px;
        }

        /* History Tab */
        .history-tab {
          padding: 16px;
          overflow-y: auto;
        }

        .history-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .history-item {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 12px;
        }

        .history-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .type-badge {
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 500;
        }

        .type-badge.initial {
          background: #dbeafe;
          color: #1d4ed8;
        }

        .type-badge.refinement {
          background: #f3e8ff;
          color: #7c3aed;
        }

        .history-date {
          font-size: 12px;
          color: #6b7280;
        }

        .history-prompt {
          font-size: 13px;
          color: #374151;
          margin-bottom: 8px;
          line-height: 1.4;
        }

        .history-meta {
          font-size: 12px;
          color: #9ca3af;
          display: flex;
          gap: 6px;
        }

        .reapply-button {
          margin-top: 8px;
          padding: 4px 10px;
          background: #f3f4f6;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 12px;
          color: #374151;
          cursor: pointer;
        }

        .reapply-button:hover {
          background: #e5e7eb;
        }

        /* Versions Tab */
        .versions-tab {
          padding: 16px;
          overflow-y: auto;
        }

        .versions-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .version-item {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 12px;
        }

        .version-item.current {
          border-color: #3b82f6;
          background: #eff6ff;
        }

        .version-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }

        .version-number {
          font-size: 14px;
          font-weight: 600;
          color: #3b82f6;
        }

        .current-badge {
          padding: 2px 8px;
          background: #3b82f6;
          color: white;
          border-radius: 12px;
          font-size: 10px;
          font-weight: 500;
        }

        .version-summary {
          font-size: 13px;
          color: #374151;
          margin-bottom: 6px;
        }

        .version-meta {
          font-size: 12px;
          color: #9ca3af;
          display: flex;
          gap: 6px;
        }

        .restore-button {
          margin-top: 8px;
          padding: 4px 10px;
          background: #fef3c7;
          border: 1px solid #fbbf24;
          border-radius: 4px;
          font-size: 12px;
          color: #92400e;
          cursor: pointer;
        }

        .restore-button:hover:not(:disabled) {
          background: #fde68a;
        }

        .restore-button:disabled {
          opacity: 0.5;
        }

        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: #9ca3af;
          font-size: 14px;
        }

        /* Prompts Tab */
        .prompts-tab {
          padding: 16px;
          overflow-y: auto;
        }

        .prompts-description {
          font-size: 13px;
          color: #6b7280;
          margin: 0 0 16px 0;
        }

        .prompts-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .prompt-item {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 12px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .prompt-item:hover {
          border-color: #3b82f6;
          background: #fafafa;
        }

        .prompt-item.selected {
          border-color: #3b82f6;
          background: #eff6ff;
        }

        .prompt-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }

        .prompt-name {
          font-size: 14px;
          font-weight: 500;
          color: #374151;
        }

        .default-badge {
          padding: 2px 6px;
          background: #dbeafe;
          color: #1d4ed8;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 500;
        }

        .prompt-description {
          font-size: 12px;
          color: #6b7280;
          margin: 0 0 8px 0;
          line-height: 1.4;
        }

        .prompt-item-meta {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .category-tag {
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          color: white;
          font-weight: 500;
        }

        .usage-count {
          font-size: 11px;
          color: #9ca3af;
        }
      `}</style>
    </div>
  );
}

export default RefinementPanel;
