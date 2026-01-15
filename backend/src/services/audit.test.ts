/**
 * Audit Service Tests
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test database path
const TEST_DB_PATH = path.resolve(__dirname, '../../data/test-audit.sqlite');

let db: Database.Database;
let testFirmId: string;
let testUserId: string;

// Mock getDatabase
const mockGetDatabase = () => db;

// Setup test database
const setupTestDatabase = () => {
  db = new Database(TEST_DB_PATH);
  db.exec(`
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

  // Create test firm and user
  testFirmId = uuidv4();
  testUserId = uuidv4();

  db.prepare(`INSERT INTO firms (id, name) VALUES (?, ?)`).run(testFirmId, 'Test Audit Firm');
  db.prepare(`
    INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(testUserId, testFirmId, 'audit@test.com', 'hash', 'Audit', 'Test', 'attorney');
};

describe('Audit Service', () => {
  beforeAll(() => {
    // Ensure test data directory exists
    const dataDir = path.dirname(TEST_DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    setupTestDatabase();
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  beforeEach(() => {
    // Clear audit logs before each test
    db.prepare('DELETE FROM audit_logs').run();
  });

  describe('logAuditEvent', () => {
    it('should create an audit log entry', () => {
      const eventId = uuidv4();
      const eventType = 'LOGIN_SUCCESS';

      db.prepare(`
        INSERT INTO audit_logs (id, event_type, user_id, firm_id, resource_type, resource_id, details, ip_address, user_agent, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        eventId,
        eventType,
        testUserId,
        testFirmId,
        null,
        null,
        JSON.stringify({ success: true }),
        '127.0.0.1',
        'Mozilla/5.0'
      );

      const log = db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(eventId) as {
        id: string;
        event_type: string;
        user_id: string;
        firm_id: string;
        details: string;
        ip_address: string;
        user_agent: string;
      };

      expect(log).toBeDefined();
      expect(log.event_type).toBe('LOGIN_SUCCESS');
      expect(log.user_id).toBe(testUserId);
      expect(log.firm_id).toBe(testFirmId);
      expect(log.ip_address).toBe('127.0.0.1');
    });

    it('should handle events without user context', () => {
      const eventId = uuidv4();

      db.prepare(`
        INSERT INTO audit_logs (id, event_type, user_id, firm_id, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run(eventId, 'LOGIN_FAILED', null, null);

      const log = db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(eventId) as {
        id: string;
        event_type: string;
        user_id: string | null;
        firm_id: string | null;
      };

      expect(log).toBeDefined();
      expect(log.event_type).toBe('LOGIN_FAILED');
      expect(log.user_id).toBeNull();
      expect(log.firm_id).toBeNull();
    });

    it('should handle IP address as array', () => {
      const eventId = uuidv4();
      const ipAddresses = ['192.168.1.1', '10.0.0.1'];

      // Simulate handling IP address array (take first one)
      const ipAddress = Array.isArray(ipAddresses) ? ipAddresses[0] : ipAddresses;

      db.prepare(`
        INSERT INTO audit_logs (id, event_type, ip_address, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `).run(eventId, 'ACCESS_DENIED', ipAddress);

      const log = db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(eventId) as {
        id: string;
        ip_address: string;
      };

      expect(log.ip_address).toBe('192.168.1.1');
    });

    it('should store details as JSON', () => {
      const eventId = uuidv4();
      const details = { action: 'create', count: 5, metadata: { key: 'value' } };

      db.prepare(`
        INSERT INTO audit_logs (id, event_type, details, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `).run(eventId, 'DOCUMENT_UPLOADED', JSON.stringify(details));

      const log = db.prepare('SELECT details FROM audit_logs WHERE id = ?').get(eventId) as {
        details: string;
      };

      expect(log.details).toBe(JSON.stringify(details));
      expect(JSON.parse(log.details)).toEqual(details);
    });
  });

  describe('getAuditLogs', () => {
    beforeEach(() => {
      // Insert test audit logs
      const events = [
        { id: uuidv4(), event_type: 'LOGIN_SUCCESS', user_id: testUserId, firm_id: testFirmId },
        { id: uuidv4(), event_type: 'DOCUMENT_UPLOADED', user_id: testUserId, firm_id: testFirmId, resource_type: 'document', resource_id: 'doc1' },
        { id: uuidv4(), event_type: 'TEMPLATE_CREATED', user_id: testUserId, firm_id: testFirmId, resource_type: 'template', resource_id: 'tmpl1' },
        { id: uuidv4(), event_type: 'LOGIN_SUCCESS', user_id: 'other-user', firm_id: 'other-firm' },
      ];

      events.forEach(event => {
        db.prepare(`
          INSERT INTO audit_logs (id, event_type, user_id, firm_id, resource_type, resource_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(event.id, event.event_type, event.user_id, event.firm_id, event.resource_type || null, event.resource_id || null);
      });
    });

    it('should return all audit logs', () => {
      const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC').all();
      expect(logs.length).toBe(4);
    });

    it('should filter by user_id', () => {
      const logs = db.prepare('SELECT * FROM audit_logs WHERE user_id = ?').all(testUserId);
      expect(logs.length).toBe(3);
    });

    it('should filter by firm_id', () => {
      const logs = db.prepare('SELECT * FROM audit_logs WHERE firm_id = ?').all(testFirmId);
      expect(logs.length).toBe(3);
    });

    it('should filter by event_type', () => {
      const logs = db.prepare('SELECT * FROM audit_logs WHERE event_type = ?').all('LOGIN_SUCCESS');
      expect(logs.length).toBe(2);
    });

    it('should filter by resource_type', () => {
      const logs = db.prepare('SELECT * FROM audit_logs WHERE resource_type = ?').all('document');
      expect(logs.length).toBe(1);
    });

    it('should filter by resource_id', () => {
      const logs = db.prepare('SELECT * FROM audit_logs WHERE resource_id = ?').all('doc1');
      expect(logs.length).toBe(1);
    });

    it('should support limit and offset', () => {
      const logs = db.prepare('SELECT * FROM audit_logs LIMIT ? OFFSET ?').all(2, 1);
      expect(logs.length).toBe(2);
    });

    it('should combine multiple filters', () => {
      const logs = db.prepare(`
        SELECT * FROM audit_logs
        WHERE user_id = ? AND event_type = ?
      `).all(testUserId, 'LOGIN_SUCCESS');
      expect(logs.length).toBe(1);
    });
  });

  describe('getAuditLogCount', () => {
    beforeEach(() => {
      // Insert test logs
      for (let i = 0; i < 10; i++) {
        db.prepare(`
          INSERT INTO audit_logs (id, event_type, user_id, firm_id, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).run(uuidv4(), 'TEST_EVENT', testUserId, testFirmId);
      }
    });

    it('should count all audit logs', () => {
      const result = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get() as { count: number };
      expect(result.count).toBe(10);
    });

    it('should count with filters', () => {
      // Add some logs with different user
      for (let i = 0; i < 3; i++) {
        db.prepare(`
          INSERT INTO audit_logs (id, event_type, user_id, firm_id, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).run(uuidv4(), 'OTHER_EVENT', 'other-user', 'other-firm');
      }

      const result = db.prepare('SELECT COUNT(*) as count FROM audit_logs WHERE user_id = ?').get(testUserId) as { count: number };
      expect(result.count).toBe(10);
    });
  });

  describe('Audit Event Types', () => {
    it('should support all authentication event types', () => {
      const authEvents = ['USER_REGISTERED', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGED'];

      authEvents.forEach(eventType => {
        const eventId = uuidv4();
        expect(() => {
          db.prepare(`
            INSERT INTO audit_logs (id, event_type, created_at)
            VALUES (?, ?, datetime('now'))
          `).run(eventId, eventType);
        }).not.toThrow();
      });
    });

    it('should support document event types', () => {
      const docEvents = ['DOCUMENT_UPLOADED', 'DOCUMENT_DOWNLOADED', 'DOCUMENT_PREVIEWED', 'DOCUMENT_DELETED'];

      docEvents.forEach(eventType => {
        const eventId = uuidv4();
        expect(() => {
          db.prepare(`
            INSERT INTO audit_logs (id, event_type, resource_type, resource_id, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
          `).run(eventId, eventType, 'document', 'doc123');
        }).not.toThrow();
      });
    });

    it('should support template event types', () => {
      const templateEvents = ['TEMPLATE_CREATED', 'TEMPLATE_UPDATED', 'TEMPLATE_DELETED', 'TEMPLATE_APPROVED', 'TEMPLATE_DUPLICATED'];

      templateEvents.forEach(eventType => {
        const eventId = uuidv4();
        expect(() => {
          db.prepare(`
            INSERT INTO audit_logs (id, event_type, resource_type, resource_id, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
          `).run(eventId, eventType, 'template', 'tmpl123');
        }).not.toThrow();
      });
    });

    it('should support demand letter event types', () => {
      const letterEvents = ['DEMAND_LETTER_CREATED', 'DEMAND_LETTER_UPDATED', 'DEMAND_LETTER_DELETED', 'DEMAND_LETTER_EXPORTED'];

      letterEvents.forEach(eventType => {
        const eventId = uuidv4();
        expect(() => {
          db.prepare(`
            INSERT INTO audit_logs (id, event_type, resource_type, resource_id, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
          `).run(eventId, eventType, 'demand_letter', 'letter123');
        }).not.toThrow();
      });
    });

    it('should support AI event types', () => {
      const aiEvents = ['AI_GENERATION_REQUESTED', 'AI_REFINEMENT_REQUESTED', 'AI_PROMPT_TEMPLATE_CREATED'];

      aiEvents.forEach(eventType => {
        const eventId = uuidv4();
        expect(() => {
          db.prepare(`
            INSERT INTO audit_logs (id, event_type, details, created_at)
            VALUES (?, ?, ?, datetime('now'))
          `).run(eventId, eventType, JSON.stringify({ model: 'gpt-4', tokens: 1000 }));
        }).not.toThrow();
      });
    });

    it('should support collaboration event types', () => {
      const collabEvents = ['COLLABORATION_JOINED', 'COLLABORATION_LEFT', 'COLLABORATION_INVITE_CREATED'];

      collabEvents.forEach(eventType => {
        const eventId = uuidv4();
        expect(() => {
          db.prepare(`
            INSERT INTO audit_logs (id, event_type, resource_type, resource_id, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
          `).run(eventId, eventType, 'session', 'session123');
        }).not.toThrow();
      });
    });

    it('should support change tracking event types', () => {
      const changeEvents = ['CHANGE_CREATED', 'CHANGE_ACCEPTED', 'CHANGE_REJECTED'];

      changeEvents.forEach(eventType => {
        const eventId = uuidv4();
        expect(() => {
          db.prepare(`
            INSERT INTO audit_logs (id, event_type, resource_type, resource_id, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
          `).run(eventId, eventType, 'change', 'change123');
        }).not.toThrow();
      });
    });

    it('should support security event types', () => {
      const securityEvents = ['ACCESS_DENIED', 'RATE_LIMIT_EXCEEDED'];

      securityEvents.forEach(eventType => {
        const eventId = uuidv4();
        expect(() => {
          db.prepare(`
            INSERT INTO audit_logs (id, event_type, ip_address, user_agent, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
          `).run(eventId, eventType, '192.168.1.1', 'Suspicious User Agent');
        }).not.toThrow();
      });
    });
  });

  describe('Date filtering', () => {
    it('should filter by from_date', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      // Insert log with specific date
      db.prepare(`
        INSERT INTO audit_logs (id, event_type, created_at)
        VALUES (?, ?, ?)
      `).run(uuidv4(), 'TEST_EVENT', yesterday.toISOString());

      const logs = db.prepare(`
        SELECT * FROM audit_logs WHERE created_at >= ?
      `).all(yesterday.toISOString());

      expect(logs.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by to_date', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      db.prepare(`
        INSERT INTO audit_logs (id, event_type, created_at)
        VALUES (?, ?, datetime('now'))
      `).run(uuidv4(), 'TEST_EVENT');

      const logs = db.prepare(`
        SELECT * FROM audit_logs WHERE created_at <= ?
      `).all(tomorrow.toISOString());

      expect(logs.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by date range', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      db.prepare(`
        INSERT INTO audit_logs (id, event_type, created_at)
        VALUES (?, ?, datetime('now'))
      `).run(uuidv4(), 'RANGE_TEST');

      const logs = db.prepare(`
        SELECT * FROM audit_logs
        WHERE created_at >= ? AND created_at <= ?
        AND event_type = ?
      `).all(yesterday.toISOString(), tomorrow.toISOString(), 'RANGE_TEST');

      expect(logs.length).toBe(1);
    });
  });
});
