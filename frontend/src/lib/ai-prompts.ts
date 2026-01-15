// AI Prompt Template API functions
import { apiClient } from './api';
import type {
  AIPromptTemplate,
  AIPromptTemplateListResponse,
  AIPromptVersionListResponse,
  CreateAIPromptRequest,
  UpdateAIPromptRequest,
  TestPromptRequest,
  TestPromptResponse,
  AIPromptMetaInfo,
  PromptType,
  PromptCategory,
} from '../types/ai-prompt';

// List AI prompt templates
export async function listAIPrompts(params?: {
  prompt_type?: PromptType;
  category?: PromptCategory;
  search?: string;
  is_shared?: boolean;
  is_approved?: boolean;
  include_defaults?: boolean;
  created_by?: string;
  limit?: number;
  offset?: number;
}): Promise<AIPromptTemplateListResponse> {
  const response = await apiClient.get<AIPromptTemplateListResponse>('/api/ai-prompts', {
    params: {
      ...params,
      include_defaults: params?.include_defaults ?? true,
    },
  });
  return response.data;
}

// Get single AI prompt template with full content
export async function getAIPrompt(id: string): Promise<AIPromptTemplate> {
  const response = await apiClient.get<AIPromptTemplate>(`/api/ai-prompts/${id}`);
  return response.data;
}

// Create new AI prompt template
export async function createAIPrompt(
  request: CreateAIPromptRequest
): Promise<AIPromptTemplate> {
  const response = await apiClient.post<AIPromptTemplate>('/api/ai-prompts', request);
  return response.data;
}

// Update AI prompt template
export async function updateAIPrompt(
  id: string,
  request: UpdateAIPromptRequest
): Promise<AIPromptTemplate> {
  const response = await apiClient.patch<AIPromptTemplate>(`/api/ai-prompts/${id}`, request);
  return response.data;
}

// Delete AI prompt template
export async function deleteAIPrompt(id: string): Promise<void> {
  await apiClient.delete(`/api/ai-prompts/${id}`);
}

// Duplicate AI prompt template
export async function duplicateAIPrompt(
  id: string,
  name?: string
): Promise<AIPromptTemplate> {
  const response = await apiClient.post<AIPromptTemplate>(`/api/ai-prompts/${id}/duplicate`, {
    name,
  });
  return response.data;
}

// Approve/unapprove AI prompt template (admin only)
export async function approveAIPrompt(
  id: string,
  approved: boolean
): Promise<{ id: string; is_approved: boolean; updated_at: string }> {
  const response = await apiClient.post(`/api/ai-prompts/${id}/approve`, { approved });
  return response.data;
}

// Test/preview AI prompt template
export async function testAIPrompt(
  id: string,
  request: TestPromptRequest
): Promise<TestPromptResponse> {
  const response = await apiClient.post<TestPromptResponse>(
    `/api/ai-prompts/${id}/test`,
    request,
    { timeout: 60000 }
  );
  return response.data;
}

// Get version history for AI prompt template
export async function getAIPromptVersions(id: string): Promise<AIPromptVersionListResponse> {
  const response = await apiClient.get<AIPromptVersionListResponse>(
    `/api/ai-prompts/${id}/versions`
  );
  return response.data;
}

// Restore a specific version
export async function restoreAIPromptVersion(
  id: string,
  versionId: string
): Promise<{ id: string; current_version: number; restored_from: number; updated_at: string }> {
  const response = await apiClient.post(
    `/api/ai-prompts/${id}/versions/${versionId}/restore`
  );
  return response.data;
}

// Get metadata (types, categories, reserved variables)
export async function getAIPromptMetaInfo(): Promise<AIPromptMetaInfo> {
  const response = await apiClient.get<AIPromptMetaInfo>('/api/ai-prompts/meta/info');
  return response.data;
}

// Seed default AI prompt templates (admin only)
export async function seedDefaultAIPrompts(): Promise<{
  templates_created: string[];
  templates_skipped: string[];
  total_created: number;
  total_skipped: number;
}> {
  const response = await apiClient.post('/api/ai-prompts/meta/seed-defaults');
  return response.data;
}

// Helper to format prompt type for display
export function formatPromptType(type: PromptType): string {
  const typeMap: Record<PromptType, string> = {
    refinement: 'Refinement',
    generation: 'Generation',
    analysis: 'Analysis',
  };
  return typeMap[type] || type;
}

// Helper to get prompt type color
export function getPromptTypeColor(type: PromptType): string {
  const colorMap: Record<PromptType, string> = {
    refinement: '#3b82f6', // blue
    generation: '#10b981', // green
    analysis: '#f59e0b', // amber
  };
  return colorMap[type] || '#6b7280';
}

// Helper to get category color
export function getCategoryColor(category?: PromptCategory): string {
  if (!category) return '#6b7280';

  const colorMap: Record<PromptCategory, string> = {
    'Tone & Style': '#8b5cf6', // purple
    'Content Enhancement': '#06b6d4', // cyan
    'Legal Specific': '#ef4444', // red
    Formatting: '#84cc16', // lime
    Summarization: '#f97316', // orange
    Custom: '#6b7280', // gray
  };
  return colorMap[category] || '#6b7280';
}
