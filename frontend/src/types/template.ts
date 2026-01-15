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

// Template analytics types
export interface TemplateAnalyticsSummary {
  total_templates: number;
  shared_templates: number;
  approved_templates: number;
  private_templates: number;
}

export interface CategoryBreakdown {
  category: string;
  count: number;
}

export interface TopTemplate {
  id: string;
  name: string;
  category: string | null;
  is_shared: boolean;
  is_approved: boolean;
  usage_count: number;
  last_used_at: string | null;
  creator_name: string;
}

export interface RecentActivity {
  templates_created_last_30_days: number;
  templates_updated_last_30_days: number;
}

export interface UsageStatistics {
  total_demand_letters: number;
  demand_letters_with_template: number;
  template_adoption_rate: number;
  unique_templates_used: number;
}

export interface TemplatesByCreator {
  user_id: string;
  name: string;
  role: string;
  template_count: number;
  shared_count: number;
}

export interface TemplateAnalyticsResponse {
  summary: TemplateAnalyticsSummary;
  category_breakdown: CategoryBreakdown[];
  top_templates: TopTemplate[];
  recent_activity: RecentActivity;
  usage_statistics: UsageStatistics;
  templates_by_creator: TemplatesByCreator[];
}

export interface SeedDefaultsResponse {
  message: string;
  templates_created: string[];
  templates_skipped: string[];
  total_created: number;
  total_skipped: number;
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
