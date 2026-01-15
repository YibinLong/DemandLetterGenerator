// Demand letter API tests
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
const TEST_DB_PATH = path.resolve(__dirname, '../../data/test-demand-letters.sqlite');
const JWT_SECRET = 'test-jwt-secret';

let db: Database.Database;
let testFirmId: string;
let testUserId: string;
let testToken: string;

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
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'approved', 'sent', 'archived')),
      case_reference TEXT,
      client_name TEXT,
      recipient_name TEXT,
      recipient_address TEXT,
      incident_date TEXT,
      demand_amount REAL,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
    );

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

    CREATE TABLE IF NOT EXISTS demand_letter_documents (
      id TEXT PRIMARY KEY,
      demand_letter_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (demand_letter_id) REFERENCES demand_letters(id) ON DELETE CASCADE,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      UNIQUE(demand_letter_id, document_id)
    );

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
  `);
};

// Create test user and generate token
const createTestUserAndToken = () => {
  testFirmId = uuidv4();
  testUserId = uuidv4();

  db.prepare(`
    INSERT INTO firms (id, name) VALUES (?, ?)
  `).run(testFirmId, 'Test Law Firm');

  const passwordHash = bcrypt.hashSync('Password123!', 10);
  db.prepare(`
    INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(testUserId, testFirmId, 'attorney@test.com', passwordHash, 'John', 'Attorney', 'attorney');

  testToken = jwt.sign(
    {
      userId: testUserId,
      email: 'attorney@test.com',
      firmId: testFirmId,
      role: 'attorney',
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
};

// Helper to create test document
const createTestDocument = (options?: { case_reference?: string }) => {
  const docId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO documents (id, user_id, firm_id, filename, original_filename, file_type, file_size, file_path, case_reference, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    docId,
    testUserId,
    testFirmId,
    `${docId}.pdf.enc`,
    'test-document.pdf',
    'pdf',
    1024,
    `/fake/path/${docId}`,
    options?.case_reference || null,
    now,
    now
  );

  return docId;
};

// Helper to create test demand letter
const createTestDemandLetter = (options?: {
  title?: string;
  content?: string;
  status?: string;
  case_reference?: string;
  client_name?: string;
}) => {
  const letterId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO demand_letters (id, user_id, firm_id, title, content, status, case_reference, client_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    letterId,
    testUserId,
    testFirmId,
    options?.title || 'Test Demand Letter',
    options?.content || 'Test content for demand letter.',
    options?.status || 'draft',
    options?.case_reference || null,
    options?.client_name || 'John Doe',
    now,
    now
  );

  return letterId;
};

describe('Demand Letter API', () => {
  beforeAll(() => {
    // Ensure test directory exists
    if (!fs.existsSync(path.dirname(TEST_DB_PATH))) {
      fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
    }

    // Create test database
    db = new Database(TEST_DB_PATH);
    createTestSchema();
    createTestUserAndToken();
  });

  afterAll(() => {
    // Close database
    db.close();

    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  beforeEach(() => {
    // Clear demand letter related tables before each test
    db.prepare('DELETE FROM ai_generation_history').run();
    db.prepare('DELETE FROM demand_letter_documents').run();
    db.prepare('DELETE FROM demand_letter_versions').run();
    db.prepare('DELETE FROM demand_letters').run();
    db.prepare('DELETE FROM documents').run();
    db.prepare('DELETE FROM audit_logs').run();
  });

  describe('Demand Letter CRUD Operations', () => {
    it('should create a demand letter', () => {
      const letterId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO demand_letters (id, user_id, firm_id, title, content, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(letterId, testUserId, testFirmId, 'New Demand Letter', 'Content here', 'draft', now, now);

      const letter = db.prepare('SELECT * FROM demand_letters WHERE id = ?').get(letterId) as {
        id: string;
        title: string;
        status: string;
      };

      expect(letter).toBeDefined();
      expect(letter.title).toBe('New Demand Letter');
      expect(letter.status).toBe('draft');
    });

    it('should retrieve demand letters by firm_id', () => {
      createTestDemandLetter({ title: 'Letter 1' });
      createTestDemandLetter({ title: 'Letter 2' });

      const letters = db.prepare('SELECT * FROM demand_letters WHERE firm_id = ?').all(testFirmId) as Array<{
        title: string;
      }>;

      expect(letters.length).toBe(2);
    });

    it('should update demand letter status', () => {
      const letterId = createTestDemandLetter();

      db.prepare(`
        UPDATE demand_letters SET status = ?, updated_at = ? WHERE id = ?
      `).run('in_review', new Date().toISOString(), letterId);

      const letter = db.prepare('SELECT * FROM demand_letters WHERE id = ?').get(letterId) as {
        status: string;
      };

      expect(letter.status).toBe('in_review');
    });

    it('should update demand letter content', () => {
      const letterId = createTestDemandLetter();
      const newContent = 'Updated demand letter content with more details.';

      db.prepare(`
        UPDATE demand_letters SET content = ?, updated_at = ? WHERE id = ?
      `).run(newContent, new Date().toISOString(), letterId);

      const letter = db.prepare('SELECT * FROM demand_letters WHERE id = ?').get(letterId) as {
        content: string;
      };

      expect(letter.content).toBe(newContent);
    });

    it('should delete demand letter', () => {
      const letterId = createTestDemandLetter();

      db.prepare('DELETE FROM demand_letters WHERE id = ?').run(letterId);

      const letter = db.prepare('SELECT * FROM demand_letters WHERE id = ?').get(letterId);
      expect(letter).toBeUndefined();
    });
  });

  describe('Demand Letter Status Management', () => {
    it('should support draft status', () => {
      const letterId = createTestDemandLetter({ status: 'draft' });

      const letter = db.prepare('SELECT status FROM demand_letters WHERE id = ?').get(letterId) as {
        status: string;
      };

      expect(letter.status).toBe('draft');
    });

    it('should support in_review status', () => {
      const letterId = createTestDemandLetter({ status: 'in_review' });

      const letter = db.prepare('SELECT status FROM demand_letters WHERE id = ?').get(letterId) as {
        status: string;
      };

      expect(letter.status).toBe('in_review');
    });

    it('should support approved status', () => {
      const letterId = createTestDemandLetter({ status: 'approved' });

      const letter = db.prepare('SELECT status FROM demand_letters WHERE id = ?').get(letterId) as {
        status: string;
      };

      expect(letter.status).toBe('approved');
    });

    it('should support sent status', () => {
      const letterId = createTestDemandLetter({ status: 'sent' });

      const letter = db.prepare('SELECT status FROM demand_letters WHERE id = ?').get(letterId) as {
        status: string;
      };

      expect(letter.status).toBe('sent');
    });

    it('should support archived status', () => {
      const letterId = createTestDemandLetter({ status: 'archived' });

      const letter = db.prepare('SELECT status FROM demand_letters WHERE id = ?').get(letterId) as {
        status: string;
      };

      expect(letter.status).toBe('archived');
    });

    it('should filter letters by status', () => {
      createTestDemandLetter({ status: 'draft', title: 'Draft 1' });
      createTestDemandLetter({ status: 'draft', title: 'Draft 2' });
      createTestDemandLetter({ status: 'approved', title: 'Approved 1' });

      const draftLetters = db.prepare(`
        SELECT * FROM demand_letters WHERE firm_id = ? AND status = ?
      `).all(testFirmId, 'draft') as Array<{ status: string }>;

      expect(draftLetters.length).toBe(2);
      expect(draftLetters.every(l => l.status === 'draft')).toBe(true);
    });
  });

  describe('Version Management', () => {
    it('should create initial version with demand letter', () => {
      const letterId = createTestDemandLetter();
      const versionId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO demand_letter_versions (id, demand_letter_id, version_number, content, changed_by, change_summary, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(versionId, letterId, 1, 'Initial content', testUserId, 'Initial AI generation', now);

      const version = db.prepare(`
        SELECT * FROM demand_letter_versions WHERE demand_letter_id = ?
      `).get(letterId) as { version_number: number; change_summary: string };

      expect(version).toBeDefined();
      expect(version.version_number).toBe(1);
      expect(version.change_summary).toBe('Initial AI generation');
    });

    it('should create new version on content update', () => {
      const letterId = createTestDemandLetter();
      const now = new Date().toISOString();

      // Create initial version
      db.prepare(`
        INSERT INTO demand_letter_versions (id, demand_letter_id, version_number, content, changed_by, change_summary, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), letterId, 1, 'Initial content', testUserId, 'Initial', now);

      // Create second version
      db.prepare(`
        INSERT INTO demand_letter_versions (id, demand_letter_id, version_number, content, changed_by, change_summary, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), letterId, 2, 'Updated content', testUserId, 'Manual edit', now);

      const versions = db.prepare(`
        SELECT * FROM demand_letter_versions WHERE demand_letter_id = ? ORDER BY version_number
      `).all(letterId) as Array<{ version_number: number }>;

      expect(versions.length).toBe(2);
      expect(versions[0].version_number).toBe(1);
      expect(versions[1].version_number).toBe(2);
    });

    it('should get latest version number', () => {
      const letterId = createTestDemandLetter();
      const now = new Date().toISOString();

      // Create multiple versions
      for (let i = 1; i <= 5; i++) {
        db.prepare(`
          INSERT INTO demand_letter_versions (id, demand_letter_id, version_number, content, changed_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), letterId, i, `Content v${i}`, testUserId, now);
      }

      const latest = db.prepare(`
        SELECT MAX(version_number) as version FROM demand_letter_versions WHERE demand_letter_id = ?
      `).get(letterId) as { version: number };

      expect(latest.version).toBe(5);
    });

    it('should get version count', () => {
      const letterId = createTestDemandLetter();
      const now = new Date().toISOString();

      // Create 3 versions
      for (let i = 1; i <= 3; i++) {
        db.prepare(`
          INSERT INTO demand_letter_versions (id, demand_letter_id, version_number, content, changed_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), letterId, i, `Content v${i}`, testUserId, now);
      }

      const count = db.prepare(`
        SELECT COUNT(*) as count FROM demand_letter_versions WHERE demand_letter_id = ?
      `).get(letterId) as { count: number };

      expect(count.count).toBe(3);
    });
  });

  describe('Source Document Linking', () => {
    it('should link source documents to demand letter', () => {
      const letterId = createTestDemandLetter();
      const docId1 = createTestDocument();
      const docId2 = createTestDocument();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO demand_letter_documents (id, demand_letter_id, document_id, created_at)
        VALUES (?, ?, ?, ?)
      `).run(uuidv4(), letterId, docId1, now);

      db.prepare(`
        INSERT INTO demand_letter_documents (id, demand_letter_id, document_id, created_at)
        VALUES (?, ?, ?, ?)
      `).run(uuidv4(), letterId, docId2, now);

      const links = db.prepare(`
        SELECT * FROM demand_letter_documents WHERE demand_letter_id = ?
      `).all(letterId) as Array<{ document_id: string }>;

      expect(links.length).toBe(2);
    });

    it('should get source documents for demand letter', () => {
      const letterId = createTestDemandLetter();
      const docId = createTestDocument();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO demand_letter_documents (id, demand_letter_id, document_id, created_at)
        VALUES (?, ?, ?, ?)
      `).run(uuidv4(), letterId, docId, now);

      const documents = db.prepare(`
        SELECT d.* FROM documents d
        JOIN demand_letter_documents dld ON d.id = dld.document_id
        WHERE dld.demand_letter_id = ?
      `).all(letterId) as Array<{ id: string; original_filename: string }>;

      expect(documents.length).toBe(1);
      expect(documents[0].id).toBe(docId);
    });

    it('should prevent duplicate document links', () => {
      const letterId = createTestDemandLetter();
      const docId = createTestDocument();
      const now = new Date().toISOString();

      // First link succeeds
      db.prepare(`
        INSERT INTO demand_letter_documents (id, demand_letter_id, document_id, created_at)
        VALUES (?, ?, ?, ?)
      `).run(uuidv4(), letterId, docId, now);

      // Second link should fail due to unique constraint
      expect(() => {
        db.prepare(`
          INSERT INTO demand_letter_documents (id, demand_letter_id, document_id, created_at)
          VALUES (?, ?, ?, ?)
        `).run(uuidv4(), letterId, docId, now);
      }).toThrow();
    });
  });

  describe('AI Generation History', () => {
    it('should record initial AI generation', () => {
      const letterId = createTestDemandLetter();
      const historyId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO ai_generation_history (id, demand_letter_id, user_id, prompt, response_summary, model_used, tokens_used, generation_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        historyId,
        letterId,
        testUserId,
        JSON.stringify({ case_info: { client_name: 'John Doe' }, instructions: 'Focus on damages' }),
        'Generated demand letter content...',
        'gpt-4o-mini',
        2500,
        'initial',
        now
      );

      const history = db.prepare(`
        SELECT * FROM ai_generation_history WHERE demand_letter_id = ?
      `).get(letterId) as { generation_type: string; model_used: string; tokens_used: number };

      expect(history).toBeDefined();
      expect(history.generation_type).toBe('initial');
      expect(history.model_used).toBe('gpt-4o-mini');
      expect(history.tokens_used).toBe(2500);
    });

    it('should record refinement history', () => {
      const letterId = createTestDemandLetter();
      const now = new Date().toISOString();

      // Initial generation
      db.prepare(`
        INSERT INTO ai_generation_history (id, demand_letter_id, user_id, prompt, generation_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), letterId, testUserId, 'Initial prompt', 'initial', now);

      // Refinement
      db.prepare(`
        INSERT INTO ai_generation_history (id, demand_letter_id, user_id, prompt, generation_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), letterId, testUserId, 'Make it more assertive', 'refinement', now);

      const history = db.prepare(`
        SELECT * FROM ai_generation_history WHERE demand_letter_id = ? ORDER BY created_at
      `).all(letterId) as Array<{ generation_type: string }>;

      expect(history.length).toBe(2);
      expect(history[0].generation_type).toBe('initial');
      expect(history[1].generation_type).toBe('refinement');
    });

    it('should track tokens used', () => {
      const letterId = createTestDemandLetter();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO ai_generation_history (id, demand_letter_id, user_id, prompt, tokens_used, generation_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), letterId, testUserId, 'Prompt 1', 1000, 'initial', now);

      db.prepare(`
        INSERT INTO ai_generation_history (id, demand_letter_id, user_id, prompt, tokens_used, generation_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), letterId, testUserId, 'Prompt 2', 500, 'refinement', now);

      const totalTokens = db.prepare(`
        SELECT SUM(tokens_used) as total FROM ai_generation_history WHERE demand_letter_id = ?
      `).get(letterId) as { total: number };

      expect(totalTokens.total).toBe(1500);
    });
  });

  describe('Filtering and Search', () => {
    it('should search demand letters by title', () => {
      createTestDemandLetter({ title: 'Personal Injury - Smith Case' });
      createTestDemandLetter({ title: 'Auto Accident - Johnson' });
      createTestDemandLetter({ title: 'Medical Malpractice' });

      const searchTerm = '%Smith%';
      const results = db.prepare(`
        SELECT * FROM demand_letters WHERE firm_id = ? AND title LIKE ?
      `).all(testFirmId, searchTerm) as Array<{ title: string }>;

      expect(results.length).toBe(1);
      expect(results[0].title).toContain('Smith');
    });

    it('should search demand letters by client name', () => {
      createTestDemandLetter({ client_name: 'Alice Johnson' });
      createTestDemandLetter({ client_name: 'Bob Smith' });

      const searchTerm = '%Johnson%';
      const results = db.prepare(`
        SELECT * FROM demand_letters WHERE firm_id = ? AND client_name LIKE ?
      `).all(testFirmId, searchTerm) as Array<{ client_name: string }>;

      expect(results.length).toBe(1);
      expect(results[0].client_name).toBe('Alice Johnson');
    });

    it('should filter by case reference', () => {
      createTestDemandLetter({ case_reference: 'CASE-001' });
      createTestDemandLetter({ case_reference: 'CASE-001' });
      createTestDemandLetter({ case_reference: 'CASE-002' });

      const results = db.prepare(`
        SELECT * FROM demand_letters WHERE firm_id = ? AND case_reference = ?
      `).all(testFirmId, 'CASE-001') as Array<{ case_reference: string }>;

      expect(results.length).toBe(2);
    });
  });

  describe('Audit Logging', () => {
    it('should log demand letter creation', () => {
      const letterId = createTestDemandLetter();

      db.prepare(`
        INSERT INTO audit_logs (id, event_type, user_id, firm_id, resource_type, resource_id, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        uuidv4(),
        'DEMAND_LETTER_CREATED',
        testUserId,
        testFirmId,
        'demand_letter',
        letterId,
        JSON.stringify({ title: 'Test Letter', document_count: 2 })
      );

      const log = db.prepare(`
        SELECT * FROM audit_logs WHERE event_type = ? AND resource_id = ?
      `).get('DEMAND_LETTER_CREATED', letterId) as { event_type: string };

      expect(log).toBeDefined();
      expect(log.event_type).toBe('DEMAND_LETTER_CREATED');
    });

    it('should log demand letter updates', () => {
      const letterId = createTestDemandLetter();

      db.prepare(`
        INSERT INTO audit_logs (id, event_type, user_id, firm_id, resource_type, resource_id, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        uuidv4(),
        'DEMAND_LETTER_UPDATED',
        testUserId,
        testFirmId,
        'demand_letter',
        letterId,
        JSON.stringify({ fields_updated: ['content', 'status'] })
      );

      const log = db.prepare(`
        SELECT * FROM audit_logs WHERE event_type = ? AND resource_id = ?
      `).get('DEMAND_LETTER_UPDATED', letterId) as { event_type: string };

      expect(log).toBeDefined();
    });

    it('should log AI generation requests', () => {
      const letterId = createTestDemandLetter();

      db.prepare(`
        INSERT INTO audit_logs (id, event_type, user_id, firm_id, resource_type, resource_id, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        uuidv4(),
        'AI_GENERATION_REQUESTED',
        testUserId,
        testFirmId,
        'demand_letter',
        letterId,
        JSON.stringify({ model: 'gpt-4o-mini', tokens_used: 2500 })
      );

      const log = db.prepare(`
        SELECT * FROM audit_logs WHERE event_type = ?
      `).get('AI_GENERATION_REQUESTED') as { event_type: string; details: string };

      expect(log).toBeDefined();
      expect(JSON.parse(log.details).model).toBe('gpt-4o-mini');
    });
  });

  describe('JWT Token Validation', () => {
    it('should validate test token', () => {
      const decoded = jwt.verify(testToken, JWT_SECRET) as {
        userId: string;
        firmId: string;
        role: string;
      };

      expect(decoded.userId).toBe(testUserId);
      expect(decoded.firmId).toBe(testFirmId);
      expect(decoded.role).toBe('attorney');
    });
  });
});
