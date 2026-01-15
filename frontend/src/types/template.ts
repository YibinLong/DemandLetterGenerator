// Template types for the frontend

export interface TemplateCreator {
  id: string;
  name: string;
  email: string;
}

export interface Template {
  id: string;
  firm_id: string;
  created_by: string;
  name: string;
  description?: string | null;
  content: string;
  placeholders: string[];
  category?: string | null;
  is_shared: boolean;
  is_approved: boolean;
  creator: TemplateCreator;
  usage_count?: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateListItem {
  id: string;
  firm_id: string;
  created_by: string;
  name: string;
  description?: string | null;
  placeholders: string[];
  category?: string | null;
  is_shared: boolean;
  is_approved: boolean;
  creator: TemplateCreator;
  created_at: string;
  updated_at: string;
}

export interface TemplateListResponse {
  templates: TemplateListItem[];
  total: number;
  limit: number;
  offset: number;
  categories: string[];
}

export interface CreateTemplateRequest {
  name: string;
  description?: string;
  content: string;
  category?: string;
  is_shared?: boolean;
}

export interface CreateTemplateResponse extends Template {
  message: string;
}

export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  content?: string;
  category?: string;
  is_shared?: boolean;
}

export interface UpdateTemplateResponse extends Template {
  message: string;
}

export interface TemplateApprovalResponse {
  id: string;
  is_approved: boolean;
  updated_at: string;
  message: string;
}

export interface DuplicateTemplateRequest {
  name?: string;
}

export interface DuplicateTemplateResponse extends Template {
  message: string;
}

export interface TemplatePreviewRequest {
  values: Record<string, string>;
}

export interface TemplatePreviewResponse {
  preview: string;
  placeholders: string[];
  provided: string[];
  missing: string[];
}

export interface TemplateCategoriesResponse {
  categories: string[];
}

// Template categories
export const TEMPLATE_CATEGORIES = [
  'Personal Injury',
  'Auto Accident',
  'Medical Malpractice',
  'Slip and Fall',
  'Product Liability',
  'Workers Compensation',
  'General',
  'Other'
] as const;

export type TemplateCategory = typeof TEMPLATE_CATEGORIES[number];
