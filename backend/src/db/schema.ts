// Database schema definitions for Demand Letter Generator
// Using SQLite with better-sqlite3

export const SCHEMA_VERSION = 1;

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
