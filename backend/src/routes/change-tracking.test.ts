// Change tracking API tests
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
const TEST_DB_PATH = path.resolve(__dirname, '../../data/test-change-tracking.sqlite');
const JWT_SECRET = 'test-jwt-secret';

let db: Database.Database;
let testFirmId: string;
let testUserId: string;
let testUserId2: string;
let testToken: string;
let testToken2: string;
let testDemandLetterId: string;

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

    CREATE TABLE IF NOT EXISTS demand_letters (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      firm_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      content_html TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      case_reference TEXT,
      client_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS demand_letter_versions (
      id TEXT PRIMARY KEY,
      demand_letter_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      content TEXT NOT NULL,
      content_html TEXT,
      changed_by TEXT NOT NULL,
      change_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (demand_letter_id) REFERENCES demand_letters(id) ON DELETE CASCADE,
      FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS document_changes (
      id TEXT PRIMARY KEY,
      demand_letter_id TEXT NOT NULL,
      version_id TEXT,
      user_id TEXT NOT NULL,
      change_type TEXT NOT NULL CHECK (change_type IN ('insertion', 'deletion', 'modification', 'format')),
      position_start INTEGER NOT NULL,
      position_end INTEGER NOT NULL,
      old_content TEXT,
      new_content TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
      reviewed_by TEXT,
      reviewed_at TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (demand_letter_id) REFERENCES demand_letters(id) ON DELETE CASCADE,
      FOREIGN KEY (version_id) REFERENCES demand_letter_versions(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS document_comments (
      id TEXT PRIMARY KEY,
      demand_letter_id TEXT NOT NULL,
      change_id TEXT,
      user_id TEXT NOT NULL,
      parent_id TEXT,
      content TEXT NOT NULL,
      position_start INTEGER,
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

// Create test users and generate tokens
const createTestUsersAndTokens = () => {
  testFirmId = uuidv4();
  testUserId = uuidv4();
  testUserId2 = uuidv4();

  db.prepare(`
    INSERT INTO firms (id, name) VALUES (?, ?)
  `).run(testFirmId, 'Test Law Firm');

  const passwordHash = bcrypt.hashSync('Password123!', 10);

  // First user (attorney)
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

  // Second user (paralegal)
  db.prepare(`
    INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(testUserId2, testFirmId, 'paralegal@test.com', passwordHash, 'Jane', 'Paralegal', 'paralegal');

  testToken2 = jwt.sign(
    {
      userId: testUserId2,
      email: 'paralegal@test.com',
      firmId: testFirmId,
      role: 'paralegal',
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
};

// Create test demand letter
const createTestDemandLetter = () => {
  testDemandLetterId = uuidv4();
  db.prepare(`
    INSERT INTO demand_letters (id, user_id, firm_id, title, content, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(testDemandLetterId, testUserId, testFirmId, 'Test Demand Letter', 'Test content', 'draft');

  // Create some versions
  db.prepare(`
    INSERT INTO demand_letter_versions (id, demand_letter_id, version_number, content, changed_by, change_summary)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), testDemandLetterId, 1, 'Initial content', testUserId, 'Initial creation');

  db.prepare(`
    INSERT INTO demand_letter_versions (id, demand_letter_id, version_number, content, changed_by, change_summary)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), testDemandLetterId, 2, 'Updated content', testUserId, 'Manual edit');
};

beforeAll(() => {
  // Create test database
  const dbDir = path.dirname(TEST_DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(TEST_DB_PATH);
  db.pragma('foreign_keys = ON');

  createTestSchema();
  createTestUsersAndTokens();
  createTestDemandLetter();
});

afterAll(() => {
  db.close();
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});

beforeEach(() => {
  // Clean up changes and comments before each test
  db.exec('DELETE FROM document_comments');
  db.exec('DELETE FROM document_changes');
});

describe('Document Changes API', () => {
  describe('GET /:demandLetterId/changes', () => {
    it('should return empty changes list for new document', () => {
      const changes = db.prepare(`
        SELECT * FROM document_changes WHERE demand_letter_id = ?
      `).all(testDemandLetterId);

      expect(changes).toHaveLength(0);
    });

    it('should return changes with user info', () => {
      // Create a test change
      const changeId = uuidv4();
      db.prepare(`
        INSERT INTO document_changes (id, demand_letter_id, user_id, change_type, position_start, position_end, new_content, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(changeId, testDemandLetterId, testUserId, 'insertion', 0, 10, 'New text', 'pending');

      const changes = db.prepare(`
        SELECT dc.*, u.first_name || ' ' || u.last_name as user_name
        FROM document_changes dc
        LEFT JOIN users u ON dc.user_id = u.id
        WHERE dc.demand_letter_id = ?
      `).all(testDemandLetterId);

      expect(changes).toHaveLength(1);
      expect((changes[0] as { user_name: string }).user_name).toBe('John Attorney');
    });

    it('should filter changes by status', () => {
      // Create changes with different statuses
      db.prepare(`
        INSERT INTO document_changes (id, demand_letter_id, user_id, change_type, position_start, position_end, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testDemandLetterId, testUserId, 'insertion', 0, 10, 'pending');

      db.prepare(`
        INSERT INTO document_changes (id, demand_letter_id, user_id, change_type, position_start, position_end, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), testDemandLetterId, testUserId, 'deletion', 10, 20, 'accepted');

      const pendingChanges = db.prepare(`
        SELECT * FROM document_changes WHERE demand_letter_id = ? AND status = 'pending'
      `).all(testDemandLetterId);

      const acceptedChanges = db.prepare(`
        SELECT * FROM document_changes WHERE demand_letter_id = ? AND status = 'accepted'
      `).all(testDemandLetterId);

      expect(pendingChanges).toHaveLength(1);
      expect(acceptedChanges).toHaveLength(1);
    });
  });

  describe('POST /:demandLetterId/changes', () => {
    it('should create a new change', () => {
      const changeId = uuidv4();
      db.prepare(`
        INSERT INTO document_changes (id, demand_letter_id, user_id, change_type, position_start, position_end, new_content, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(changeId, testDemandLetterId, testUserId, 'insertion', 50, 60, 'Added text', 'pending');

      const change = db.prepare('SELECT * FROM document_changes WHERE id = ?').get(changeId) as {
        id: string;
        change_type: string;
        new_content: string;
        status: string;
      };

      expect(change).toBeDefined();
      expect(change.change_type).toBe('insertion');
      expect(change.new_content).toBe('Added text');
      expect(change.status).toBe('pending');
    });

    it('should validate change_type values', () => {
      const validTypes = ['insertion', 'deletion', 'modification', 'format'];

      validTypes.forEach((type) => {
        const changeId = uuidv4();
        expect(() => {
          db.prepare(`
            INSERT INTO document_changes (id, demand_letter_id, user_id, change_type, position_start, position_end, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(changeId, testDemandLetterId, testUserId, type, 0, 10, 'pending');
        }).not.toThrow();
      });
    });
  });

  describe('POST /:demandLetterId/changes/:changeId/review', () => {
    it('should accept a pending change', () => {
      const changeId = uuidv4();
      db.prepare(`
        INSERT INTO document_changes (id, demand_letter_id, user_id, change_type, position_start, position_end, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(changeId, testDemandLetterId, testUserId, 'insertion', 0, 10, 'pending');

      const now = new Date().toISOString();
      db.prepare(`
        UPDATE document_changes SET status = 'accepted', reviewed_by = ?, reviewed_at = ? WHERE id = ?
      `).run(testUserId2, now, changeId);

      const change = db.prepare('SELECT * FROM document_changes WHERE id = ?').get(changeId) as {
        status: string;
        reviewed_by: string;
      };

      expect(change.status).toBe('accepted');
      expect(change.reviewed_by).toBe(testUserId2);
    });

    it('should reject a pending change', () => {
      const changeId = uuidv4();
      db.prepare(`
        INSERT INTO document_changes (id, demand_letter_id, user_id, change_type, position_start, position_end, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(changeId, testDemandLetterId, testUserId, 'deletion', 10, 20, 'pending');

      const now = new Date().toISOString();
      db.prepare(`
        UPDATE document_changes SET status = 'rejected', reviewed_by = ?, reviewed_at = ? WHERE id = ?
      `).run(testUserId2, now, changeId);

      const change = db.prepare('SELECT * FROM document_changes WHERE id = ?').get(changeId) as {
        status: string;
      };

      expect(change.status).toBe('rejected');
    });
  });

  describe('Bulk review changes', () => {
    it('should bulk accept multiple changes', () => {
      const changeIds = [uuidv4(), uuidv4(), uuidv4()];

      changeIds.forEach((id, i) => {
        db.prepare(`
          INSERT INTO document_changes (id, demand_letter_id, user_id, change_type, position_start, position_end, status)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, testDemandLetterId, testUserId, 'insertion', i * 10, (i + 1) * 10, 'pending');
      });

      const now = new Date().toISOString();
      const placeholders = changeIds.map(() => '?').join(',');
      db.prepare(`
        UPDATE document_changes SET status = 'accepted', reviewed_by = ?, reviewed_at = ?
        WHERE id IN (${placeholders}) AND status = 'pending'
      `).run(testUserId2, now, ...changeIds);

      const changes = db.prepare(`
        SELECT * FROM document_changes WHERE demand_letter_id = ? AND status = 'accepted'
      `).all(testDemandLetterId);

      expect(changes).toHaveLength(3);
    });
  });

  describe('DELETE /:demandLetterId/changes/:changeId', () => {
    it('should delete a pending change', () => {
      const changeId = uuidv4();
      db.prepare(`
        INSERT INTO document_changes (id, demand_letter_id, user_id, change_type, position_start, position_end, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(changeId, testDemandLetterId, testUserId, 'insertion', 0, 10, 'pending');

      db.prepare('DELETE FROM document_changes WHERE id = ?').run(changeId);

      const change = db.prepare('SELECT * FROM document_changes WHERE id = ?').get(changeId);
      expect(change).toBeUndefined();
    });
  });
});

describe('Document Comments API', () => {
  describe('GET /:demandLetterId/comments', () => {
    it('should return empty comments list', () => {
      const comments = db.prepare(`
        SELECT * FROM document_comments WHERE demand_letter_id = ?
      `).all(testDemandLetterId);

      expect(comments).toHaveLength(0);
    });

    it('should return comments with user info', () => {
      const commentId = uuidv4();
      db.prepare(`
        INSERT INTO document_comments (id, demand_letter_id, user_id, content)
        VALUES (?, ?, ?, ?)
      `).run(commentId, testDemandLetterId, testUserId, 'Test comment');

      const comments = db.prepare(`
        SELECT dc.*, u.first_name || ' ' || u.last_name as user_name
        FROM document_comments dc
        LEFT JOIN users u ON dc.user_id = u.id
        WHERE dc.demand_letter_id = ?
      `).all(testDemandLetterId);

      expect(comments).toHaveLength(1);
      expect((comments[0] as { user_name: string }).user_name).toBe('John Attorney');
    });

    it('should filter resolved comments', () => {
      // Unresolved comment
      db.prepare(`
        INSERT INTO document_comments (id, demand_letter_id, user_id, content, is_resolved)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuidv4(), testDemandLetterId, testUserId, 'Unresolved comment', 0);

      // Resolved comment
      db.prepare(`
        INSERT INTO document_comments (id, demand_letter_id, user_id, content, is_resolved)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuidv4(), testDemandLetterId, testUserId, 'Resolved comment', 1);

      const unresolvedComments = db.prepare(`
        SELECT * FROM document_comments WHERE demand_letter_id = ? AND is_resolved = 0
      `).all(testDemandLetterId);

      const allComments = db.prepare(`
        SELECT * FROM document_comments WHERE demand_letter_id = ?
      `).all(testDemandLetterId);

      expect(unresolvedComments).toHaveLength(1);
      expect(allComments).toHaveLength(2);
    });
  });

  describe('POST /:demandLetterId/comments', () => {
    it('should create a new comment', () => {
      const commentId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO document_comments (id, demand_letter_id, user_id, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(commentId, testDemandLetterId, testUserId, 'A new comment', now, now);

      const comment = db.prepare('SELECT * FROM document_comments WHERE id = ?').get(commentId) as {
        id: string;
        content: string;
      };

      expect(comment).toBeDefined();
      expect(comment.content).toBe('A new comment');
    });

    it('should create a reply to a comment', () => {
      const parentId = uuidv4();
      const replyId = uuidv4();
      const now = new Date().toISOString();

      // Create parent comment
      db.prepare(`
        INSERT INTO document_comments (id, demand_letter_id, user_id, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(parentId, testDemandLetterId, testUserId, 'Parent comment', now, now);

      // Create reply
      db.prepare(`
        INSERT INTO document_comments (id, demand_letter_id, user_id, content, parent_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(replyId, testDemandLetterId, testUserId2, 'Reply comment', parentId, now, now);

      const reply = db.prepare('SELECT * FROM document_comments WHERE id = ?').get(replyId) as {
        parent_id: string;
      };

      expect(reply.parent_id).toBe(parentId);
    });

    it('should create a comment on a specific change', () => {
      const changeId = uuidv4();
      const commentId = uuidv4();
      const now = new Date().toISOString();

      // Create change
      db.prepare(`
        INSERT INTO document_changes (id, demand_letter_id, user_id, change_type, position_start, position_end, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(changeId, testDemandLetterId, testUserId, 'insertion', 0, 10, 'pending');

      // Create comment on change
      db.prepare(`
        INSERT INTO document_comments (id, demand_letter_id, user_id, content, change_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(commentId, testDemandLetterId, testUserId2, 'Comment on change', changeId, now, now);

      const comment = db.prepare('SELECT * FROM document_comments WHERE id = ?').get(commentId) as {
        change_id: string;
      };

      expect(comment.change_id).toBe(changeId);
    });
  });

  describe('PATCH /:demandLetterId/comments/:commentId', () => {
    it('should update a comment', () => {
      const commentId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO document_comments (id, demand_letter_id, user_id, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(commentId, testDemandLetterId, testUserId, 'Original content', now, now);

      const later = new Date().toISOString();
      db.prepare(`
        UPDATE document_comments SET content = ?, updated_at = ? WHERE id = ?
      `).run('Updated content', later, commentId);

      const comment = db.prepare('SELECT * FROM document_comments WHERE id = ?').get(commentId) as {
        content: string;
      };

      expect(comment.content).toBe('Updated content');
    });
  });

  describe('POST /:demandLetterId/comments/:commentId/resolve', () => {
    it('should resolve a comment', () => {
      const commentId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO document_comments (id, demand_letter_id, user_id, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(commentId, testDemandLetterId, testUserId, 'Comment to resolve', now, now);

      db.prepare(`
        UPDATE document_comments SET is_resolved = 1, resolved_by = ?, resolved_at = ? WHERE id = ?
      `).run(testUserId2, now, commentId);

      const comment = db.prepare('SELECT * FROM document_comments WHERE id = ?').get(commentId) as {
        is_resolved: number;
        resolved_by: string;
      };

      expect(comment.is_resolved).toBe(1);
      expect(comment.resolved_by).toBe(testUserId2);
    });

    it('should unresolve a comment', () => {
      const commentId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO document_comments (id, demand_letter_id, user_id, content, is_resolved, resolved_by, resolved_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(commentId, testDemandLetterId, testUserId, 'Resolved comment', 1, testUserId2, now, now, now);

      db.prepare(`
        UPDATE document_comments SET is_resolved = 0, resolved_by = NULL, resolved_at = NULL WHERE id = ?
      `).run(commentId);

      const comment = db.prepare('SELECT * FROM document_comments WHERE id = ?').get(commentId) as {
        is_resolved: number;
        resolved_by: string | null;
      };

      expect(comment.is_resolved).toBe(0);
      expect(comment.resolved_by).toBeNull();
    });
  });

  describe('DELETE /:demandLetterId/comments/:commentId', () => {
    it('should delete a comment', () => {
      const commentId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO document_comments (id, demand_letter_id, user_id, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(commentId, testDemandLetterId, testUserId, 'Comment to delete', now, now);

      db.prepare('DELETE FROM document_comments WHERE id = ?').run(commentId);

      const comment = db.prepare('SELECT * FROM document_comments WHERE id = ?').get(commentId);
      expect(comment).toBeUndefined();
    });

    it('should cascade delete replies when parent is deleted', () => {
      const parentId = uuidv4();
      const replyId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO document_comments (id, demand_letter_id, user_id, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(parentId, testDemandLetterId, testUserId, 'Parent', now, now);

      db.prepare(`
        INSERT INTO document_comments (id, demand_letter_id, user_id, content, parent_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(replyId, testDemandLetterId, testUserId2, 'Reply', parentId, now, now);

      db.prepare('DELETE FROM document_comments WHERE id = ?').run(parentId);

      const reply = db.prepare('SELECT * FROM document_comments WHERE id = ?').get(replyId);
      expect(reply).toBeUndefined();
    });
  });
});

describe('Version Comparison', () => {
  describe('GET /:demandLetterId/versions/compare', () => {
    it('should have versions to compare', () => {
      const versions = db.prepare(`
        SELECT * FROM demand_letter_versions WHERE demand_letter_id = ? ORDER BY version_number ASC
      `).all(testDemandLetterId);

      expect(versions.length).toBeGreaterThanOrEqual(2);
    });

    it('should retrieve version content for comparison', () => {
      const version1 = db.prepare(`
        SELECT * FROM demand_letter_versions WHERE demand_letter_id = ? AND version_number = 1
      `).get(testDemandLetterId) as { content: string };

      const version2 = db.prepare(`
        SELECT * FROM demand_letter_versions WHERE demand_letter_id = ? AND version_number = 2
      `).get(testDemandLetterId) as { content: string };

      expect(version1).toBeDefined();
      expect(version2).toBeDefined();
      expect(version1.content).not.toBe(version2.content);
    });
  });
});

describe('Cascade Deletes', () => {
  it('should delete changes when demand letter is deleted', () => {
    // Create a new demand letter
    const letterId = uuidv4();
    db.prepare(`
      INSERT INTO demand_letters (id, user_id, firm_id, title, content, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(letterId, testUserId, testFirmId, 'Temp Letter', 'Content', 'draft');

    // Create a change for it
    const changeId = uuidv4();
    db.prepare(`
      INSERT INTO document_changes (id, demand_letter_id, user_id, change_type, position_start, position_end, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(changeId, letterId, testUserId, 'insertion', 0, 10, 'pending');

    // Delete the demand letter
    db.prepare('DELETE FROM demand_letters WHERE id = ?').run(letterId);

    // Check change is deleted
    const change = db.prepare('SELECT * FROM document_changes WHERE id = ?').get(changeId);
    expect(change).toBeUndefined();
  });

  it('should delete comments when demand letter is deleted', () => {
    // Create a new demand letter
    const letterId = uuidv4();
    db.prepare(`
      INSERT INTO demand_letters (id, user_id, firm_id, title, content, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(letterId, testUserId, testFirmId, 'Temp Letter 2', 'Content', 'draft');

    // Create a comment for it
    const commentId = uuidv4();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO document_comments (id, demand_letter_id, user_id, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(commentId, letterId, testUserId, 'Comment', now, now);

    // Delete the demand letter
    db.prepare('DELETE FROM demand_letters WHERE id = ?').run(letterId);

    // Check comment is deleted
    const comment = db.prepare('SELECT * FROM document_comments WHERE id = ?').get(commentId);
    expect(comment).toBeUndefined();
  });

  it('should delete comments when change is deleted', () => {
    // Create a change
    const changeId = uuidv4();
    db.prepare(`
      INSERT INTO document_changes (id, demand_letter_id, user_id, change_type, position_start, position_end, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(changeId, testDemandLetterId, testUserId, 'insertion', 0, 10, 'pending');

    // Create a comment on the change
    const commentId = uuidv4();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO document_comments (id, demand_letter_id, user_id, content, change_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(commentId, testDemandLetterId, testUserId, 'Comment on change', changeId, now, now);

    // Delete the change
    db.prepare('DELETE FROM document_changes WHERE id = ?').run(changeId);

    // Check comment is deleted
    const comment = db.prepare('SELECT * FROM document_comments WHERE id = ?').get(commentId);
    expect(comment).toBeUndefined();
  });
});
