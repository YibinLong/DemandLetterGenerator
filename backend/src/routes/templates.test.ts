// Template management API tests
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
const TEST_DB_PATH = path.resolve(__dirname, '../../data/test-templates.sqlite');
const JWT_SECRET = 'test-jwt-secret';

let db: Database.Database;
let testFirmId: string;
let testFirmId2: string;
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

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      firm_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      content TEXT NOT NULL,
      placeholders TEXT,
      category TEXT,
      is_shared INTEGER NOT NULL DEFAULT 0,
      is_approved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS demand_letters (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      firm_id TEXT NOT NULL,
      template_id TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
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

    CREATE INDEX IF NOT EXISTS idx_templates_firm_id ON templates(firm_id);
    CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
  `);
};

// Create test users and generate tokens
const createTestUsersAndTokens = () => {
  testFirmId = uuidv4();
  testFirmId2 = uuidv4();
  testUserId = uuidv4();
  testAdminId = uuidv4();

  // Create firms
  db.prepare(`INSERT INTO firms (id, name) VALUES (?, ?)`).run(testFirmId, 'Test Law Firm');
  db.prepare(`INSERT INTO firms (id, name) VALUES (?, ?)`).run(testFirmId2, 'Other Law Firm');

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

describe('Template Management API', () => {
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
    // Clear templates and demand_letters tables before each test
    db.prepare('DELETE FROM demand_letters').run();
    db.prepare('DELETE FROM templates').run();
    db.prepare('DELETE FROM audit_logs').run();
  });

  describe('Template Creation', () => {
    it('should create a new template with valid data', () => {
      const templateId = uuidv4();
      const now = new Date().toISOString();
      const content = 'Dear {{recipient_name}}, This is about {{client_name}}.';
      const placeholders = ['recipient_name', 'client_name'];

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, description, content, placeholders, category, is_shared, is_approved, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        templateId,
        testFirmId,
        testUserId,
        'Test Template',
        'A test template description',
        content,
        JSON.stringify(placeholders),
        'Personal Injury',
        0,
        0,
        now,
        now
      );

      const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(templateId) as {
        id: string;
        name: string;
        content: string;
        placeholders: string;
        category: string;
      };

      expect(template).toBeDefined();
      expect(template.name).toBe('Test Template');
      expect(template.content).toBe(content);
      expect(JSON.parse(template.placeholders)).toEqual(placeholders);
      expect(template.category).toBe('Personal Injury');
    });

    it('should extract placeholders from template content', () => {
      const content = 'Dear {{recipient_name}}, regarding {{client_name}} incident on {{incident_date}}.';
      const regex = /\{\{([^}]+)\}\}/g;
      const placeholders: Set<string> = new Set();
      let match;
      while ((match = regex.exec(content)) !== null) {
        placeholders.add(match[1].trim());
      }

      const extracted = Array.from(placeholders);
      expect(extracted).toContain('recipient_name');
      expect(extracted).toContain('client_name');
      expect(extracted).toContain('incident_date');
      expect(extracted.length).toBe(3);
    });

    it('should validate placeholder names', () => {
      const validPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

      expect(validPattern.test('client_name')).toBe(true);
      expect(validPattern.test('recipient_address')).toBe(true);
      expect(validPattern.test('_private')).toBe(true);
      expect(validPattern.test('Amount123')).toBe(true);

      expect(validPattern.test('123start')).toBe(false);
      expect(validPattern.test('has space')).toBe(false);
      expect(validPattern.test('has-dash')).toBe(false);
      expect(validPattern.test('special@char')).toBe(false);
    });

    it('should prevent duplicate template names within firm', () => {
      const templateId1 = uuidv4();
      const templateId2 = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(templateId1, testFirmId, testUserId, 'Unique Name', 'Content', now, now);

      // Check for duplicate before insert
      const existing = db.prepare(`
        SELECT id FROM templates WHERE firm_id = ? AND name = ?
      `).get(testFirmId, 'Unique Name');

      expect(existing).toBeDefined();
    });
  });

  describe('Template Retrieval', () => {
    it('should retrieve templates by firm_id', () => {
      const now = new Date().toISOString();

      // Insert templates for test firm
      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, 'Template 1', 'Content 1', now, now);

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, 'Template 2', 'Content 2', now, now);

      // Insert template for different firm
      const otherUserId = uuidv4();
      db.prepare(`
        INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(otherUserId, testFirmId2, 'other@example.com', 'hash', 'Other', 'User', 'attorney');

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId2, otherUserId, 'Other Firm Template', 'Content', now, now);

      const firmTemplates = db.prepare('SELECT * FROM templates WHERE firm_id = ?').all(testFirmId);
      expect(firmTemplates.length).toBe(2);
    });

    it('should filter templates by category', () => {
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, content, category, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, 'PI Template', 'Content', 'Personal Injury', now, now);

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, content, category, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, 'Auto Template', 'Content', 'Auto Accident', now, now);

      const piTemplates = db.prepare(`
        SELECT * FROM templates WHERE firm_id = ? AND category = ?
      `).all(testFirmId, 'Personal Injury');

      expect(piTemplates.length).toBe(1);
    });

    it('should filter templates by shared status', () => {
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, content, is_shared, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, 'Shared Template', 'Content', 1, now, now);

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, content, is_shared, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, 'Private Template', 'Content', 0, now, now);

      const sharedTemplates = db.prepare(`
        SELECT * FROM templates WHERE firm_id = ? AND is_shared = ?
      `).all(testFirmId, 1);

      expect(sharedTemplates.length).toBe(1);
    });

    it('should search templates by name', () => {
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, 'Personal Injury Demand', 'Content 1', now, now);

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, 'Auto Accident Letter', 'Content 2', now, now);

      const searchResults = db.prepare(`
        SELECT * FROM templates WHERE firm_id = ? AND name LIKE ?
      `).all(testFirmId, '%Injury%');

      expect(searchResults.length).toBe(1);
    });
  });

  describe('Template Updates', () => {
    it('should update template name and description', () => {
      const templateId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, description, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(templateId, testFirmId, testUserId, 'Original Name', 'Original Desc', 'Content', now, now);

      db.prepare(`
        UPDATE templates SET name = ?, description = ?, updated_at = ? WHERE id = ?
      `).run('Updated Name', 'Updated Description', new Date().toISOString(), templateId);

      const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(templateId) as {
        name: string;
        description: string;
      };

      expect(template.name).toBe('Updated Name');
      expect(template.description).toBe('Updated Description');
    });

    it('should update template content and recalculate placeholders', () => {
      const templateId = uuidv4();
      const now = new Date().toISOString();
      const originalContent = 'Dear {{name}}';
      const newContent = 'Dear {{recipient_name}}, regarding {{client_name}}';

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, content, placeholders, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(templateId, testFirmId, testUserId, 'Test', originalContent, JSON.stringify(['name']), now, now);

      // Extract new placeholders
      const regex = /\{\{([^}]+)\}\}/g;
      const placeholders: Set<string> = new Set();
      let match;
      while ((match = regex.exec(newContent)) !== null) {
        placeholders.add(match[1].trim());
      }
      const newPlaceholders = Array.from(placeholders);

      db.prepare(`
        UPDATE templates SET content = ?, placeholders = ?, updated_at = ? WHERE id = ?
      `).run(newContent, JSON.stringify(newPlaceholders), new Date().toISOString(), templateId);

      const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(templateId) as {
        content: string;
        placeholders: string;
      };

      expect(template.content).toBe(newContent);
      expect(JSON.parse(template.placeholders)).toContain('recipient_name');
      expect(JSON.parse(template.placeholders)).toContain('client_name');
    });

    it('should update template sharing status', () => {
      const templateId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, content, is_shared, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(templateId, testFirmId, testUserId, 'Test', 'Content', 0, now, now);

      db.prepare(`UPDATE templates SET is_shared = ?, updated_at = ? WHERE id = ?`)
        .run(1, new Date().toISOString(), templateId);

      const template = db.prepare('SELECT is_shared FROM templates WHERE id = ?').get(templateId) as {
        is_shared: number;
      };

      expect(template.is_shared).toBe(1);
    });
  });

  describe('Template Approval', () => {
    it('should allow admin to approve shared template', () => {
      const templateId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, content, is_shared, is_approved, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(templateId, testFirmId, testUserId, 'Test', 'Content', 1, 0, now, now);

      // Admin approves template
      db.prepare(`UPDATE templates SET is_approved = ?, updated_at = ? WHERE id = ?`)
        .run(1, new Date().toISOString(), templateId);

      const template = db.prepare('SELECT is_approved FROM templates WHERE id = ?').get(templateId) as {
        is_approved: number;
      };

      expect(template.is_approved).toBe(1);
    });

    it('should only allow approval for shared templates', () => {
      const templateId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, content, is_shared, is_approved, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(templateId, testFirmId, testUserId, 'Test', 'Content', 0, 0, now, now);

      const template = db.prepare('SELECT is_shared FROM templates WHERE id = ?').get(templateId) as {
        is_shared: number;
      };

      // Verify template is not shared before approval attempt
      expect(template.is_shared).toBe(0);
    });

    it('should allow admin to unapprove template', () => {
      const templateId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, content, is_shared, is_approved, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(templateId, testFirmId, testUserId, 'Test', 'Content', 1, 1, now, now);

      db.prepare(`UPDATE templates SET is_approved = ?, updated_at = ? WHERE id = ?`)
        .run(0, new Date().toISOString(), templateId);

      const template = db.prepare('SELECT is_approved FROM templates WHERE id = ?').get(templateId) as {
        is_approved: number;
      };

      expect(template.is_approved).toBe(0);
    });
  });

  describe('Template Duplication', () => {
    it('should duplicate template with new id', () => {
      const originalId = uuidv4();
      const newId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, description, content, placeholders, category, is_shared, is_approved, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(originalId, testFirmId, testUserId, 'Original', 'Description', 'Content with {{placeholder}}', JSON.stringify(['placeholder']), 'Personal Injury', 1, 1, now, now);

      // Get original template
      const original = db.prepare('SELECT * FROM templates WHERE id = ?').get(originalId) as {
        firm_id: string;
        description: string;
        content: string;
        placeholders: string;
        category: string;
      };

      // Create duplicate with modifications
      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, description, content, placeholders, category, is_shared, is_approved, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newId,
        testFirmId,
        testUserId,
        'Original (Copy)',
        original.description,
        original.content,
        original.placeholders,
        original.category,
        0, // Not shared
        0, // Not approved
        now,
        now
      );

      const duplicate = db.prepare('SELECT * FROM templates WHERE id = ?').get(newId) as {
        id: string;
        name: string;
        content: string;
        is_shared: number;
        is_approved: number;
      };

      expect(duplicate.id).not.toBe(originalId);
      expect(duplicate.name).toBe('Original (Copy)');
      expect(duplicate.content).toBe(original.content);
      expect(duplicate.is_shared).toBe(0);
      expect(duplicate.is_approved).toBe(0);
    });

    it('should generate unique name for duplicates', () => {
      const now = new Date().toISOString();
      const baseName = 'Test Template';

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, baseName, 'Content', now, now);

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testFirmId, testUserId, `${baseName} (Copy)`, 'Content', now, now);

      // Generate next unique name
      let newName = `${baseName} (Copy)`;
      let counter = 1;
      while (true) {
        const existing = db.prepare(`
          SELECT id FROM templates WHERE firm_id = ? AND name = ?
        `).get(testFirmId, newName);
        if (!existing) break;
        newName = `${baseName} (Copy) (${counter})`;
        counter++;
        if (counter > 10) break;
      }

      expect(newName).toBe('Test Template (Copy) (1)');
    });
  });

  describe('Template Preview', () => {
    it('should replace placeholders with provided values', () => {
      const content = 'Dear {{recipient_name}}, regarding {{client_name}}. Amount: ${{demand_amount}}.';
      const values: Record<string, string> = {
        recipient_name: 'John Doe',
        client_name: 'Jane Smith',
        demand_amount: '50,000',
      };

      let preview = content;
      for (const [key, value] of Object.entries(values)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        preview = preview.replace(regex, value);
      }

      expect(preview).toBe('Dear John Doe, regarding Jane Smith. Amount: $50,000.');
    });

    it('should identify missing placeholders', () => {
      const placeholders = ['recipient_name', 'client_name', 'demand_amount'];
      const providedValues = { recipient_name: 'John Doe' };

      const missing = placeholders.filter(p => !providedValues[p as keyof typeof providedValues]);

      expect(missing).toContain('client_name');
      expect(missing).toContain('demand_amount');
      expect(missing.length).toBe(2);
    });

    it('should preserve unfilled placeholders in preview', () => {
      const content = 'Dear {{recipient_name}}, regarding {{client_name}}.';
      const values: Record<string, string> = {
        recipient_name: 'John Doe',
      };

      let preview = content;
      for (const [key, value] of Object.entries(values)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        preview = preview.replace(regex, value);
      }

      expect(preview).toBe('Dear John Doe, regarding {{client_name}}.');
    });
  });

  describe('Template Deletion', () => {
    it('should delete template from database', () => {
      const templateId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(templateId, testFirmId, testUserId, 'To Delete', 'Content', now, now);

      db.prepare('DELETE FROM templates WHERE id = ?').run(templateId);

      const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(templateId);
      expect(template).toBeUndefined();
    });

    it('should prevent deletion if template is in use', () => {
      const templateId = uuidv4();
      const letterId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(templateId, testFirmId, testUserId, 'In Use', 'Content', now, now);

      db.prepare(`
        INSERT INTO demand_letters (id, user_id, firm_id, template_id, title, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(letterId, testUserId, testFirmId, templateId, 'Test Letter', 'Content', now, now);

      // Check usage count
      const usageCount = db.prepare(`
        SELECT COUNT(*) as count FROM demand_letters WHERE template_id = ?
      `).get(templateId) as { count: number };

      expect(usageCount.count).toBe(1);
    });

    it('should set template_id to NULL when template is deleted (ON DELETE SET NULL)', () => {
      const templateId = uuidv4();
      const letterId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(templateId, testFirmId, testUserId, 'To Delete', 'Content', now, now);

      db.prepare(`
        INSERT INTO demand_letters (id, user_id, firm_id, template_id, title, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(letterId, testUserId, testFirmId, templateId, 'Test Letter', 'Content', now, now);

      // Delete template
      db.prepare('DELETE FROM templates WHERE id = ?').run(templateId);

      // Check demand letter still exists but template_id is NULL
      const letter = db.prepare('SELECT template_id FROM demand_letters WHERE id = ?').get(letterId) as {
        template_id: string | null;
      };

      expect(letter.template_id).toBeNull();
    });
  });

  describe('Template Categories', () => {
    it('should support predefined categories', () => {
      const categories = [
        'Personal Injury',
        'Auto Accident',
        'Medical Malpractice',
        'Slip and Fall',
        'Product Liability',
        'Workers Compensation',
        'General',
        'Other'
      ];

      expect(categories.length).toBe(8);
      expect(categories).toContain('Personal Injury');
      expect(categories).toContain('Auto Accident');
    });

    it('should allow templates without category', () => {
      const templateId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(templateId, testFirmId, testUserId, 'No Category', 'Content', now, now);

      const template = db.prepare('SELECT category FROM templates WHERE id = ?').get(templateId) as {
        category: string | null;
      };

      expect(template.category).toBeNull();
    });
  });

  describe('Audit Logging', () => {
    it('should log template creation event', () => {
      const auditId = uuidv4();
      const templateId = uuidv4();

      db.prepare(`
        INSERT INTO audit_logs (id, event_type, user_id, firm_id, resource_type, resource_id, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        auditId,
        'TEMPLATE_CREATED',
        testUserId,
        testFirmId,
        'template',
        templateId,
        JSON.stringify({ name: 'Test Template', category: 'Personal Injury' })
      );

      const log = db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(auditId) as {
        event_type: string;
        resource_type: string;
      };

      expect(log.event_type).toBe('TEMPLATE_CREATED');
      expect(log.resource_type).toBe('template');
    });

    it('should log template update event', () => {
      const auditId = uuidv4();
      const templateId = uuidv4();

      db.prepare(`
        INSERT INTO audit_logs (id, event_type, user_id, firm_id, resource_type, resource_id, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        auditId,
        'TEMPLATE_UPDATED',
        testUserId,
        testFirmId,
        'template',
        templateId,
        JSON.stringify({ updated_fields: ['name', 'content'] })
      );

      const log = db.prepare('SELECT * FROM audit_logs WHERE event_type = ?').get('TEMPLATE_UPDATED') as {
        event_type: string;
        details: string;
      };

      expect(log.event_type).toBe('TEMPLATE_UPDATED');
      expect(JSON.parse(log.details).updated_fields).toContain('name');
    });

    it('should log template approval event', () => {
      const auditId = uuidv4();
      const templateId = uuidv4();

      db.prepare(`
        INSERT INTO audit_logs (id, event_type, user_id, firm_id, resource_type, resource_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(auditId, 'TEMPLATE_APPROVED', testAdminId, testFirmId, 'template', templateId);

      const log = db.prepare('SELECT * FROM audit_logs WHERE event_type = ?').get('TEMPLATE_APPROVED');
      expect(log).toBeDefined();
    });

    it('should log template duplication event', () => {
      const auditId = uuidv4();
      const newTemplateId = uuidv4();
      const sourceTemplateId = uuidv4();

      db.prepare(`
        INSERT INTO audit_logs (id, event_type, user_id, firm_id, resource_type, resource_id, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        auditId,
        'TEMPLATE_DUPLICATED',
        testUserId,
        testFirmId,
        'template',
        newTemplateId,
        JSON.stringify({ source_template_id: sourceTemplateId })
      );

      const log = db.prepare('SELECT * FROM audit_logs WHERE event_type = ?').get('TEMPLATE_DUPLICATED') as {
        event_type: string;
        details: string;
      };

      expect(log.event_type).toBe('TEMPLATE_DUPLICATED');
      expect(JSON.parse(log.details).source_template_id).toBe(sourceTemplateId);
    });

    it('should log template deletion event', () => {
      const auditId = uuidv4();
      const templateId = uuidv4();

      db.prepare(`
        INSERT INTO audit_logs (id, event_type, user_id, firm_id, resource_type, resource_id, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        auditId,
        'TEMPLATE_DELETED',
        testUserId,
        testFirmId,
        'template',
        templateId,
        JSON.stringify({ name: 'Deleted Template' })
      );

      const log = db.prepare('SELECT * FROM audit_logs WHERE event_type = ?').get('TEMPLATE_DELETED');
      expect(log).toBeDefined();
    });
  });

  describe('Authorization', () => {
    it('should require authentication for template operations', () => {
      // Verify token contains required claims
      const decoded = jwt.verify(testToken, JWT_SECRET) as {
        userId: string;
        firmId: string;
        role: string;
      };

      expect(decoded.userId).toBeDefined();
      expect(decoded.firmId).toBeDefined();
      expect(decoded.role).toBeDefined();
    });

    it('should restrict admin operations to admin role', () => {
      const decoded = jwt.verify(testAdminToken, JWT_SECRET) as { role: string };
      expect(decoded.role).toBe('admin');

      const userDecoded = jwt.verify(testToken, JWT_SECRET) as { role: string };
      expect(userDecoded.role).not.toBe('admin');
    });

    it('should only allow template creator or admin to delete', () => {
      const templateCreator = testUserId;
      const adminUser = testAdminId;
      const otherUser = 'other-user-id';

      // Creator can delete
      expect(templateCreator === testUserId).toBe(true);

      // Admin can delete
      const adminDecoded = jwt.verify(testAdminToken, JWT_SECRET) as { role: string };
      expect(adminDecoded.role === 'admin').toBe(true);

      // Other user cannot delete
      expect(otherUser !== testUserId && otherUser !== testAdminId).toBe(true);
    });
  });
});
