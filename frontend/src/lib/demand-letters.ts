// Demand letter API functions
import { apiClient, aiServiceClient } from './api';
import type {
  DemandLetter,
  DemandLetterListResponse,
  CreateDemandLetterRequest,
  CreateDemandLetterResponse,
  UpdateDemandLetterRequest,
  RefineRequest,
  RefineResponse,
  VersionListResponse,
  DemandLetterVersion,
  AIHistoryResponse,
} from '../types/demand-letter';

// Create new demand letter with AI generation
export async function createDemandLetter(
  request: CreateDemandLetterRequest
): Promise<CreateDemandLetterResponse> {
  const response = await apiClient.post<CreateDemandLetterResponse>(
    '/api/demand-letters',
    request,
    { timeout: 150000 } // 2.5 minute timeout for AI generation
  );
  return response.data;
}

// Generate demand letter with streaming response
export async function generateDemandLetterStream(
  request: CreateDemandLetterRequest,
  onChunk: (chunk: string) => void,
  onComplete: () => void,
  onError: (error: Error) => void
): Promise<void> {
  try {
    const response = await apiClient.post('/api/demand-letters/generate-stream', request, {
      responseType: 'stream',
      timeout: 150000,
      adapter: 'fetch', // Use fetch adapter for streaming
      headers: {
        Accept: 'text/plain',
      },
    });

    const reader = response.data.getReader?.();
    if (!reader) {
      // Fallback for non-streaming response
      onChunk(response.data);
      onComplete();
      return;
    }

    const decoder = new TextDecoder();
    let done = false;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        const chunk = decoder.decode(value, { stream: !done });
        onChunk(chunk);
      }
    }

    onComplete();
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
  }
}

// Alternative streaming using EventSource-style fetch
export function streamDemandLetterGeneration(
  request: CreateDemandLetterRequest,
  callbacks: {
    onChunk: (chunk: string) => void;
    onComplete: () => void;
    onError: (error: Error) => void;
  }
): AbortController {
  const controller = new AbortController();
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const token = localStorage.getItem('accessToken');

  fetch(`${baseUrl}/api/demand-letters/generate-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
    },
    body: JSON.stringify(request),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: !done });
          callbacks.onChunk(chunk);
        }
      }

      callbacks.onComplete();
    })
    .catch((error) => {
      if (error.name !== 'AbortError') {
        callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      }
    });

  return controller;
}

// List demand letters
export async function listDemandLetters(params?: {
  status?: string;
  case_reference?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<DemandLetterListResponse> {
  const response = await apiClient.get<DemandLetterListResponse>('/api/demand-letters', {
    params,
  });
  return response.data;
}

// Get single demand letter with full content
export async function getDemandLetter(id: string): Promise<DemandLetter> {
  const response = await apiClient.get<DemandLetter>(`/api/demand-letters/${id}`);
  return response.data;
}

// Update demand letter
export async function updateDemandLetter(
  id: string,
  data: UpdateDemandLetterRequest
): Promise<DemandLetter> {
  const response = await apiClient.patch<DemandLetter>(`/api/demand-letters/${id}`, data);
  return response.data;
}

// Refine demand letter with AI
export async function refineDemandLetter(
  id: string,
  request: RefineRequest
): Promise<RefineResponse> {
  const response = await apiClient.post<RefineResponse>(
    `/api/demand-letters/${id}/refine`,
    request,
    { timeout: 150000 }
  );
  return response.data;
}

// Delete demand letter
export async function deleteDemandLetter(id: string): Promise<void> {
  await apiClient.delete(`/api/demand-letters/${id}`);
}

// Get demand letter versions
export async function getDemandLetterVersions(id: string): Promise<VersionListResponse> {
  const response = await apiClient.get<VersionListResponse>(
    `/api/demand-letters/${id}/versions`
  );
  return response.data;
}

// Get specific version content
export async function getDemandLetterVersion(
  id: string,
  versionId: string
): Promise<DemandLetterVersion> {
  const response = await apiClient.get<DemandLetterVersion>(
    `/api/demand-letters/${id}/versions/${versionId}`
  );
  return response.data;
}

// Restore specific version
export async function restoreDemandLetterVersion(
  id: string,
  versionId: string
): Promise<{
  id: string;
  content: string;
  version: number;
  restored_from: number;
  updated_at: string;
}> {
  const response = await apiClient.post(
    `/api/demand-letters/${id}/versions/${versionId}/restore`
  );
  return response.data;
}

// Get AI generation history
export async function getDemandLetterAIHistory(id: string): Promise<AIHistoryResponse> {
  const response = await apiClient.get<AIHistoryResponse>(
    `/api/demand-letters/${id}/ai-history`
  );
  return response.data;
}

// Get available AI models from AI service
export async function getAvailableModels(): Promise<{
  models: Array<{
    id: string;
    input_price_per_1k: number;
    output_price_per_1k: number;
    max_tokens: number;
    default_max_completion: number;
  }>;
  default: string;
}> {
  const response = await aiServiceClient.get('/ai/models');
  return response.data;
}

// Get AI service session stats
export async function getAISessionStats(): Promise<{
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_cost: number;
  request_count: number;
  average_cost_per_request: number;
}> {
  const response = await aiServiceClient.get('/ai/stats');
  return response.data;
}

// Helper to format status for display
export function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    draft: 'Draft',
    in_review: 'In Review',
    approved: 'Approved',
    sent: 'Sent',
    archived: 'Archived',
  };
  return statusMap[status] || status;
}

// Helper to get status color
export function getStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    draft: '#6b7280', // gray
    in_review: '#f59e0b', // amber
    approved: '#10b981', // green
    sent: '#3b82f6', // blue
    archived: '#9ca3af', // light gray
  };
  return colorMap[status] || '#6b7280';
}

// Helper to format date for display
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Helper to format relative time
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateString);
}
