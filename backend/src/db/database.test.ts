import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CREATE_TABLES_SQL, SCHEMA_VERSION } from './schema.js';
import type { Firm, User, Document, Template, DemandLetter } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use a test database
const TEST_DB_PATH = path.resolve(__dirname, '../../data/test.sqlite');

let db: Database.Database;

beforeAll(() => {
  // Ensure test directory exists
  const dbDir = path.dirname(TEST_DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Remove existing test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  // Create fresh test database
  db = new Database(TEST_DB_PATH);
  db.pragma('foreign_keys = ON');
  db.exec(CREATE_TABLES_SQL);
});

afterAll(() => {
  if (db) {
    db.close();
  }
  // Clean up test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  // Clean up WAL files
  const walPath = TEST_DB_PATH + '-wal';
  const shmPath = TEST_DB_PATH + '-shm';
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
});

describe('Database Schema', () => {
  it('should create all required tables', () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
    `).all() as { name: string }[];

    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('firms');
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('documents');
    expect(tableNames).toContain('templates');
    expect(tableNames).toContain('demand_letters');
    expect(tableNames).toContain('demand_letter_versions');
    expect(tableNames).toContain('demand_letter_documents');
    expect(tableNames).toContain('ai_generation_history');
    expect(tableNames).toContain('schema_migrations');
  });

  it('should have foreign keys enabled', () => {
    const fkStatus = db.pragma('foreign_keys') as { foreign_keys: number }[];
    expect(fkStatus[0].foreign_keys).toBe(1);
  });
});

describe('Firms CRUD', () => {
  const testFirmId = uuidv4();

  it('should create a firm', () => {
    const result = db.prepare(`
      INSERT INTO firms (id, name, address, phone, email, website)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      testFirmId,
      'Test Law Firm',
      '123 Test Street',
      '555-1234',
      'test@testfirm.com',
      'https://testfirm.com'
    );

    expect(result.changes).toBe(1);
  });

  it('should read a firm', () => {
    const firm = db.prepare('SELECT * FROM firms WHERE id = ?').get(testFirmId) as Firm;

    expect(firm).toBeDefined();
    expect(firm.name).toBe('Test Law Firm');
    expect(firm.email).toBe('test@testfirm.com');
  });

  it('should update a firm', () => {
    const result = db.prepare(`
      UPDATE firms SET name = ?, updated_at = datetime('now') WHERE id = ?
    `).run('Updated Law Firm', testFirmId);

    expect(result.changes).toBe(1);

    const firm = db.prepare('SELECT * FROM firms WHERE id = ?').get(testFirmId) as Firm;
    expect(firm.name).toBe('Updated Law Firm');
  });

  it('should delete a firm', () => {
    // First create a firm to delete
    const deleteTestId = uuidv4();
    db.prepare(`
      INSERT INTO firms (id, name) VALUES (?, ?)
    `).run(deleteTestId, 'Firm to Delete');

    const result = db.prepare('DELETE FROM firms WHERE id = ?').run(deleteTestId);
    expect(result.changes).toBe(1);

    const firm = db.prepare('SELECT * FROM firms WHERE id = ?').get(deleteTestId);
    expect(firm).toBeUndefined();
  });
});

describe('Users CRUD', () => {
  let firmId: string;
  let userId: string;

  beforeAll(() => {
    // Create a firm for user tests
    firmId = uuidv4();
    db.prepare(`
      INSERT INTO firms (id, name) VALUES (?, ?)
    `).run(firmId, 'User Test Firm');
  });

  it('should create a user', async () => {
    userId = uuidv4();
    const passwordHash = await bcrypt.hash('testpassword', 10);

    const result = db.prepare(`
      INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, firmId, 'testuser@test.com', passwordHash, 'Test', 'User', 'attorney');

    expect(result.changes).toBe(1);
  });

  it('should read a user', () => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User;

    expect(user).toBeDefined();
    expect(user.email).toBe('testuser@test.com');
    expect(user.first_name).toBe('Test');
    expect(user.last_name).toBe('User');
    expect(user.role).toBe('attorney');
  });

  it('should enforce unique email constraint', async () => {
    const newUserId = uuidv4();
    const passwordHash = await bcrypt.hash('testpassword', 10);

    expect(() => {
      db.prepare(`
        INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(newUserId, firmId, 'testuser@test.com', passwordHash, 'Another', 'User', 'paralegal');
    }).toThrow();
  });

  it('should validate role values', async () => {
    const newUserId = uuidv4();
    const passwordHash = await bcrypt.hash('testpassword', 10);

    expect(() => {
      db.prepare(`
        INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(newUserId, firmId, 'invalid@test.com', passwordHash, 'Invalid', 'Role', 'invalid_role');
    }).toThrow();
  });

  it('should update a user', () => {
    const result = db.prepare(`
      UPDATE users SET last_login = datetime('now') WHERE id = ?
    `).run(userId);

    expect(result.changes).toBe(1);
  });
});

describe('Documents CRUD', () => {
  let firmId: string;
  let userId: string;
  let documentId: string;

  beforeAll(async () => {
    firmId = uuidv4();
    userId = uuidv4();
    const passwordHash = await bcrypt.hash('testpassword', 10);

    db.prepare('INSERT INTO firms (id, name) VALUES (?, ?)').run(firmId, 'Doc Test Firm');
    db.prepare(`
      INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, firmId, 'docuser@test.com', passwordHash, 'Doc', 'User', 'attorney');
  });

  it('should create a document', () => {
    documentId = uuidv4();
    const result = db.prepare(`
      INSERT INTO documents (id, user_id, firm_id, filename, original_filename, file_type, file_size, file_path, case_reference)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      documentId,
      userId,
      firmId,
      'test-doc-123.pdf',
      'Medical Records.pdf',
      'pdf',
      1024000,
      '/uploads/test-doc-123.pdf',
      'CASE-001'
    );

    expect(result.changes).toBe(1);
  });

  it('should read a document', () => {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId) as Document;

    expect(doc).toBeDefined();
    expect(doc.original_filename).toBe('Medical Records.pdf');
    expect(doc.file_type).toBe('pdf');
    expect(doc.case_reference).toBe('CASE-001');
  });

  it('should validate file_type values', () => {
    const newDocId = uuidv4();
    expect(() => {
      db.prepare(`
        INSERT INTO documents (id, user_id, firm_id, filename, original_filename, file_type, file_size, file_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(newDocId, userId, firmId, 'test.xyz', 'test.xyz', 'xyz', 100, '/uploads/test.xyz');
    }).toThrow();
  });

  it('should list documents by firm', () => {
    const docs = db.prepare('SELECT * FROM documents WHERE firm_id = ?').all(firmId) as Document[];
    expect(docs.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Templates CRUD', () => {
  let firmId: string;
  let userId: string;
  let templateId: string;

  beforeAll(async () => {
    firmId = uuidv4();
    userId = uuidv4();
    const passwordHash = await bcrypt.hash('testpassword', 10);

    db.prepare('INSERT INTO firms (id, name) VALUES (?, ?)').run(firmId, 'Template Test Firm');
    db.prepare(`
      INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, firmId, 'templateuser@test.com', passwordHash, 'Template', 'User', 'attorney');
  });

  it('should create a template', () => {
    templateId = uuidv4();
    const placeholders = JSON.stringify(['client_name', 'incident_date', 'demand_amount']);

    const result = db.prepare(`
      INSERT INTO templates (id, firm_id, created_by, name, description, content, placeholders, category, is_shared)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      templateId,
      firmId,
      userId,
      'Test Demand Letter',
      'A test template',
      'Dear {{client_name}}, regarding the incident on {{incident_date}}...',
      placeholders,
      'Personal Injury',
      1
    );

    expect(result.changes).toBe(1);
  });

  it('should read a template with placeholders', () => {
    const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(templateId) as Template;

    expect(template).toBeDefined();
    expect(template.name).toBe('Test Demand Letter');

    const placeholders = JSON.parse(template.placeholders || '[]');
    expect(placeholders).toContain('client_name');
    expect(placeholders).toContain('incident_date');
  });

  it('should list shared templates for a firm', () => {
    const templates = db.prepare(`
      SELECT * FROM templates WHERE firm_id = ? AND is_shared = 1
    `).all(firmId) as Template[];

    expect(templates.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Demand Letters CRUD', () => {
  let firmId: string;
  let userId: string;
  let templateId: string;
  let demandLetterId: string;

  beforeAll(async () => {
    firmId = uuidv4();
    userId = uuidv4();
    templateId = uuidv4();
    const passwordHash = await bcrypt.hash('testpassword', 10);

    db.prepare('INSERT INTO firms (id, name) VALUES (?, ?)').run(firmId, 'DL Test Firm');
    db.prepare(`
      INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, firmId, 'dluser@test.com', passwordHash, 'DL', 'User', 'attorney');
    db.prepare(`
      INSERT INTO templates (id, firm_id, created_by, name, content)
      VALUES (?, ?, ?, ?, ?)
    `).run(templateId, firmId, userId, 'DL Template', 'Template content...');
  });

  it('should create a demand letter', () => {
    demandLetterId = uuidv4();
    const result = db.prepare(`
      INSERT INTO demand_letters (id, user_id, firm_id, template_id, title, content, status, case_reference, client_name, demand_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      demandLetterId,
      userId,
      firmId,
      templateId,
      'Smith v. Insurance Co.',
      'Full demand letter content...',
      'draft',
      'CASE-2026-001',
      'John Smith',
      50000
    );

    expect(result.changes).toBe(1);
  });

  it('should read a demand letter with related data', () => {
    const letter = db.prepare(`
      SELECT dl.*, t.name as template_name, u.first_name, u.last_name
      FROM demand_letters dl
      LEFT JOIN templates t ON dl.template_id = t.id
      LEFT JOIN users u ON dl.user_id = u.id
      WHERE dl.id = ?
    `).get(demandLetterId) as DemandLetter & { template_name: string; first_name: string; last_name: string };

    expect(letter).toBeDefined();
    expect(letter.title).toBe('Smith v. Insurance Co.');
    expect(letter.template_name).toBe('DL Template');
    expect(letter.first_name).toBe('DL');
  });

  it('should update demand letter status', () => {
    const result = db.prepare(`
      UPDATE demand_letters SET status = ?, updated_at = datetime('now') WHERE id = ?
    `).run('in_review', demandLetterId);

    expect(result.changes).toBe(1);

    const letter = db.prepare('SELECT status FROM demand_letters WHERE id = ?').get(demandLetterId) as { status: string };
    expect(letter.status).toBe('in_review');
  });

  it('should validate status values', () => {
    expect(() => {
      db.prepare(`
        UPDATE demand_letters SET status = ? WHERE id = ?
      `).run('invalid_status', demandLetterId);
    }).toThrow();
  });

  it('should create version history', () => {
    const versionId = uuidv4();
    const result = db.prepare(`
      INSERT INTO demand_letter_versions (id, demand_letter_id, version_number, content, changed_by, change_summary)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(versionId, demandLetterId, 1, 'Version 1 content', userId, 'Initial draft');

    expect(result.changes).toBe(1);

    const versions = db.prepare(`
      SELECT * FROM demand_letter_versions WHERE demand_letter_id = ? ORDER BY version_number
    `).all(demandLetterId);

    expect(versions.length).toBe(1);
  });
});

describe('Foreign Key Constraints', () => {
  it('should cascade delete users when firm is deleted', async () => {
    const firmId = uuidv4();
    const userId = uuidv4();
    const passwordHash = await bcrypt.hash('testpassword', 10);

    db.prepare('INSERT INTO firms (id, name) VALUES (?, ?)').run(firmId, 'Cascade Test Firm');
    db.prepare(`
      INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, firmId, 'cascade@test.com', passwordHash, 'Cascade', 'Test', 'staff');

    // Verify user exists
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    expect(user).toBeDefined();

    // Delete firm
    db.prepare('DELETE FROM firms WHERE id = ?').run(firmId);

    // Verify user was cascade deleted
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    expect(user).toBeUndefined();
  });

  it('should set template_id to NULL when template is deleted', async () => {
    const firmId = uuidv4();
    const userId = uuidv4();
    const templateId = uuidv4();
    const demandLetterId = uuidv4();
    const passwordHash = await bcrypt.hash('testpassword', 10);

    db.prepare('INSERT INTO firms (id, name) VALUES (?, ?)').run(firmId, 'SetNull Test Firm');
    db.prepare(`
      INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, firmId, 'setnull@test.com', passwordHash, 'SetNull', 'Test', 'attorney');
    db.prepare(`
      INSERT INTO templates (id, firm_id, created_by, name, content)
      VALUES (?, ?, ?, ?, ?)
    `).run(templateId, firmId, userId, 'SetNull Template', 'Content');
    db.prepare(`
      INSERT INTO demand_letters (id, user_id, firm_id, template_id, title, content)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(demandLetterId, userId, firmId, templateId, 'SetNull DL', 'Content');

    // Verify template_id is set
    let letter = db.prepare('SELECT template_id FROM demand_letters WHERE id = ?').get(demandLetterId) as { template_id: string | null };
    expect(letter.template_id).toBe(templateId);

    // Delete template
    db.prepare('DELETE FROM templates WHERE id = ?').run(templateId);

    // Verify template_id is now NULL
    letter = db.prepare('SELECT template_id FROM demand_letters WHERE id = ?').get(demandLetterId) as { template_id: string | null };
    expect(letter.template_id).toBeNull();
  });
});

describe('Query Performance', () => {
  it('should have indexes on frequently queried columns', () => {
    const indexes = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL
    `).all() as { name: string }[];

    const indexNames = indexes.map(i => i.name);

    expect(indexNames).toContain('idx_users_firm_id');
    expect(indexNames).toContain('idx_users_email');
    expect(indexNames).toContain('idx_documents_firm_id');
    expect(indexNames).toContain('idx_demand_letters_status');
  });
});
