// Database schema definitions for Demand Letter Generator
// Using SQLite with better-sqlite3

export const SCHEMA_VERSION = 5;

// SQL statements for creating all tables
export const CREATE_TABLES_SQL = `
-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Schema version tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  description TEXT
);

-- Firms table - law firms that use the system
CREATE TABLE IF NOT EXISTS firms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Users table - attorneys, paralegals, and other staff
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  firm_id TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'attorney', 'paralegal', 'staff')),
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE
);

-- Documents table - uploaded source documents
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  firm_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'docx', 'txt')),
  file_size INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  case_reference TEXT,
  description TEXT,
  extracted_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE
);

-- Templates table - demand letter templates
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  firm_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  placeholders TEXT, -- JSON array of placeholder names
  category TEXT,
  is_shared INTEGER NOT NULL DEFAULT 0, -- 1 = shared with firm, 0 = private
  is_approved INTEGER NOT NULL DEFAULT 0, -- 1 = approved for firm-wide use
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Demand letters table - generated demand letters
CREATE TABLE IF NOT EXISTS demand_letters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  firm_id TEXT NOT NULL,
  template_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_html TEXT, -- HTML formatted content for rich text editing
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'approved', 'sent', 'archived')),
  case_reference TEXT,
  client_name TEXT,
  recipient_name TEXT,
  recipient_address TEXT,
  incident_date TEXT,
  demand_amount REAL,
  metadata TEXT, -- JSON for additional custom fields
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
);

-- Demand letter versions table - version history for demand letters
CREATE TABLE IF NOT EXISTS demand_letter_versions (
  id TEXT PRIMARY KEY,
  demand_letter_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_html TEXT, -- HTML formatted content for rich text editing
  changed_by TEXT NOT NULL,
  change_summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (demand_letter_id) REFERENCES demand_letters(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Demand letter source documents junction table
CREATE TABLE IF NOT EXISTS demand_letter_documents (
  id TEXT PRIMARY KEY,
  demand_letter_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (demand_letter_id) REFERENCES demand_letters(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  UNIQUE(demand_letter_id, document_id)
);

-- AI generation history table - for audit trail
CREATE TABLE IF NOT EXISTS ai_generation_history (
  id TEXT PRIMARY KEY,
  demand_letter_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  response_summary TEXT,
  model_used TEXT,
  tokens_used INTEGER,
  generation_type TEXT NOT NULL CHECK (generation_type IN ('initial', 'refinement')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (demand_letter_id) REFERENCES demand_letters(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Audit logs table for compliance tracking
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id TEXT,
  firm_id TEXT,
  resource_type TEXT,
  resource_id TEXT,
  details TEXT, -- JSON for additional event data
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE SET NULL
);

-- Rate limit tracking table
CREATE TABLE IF NOT EXISTS rate_limits (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL, -- IP address or user ID
  endpoint TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(identifier, endpoint)
);

-- Collaboration sessions table - tracks active editing sessions
CREATE TABLE IF NOT EXISTS collaboration_sessions (
  id TEXT PRIMARY KEY,
  demand_letter_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (demand_letter_id) REFERENCES demand_letters(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Collaboration invites table - sharing access to edit sessions
CREATE TABLE IF NOT EXISTS collaboration_invites (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  demand_letter_id TEXT NOT NULL,
  invited_by TEXT NOT NULL,
  invited_user_id TEXT, -- For internal users
  invited_email TEXT, -- For external invites
  token TEXT NOT NULL UNIQUE, -- Secure token for invite link
  permission TEXT NOT NULL DEFAULT 'edit' CHECK (permission IN ('view', 'edit')),
  accepted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (demand_letter_id) REFERENCES demand_letters(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_firm_id ON users(firm_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_documents_firm_id ON documents(firm_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_case_reference ON documents(case_reference);
CREATE INDEX IF NOT EXISTS idx_templates_firm_id ON templates(firm_id);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_demand_letters_firm_id ON demand_letters(firm_id);
CREATE INDEX IF NOT EXISTS idx_demand_letters_user_id ON demand_letters(user_id);
CREATE INDEX IF NOT EXISTS idx_demand_letters_status ON demand_letters(status);
CREATE INDEX IF NOT EXISTS idx_demand_letters_case_reference ON demand_letters(case_reference);
CREATE INDEX IF NOT EXISTS idx_demand_letter_versions_demand_letter_id ON demand_letter_versions(demand_letter_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_firm_id ON audit_logs(firm_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON rate_limits(identifier);
CREATE INDEX IF NOT EXISTS idx_collaboration_sessions_demand_letter_id ON collaboration_sessions(demand_letter_id);
CREATE INDEX IF NOT EXISTS idx_collaboration_sessions_is_active ON collaboration_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_collaboration_invites_token ON collaboration_invites(token);
CREATE INDEX IF NOT EXISTS idx_collaboration_invites_session_id ON collaboration_invites(session_id);
CREATE INDEX IF NOT EXISTS idx_collaboration_invites_invited_user_id ON collaboration_invites(invited_user_id);

-- Document changes table - tracks individual changes for change tracking
CREATE TABLE IF NOT EXISTS document_changes (
  id TEXT PRIMARY KEY,
  demand_letter_id TEXT NOT NULL,
  version_id TEXT, -- Optional: links to specific version
  user_id TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('insertion', 'deletion', 'modification', 'format')),
  position_start INTEGER NOT NULL, -- Character position where change starts
  position_end INTEGER NOT NULL, -- Character position where change ends
  old_content TEXT, -- Original content (for deletions/modifications)
  new_content TEXT, -- New content (for insertions/modifications)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  reviewed_by TEXT, -- User who accepted/rejected the change
  reviewed_at TEXT,
  metadata TEXT, -- JSON for additional change data (e.g., formatting details)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (demand_letter_id) REFERENCES demand_letters(id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES demand_letter_versions(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Document comments table - stores comments and annotations
CREATE TABLE IF NOT EXISTS document_comments (
  id TEXT PRIMARY KEY,
  demand_letter_id TEXT NOT NULL,
  change_id TEXT, -- Optional: comment on a specific change
  user_id TEXT NOT NULL,
  parent_id TEXT, -- For threaded replies
  content TEXT NOT NULL,
  position_start INTEGER, -- Character position for inline comments
  position_end INTEGER,
  is_resolved INTEGER NOT NULL DEFAULT 0,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (demand_letter_id) REFERENCES demand_letters(id) ON DELETE CASCADE,
  FOREIGN KEY (change_id) REFERENCES document_changes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES document_comments(id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for change tracking tables
CREATE INDEX IF NOT EXISTS idx_document_changes_demand_letter_id ON document_changes(demand_letter_id);
CREATE INDEX IF NOT EXISTS idx_document_changes_user_id ON document_changes(user_id);
CREATE INDEX IF NOT EXISTS idx_document_changes_status ON document_changes(status);
CREATE INDEX IF NOT EXISTS idx_document_changes_version_id ON document_changes(version_id);
CREATE INDEX IF NOT EXISTS idx_document_comments_demand_letter_id ON document_comments(demand_letter_id);
CREATE INDEX IF NOT EXISTS idx_document_comments_change_id ON document_comments(change_id);
CREATE INDEX IF NOT EXISTS idx_document_comments_user_id ON document_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_document_comments_parent_id ON document_comments(parent_id);
`;

// TypeScript interfaces matching the database schema
export interface Firm {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  firm_id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'attorney' | 'paralegal' | 'staff';
  is_active: number;
  last_login?: string;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  user_id: string;
  firm_id: string;
  filename: string;
  original_filename: string;
  file_type: 'pdf' | 'docx' | 'txt';
  file_size: number;
  file_path: string;
  case_reference?: string;
  description?: string;
  extracted_text?: string;
  created_at: string;
  updated_at: string;
}

export interface Template {
  id: string;
  firm_id: string;
  created_by: string;
  name: string;
  description?: string;
  content: string;
  placeholders?: string; // JSON string
  category?: string;
  is_shared: number;
  is_approved: number;
  created_at: string;
  updated_at: string;
}

export interface DemandLetter {
  id: string;
  user_id: string;
  firm_id: string;
  template_id?: string;
  title: string;
  content: string;
  content_html?: string;
  status: 'draft' | 'in_review' | 'approved' | 'sent' | 'archived';
  case_reference?: string;
  client_name?: string;
  recipient_name?: string;
  recipient_address?: string;
  incident_date?: string;
  demand_amount?: number;
  metadata?: string; // JSON string
  created_at: string;
  updated_at: string;
}

export interface DemandLetterVersion {
  id: string;
  demand_letter_id: string;
  version_number: number;
  content: string;
  content_html?: string;
  changed_by: string;
  change_summary?: string;
  created_at: string;
}

export interface DemandLetterDocument {
  id: string;
  demand_letter_id: string;
  document_id: string;
  created_at: string;
}

export interface AIGenerationHistory {
  id: string;
  demand_letter_id: string;
  user_id: string;
  prompt: string;
  response_summary?: string;
  model_used?: string;
  tokens_used?: number;
  generation_type: 'initial' | 'refinement';
  created_at: string;
}

export interface SchemaMigration {
  version: number;
  applied_at: string;
  description?: string;
}

export interface AuditLog {
  id: string;
  event_type: string;
  user_id?: string;
  firm_id?: string;
  resource_type?: string;
  resource_id?: string;
  details?: string; // JSON string
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface RateLimit {
  id: string;
  identifier: string;
  endpoint: string;
  request_count: number;
  window_start: string;
  created_at: string;
}

export interface CollaborationSession {
  id: string;
  demand_letter_id: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  is_active: number;
}

export interface CollaborationInvite {
  id: string;
  session_id: string;
  demand_letter_id: string;
  invited_by: string;
  invited_user_id?: string;
  invited_email?: string;
  token: string;
  permission: 'view' | 'edit';
  accepted: number;
  created_at: string;
  expires_at: string;
}

export interface DocumentChange {
  id: string;
  demand_letter_id: string;
  version_id?: string;
  user_id: string;
  change_type: 'insertion' | 'deletion' | 'modification' | 'format';
  position_start: number;
  position_end: number;
  old_content?: string;
  new_content?: string;
  status: 'pending' | 'accepted' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: string;
  metadata?: string; // JSON string
  created_at: string;
}

export interface DocumentComment {
  id: string;
  demand_letter_id: string;
  change_id?: string;
  user_id: string;
  parent_id?: string;
  content: string;
  position_start?: number;
  position_end?: number;
  is_resolved: number;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
}
