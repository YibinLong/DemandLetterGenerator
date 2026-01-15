// Tests for authentication and security features
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test database path
const TEST_DB_PATH = path.resolve(__dirname, '../../data/test-auth.sqlite');

// Database and test data
let db: Database.Database;
let testFirmId: string;
let testUserId: string;
const testEmail = 'test@example.com';
const testPassword = 'TestPass123';

// Create test database schema
const createTestSchema = () => {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      description TEXT
    );

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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS rate_limits (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 1,
      window_start TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(identifier, endpoint)
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
  `);
};

// Setup before all tests
beforeAll(async () => {
  // Clean up old test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  // Remove WAL files if they exist
  if (fs.existsSync(TEST_DB_PATH + '-wal')) fs.unlinkSync(TEST_DB_PATH + '-wal');
  if (fs.existsSync(TEST_DB_PATH + '-shm')) fs.unlinkSync(TEST_DB_PATH + '-shm');

  // Ensure directory exists
  const dir = path.dirname(TEST_DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Create test database
  db = new Database(TEST_DB_PATH);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  createTestSchema();

  // Create test firm
  testFirmId = uuidv4();
  db.prepare(`
    INSERT INTO firms (id, name, created_at, updated_at)
    VALUES (?, ?, datetime('now'), datetime('now'))
  `).run(testFirmId, 'Test Law Firm');

  // Create test user with hashed password
  testUserId = uuidv4();
  const passwordHash = await bcrypt.hash(testPassword, 10);
  db.prepare(`
    INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
  `).run(testUserId, testFirmId, testEmail, passwordHash, 'Test', 'User', 'attorney');
});

// Cleanup after all tests
afterAll(() => {
  if (db) {
    db.close();
  }
  // Clean up test database files
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  if (fs.existsSync(TEST_DB_PATH + '-wal')) fs.unlinkSync(TEST_DB_PATH + '-wal');
  if (fs.existsSync(TEST_DB_PATH + '-shm')) fs.unlinkSync(TEST_DB_PATH + '-shm');
});

interface PragmaTableInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

describe('Database Schema - Auth Tables', () => {
  it('should have users table with correct columns', () => {
    const tableInfo = db.prepare("PRAGMA table_info(users)").all() as PragmaTableInfo[];
    const columnNames = tableInfo.map((col) => col.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('firm_id');
    expect(columnNames).toContain('email');
    expect(columnNames).toContain('password_hash');
    expect(columnNames).toContain('role');
    expect(columnNames).toContain('is_active');
  });

  it('should have audit_logs table with correct columns', () => {
    const tableInfo = db.prepare("PRAGMA table_info(audit_logs)").all() as PragmaTableInfo[];
    const columnNames = tableInfo.map((col) => col.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('event_type');
    expect(columnNames).toContain('user_id');
    expect(columnNames).toContain('firm_id');
    expect(columnNames).toContain('details');
    expect(columnNames).toContain('ip_address');
  });

  it('should have rate_limits table with correct columns', () => {
    const tableInfo = db.prepare("PRAGMA table_info(rate_limits)").all() as PragmaTableInfo[];
    const columnNames = tableInfo.map((col) => col.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('identifier');
    expect(columnNames).toContain('endpoint');
    expect(columnNames).toContain('request_count');
    expect(columnNames).toContain('window_start');
  });
});

describe('Password Hashing', () => {
  it('should hash password correctly', async () => {
    const password = 'SecurePassword123';
    const hash = await bcrypt.hash(password, 10);

    expect(hash).not.toBe(password);
    expect(hash.length).toBeGreaterThan(50);
  });

  it('should verify correct password', async () => {
    const password = 'SecurePassword123';
    const hash = await bcrypt.hash(password, 10);

    const isValid = await bcrypt.compare(password, hash);
    expect(isValid).toBe(true);
  });

  it('should reject incorrect password', async () => {
    const password = 'SecurePassword123';
    const wrongPassword = 'WrongPassword456';
    const hash = await bcrypt.hash(password, 10);

    const isValid = await bcrypt.compare(wrongPassword, hash);
    expect(isValid).toBe(false);
  });
});

describe('User CRUD Operations', () => {
  it('should retrieve user by email', () => {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(testEmail) as { email: string; role: string } | undefined;

    expect(user).toBeDefined();
    expect(user?.email).toBe(testEmail);
    expect(user?.role).toBe('attorney');
  });

  it('should enforce unique email constraint', () => {
    const duplicateInsert = () => {
      db.prepare(`
        INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `).run(uuidv4(), testFirmId, testEmail, 'hash', 'Dup', 'User', 'staff');
    };

    expect(duplicateInsert).toThrow();
  });

  it('should update user last_login', () => {
    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(testUserId);

    const user = db.prepare('SELECT last_login FROM users WHERE id = ?').get(testUserId) as { last_login: string } | undefined;
    expect(user?.last_login).toBeDefined();
  });

  it('should deactivate user', () => {
    // Create a user to deactivate
    const deactivateUserId = uuidv4();
    db.prepare(`
      INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(deactivateUserId, testFirmId, 'deactivate@test.com', 'hash', 'Deact', 'User', 'staff');

    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(deactivateUserId);

    const user = db.prepare('SELECT is_active FROM users WHERE id = ?').get(deactivateUserId) as { is_active: number } | undefined;
    expect(user?.is_active).toBe(0);
  });
});

describe('Role Validation', () => {
  it('should accept valid roles', () => {
    const validRoles = ['admin', 'attorney', 'paralegal', 'staff'];

    for (const role of validRoles) {
      const userId = uuidv4();
      const email = `role-${role}-${Date.now()}@test.com`;

      const insert = () => {
        db.prepare(`
          INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
        `).run(userId, testFirmId, email, 'hash', 'Role', 'Test', role);
      };

      expect(insert).not.toThrow();
    }
  });

  it('should reject invalid role', () => {
    const invalidInsert = () => {
      db.prepare(`
        INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `).run(uuidv4(), testFirmId, 'invalid-role@test.com', 'hash', 'Bad', 'Role', 'superadmin');
    };

    expect(invalidInsert).toThrow();
  });
});

describe('Audit Logging', () => {
  it('should create audit log entry', () => {
    const auditId = uuidv4();
    db.prepare(`
      INSERT INTO audit_logs (id, event_type, user_id, firm_id, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(auditId, 'LOGIN_SUCCESS', testUserId, testFirmId, JSON.stringify({ email: testEmail }), '127.0.0.1');

    const log = db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(auditId) as { event_type: string; user_id: string } | undefined;

    expect(log).toBeDefined();
    expect(log?.event_type).toBe('LOGIN_SUCCESS');
    expect(log?.user_id).toBe(testUserId);
  });

  it('should store JSON details correctly', () => {
    const auditId = uuidv4();
    const details = { action: 'test', metadata: { key: 'value' } };

    db.prepare(`
      INSERT INTO audit_logs (id, event_type, user_id, firm_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(auditId, 'TEST_EVENT', testUserId, testFirmId, JSON.stringify(details));

    const log = db.prepare('SELECT details FROM audit_logs WHERE id = ?').get(auditId) as { details: string } | undefined;
    const parsedDetails = JSON.parse(log?.details || '{}');

    expect(parsedDetails.action).toBe('test');
    expect(parsedDetails.metadata.key).toBe('value');
  });

  it('should query audit logs by event type', () => {
    // Insert multiple audit logs
    for (let i = 0; i < 3; i++) {
      db.prepare(`
        INSERT INTO audit_logs (id, event_type, user_id, firm_id, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run(uuidv4(), 'QUERY_TEST_EVENT', testUserId, testFirmId);
    }

    const logs = db.prepare('SELECT * FROM audit_logs WHERE event_type = ?').all('QUERY_TEST_EVENT');
    expect(logs.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Rate Limiting Storage', () => {
  it('should create rate limit record', () => {
    const rateLimitId = uuidv4();
    db.prepare(`
      INSERT INTO rate_limits (id, identifier, endpoint, request_count, window_start, created_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(rateLimitId, 'ip:192.168.1.1', '/api/auth/login', 1);

    const record = db.prepare('SELECT * FROM rate_limits WHERE id = ?').get(rateLimitId) as { identifier: string; endpoint: string } | undefined;

    expect(record).toBeDefined();
    expect(record?.identifier).toBe('ip:192.168.1.1');
    expect(record?.endpoint).toBe('/api/auth/login');
  });

  it('should update rate limit count', () => {
    const rateLimitId = uuidv4();
    db.prepare(`
      INSERT INTO rate_limits (id, identifier, endpoint, request_count, window_start, created_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(rateLimitId, 'ip:192.168.1.2', '/api/test', 5);

    db.prepare('UPDATE rate_limits SET request_count = request_count + 1 WHERE id = ?').run(rateLimitId);

    const record = db.prepare('SELECT request_count FROM rate_limits WHERE id = ?').get(rateLimitId) as { request_count: number } | undefined;
    expect(record?.request_count).toBe(6);
  });

  it('should enforce unique constraint on identifier + endpoint', () => {
    const identifier = `ip:unique-test-${Date.now()}`;
    const endpoint = '/api/unique-test';

    db.prepare(`
      INSERT INTO rate_limits (id, identifier, endpoint, request_count, window_start, created_at)
      VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(uuidv4(), identifier, endpoint);

    const duplicateInsert = () => {
      db.prepare(`
        INSERT INTO rate_limits (id, identifier, endpoint, request_count, window_start, created_at)
        VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
      `).run(uuidv4(), identifier, endpoint);
    };

    expect(duplicateInsert).toThrow();
  });
});

describe('Firm Access Control', () => {
  it('should enforce foreign key on firm_id for users', () => {
    const invalidInsert = () => {
      db.prepare(`
        INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `).run(uuidv4(), 'non-existent-firm-id', 'orphan@test.com', 'hash', 'Orphan', 'User', 'staff');
    };

    expect(invalidInsert).toThrow();
  });

  it('should cascade delete users when firm is deleted', () => {
    // Create a firm to delete
    const deleteFirmId = uuidv4();
    db.prepare(`
      INSERT INTO firms (id, name, created_at, updated_at)
      VALUES (?, ?, datetime('now'), datetime('now'))
    `).run(deleteFirmId, 'Delete Test Firm');

    // Create a user in that firm
    const deleteUserId = uuidv4();
    db.prepare(`
      INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(deleteUserId, deleteFirmId, 'delete-cascade@test.com', 'hash', 'Delete', 'Cascade', 'staff');

    // Delete the firm
    db.prepare('DELETE FROM firms WHERE id = ?').run(deleteFirmId);

    // User should be deleted too
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(deleteUserId);
    expect(user).toBeUndefined();
  });

  it('should allow querying users by firm', () => {
    const users = db.prepare('SELECT * FROM users WHERE firm_id = ?').all(testFirmId);
    expect(users.length).toBeGreaterThan(0);
  });
});

describe('Password Validation Rules', () => {
  it('should accept password with 8+ chars, uppercase, lowercase, and number', () => {
    const validPasswords = [
      'Password1',
      'MySecure123',
      'Test1234abc',
      'ABCdef789',
    ];

    for (const password of validPasswords) {
      expect(password.length).toBeGreaterThanOrEqual(8);
      expect(/[A-Z]/.test(password)).toBe(true);
      expect(/[a-z]/.test(password)).toBe(true);
      expect(/[0-9]/.test(password)).toBe(true);
    }
  });

  it('should identify invalid passwords', () => {
    const validatePassword = (password: string): boolean => {
      if (password.length < 8) return false;
      if (!/[A-Z]/.test(password)) return false;
      if (!/[a-z]/.test(password)) return false;
      if (!/[0-9]/.test(password)) return false;
      return true;
    };

    expect(validatePassword('short')).toBe(false); // Too short
    expect(validatePassword('alllowercase1')).toBe(false); // No uppercase
    expect(validatePassword('ALLUPPERCASE1')).toBe(false); // No lowercase
    expect(validatePassword('NoNumbers')).toBe(false); // No number
    expect(validatePassword('ValidPass1')).toBe(true); // Valid
  });
});
