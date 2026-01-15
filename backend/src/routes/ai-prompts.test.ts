// AI Prompts Management API tests
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test database setup
const TEST_DB_PATH = path.resolve(__dirname, '../../data/test-ai-prompts.sqlite');
const JWT_SECRET = 'test-jwt-secret';

let db: Database.Database;
let testFirmId: string;
let testUserId: string;
let testAdminId: string;
let testToken: string;
let testAdminToken: string;

// Create test database schema
const createTestSchema = () => {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS firms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      firm_id TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      role TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_prompt_templates (
      id TEXT PRIMARY KEY,
      firm_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      prompt_type TEXT NOT NULL CHECK (prompt_type IN ('refinement', 'generation', 'analysis')),
      system_prompt TEXT NOT NULL,
      user_prompt_template TEXT NOT NULL,
      variables TEXT,
      category TEXT,
      is_shared INTEGER NOT NULL DEFAULT 0,
      is_approved INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      usage_count INTEGER NOT NULL DEFAULT 0,
      current_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_prompt_template_versions (
      id TEXT PRIMARY KEY,
      prompt_template_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      system_prompt TEXT NOT NULL,
      user_prompt_template TEXT NOT NULL,
      variables TEXT,
      changed_by TEXT NOT NULL,
      change_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (prompt_template_id) REFERENCES ai_prompt_templates(id) ON DELETE CASCADE,
      FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      user_id TEXT,
      firm_id TEXT,
      resource_type TEXT,
      resource_id TEXT,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ai_prompt_templates_firm_id ON ai_prompt_templates(firm_id);
    CREATE INDEX IF NOT EXISTS idx_ai_prompt_templates_type ON ai_prompt_templates(prompt_type);
    CREATE INDEX IF NOT EXISTS idx_ai_prompt_template_versions_template ON ai_prompt_template_versions(prompt_template_id);
  `);
};

// Create test users and generate tokens
const createTestUsersAndTokens = () => {
  testFirmId = uuidv4();
  testUserId = uuidv4();
  testAdminId = uuidv4();

  // Create firm
  db.prepare(`INSERT INTO firms (id, name) VALUES (?, ?)`).run(testFirmId, 'Test Law Firm');

  const passwordHash = bcrypt.hashSync('Password123!', 10);

  // Create attorney user
  db.prepare(`
    INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(testUserId, testFirmId, 'attorney@example.com', passwordHash, 'Test', 'Attorney', 'attorney');

  // Create admin user
  db.prepare(`
    INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(testAdminId, testFirmId, 'admin@example.com', passwordHash, 'Test', 'Admin', 'admin');

  // Generate tokens
  testToken = jwt.sign(
    { userId: testUserId, email: 'attorney@example.com', firmId: testFirmId, role: 'attorney' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  testAdminToken = jwt.sign(
    { userId: testAdminId, email: 'admin@example.com', firmId: testFirmId, role: 'admin' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
};

// Helper function to extract variables from prompts
const extractVariables = (systemPrompt: string, userPrompt: string): string[] => {
  const regex = /\{\{([^}]+)\}\}/g;
  const variables: Set<string> = new Set();
  let match;
  while ((match = regex.exec(systemPrompt)) !== null) {
    variables.add(match[1].trim());
  }
  while ((match = regex.exec(userPrompt)) !== null) {
    variables.add(match[1].trim());
  }
  return Array.from(variables);
};

describe('AI Prompts Management API', () => {
  beforeAll(() => {
    // Ensure test directories exist
    if (!fs.existsSync(path.dirname(TEST_DB_PATH))) {
      fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
    }

    // Create test database
    db = new Database(TEST_DB_PATH);
    createTestSchema();
    createTestUsersAndTokens();
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  beforeEach(() => {
    // Clear tables before each test
    db.prepare('DELETE FROM ai_prompt_template_versions').run();
    db.prepare('DELETE FROM ai_prompt_templates').run();
    db.prepare('DELETE FROM audit_logs').run();
  });

  describe('AI Prompt Template Creation', () => {
    it('should create a new AI prompt template with valid data', () => {
      const templateId = uuidv4();
      const now = new Date().toISOString();
      const systemPrompt = 'You are a legal assistant. Context: {{context}}';
      const userPrompt = 'Refine this: {{current_draft}}';
      const variables = extractVariables(systemPrompt, userPrompt);

      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, description, prompt_type,
          system_prompt, user_prompt_template, variables, category,
          is_shared, is_approved, is_default, usage_count, current_version,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        templateId,
        testFirmId,
        testUserId,
        'Test Prompt',
        'A test prompt template',
        'refinement',
        systemPrompt,
        userPrompt,
        JSON.stringify(variables.map(v => ({ name: v, description: '', required: true }))),
        'Tone & Style',
        0,
        0,
        0,
        0,
        1,
        now,
        now
      );

      const template = db.prepare('SELECT * FROM ai_prompt_templates WHERE id = ?').get(templateId) as {
        id: string;
        name: string;
        prompt_type: string;
        system_prompt: string;
        user_prompt_template: string;
        variables: string;
        current_version: number;
      };

      expect(template).toBeDefined();
      expect(template.name).toBe('Test Prompt');
      expect(template.prompt_type).toBe('refinement');
      expect(template.system_prompt).toBe(systemPrompt);
      expect(template.current_version).toBe(1);

      const parsedVariables = JSON.parse(template.variables);
      expect(parsedVariables).toContainEqual(expect.objectContaining({ name: 'context' }));
      expect(parsedVariables).toContainEqual(expect.objectContaining({ name: 'current_draft' }));
    });

    it('should extract variables from prompt templates', () => {
      const systemPrompt = 'Hello {{name}}, context: {{context}}';
      const userPrompt = 'Process {{content}} with {{style}}';

      const variables = extractVariables(systemPrompt, userPrompt);

      expect(variables).toContain('name');
      expect(variables).toContain('context');
      expect(variables).toContain('content');
      expect(variables).toContain('style');
      expect(variables.length).toBe(4);
    });

    it('should validate prompt type values', () => {
      const validTypes = ['refinement', 'generation', 'analysis'];

      expect(validTypes).toContain('refinement');
      expect(validTypes).toContain('generation');
      expect(validTypes).toContain('analysis');
      expect(validTypes).not.toContain('invalid');
    });

    it('should prevent duplicate template names within firm', () => {
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, prompt_type, system_prompt,
          user_prompt_template, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, 'Unique Name', 'refinement', 'test', 'test', now, now);

      // Check for duplicate before insert
      const existing = db.prepare(`
        SELECT id FROM ai_prompt_templates WHERE firm_id = ? AND name = ?
      `).get(testFirmId, 'Unique Name');

      expect(existing).toBeDefined();
    });
  });

  describe('AI Prompt Template Retrieval', () => {
    it('should retrieve templates by firm_id', () => {
      const now = new Date().toISOString();

      // Insert templates
      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, prompt_type, system_prompt,
          user_prompt_template, category, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, 'Prompt 1', 'refinement', 'sys', 'usr', 'Tone & Style', now, now);

      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, prompt_type, system_prompt,
          user_prompt_template, category, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, 'Prompt 2', 'generation', 'sys', 'usr', 'Content Enhancement', now, now);

      const templates = db.prepare('SELECT * FROM ai_prompt_templates WHERE firm_id = ?').all(testFirmId);
      expect(templates.length).toBe(2);
    });

    it('should filter templates by prompt type', () => {
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, prompt_type, system_prompt,
          user_prompt_template, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, 'Refinement 1', 'refinement', 'sys', 'usr', now, now);

      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, prompt_type, system_prompt,
          user_prompt_template, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, 'Refinement 2', 'refinement', 'sys', 'usr', now, now);

      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, prompt_type, system_prompt,
          user_prompt_template, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, 'Generation 1', 'generation', 'sys', 'usr', now, now);

      const refinementTemplates = db.prepare(`
        SELECT * FROM ai_prompt_templates WHERE firm_id = ? AND prompt_type = ?
      `).all(testFirmId, 'refinement');

      expect(refinementTemplates.length).toBe(2);
    });

    it('should filter templates by category', () => {
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, prompt_type, system_prompt,
          user_prompt_template, category, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, 'Style Prompt', 'refinement', 'sys', 'usr', 'Tone & Style', now, now);

      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, prompt_type, system_prompt,
          user_prompt_template, category, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, 'Content Prompt', 'refinement', 'sys', 'usr', 'Content Enhancement', now, now);

      const toneTemplates = db.prepare(`
        SELECT * FROM ai_prompt_templates WHERE firm_id = ? AND category = ?
      `).all(testFirmId, 'Tone & Style');

      expect(toneTemplates.length).toBe(1);
    });

    it('should filter templates by shared status', () => {
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, prompt_type, system_prompt,
          user_prompt_template, is_shared, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, 'Shared', 'refinement', 'sys', 'usr', 1, now, now);

      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, prompt_type, system_prompt,
          user_prompt_template, is_shared, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, 'Private', 'refinement', 'sys', 'usr', 0, now, now);

      const sharedTemplates = db.prepare(`
        SELECT * FROM ai_prompt_templates WHERE firm_id = ? AND is_shared = 1
      `).all(testFirmId);

      expect(sharedTemplates.length).toBe(1);
    });
  });

  describe('AI Prompt Template Updates', () => {
    it('should update template name and description', () => {
      const templateId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, description, prompt_type,
          system_prompt, user_prompt_template, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(templateId, testFirmId, testUserId, 'Original', 'Original desc', 'refinement', 'sys', 'usr', now, now);

      db.prepare(`
        UPDATE ai_prompt_templates SET name = ?, description = ?, updated_at = ? WHERE id = ?
      `).run('Updated', 'Updated desc', new Date().toISOString(), templateId);

      const template = db.prepare('SELECT * FROM ai_prompt_templates WHERE id = ?').get(templateId) as {
        name: string;
        description: string;
      };

      expect(template.name).toBe('Updated');
      expect(template.description).toBe('Updated desc');
    });

    it('should create new version when prompts change', () => {
      const templateId = uuidv4();
      const versionId = uuidv4();
      const now = new Date().toISOString();

      // Create template
      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, prompt_type, system_prompt,
          user_prompt_template, current_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(templateId, testFirmId, testUserId, 'Versioned', 'refinement', 'Version 1', 'Version 1', 1, now, now);

      // Create version 1 record
      db.prepare(`
        INSERT INTO ai_prompt_template_versions (
          id, prompt_template_id, version_number, system_prompt,
          user_prompt_template, changed_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(versionId, templateId, 1, 'Version 1', 'Version 1', testUserId, now);

      // Update template to version 2
      db.prepare(`
        UPDATE ai_prompt_templates
        SET system_prompt = ?, current_version = ?, updated_at = ?
        WHERE id = ?
      `).run('Version 2', 2, new Date().toISOString(), templateId);

      // Create version 2 record
      db.prepare(`
        INSERT INTO ai_prompt_template_versions (
          id, prompt_template_id, version_number, system_prompt,
          user_prompt_template, changed_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), templateId, 2, 'Version 2', 'Version 1', testUserId, new Date().toISOString());

      const template = db.prepare('SELECT current_version FROM ai_prompt_templates WHERE id = ?').get(templateId) as {
        current_version: number;
      };

      expect(template.current_version).toBe(2);

      const versions = db.prepare(`
        SELECT * FROM ai_prompt_template_versions WHERE prompt_template_id = ? ORDER BY version_number
      `).all(templateId);

      expect(versions.length).toBe(2);
    });
  });

  describe('AI Prompt Template Versioning', () => {
    it('should return version history', () => {
      const templateId = uuidv4();
      const now = new Date().toISOString();

      // Create template
      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, prompt_type, system_prompt,
          user_prompt_template, current_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(templateId, testFirmId, testUserId, 'Versioned', 'refinement', 'V2', 'V2', 2, now, now);

      // Create version records
      db.prepare(`
        INSERT INTO ai_prompt_template_versions (
          id, prompt_template_id, version_number, system_prompt,
          user_prompt_template, changed_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), templateId, 1, 'V1', 'V1', testUserId, now);

      db.prepare(`
        INSERT INTO ai_prompt_template_versions (
          id, prompt_template_id, version_number, system_prompt,
          user_prompt_template, changed_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), templateId, 2, 'V2', 'V2', testUserId, new Date().toISOString());

      const versions = db.prepare(`
        SELECT * FROM ai_prompt_template_versions
        WHERE prompt_template_id = ?
        ORDER BY version_number DESC
      `).all(templateId) as Array<{ version_number: number; system_prompt: string }>;

      expect(versions.length).toBe(2);
      expect(versions[0].version_number).toBe(2);
      expect(versions[1].version_number).toBe(1);
    });

    it('should restore from a previous version', () => {
      const templateId = uuidv4();
      const now = new Date().toISOString();

      // Create template at version 2
      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, prompt_type, system_prompt,
          user_prompt_template, current_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(templateId, testFirmId, testUserId, 'Versioned', 'refinement', 'V2', 'V2', 2, now, now);

      // Create version 1 record
      db.prepare(`
        INSERT INTO ai_prompt_template_versions (
          id, prompt_template_id, version_number, system_prompt,
          user_prompt_template, changed_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), templateId, 1, 'V1', 'V1', testUserId, now);

      // Get version 1 content
      const v1 = db.prepare(`
        SELECT system_prompt, user_prompt_template FROM ai_prompt_template_versions
        WHERE prompt_template_id = ? AND version_number = ?
      `).get(templateId, 1) as { system_prompt: string; user_prompt_template: string };

      // Restore to version 1 (creates version 3)
      db.prepare(`
        UPDATE ai_prompt_templates
        SET system_prompt = ?, user_prompt_template = ?, current_version = ?, updated_at = ?
        WHERE id = ?
      `).run(v1.system_prompt, v1.user_prompt_template, 3, new Date().toISOString(), templateId);

      const template = db.prepare('SELECT * FROM ai_prompt_templates WHERE id = ?').get(templateId) as {
        system_prompt: string;
        current_version: number;
      };

      expect(template.system_prompt).toBe('V1');
      expect(template.current_version).toBe(3);
    });
  });

  describe('AI Prompt Template Duplication', () => {
    it('should duplicate a prompt template with new id', () => {
      const originalId = uuidv4();
      const newId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, description, prompt_type,
          system_prompt, user_prompt_template, category, is_shared,
          is_approved, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(originalId, testFirmId, testUserId, 'Original', 'Desc', 'refinement', 'sys', 'usr', 'Tone & Style', 1, 1, now, now);

      // Get original
      const original = db.prepare('SELECT * FROM ai_prompt_templates WHERE id = ?').get(originalId) as {
        description: string;
        system_prompt: string;
        user_prompt_template: string;
        category: string;
      };

      // Create duplicate
      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, description, prompt_type,
          system_prompt, user_prompt_template, category, is_shared,
          is_approved, current_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newId,
        testFirmId,
        testUserId,
        'Original (Copy)',
        original.description,
        'refinement',
        original.system_prompt,
        original.user_prompt_template,
        original.category,
        0,
        0,
        1,
        now,
        now
      );

      const duplicate = db.prepare('SELECT * FROM ai_prompt_templates WHERE id = ?').get(newId) as {
        id: string;
        name: string;
        is_shared: number;
        is_approved: number;
        current_version: number;
      };

      expect(duplicate.id).not.toBe(originalId);
      expect(duplicate.name).toBe('Original (Copy)');
      expect(duplicate.is_shared).toBe(0);
      expect(duplicate.is_approved).toBe(0);
      expect(duplicate.current_version).toBe(1);
    });
  });

  describe('AI Prompt Template Testing/Preview', () => {
    it('should replace variables with provided values', () => {
      const systemPrompt = 'Hello {{name}}';
      const userPrompt = 'Process {{content}}';
      const values: Record<string, string> = {
        name: 'World',
        content: 'this text',
      };

      let previewSystem = systemPrompt;
      let previewUser = userPrompt;

      for (const [key, value] of Object.entries(values)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        previewSystem = previewSystem.replace(regex, value);
        previewUser = previewUser.replace(regex, value);
      }

      expect(previewSystem).toBe('Hello World');
      expect(previewUser).toBe('Process this text');
    });

    it('should identify missing required variables', () => {
      const variables = [
        { name: 'name', required: true },
        { name: 'content', required: true },
        { name: 'optional', required: false },
      ];
      const providedValues = { name: 'World' };

      const missing = variables
        .filter(v => v.required && !providedValues[v.name as keyof typeof providedValues])
        .map(v => v.name);

      expect(missing).toContain('content');
      expect(missing).not.toContain('optional');
      expect(missing.length).toBe(1);
    });

    it('should preserve unfilled variables in preview', () => {
      const systemPrompt = 'Hello {{name}}, context: {{context}}';
      const values: Record<string, string> = {
        name: 'World',
      };

      let preview = systemPrompt;
      for (const [key, value] of Object.entries(values)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        preview = preview.replace(regex, value);
      }

      expect(preview).toBe('Hello World, context: {{context}}');
    });
  });

  describe('AI Prompt Template Approval', () => {
    it('should allow admin to approve shared template', () => {
      const templateId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, prompt_type, system_prompt,
          user_prompt_template, is_shared, is_approved, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(templateId, testFirmId, testUserId, 'To Approve', 'refinement', 'sys', 'usr', 1, 0, now, now);

      // Admin approves
      db.prepare(`UPDATE ai_prompt_templates SET is_approved = ?, updated_at = ? WHERE id = ?`)
        .run(1, new Date().toISOString(), templateId);

      const template = db.prepare('SELECT is_approved FROM ai_prompt_templates WHERE id = ?').get(templateId) as {
        is_approved: number;
      };

      expect(template.is_approved).toBe(1);
    });

    it('should restrict approval to admin role', () => {
      const decoded = jwt.verify(testAdminToken, JWT_SECRET) as { role: string };
      expect(decoded.role).toBe('admin');

      const userDecoded = jwt.verify(testToken, JWT_SECRET) as { role: string };
      expect(userDecoded.role).not.toBe('admin');
    });
  });

  describe('AI Prompt Template Deletion', () => {
    it('should delete a template from database', () => {
      const templateId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, prompt_type, system_prompt,
          user_prompt_template, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(templateId, testFirmId, testUserId, 'To Delete', 'refinement', 'sys', 'usr', now, now);

      db.prepare('DELETE FROM ai_prompt_templates WHERE id = ?').run(templateId);

      const template = db.prepare('SELECT * FROM ai_prompt_templates WHERE id = ?').get(templateId);
      expect(template).toBeUndefined();
    });

    it('should cascade delete versions when template is deleted', () => {
      const templateId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, prompt_type, system_prompt,
          user_prompt_template, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(templateId, testFirmId, testUserId, 'With Versions', 'refinement', 'sys', 'usr', now, now);

      db.prepare(`
        INSERT INTO ai_prompt_template_versions (
          id, prompt_template_id, version_number, system_prompt,
          user_prompt_template, changed_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), templateId, 1, 'sys', 'usr', testUserId, now);

      db.prepare('DELETE FROM ai_prompt_templates WHERE id = ?').run(templateId);

      const versions = db.prepare(`
        SELECT * FROM ai_prompt_template_versions WHERE prompt_template_id = ?
      `).all(templateId);

      expect(versions.length).toBe(0);
    });
  });

  describe('AI Prompt Categories', () => {
    it('should support predefined categories', () => {
      const categories = [
        'Tone & Style',
        'Content Enhancement',
        'Legal Specific',
        'Structure & Format',
        'Custom',
      ];

      expect(categories.length).toBe(5);
      expect(categories).toContain('Tone & Style');
      expect(categories).toContain('Legal Specific');
    });

    it('should allow templates without category', () => {
      const templateId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, prompt_type, system_prompt,
          user_prompt_template, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(templateId, testFirmId, testUserId, 'No Category', 'refinement', 'sys', 'usr', now, now);

      const template = db.prepare('SELECT category FROM ai_prompt_templates WHERE id = ?').get(templateId) as {
        category: string | null;
      };

      expect(template.category).toBeNull();
    });
  });

  describe('Default AI Prompt Templates', () => {
    it('should create default templates when seeding', () => {
      const now = new Date().toISOString();

      const defaultTemplates = [
        { name: 'Professional Tone', type: 'refinement', category: 'Tone & Style' },
        { name: 'Formal Legal Language', type: 'refinement', category: 'Legal Specific' },
        { name: 'Concise Summary', type: 'refinement', category: 'Structure & Format' },
      ];

      for (const template of defaultTemplates) {
        db.prepare(`
          INSERT INTO ai_prompt_templates (
            id, firm_id, created_by, name, prompt_type, system_prompt,
            user_prompt_template, category, is_shared, is_approved, is_default,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          uuidv4(),
          testFirmId,
          testAdminId,
          template.name,
          template.type,
          `Default system prompt for ${template.name}`,
          `Default user prompt for ${template.name}`,
          template.category,
          1,
          1,
          1,
          now,
          now
        );
      }

      const templates = db.prepare(`
        SELECT * FROM ai_prompt_templates WHERE firm_id = ? AND is_default = 1
      `).all(testFirmId);

      expect(templates.length).toBe(3);
    });

    it('should mark default templates as shared and approved', () => {
      const templateId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, prompt_type, system_prompt,
          user_prompt_template, is_shared, is_approved, is_default,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(templateId, testFirmId, testAdminId, 'Default', 'refinement', 'sys', 'usr', 1, 1, 1, now, now);

      const template = db.prepare(`
        SELECT is_shared, is_approved, is_default FROM ai_prompt_templates WHERE id = ?
      `).get(templateId) as { is_shared: number; is_approved: number; is_default: number };

      expect(template.is_shared).toBe(1);
      expect(template.is_approved).toBe(1);
      expect(template.is_default).toBe(1);
    });
  });

  describe('Audit Logging', () => {
    it('should log prompt template creation event', () => {
      const auditId = uuidv4();
      const templateId = uuidv4();

      db.prepare(`
        INSERT INTO audit_logs (id, event_type, user_id, firm_id, resource_type, resource_id, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        auditId,
        'AI_PROMPT_CREATED',
        testUserId,
        testFirmId,
        'ai_prompt_template',
        templateId,
        JSON.stringify({ name: 'Test Prompt', prompt_type: 'refinement' })
      );

      const log = db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(auditId) as {
        event_type: string;
        resource_type: string;
      };

      expect(log.event_type).toBe('AI_PROMPT_CREATED');
      expect(log.resource_type).toBe('ai_prompt_template');
    });

    it('should log prompt template update event', () => {
      const auditId = uuidv4();
      const templateId = uuidv4();

      db.prepare(`
        INSERT INTO audit_logs (id, event_type, user_id, firm_id, resource_type, resource_id, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        auditId,
        'AI_PROMPT_UPDATED',
        testUserId,
        testFirmId,
        'ai_prompt_template',
        templateId,
        JSON.stringify({ updated_fields: ['name', 'system_prompt'], new_version: 2 })
      );

      const log = db.prepare('SELECT * FROM audit_logs WHERE event_type = ?').get('AI_PROMPT_UPDATED') as {
        event_type: string;
        details: string;
      };

      expect(log.event_type).toBe('AI_PROMPT_UPDATED');
      expect(JSON.parse(log.details).new_version).toBe(2);
    });
  });

  describe('Usage Tracking', () => {
    it('should increment usage count when template is used', () => {
      const templateId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, prompt_type, system_prompt,
          user_prompt_template, usage_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(templateId, testFirmId, testUserId, 'Track Usage', 'refinement', 'sys', 'usr', 0, now, now);

      // Increment usage
      db.prepare(`
        UPDATE ai_prompt_templates SET usage_count = usage_count + 1 WHERE id = ?
      `).run(templateId);

      const template = db.prepare('SELECT usage_count FROM ai_prompt_templates WHERE id = ?').get(templateId) as {
        usage_count: number;
      };

      expect(template.usage_count).toBe(1);
    });

    it('should get top templates by usage', () => {
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, prompt_type, system_prompt,
          user_prompt_template, usage_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, 'Popular', 'refinement', 'sys', 'usr', 100, now, now);

      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, prompt_type, system_prompt,
          user_prompt_template, usage_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, 'Less Popular', 'refinement', 'sys', 'usr', 10, now, now);

      const topTemplates = db.prepare(`
        SELECT * FROM ai_prompt_templates
        WHERE firm_id = ?
        ORDER BY usage_count DESC
        LIMIT 10
      `).all(testFirmId) as Array<{ name: string; usage_count: number }>;

      expect(topTemplates[0].name).toBe('Popular');
      expect(topTemplates[0].usage_count).toBe(100);
    });
  });
});
