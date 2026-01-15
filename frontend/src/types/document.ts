// Document types for the frontend

export interface Document {
  id: string;
  user_id: string;
  firm_id: string;
  original_filename: string;
  file_type: 'pdf' | 'docx' | 'txt';
  file_size: number;
  case_reference?: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentUploadResponse {
  id: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  case_reference: string | null;
  description: string | null;
  created_at: string;
  message: string;
}

export interface MultipleUploadResponse {
  documents: Array<{
    id: string;
    original_filename: string;
    file_type: string;
    file_size: number;
  }>;
  count: number;
  message: string;
}

export interface DocumentListResponse {
  documents: Document[];
  total: number;
  limit: number;
  offset: number;
}

export interface UploadProgress {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
  documentId?: string;
}
