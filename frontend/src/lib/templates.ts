// Template API functions
import { apiClient } from './api';
import type {
  Template,
  TemplateListResponse,
  CreateTemplateRequest,
  CreateTemplateResponse,
  UpdateTemplateRequest,
  UpdateTemplateResponse,
  TemplateApprovalResponse,
  DuplicateTemplateRequest,
  DuplicateTemplateResponse,
  TemplatePreviewRequest,
  TemplatePreviewResponse,
  TemplateCategoriesResponse,
  TemplateAnalyticsResponse,
  SeedDefaultsResponse,
} from '../types/template';

// Create new template
export async function createTemplate(
  request: CreateTemplateRequest
): Promise<CreateTemplateResponse> {
  const response = await apiClient.post<CreateTemplateResponse>(
    '/api/templates',
    request
  );
  return response.data;
}

// List templates
export async function listTemplates(params?: {
  category?: string;
  search?: string;
  is_shared?: boolean;
  is_approved?: boolean;
  created_by?: string;
  limit?: number;
  offset?: number;
}): Promise<TemplateListResponse> {
  const response = await apiClient.get<TemplateListResponse>('/api/templates', {
    params,
  });
  return response.data;
}

// Get single template with full content
export async function getTemplate(id: string): Promise<Template> {
  const response = await apiClient.get<Template>(`/api/templates/${id}`);
  return response.data;
}

// Update template
export async function updateTemplate(
  id: string,
  data: UpdateTemplateRequest
): Promise<UpdateTemplateResponse> {
  const response = await apiClient.patch<UpdateTemplateResponse>(
    `/api/templates/${id}`,
    data
  );
  return response.data;
}

// Approve/unapprove template (admin only)
export async function approveTemplate(
  id: string,
  approved: boolean
): Promise<TemplateApprovalResponse> {
  const response = await apiClient.post<TemplateApprovalResponse>(
    `/api/templates/${id}/approve`,
    { approved }
  );
  return response.data;
}

// Duplicate template
export async function duplicateTemplate(
  id: string,
  request?: DuplicateTemplateRequest
): Promise<DuplicateTemplateResponse> {
  const response = await apiClient.post<DuplicateTemplateResponse>(
    `/api/templates/${id}/duplicate`,
    request || {}
  );
  return response.data;
}

// Preview template with placeholder values
export async function previewTemplate(
  id: string,
  request: TemplatePreviewRequest
): Promise<TemplatePreviewResponse> {
  const response = await apiClient.post<TemplatePreviewResponse>(
    `/api/templates/${id}/preview`,
    request
  );
  return response.data;
}

// Delete template
export async function deleteTemplate(id: string): Promise<void> {
  await apiClient.delete(`/api/templates/${id}`);
}

// Get available categories
export async function getTemplateCategories(): Promise<TemplateCategoriesResponse> {
  const response = await apiClient.get<TemplateCategoriesResponse>(
    '/api/templates/meta/categories'
  );
  return response.data;
}

// Get template analytics for the firm
export async function getTemplateAnalytics(): Promise<TemplateAnalyticsResponse> {
  const response = await apiClient.get<TemplateAnalyticsResponse>(
    '/api/templates/meta/analytics'
  );
  return response.data;
}

// Seed default starter templates (admin only)
export async function seedDefaultTemplates(): Promise<SeedDefaultsResponse> {
  const response = await apiClient.post<SeedDefaultsResponse>(
    '/api/templates/meta/seed-defaults'
  );
  return response.data;
}

// Helper to format category for display
export function formatCategory(category: string | null | undefined): string {
  if (!category) return 'Uncategorized';
  return category;
}

// Helper to count placeholders in content
export function countPlaceholders(content: string): number {
  const regex = /\{\{([^}]+)\}\}/g;
  const matches = content.match(regex);
  return matches ? new Set(matches).size : 0;
}

// Helper to extract placeholders from content
export function extractPlaceholders(content: string): string[] {
  const regex = /\{\{([^}]+)\}\}/g;
  const placeholders: Set<string> = new Set();
  let match;
  while ((match = regex.exec(content)) !== null) {
    placeholders.add(match[1].trim());
  }
  return Array.from(placeholders);
}

// Helper to validate placeholder name
export function isValidPlaceholderName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

// Helper to replace placeholders in content
export function replacePlaceholders(
  content: string,
  values: Record<string, string>
): string {
  let result = content;
  for (const [key, value] of Object.entries(values)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value);
  }
  return result;
}

// Helper to get placeholder display name
export function getPlaceholderDisplayName(placeholder: string): string {
  // Convert snake_case to Title Case
  return placeholder
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Helper to highlight placeholders in content for display
export function highlightPlaceholders(content: string): string {
  return content.replace(
    /\{\{([^}]+)\}\}/g,
    '<span class="placeholder">{{$1}}</span>'
  );
}
