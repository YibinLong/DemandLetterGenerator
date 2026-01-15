// Document API functions
import { apiClient } from './api';
import type {
  Document,
  DocumentUploadResponse,
  MultipleUploadResponse,
  DocumentListResponse
} from '../types/document';

// Upload a single document
export async function uploadDocument(
  file: File,
  options?: {
    case_reference?: string;
    description?: string;
    onProgress?: (progress: number) => void;
  }
): Promise<DocumentUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  if (options?.case_reference) {
    formData.append('case_reference', options.case_reference);
  }
  if (options?.description) {
    formData.append('description', options.description);
  }

  const response = await apiClient.post<DocumentUploadResponse>('/api/documents/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && options?.onProgress) {
        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        options.onProgress(progress);
      }
    },
  });

  return response.data;
}

// Upload multiple documents
export async function uploadMultipleDocuments(
  files: File[],
  options?: {
    case_reference?: string;
    description?: string;
    onProgress?: (progress: number) => void;
  }
): Promise<MultipleUploadResponse> {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append('files', file);
  });

  if (options?.case_reference) {
    formData.append('case_reference', options.case_reference);
  }
  if (options?.description) {
    formData.append('description', options.description);
  }

  const response = await apiClient.post<MultipleUploadResponse>('/api/documents/upload-multiple', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && options?.onProgress) {
        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        options.onProgress(progress);
      }
    },
  });

  return response.data;
}

// List documents
export async function listDocuments(params?: {
  case_reference?: string;
  file_type?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<DocumentListResponse> {
  const response = await apiClient.get<DocumentListResponse>('/api/documents', { params });
  return response.data;
}

// Get single document
export async function getDocument(id: string): Promise<Document> {
  const response = await apiClient.get<Document>(`/api/documents/${id}`);
  return response.data;
}

// Download document
export async function downloadDocument(id: string, filename: string): Promise<void> {
  const response = await apiClient.get(`/api/documents/${id}/download`, {
    responseType: 'blob',
  });

  // Create download link
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// Update document metadata
export async function updateDocument(
  id: string,
  data: { case_reference?: string; description?: string }
): Promise<Document> {
  const response = await apiClient.patch<Document>(`/api/documents/${id}`, data);
  return response.data;
}

// Delete document
export async function deleteDocument(id: string): Promise<void> {
  await apiClient.delete(`/api/documents/${id}`);
}

// Get document preview URL (for iframe embedding)
export function getDocumentPreviewUrl(id: string): string {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  return `${baseUrl}/api/documents/${id}/preview`;
}

// Fetch document content for preview
export async function fetchDocumentPreview(id: string): Promise<{ content: string; blob: Blob }> {
  const response = await apiClient.get(`/api/documents/${id}/preview`, {
    responseType: 'blob',
  });
  const blob = response.data as Blob;
  const content = await blob.text();
  return { content, blob };
}

// Validate file before upload
export function validateFile(file: File): { valid: boolean; error?: string } {
  const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'txt'];
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  const ext = file.name.split('.').pop()?.toLowerCase();

  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`,
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large. Maximum size is 50MB`,
    };
  }

  return { valid: true };
}

// Format file size for display
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Get file type icon
export function getFileTypeIcon(fileType: string): string {
  switch (fileType) {
    case 'pdf':
      return '📄';
    case 'docx':
      return '📝';
    case 'txt':
      return '📃';
    default:
      return '📁';
  }
}
