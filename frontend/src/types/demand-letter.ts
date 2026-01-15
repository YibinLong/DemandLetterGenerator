// Demand letter types for the frontend

export type DemandLetterStatus = 'draft' | 'in_review' | 'approved' | 'sent' | 'archived';

export interface DemandLetter {
  id: string;
  user_id: string;
  firm_id: string;
  template_id?: string;
  title: string;
  content: string;
  status: DemandLetterStatus;
  case_reference?: string;
  client_name?: string;
  recipient_name?: string;
  recipient_address?: string;
  incident_date?: string;
  demand_amount?: number;
  metadata?: Record<string, unknown>;
  version?: number;
  version_count?: number;
  source_documents?: SourceDocument[];
  created_at: string;
  updated_at: string;
}

export interface SourceDocument {
  id: string;
  filename?: string;
  original_filename?: string;
  file_type: string;
  file_size?: number;
  created_at?: string;
}

export interface DemandLetterListItem {
  id: string;
  user_id: string;
  firm_id: string;
  template_id?: string;
  title: string;
  status: DemandLetterStatus;
  case_reference?: string;
  client_name?: string;
  recipient_name?: string;
  incident_date?: string;
  demand_amount?: number;
  version_count: number;
  created_at: string;
  updated_at: string;
}

export interface DemandLetterListResponse {
  demand_letters: DemandLetterListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface CaseInfo {
  case_reference?: string;
  client_name?: string;
  incident_date?: string;
  defendant_name?: string;
  defendant_insurance?: string;
  claim_number?: string;
  additional_info?: string;
}

export interface CreateDemandLetterRequest {
  title: string;
  document_ids: string[];
  case_info?: CaseInfo;
  instructions?: string;
  template?: string;
  template_id?: string;
  model?: string;
}

export interface CreateDemandLetterResponse {
  id: string;
  title: string;
  content: string;
  status: DemandLetterStatus;
  case_reference?: string;
  client_name?: string;
  version: number;
  source_documents: SourceDocument[];
  ai_usage: {
    model: string;
    tokens: number;
    estimated_cost: number;
  };
  generation_time_ms: number;
  created_at: string;
}

export interface UpdateDemandLetterRequest {
  title?: string;
  content?: string;
  status?: DemandLetterStatus;
  case_reference?: string;
  client_name?: string;
  recipient_name?: string;
  recipient_address?: string;
  incident_date?: string;
  demand_amount?: number;
  metadata?: Record<string, unknown>;
}

export interface RefineRequest {
  instructions: string;
  model?: string;
}

export interface RefineResponse {
  id: string;
  content: string;
  version: number;
  ai_usage: {
    model: string;
    tokens: number;
    estimated_cost: number;
  };
  refinement_time_ms: number;
  updated_at: string;
}

export interface DemandLetterVersion {
  id: string;
  version_number: number;
  content?: string;
  change_summary?: string;
  changed_by: {
    id: string;
    name: string;
    email: string;
  };
  created_at: string;
}

export interface VersionListResponse {
  versions: DemandLetterVersion[];
  total: number;
}

export interface AIGenerationHistoryItem {
  id: string;
  generation_type: 'initial' | 'refinement';
  prompt: string;
  response_summary?: string;
  model_used?: string;
  tokens_used?: number;
  user: {
    id: string;
    name: string;
    email: string;
  };
  created_at: string;
}

export interface AIHistoryResponse {
  history: AIGenerationHistoryItem[];
  total: number;
}

// Generation status for real-time tracking
export type GenerationStatus =
  | 'idle'
  | 'preparing'
  | 'generating'
  | 'streaming'
  | 'complete'
  | 'error';

export interface GenerationState {
  status: GenerationStatus;
  progress: number;
  content: string;
  error?: string;
}

// Export options
export interface ExportOptions {
  font_name?: string;
  font_size?: number;
  margin_top?: number;
  margin_bottom?: number;
  margin_left?: number;
  margin_right?: number;
  line_spacing?: number;
  include_letterhead?: boolean;
  letterhead_firm_name?: string;
  letterhead_address?: string;
  letterhead_phone?: string;
  letterhead_email?: string;
  include_page_numbers?: boolean;
  include_date?: boolean;
}

export interface ExportRequest {
  options?: ExportOptions;
}

export interface BatchExportRequest {
  demand_letter_ids: string[];
  options?: ExportOptions;
}

export interface ExportOptionsResponse {
  fonts: string[];
  defaults: ExportOptions;
  font_sizes: number[];
  line_spacing_options: number[];
  margin_range: { min: number; max: number };
  firm_letterhead: {
    firm_name: string;
    address?: string;
    phone?: string;
    email?: string;
  } | null;
}
