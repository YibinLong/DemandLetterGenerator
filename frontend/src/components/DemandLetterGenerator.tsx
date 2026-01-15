import { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { listDocuments } from '../lib/documents';
import {
  createDemandLetter,
  streamDemandLetterGeneration,
} from '../lib/demand-letters';
import type { Document } from '../types/document';
import type {
  CaseInfo,
  CreateDemandLetterRequest,
  GenerationState,
} from '../types/demand-letter';

interface DemandLetterGeneratorProps {
  onGenerated?: (id: string) => void;
  onCancel?: () => void;
  preselectedDocumentIds?: string[];
}

type Step = 'documents' | 'case-info' | 'options' | 'generating' | 'complete';

export function DemandLetterGenerator({
  onGenerated,
  onCancel,
  preselectedDocumentIds = [],
}: DemandLetterGeneratorProps) {
  const queryClient = useQueryClient();

  // Step management
  const [currentStep, setCurrentStep] = useState<Step>('documents');

  // Document selection
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>(preselectedDocumentIds);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [caseInfo, setCaseInfo] = useState<CaseInfo>({});
  const [instructions, setInstructions] = useState('');
  const [useStreaming, setUseStreaming] = useState(true);
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');

  // Generation state
  const [generationState, setGenerationState] = useState<GenerationState>({
    status: 'idle',
    progress: 0,
    content: '',
  });
  const [generatedLetterId, setGeneratedLetterId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load documents
  useEffect(() => {
    const loadDocuments = async () => {
      try {
        setDocumentsLoading(true);
        const response = await listDocuments({ limit: 100 });
        setDocuments(response.documents);
      } catch (error) {
        console.error('Failed to load documents:', error);
      } finally {
        setDocumentsLoading(false);
      }
    };
    loadDocuments();
  }, []);

  // Create mutation for non-streaming generation
  const createMutation = useMutation({
    mutationFn: createDemandLetter,
    onSuccess: (data) => {
      setGeneratedLetterId(data.id);
      setGenerationState({
        status: 'complete',
        progress: 100,
        content: data.content,
      });
      queryClient.invalidateQueries({ queryKey: ['demandLetters'] });
      onGenerated?.(data.id);
    },
    onError: (error) => {
      setGenerationState(prev => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Generation failed',
      }));
    },
  });

  // Filter documents based on search
  const filteredDocuments = documents.filter(doc =>
    doc.original_filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.case_reference?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle document selection
  const toggleDocument = useCallback((docId: string) => {
    setSelectedDocumentIds(prev =>
      prev.includes(docId)
        ? prev.filter(id => id !== docId)
        : [...prev, docId]
    );
  }, []);

  // Handle select all
  const selectAllFiltered = useCallback(() => {
    const filteredIds = filteredDocuments.map(d => d.id);
    setSelectedDocumentIds(prev => {
      const allSelected = filteredIds.every(id => prev.includes(id));
      if (allSelected) {
        return prev.filter(id => !filteredIds.includes(id));
      }
      return [...new Set([...prev, ...filteredIds])];
    });
  }, [filteredDocuments]);

  // Validate current step
  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 'documents':
        return selectedDocumentIds.length > 0;
      case 'case-info':
        return title.trim().length > 0;
      case 'options':
        return true;
      default:
        return false;
    }
  }, [currentStep, selectedDocumentIds, title]);

  // Handle generation
  const handleGenerate = useCallback(async () => {
    const request: CreateDemandLetterRequest = {
      title: title.trim(),
      document_ids: selectedDocumentIds,
      case_info: caseInfo,
      instructions: instructions.trim() || undefined,
      model: selectedModel,
    };

    setCurrentStep('generating');
    setGenerationState({
      status: 'preparing',
      progress: 10,
      content: '',
    });

    if (useStreaming) {
      // Use streaming generation
      setGenerationState(prev => ({
        ...prev,
        status: 'streaming',
        progress: 20,
      }));

      abortControllerRef.current = streamDemandLetterGeneration(request, {
        onChunk: (chunk) => {
          setGenerationState(prev => ({
            ...prev,
            content: prev.content + chunk,
            progress: Math.min(90, prev.progress + 1),
          }));
        },
        onComplete: () => {
          setGenerationState(prev => ({
            ...prev,
            status: 'complete',
            progress: 100,
          }));
          setCurrentStep('complete');
          queryClient.invalidateQueries({ queryKey: ['demandLetters'] });
          // Note: With streaming, we don't get the ID back directly
          // User would need to save the content manually or we'd need to enhance the API
        },
        onError: (error) => {
          setGenerationState(prev => ({
            ...prev,
            status: 'error',
            error: error.message,
          }));
        },
      });
    } else {
      // Use non-streaming generation (returns full response with ID)
      setGenerationState(prev => ({
        ...prev,
        status: 'generating',
        progress: 30,
      }));

      createMutation.mutate(request);
    }
  }, [title, selectedDocumentIds, caseInfo, instructions, selectedModel, useStreaming, createMutation, queryClient]);

  // Cancel generation
  const cancelGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setGenerationState({
      status: 'idle',
      progress: 0,
      content: '',
    });
    setCurrentStep('options');
  }, []);

  // Step navigation
  const nextStep = useCallback(() => {
    const steps: Step[] = ['documents', 'case-info', 'options'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  }, [currentStep]);

  const prevStep = useCallback(() => {
    const steps: Step[] = ['documents', 'case-info', 'options'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  }, [currentStep]);

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="demand-letter-generator">
      {/* Progress Steps */}
      <div className="generator-steps">
        {[
          { key: 'documents', label: 'Select Documents', num: 1 },
          { key: 'case-info', label: 'Case Information', num: 2 },
          { key: 'options', label: 'Options', num: 3 },
          { key: 'generating', label: 'Generate', num: 4 },
        ].map((step, index) => (
          <div
            key={step.key}
            className={`step ${currentStep === step.key ? 'active' : ''} ${
              ['documents', 'case-info', 'options'].indexOf(currentStep) > index ? 'completed' : ''
            }`}
          >
            <div className="step-number">{step.num}</div>
            <div className="step-label">{step.label}</div>
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="generator-content">
        {/* Step 1: Document Selection */}
        {currentStep === 'documents' && (
          <div className="step-content documents-step">
            <h2>Select Source Documents</h2>
            <p className="step-description">
              Choose the documents to analyze for generating your demand letter.
              You can select medical records, police reports, bills, and other relevant documents.
            </p>

            <div className="documents-toolbar">
              <input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
              <button
                onClick={selectAllFiltered}
                className="select-all-button"
              >
                {filteredDocuments.every(d => selectedDocumentIds.includes(d.id))
                  ? 'Deselect All'
                  : 'Select All'}
              </button>
            </div>

            <div className="selected-count">
              {selectedDocumentIds.length} document{selectedDocumentIds.length !== 1 ? 's' : ''} selected
            </div>

            {documentsLoading ? (
              <div className="loading">Loading documents...</div>
            ) : filteredDocuments.length === 0 ? (
              <div className="empty-state">
                {documents.length === 0 ? (
                  <>
                    <p>No documents uploaded yet.</p>
                    <p>Please upload source documents first.</p>
                  </>
                ) : (
                  <p>No documents match your search.</p>
                )}
              </div>
            ) : (
              <div className="documents-list">
                {filteredDocuments.map(doc => (
                  <label
                    key={doc.id}
                    className={`document-item ${selectedDocumentIds.includes(doc.id) ? 'selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDocumentIds.includes(doc.id)}
                      onChange={() => toggleDocument(doc.id)}
                    />
                    <div className="document-icon">
                      {doc.file_type === 'pdf' ? '📄' : doc.file_type === 'docx' ? '📝' : '📃'}
                    </div>
                    <div className="document-details">
                      <div className="document-name">{doc.original_filename}</div>
                      <div className="document-meta">
                        <span>{doc.file_type.toUpperCase()}</span>
                        <span>•</span>
                        <span>{formatFileSize(doc.file_size)}</span>
                        {doc.case_reference && (
                          <>
                            <span>•</span>
                            <span>{doc.case_reference}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Case Information */}
        {currentStep === 'case-info' && (
          <div className="step-content case-info-step">
            <h2>Case Information</h2>
            <p className="step-description">
              Provide information about the case to help generate a more accurate demand letter.
            </p>

            <div className="form-grid">
              <div className="form-field required">
                <label htmlFor="title">Letter Title *</label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Demand Letter - Smith v. ABC Insurance"
                />
              </div>

              <div className="form-field">
                <label htmlFor="caseReference">Case Reference</label>
                <input
                  id="caseReference"
                  type="text"
                  value={caseInfo.case_reference || ''}
                  onChange={(e) => setCaseInfo(prev => ({ ...prev, case_reference: e.target.value }))}
                  placeholder="e.g., CASE-2024-001"
                />
              </div>

              <div className="form-field">
                <label htmlFor="clientName">Client Name</label>
                <input
                  id="clientName"
                  type="text"
                  value={caseInfo.client_name || ''}
                  onChange={(e) => setCaseInfo(prev => ({ ...prev, client_name: e.target.value }))}
                  placeholder="e.g., John Smith"
                />
              </div>

              <div className="form-field">
                <label htmlFor="incidentDate">Incident Date</label>
                <input
                  id="incidentDate"
                  type="date"
                  value={caseInfo.incident_date || ''}
                  onChange={(e) => setCaseInfo(prev => ({ ...prev, incident_date: e.target.value }))}
                />
              </div>

              <div className="form-field">
                <label htmlFor="defendantName">Defendant / Recipient</label>
                <input
                  id="defendantName"
                  type="text"
                  value={caseInfo.defendant_name || ''}
                  onChange={(e) => setCaseInfo(prev => ({ ...prev, defendant_name: e.target.value }))}
                  placeholder="e.g., XYZ Insurance Company"
                />
              </div>

              <div className="form-field">
                <label htmlFor="defendantInsurance">Insurance Company</label>
                <input
                  id="defendantInsurance"
                  type="text"
                  value={caseInfo.defendant_insurance || ''}
                  onChange={(e) => setCaseInfo(prev => ({ ...prev, defendant_insurance: e.target.value }))}
                  placeholder="e.g., State Farm Insurance"
                />
              </div>

              <div className="form-field">
                <label htmlFor="claimNumber">Claim Number</label>
                <input
                  id="claimNumber"
                  type="text"
                  value={caseInfo.claim_number || ''}
                  onChange={(e) => setCaseInfo(prev => ({ ...prev, claim_number: e.target.value }))}
                  placeholder="e.g., CLM-123456"
                />
              </div>

              <div className="form-field full-width">
                <label htmlFor="additionalInfo">Additional Information</label>
                <textarea
                  id="additionalInfo"
                  value={caseInfo.additional_info || ''}
                  onChange={(e) => setCaseInfo(prev => ({ ...prev, additional_info: e.target.value }))}
                  placeholder="Any additional context about the case..."
                  rows={3}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Options */}
        {currentStep === 'options' && (
          <div className="step-content options-step">
            <h2>Generation Options</h2>
            <p className="step-description">
              Configure how you want the demand letter to be generated.
            </p>

            <div className="options-form">
              <div className="form-field full-width">
                <label htmlFor="instructions">Special Instructions</label>
                <textarea
                  id="instructions"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Add any specific instructions for the AI (e.g., 'Focus on medical damages', 'Use a formal tone', 'Emphasize pain and suffering')..."
                  rows={4}
                />
              </div>

              <div className="form-field">
                <label htmlFor="model">AI Model</label>
                <select
                  id="model"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                >
                  <option value="gpt-4o-mini">GPT-4o Mini (Fast & Cost-effective)</option>
                  <option value="gpt-4o">GPT-4o (Best Quality)</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo (Balanced)</option>
                </select>
              </div>

              <div className="form-field checkbox-field">
                <label>
                  <input
                    type="checkbox"
                    checked={useStreaming}
                    onChange={(e) => setUseStreaming(e.target.checked)}
                  />
                  <span>Enable streaming (see text as it's generated)</span>
                </label>
              </div>

              <div className="generation-summary">
                <h3>Generation Summary</h3>
                <ul>
                  <li><strong>Title:</strong> {title}</li>
                  <li><strong>Documents:</strong> {selectedDocumentIds.length} selected</li>
                  {caseInfo.client_name && <li><strong>Client:</strong> {caseInfo.client_name}</li>}
                  {caseInfo.defendant_name && <li><strong>Defendant:</strong> {caseInfo.defendant_name}</li>}
                  <li><strong>Model:</strong> {selectedModel}</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Generating */}
        {currentStep === 'generating' && (
          <div className="step-content generating-step">
            <h2>
              {generationState.status === 'error'
                ? 'Generation Error'
                : generationState.status === 'complete'
                ? 'Generation Complete'
                : 'Generating Demand Letter...'}
            </h2>

            {generationState.status === 'error' ? (
              <div className="error-state">
                <div className="error-icon">⚠️</div>
                <p>{generationState.error || 'An error occurred during generation.'}</p>
                <button onClick={cancelGeneration} className="retry-button">
                  Try Again
                </button>
              </div>
            ) : (
              <>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${generationState.progress}%` }}
                  />
                </div>
                <p className="progress-status">
                  {generationState.status === 'preparing' && 'Preparing documents...'}
                  {generationState.status === 'generating' && 'Generating with AI...'}
                  {generationState.status === 'streaming' && 'Receiving content...'}
                  {generationState.status === 'complete' && 'Generation complete!'}
                </p>

                {generationState.content && (
                  <div className="generated-preview">
                    <h3>Preview</h3>
                    <div className="content-preview">
                      {generationState.content}
                    </div>
                  </div>
                )}

                {generationState.status !== 'complete' && (
                  <button onClick={cancelGeneration} className="cancel-button">
                    Cancel
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Complete */}
        {currentStep === 'complete' && (
          <div className="step-content complete-step">
            <div className="success-icon">✓</div>
            <h2>Demand Letter Generated!</h2>
            <p>Your demand letter has been created successfully.</p>

            {generatedLetterId && (
              <button
                onClick={() => onGenerated?.(generatedLetterId)}
                className="view-button"
              >
                View Demand Letter
              </button>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      {!['generating', 'complete'].includes(currentStep) && (
        <div className="generator-nav">
          <button
            onClick={onCancel}
            className="nav-button cancel"
          >
            Cancel
          </button>

          <div className="nav-buttons-right">
            {currentStep !== 'documents' && (
              <button
                onClick={prevStep}
                className="nav-button secondary"
              >
                Back
              </button>
            )}

            {currentStep === 'options' ? (
              <button
                onClick={handleGenerate}
                className="nav-button primary"
                disabled={!canProceed()}
              >
                Generate Letter
              </button>
            ) : (
              <button
                onClick={nextStep}
                className="nav-button primary"
                disabled={!canProceed()}
              >
                Continue
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        .demand-letter-generator {
          max-width: 800px;
          margin: 0 auto;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        /* Progress Steps */
        .generator-steps {
          display: flex;
          justify-content: space-between;
          margin-bottom: 32px;
          padding: 0 16px;
        }

        .step {
          display: flex;
          flex-direction: column;
          align-items: center;
          flex: 1;
          position: relative;
        }

        .step:not(:last-child)::after {
          content: '';
          position: absolute;
          top: 16px;
          left: 50%;
          width: 100%;
          height: 2px;
          background: #e5e7eb;
          z-index: 0;
        }

        .step.completed:not(:last-child)::after {
          background: #3b82f6;
        }

        .step-number {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #e5e7eb;
          color: #6b7280;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 14px;
          z-index: 1;
          transition: all 0.2s;
        }

        .step.active .step-number {
          background: #3b82f6;
          color: white;
        }

        .step.completed .step-number {
          background: #3b82f6;
          color: white;
        }

        .step-label {
          margin-top: 8px;
          font-size: 12px;
          color: #6b7280;
          text-align: center;
        }

        .step.active .step-label {
          color: #3b82f6;
          font-weight: 500;
        }

        /* Content */
        .generator-content {
          background: white;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          padding: 24px;
          min-height: 400px;
        }

        .step-content h2 {
          margin: 0 0 8px;
          font-size: 20px;
          color: #111827;
        }

        .step-description {
          color: #6b7280;
          margin: 0 0 24px;
          font-size: 14px;
        }

        /* Documents Step */
        .documents-toolbar {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
        }

        .search-input {
          flex: 1;
          padding: 10px 14px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
        }

        .search-input:focus {
          outline: none;
          border-color: #3b82f6;
        }

        .select-all-button {
          padding: 10px 16px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
        }

        .select-all-button:hover {
          background: #f9fafb;
        }

        .selected-count {
          font-size: 13px;
          color: #3b82f6;
          margin-bottom: 12px;
        }

        .documents-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 300px;
          overflow-y: auto;
        }

        .document-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .document-item:hover {
          border-color: #3b82f6;
        }

        .document-item.selected {
          background: #eff6ff;
          border-color: #3b82f6;
        }

        .document-item input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .document-icon {
          font-size: 24px;
        }

        .document-details {
          flex: 1;
        }

        .document-name {
          font-weight: 500;
          color: #111827;
        }

        .document-meta {
          font-size: 12px;
          color: #6b7280;
          display: flex;
          gap: 6px;
          margin-top: 4px;
        }

        /* Form Fields */
        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        .form-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-field.full-width {
          grid-column: span 2;
        }

        .form-field.required label::after {
          content: ' *';
          color: #ef4444;
        }

        .form-field label {
          font-size: 14px;
          font-weight: 500;
          color: #374151;
        }

        .form-field input,
        .form-field select,
        .form-field textarea {
          padding: 10px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
        }

        .form-field input:focus,
        .form-field select:focus,
        .form-field textarea:focus {
          outline: none;
          border-color: #3b82f6;
        }

        .checkbox-field label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .checkbox-field input[type="checkbox"] {
          width: 18px;
          height: 18px;
        }

        /* Options Step */
        .options-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .generation-summary {
          background: #f9fafb;
          border-radius: 8px;
          padding: 16px;
          margin-top: 16px;
        }

        .generation-summary h3 {
          margin: 0 0 12px;
          font-size: 14px;
          color: #374151;
        }

        .generation-summary ul {
          margin: 0;
          padding: 0;
          list-style: none;
          font-size: 14px;
          color: #6b7280;
        }

        .generation-summary li {
          margin-bottom: 6px;
        }

        .generation-summary li strong {
          color: #374151;
        }

        /* Generating Step */
        .generating-step {
          text-align: center;
          padding: 40px 20px;
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
          margin: 24px 0;
        }

        .progress-fill {
          height: 100%;
          background: #3b82f6;
          transition: width 0.3s ease;
        }

        .progress-status {
          color: #6b7280;
          font-size: 14px;
        }

        .generated-preview {
          margin-top: 24px;
          text-align: left;
        }

        .generated-preview h3 {
          font-size: 14px;
          color: #374151;
          margin: 0 0 12px;
        }

        .content-preview {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 16px;
          max-height: 200px;
          overflow-y: auto;
          font-size: 13px;
          line-height: 1.6;
          white-space: pre-wrap;
          color: #374151;
        }

        .error-state {
          padding: 20px;
        }

        .error-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .error-state p {
          color: #dc2626;
          margin-bottom: 16px;
        }

        .retry-button,
        .cancel-button {
          padding: 10px 20px;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
        }

        .retry-button {
          background: #3b82f6;
          color: white;
          border: none;
        }

        .cancel-button {
          background: white;
          border: 1px solid #d1d5db;
          color: #374151;
          margin-top: 16px;
        }

        /* Complete Step */
        .complete-step {
          text-align: center;
          padding: 60px 20px;
        }

        .success-icon {
          width: 64px;
          height: 64px;
          background: #10b981;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
          margin: 0 auto 24px;
        }

        .view-button {
          padding: 12px 24px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          margin-top: 16px;
        }

        .view-button:hover {
          background: #2563eb;
        }

        /* Navigation */
        .generator-nav {
          display: flex;
          justify-content: space-between;
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid #e5e7eb;
        }

        .nav-buttons-right {
          display: flex;
          gap: 12px;
        }

        .nav-button {
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }

        .nav-button.cancel {
          background: white;
          border: 1px solid #d1d5db;
          color: #6b7280;
        }

        .nav-button.cancel:hover {
          border-color: #9ca3af;
        }

        .nav-button.secondary {
          background: white;
          border: 1px solid #d1d5db;
          color: #374151;
        }

        .nav-button.secondary:hover {
          background: #f9fafb;
        }

        .nav-button.primary {
          background: #3b82f6;
          border: none;
          color: white;
        }

        .nav-button.primary:hover:not(:disabled) {
          background: #2563eb;
        }

        .nav-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Loading and Empty States */
        .loading,
        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: #6b7280;
        }

        /* Responsive */
        @media (max-width: 640px) {
          .form-grid {
            grid-template-columns: 1fr;
          }

          .form-field.full-width {
            grid-column: span 1;
          }

          .generator-steps {
            padding: 0;
          }

          .step-label {
            font-size: 10px;
          }
        }
      `}</style>
    </div>
  );
}

export default DemandLetterGenerator;
