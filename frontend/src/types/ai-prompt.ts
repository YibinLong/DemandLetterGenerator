// AI Prompt Template types for the frontend

export type PromptType = 'refinement' | 'generation' | 'analysis';

export type PromptCategory =
  | 'Tone & Style'
  | 'Content Enhancement'
  | 'Legal Specific'
  | 'Formatting'
  | 'Summarization'
  | 'Custom';

export interface PromptVariable {
  name: string;
  description: string;
  required: boolean;
  default_value?: string;
}

export interface AIPromptTemplate {
  id: string;
  firm_id: string;
  created_by: string;
  name: string;
  description?: string;
  prompt_type: PromptType;
  system_prompt: string;
  user_prompt_template: string;
  variables: PromptVariable[];
  category?: PromptCategory;
  is_shared: boolean;
  is_approved: boolean;
  is_default: boolean;
  usage_count: number;
  current_version: number;
  creator: {
    id: string;
    name: string;
    email: string;
  };
  created_at: string;
  updated_at: string;
}

export interface AIPromptTemplateListItem {
  id: string;
  firm_id: string;
  created_by: string;
  name: string;
  description?: string;
  prompt_type: PromptType;
  variables: PromptVariable[];
  category?: PromptCategory;
  is_shared: boolean;
  is_approved: boolean;
  is_default: boolean;
  usage_count: number;
  current_version: number;
  creator: {
    id: string;
    name: string;
    email: string;
  };
  created_at: string;
  updated_at: string;
}

export interface AIPromptTemplateListResponse {
  prompts: AIPromptTemplateListItem[];
  total: number;
  limit: number;
  offset: number;
  prompt_types: PromptType[];
  categories: PromptCategory[];
}

export interface AIPromptTemplateVersion {
  id: string;
  version_number: number;
  system_prompt: string;
  user_prompt_template: string;
  variables: PromptVariable[];
  change_summary?: string;
  changed_by: {
    id: string;
    name: string;
    email: string;
  };
  created_at: string;
}

export interface AIPromptVersionListResponse {
  versions: AIPromptTemplateVersion[];
  total: number;
}

export interface CreateAIPromptRequest {
  name: string;
  description?: string;
  prompt_type: PromptType;
  system_prompt: string;
  user_prompt_template: string;
  variables?: PromptVariable[];
  category?: PromptCategory;
  is_shared?: boolean;
}

export interface UpdateAIPromptRequest {
  name?: string;
  description?: string;
  system_prompt?: string;
  user_prompt_template?: string;
  variables?: PromptVariable[];
  category?: PromptCategory;
  is_shared?: boolean;
}

export interface TestPromptRequest {
  variable_values?: Record<string, string>;
  sample_content?: string;
}

export interface TestPromptResponse {
  preview: {
    system_prompt: string;
    user_prompt: string;
  };
  variables: {
    defined: PromptVariable[];
    provided: string[];
    missing: string[];
  };
  ai_response?: {
    generated_text?: string;
    tokens_used?: number;
    model?: string;
    error?: string;
  };
}

export interface AIPromptMetaInfo {
  prompt_types: PromptType[];
  categories: PromptCategory[];
  variable_syntax: string;
  reserved_variables: string[];
}
