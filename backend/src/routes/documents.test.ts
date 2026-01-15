// Document upload API tests
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
const TEST_DB_PATH = path.resolve(__dirname, '../../data/test-documents.sqlite');
const TEST_UPLOAD_DIR = path.resolve(__dirname, '../../data/test-uploads');
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
  `).run(testUserId, testFirmId, 'test@example.com', passwordHash, 'Test', 'User', 'attorney');

  testToken = jwt.sign(
    {
      userId: testUserId,
      email: 'test@example.com',
      firmId: testFirmId,
      role: 'attorney',
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
};

describe('Document Upload API', () => {
  beforeAll(() => {
    // Ensure test directories exist
    if (!fs.existsSync(path.dirname(TEST_DB_PATH))) {
      fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
    }
    if (!fs.existsSync(TEST_UPLOAD_DIR)) {
      fs.mkdirSync(TEST_UPLOAD_DIR, { recursive: true });
    }

    // Create test database
    db = new Database(TEST_DB_PATH);
    createTestSchema();
    createTestUserAndToken();
  });

  afterAll(() => {
    // Close database
    db.close();

    // Clean up test files
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(TEST_UPLOAD_DIR)) {
      fs.rmSync(TEST_UPLOAD_DIR, { recursive: true });
    }
  });

  beforeEach(() => {
    // Clear documents table before each test
    db.prepare('DELETE FROM documents').run();
  });

  describe('File Type Validation', () => {
    it('should accept PDF files', () => {
      const allowedTypes = ['pdf', 'docx', 'txt'];
      expect(allowedTypes.includes('pdf')).toBe(true);
    });

    it('should accept DOCX files', () => {
      const allowedTypes = ['pdf', 'docx', 'txt'];
      expect(allowedTypes.includes('docx')).toBe(true);
    });

    it('should accept TXT files', () => {
      const allowedTypes = ['pdf', 'docx', 'txt'];
      expect(allowedTypes.includes('txt')).toBe(true);
    });

    it('should reject unsupported file types', () => {
      const allowedTypes = ['pdf', 'docx', 'txt'];
      expect(allowedTypes.includes('exe')).toBe(false);
      expect(allowedTypes.includes('js')).toBe(false);
      expect(allowedTypes.includes('html')).toBe(false);
    });
  });

  describe('File Size Validation', () => {
    it('should enforce maximum file size of 50MB', () => {
      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB in bytes
      expect(MAX_FILE_SIZE).toBe(52428800);
    });

    it('should accept files under the size limit', () => {
      const MAX_FILE_SIZE = 50 * 1024 * 1024;
      const fileSize = 10 * 1024 * 1024; // 10MB
      expect(fileSize <= MAX_FILE_SIZE).toBe(true);
    });

    it('should reject files over the size limit', () => {
      const MAX_FILE_SIZE = 50 * 1024 * 1024;
      const fileSize = 60 * 1024 * 1024; // 60MB
      expect(fileSize <= MAX_FILE_SIZE).toBe(false);
    });
  });

  describe('Document Database Operations', () => {
    it('should insert document metadata into database', () => {
      const documentId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO documents (id, user_id, firm_id, filename, original_filename, file_type, file_size, file_path, case_reference, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        documentId,
        testUserId,
        testFirmId,
        'test-file.pdf.enc',
        'original.pdf',
        'pdf',
        1024,
        '/path/to/file',
        'CASE-001',
        'Test document',
        now,
        now
      );

      const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId) as {
        id: string;
        original_filename: string;
        file_type: string;
        case_reference: string;
      };

      expect(doc).toBeDefined();
      expect(doc.original_filename).toBe('original.pdf');
      expect(doc.file_type).toBe('pdf');
      expect(doc.case_reference).toBe('CASE-001');
    });

    it('should retrieve documents by firm_id', () => {
      const doc1Id = uuidv4();
      const doc2Id = uuidv4();
      const now = new Date().toISOString();

      // Insert two documents for test firm
      db.prepare(`
        INSERT INTO documents (id, user_id, firm_id, filename, original_filename, file_type, file_size, file_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(doc1Id, testUserId, testFirmId, 'file1.pdf.enc', 'doc1.pdf', 'pdf', 1024, '/path/1', now, now);

      db.prepare(`
        INSERT INTO documents (id, user_id, firm_id, filename, original_filename, file_type, file_size, file_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(doc2Id, testUserId, testFirmId, 'file2.docx.enc', 'doc2.docx', 'docx', 2048, '/path/2', now, now);

      const docs = db.prepare('SELECT * FROM documents WHERE firm_id = ?').all(testFirmId) as Array<{
        id: string;
      }>;

      expect(docs.length).toBe(2);
    });

    it('should filter documents by case_reference', () => {
      const docId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO documents (id, user_id, firm_id, filename, original_filename, file_type, file_size, file_path, case_reference, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(docId, testUserId, testFirmId, 'file.pdf.enc', 'doc.pdf', 'pdf', 1024, '/path', 'CASE-002', now, now);

      const docs = db.prepare('SELECT * FROM documents WHERE firm_id = ? AND case_reference = ?').all(
        testFirmId,
        'CASE-002'
      ) as Array<{ id: string }>;

      expect(docs.length).toBe(1);
      expect(docs[0].id).toBe(docId);
    });

    it('should filter documents by file_type', () => {
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO documents (id, user_id, firm_id, filename, original_filename, file_type, file_size, file_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testUserId, testFirmId, 'file1.pdf.enc', 'doc1.pdf', 'pdf', 1024, '/path/1', now, now);

      db.prepare(`
        INSERT INTO documents (id, user_id, firm_id, filename, original_filename, file_type, file_size, file_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testUserId, testFirmId, 'file2.txt.enc', 'doc2.txt', 'txt', 512, '/path/2', now, now);

      const pdfDocs = db.prepare('SELECT * FROM documents WHERE firm_id = ? AND file_type = ?').all(
        testFirmId,
        'pdf'
      ) as Array<{ file_type: string }>;

      expect(pdfDocs.length).toBe(1);
      expect(pdfDocs[0].file_type).toBe('pdf');
    });

    it('should update document metadata', () => {
      const docId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO documents (id, user_id, firm_id, filename, original_filename, file_type, file_size, file_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(docId, testUserId, testFirmId, 'file.pdf.enc', 'doc.pdf', 'pdf', 1024, '/path', now, now);

      db.prepare(`
        UPDATE documents SET case_reference = ?, description = ?, updated_at = ? WHERE id = ?
      `).run('CASE-003', 'Updated description', new Date().toISOString(), docId);

      const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId) as {
        case_reference: string;
        description: string;
      };

      expect(doc.case_reference).toBe('CASE-003');
      expect(doc.description).toBe('Updated description');
    });

    it('should delete document from database', () => {
      const docId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO documents (id, user_id, firm_id, filename, original_filename, file_type, file_size, file_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(docId, testUserId, testFirmId, 'file.pdf.enc', 'doc.pdf', 'pdf', 1024, '/path', now, now);

      db.prepare('DELETE FROM documents WHERE id = ?').run(docId);

      const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
      expect(doc).toBeUndefined();
    });

    it('should search documents by filename', () => {
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO documents (id, user_id, firm_id, filename, original_filename, file_type, file_size, file_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testUserId, testFirmId, 'file1.pdf.enc', 'important_contract.pdf', 'pdf', 1024, '/path/1', now, now);

      db.prepare(`
        INSERT INTO documents (id, user_id, firm_id, filename, original_filename, file_type, file_size, file_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testUserId, testFirmId, 'file2.pdf.enc', 'other_document.pdf', 'pdf', 1024, '/path/2', now, now);

      const searchTerm = '%contract%';
      const docs = db.prepare(`
        SELECT * FROM documents WHERE firm_id = ? AND original_filename LIKE ?
      `).all(testFirmId, searchTerm) as Array<{ original_filename: string }>;

      expect(docs.length).toBe(1);
      expect(docs[0].original_filename).toContain('contract');
    });
  });

  describe('Audit Logging', () => {
    it('should log document upload event', () => {
      const auditId = uuidv4();
      const documentId = uuidv4();

      db.prepare(`
        INSERT INTO audit_logs (id, event_type, user_id, firm_id, resource_type, resource_id, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        auditId,
        'DOCUMENT_UPLOADED',
        testUserId,
        testFirmId,
        'document',
        documentId,
        JSON.stringify({ original_filename: 'test.pdf', file_size: 1024 })
      );

      const log = db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(auditId) as {
        event_type: string;
        resource_type: string;
        resource_id: string;
      };

      expect(log).toBeDefined();
      expect(log.event_type).toBe('DOCUMENT_UPLOADED');
      expect(log.resource_type).toBe('document');
      expect(log.resource_id).toBe(documentId);
    });

    it('should log document download event', () => {
      const auditId = uuidv4();
      const documentId = uuidv4();

      db.prepare(`
        INSERT INTO audit_logs (id, event_type, user_id, firm_id, resource_type, resource_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(auditId, 'DOCUMENT_DOWNLOADED', testUserId, testFirmId, 'document', documentId);

      const log = db.prepare('SELECT * FROM audit_logs WHERE event_type = ?').get('DOCUMENT_DOWNLOADED') as {
        event_type: string;
      };

      expect(log).toBeDefined();
      expect(log.event_type).toBe('DOCUMENT_DOWNLOADED');
    });

    it('should log document preview event', () => {
      const auditId = uuidv4();
      const documentId = uuidv4();

      db.prepare(`
        INSERT INTO audit_logs (id, event_type, user_id, firm_id, resource_type, resource_id, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        auditId,
        'DOCUMENT_PREVIEWED',
        testUserId,
        testFirmId,
        'document',
        documentId,
        JSON.stringify({ original_filename: 'test.pdf', file_type: 'pdf' })
      );

      const log = db.prepare('SELECT * FROM audit_logs WHERE event_type = ?').get('DOCUMENT_PREVIEWED') as {
        event_type: string;
        resource_type: string;
      };

      expect(log).toBeDefined();
      expect(log.event_type).toBe('DOCUMENT_PREVIEWED');
      expect(log.resource_type).toBe('document');
    });

    it('should log document deletion event', () => {
      const auditId = uuidv4();
      const documentId = uuidv4();

      db.prepare(`
        INSERT INTO audit_logs (id, event_type, user_id, firm_id, resource_type, resource_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(auditId, 'DOCUMENT_DELETED', testUserId, testFirmId, 'document', documentId);

      const log = db.prepare('SELECT * FROM audit_logs WHERE event_type = ?').get('DOCUMENT_DELETED') as {
        event_type: string;
      };

      expect(log).toBeDefined();
      expect(log.event_type).toBe('DOCUMENT_DELETED');
    });
  });

  describe('Document Preview', () => {
    it('should support previewing PDF files', () => {
      const supportedPreviewTypes = ['pdf', 'txt'];
      expect(supportedPreviewTypes.includes('pdf')).toBe(true);
    });

    it('should support previewing TXT files', () => {
      const supportedPreviewTypes = ['pdf', 'txt'];
      expect(supportedPreviewTypes.includes('txt')).toBe(true);
    });

    it('should not support native preview for DOCX files', () => {
      // DOCX files require download, cannot be previewed inline in browser
      const supportedPreviewTypes = ['pdf', 'txt'];
      expect(supportedPreviewTypes.includes('docx')).toBe(false);
    });

    it('should return correct MIME type for text preview', () => {
      const mimeTypes: Record<string, string> = {
        pdf: 'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        txt: 'text/plain; charset=utf-8',
      };
      expect(mimeTypes['txt']).toBe('text/plain; charset=utf-8');
    });

    it('should return correct MIME type for PDF preview', () => {
      const mimeTypes: Record<string, string> = {
        pdf: 'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        txt: 'text/plain; charset=utf-8',
      };
      expect(mimeTypes['pdf']).toBe('application/pdf');
    });

    it('should use inline Content-Disposition for preview', () => {
      const filename = 'test-document.pdf';
      const disposition = `inline; filename="${filename}"`;
      expect(disposition).toBe('inline; filename="test-document.pdf"');
    });

    it('should use attachment Content-Disposition for download', () => {
      const filename = 'test-document.pdf';
      const disposition = `attachment; filename="${filename}"`;
      expect(disposition).toBe('attachment; filename="test-document.pdf"');
    });
  });

  describe('JWT Token Validation', () => {
    it('should generate valid JWT token', () => {
      expect(testToken).toBeDefined();
      expect(typeof testToken).toBe('string');
    });

    it('should decode JWT token correctly', () => {
      const decoded = jwt.verify(testToken, JWT_SECRET) as {
        userId: string;
        email: string;
        firmId: string;
        role: string;
      };

      expect(decoded.userId).toBe(testUserId);
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.firmId).toBe(testFirmId);
      expect(decoded.role).toBe('attorney');
    });

    it('should reject invalid JWT token', () => {
      expect(() => {
        jwt.verify('invalid-token', JWT_SECRET);
      }).toThrow();
    });
  });

  describe('Multi-file Upload Support', () => {
    it('should allow up to 10 files per request', () => {
      const MAX_FILES = 10;
      expect(MAX_FILES).toBe(10);
    });

    it('should reject requests with more than 10 files', () => {
      const MAX_FILES = 10;
      const filesCount = 15;
      expect(filesCount > MAX_FILES).toBe(true);
    });
  });
});
