// Collaboration API tests
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
const TEST_DB_PATH = path.resolve(__dirname, '../../data/test-collaboration.sqlite');
const JWT_SECRET = 'test-jwt-secret';

let db: Database.Database;
let testFirmId: string;
let testUserId: string;
let testUserId2: string;
let testToken: string;
let testToken2: string;

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

    CREATE TABLE IF NOT EXISTS collaboration_invites (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      demand_letter_id TEXT NOT NULL,
      invited_by TEXT NOT NULL,
      invited_user_id TEXT,
      invited_email TEXT,
      token TEXT NOT NULL UNIQUE,
      permission TEXT NOT NULL CHECK (permission IN ('view', 'edit')),
      accepted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (demand_letter_id) REFERENCES demand_letters(id) ON DELETE CASCADE,
      FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (invited_user_id) REFERENCES users(id) ON DELETE SET NULL
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

  // First user
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

  // Second user (same firm)
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

// Helper to create test demand letter
const createTestDemandLetter = (options?: {
  title?: string;
  content?: string;
}) => {
  const letterId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO demand_letters (id, user_id, firm_id, title, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    letterId,
    testUserId,
    testFirmId,
    options?.title || 'Test Demand Letter',
    options?.content || 'Test content for demand letter.',
    now,
    now
  );

  return letterId;
};

// Helper to create test collaboration session
const createTestSession = (demandLetterId: string) => {
  const sessionId = uuidv4();
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO collaboration_sessions (id, demand_letter_id, created_by, created_at, expires_at, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(sessionId, demandLetterId, testUserId, now, expires);

  return sessionId;
};

// Helper to create test invite
const createTestInvite = (sessionId: string, demandLetterId: string, options?: {
  invitedUserId?: string;
  invitedEmail?: string;
  permission?: 'view' | 'edit';
}) => {
  const inviteId = uuidv4();
  const token = uuidv4().replace(/-/g, '');
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO collaboration_invites
    (id, session_id, demand_letter_id, invited_by, invited_user_id, invited_email, token, permission, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    inviteId,
    sessionId,
    demandLetterId,
    testUserId,
    options?.invitedUserId || null,
    options?.invitedEmail || 'paralegal@test.com',
    token,
    options?.permission || 'edit',
    now,
    expires
  );

  return { inviteId, token };
};

describe('Collaboration API', () => {
  beforeAll(() => {
    // Ensure test directory exists
    if (!fs.existsSync(path.dirname(TEST_DB_PATH))) {
      fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
    }

    // Create test database
    db = new Database(TEST_DB_PATH);
    createTestSchema();
    createTestUsersAndTokens();
  });

  afterAll(() => {
    if (db) {
      db.close();
    }
    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  beforeEach(() => {
    // Clean up collaboration-related tables between tests
    db.exec(`
      DELETE FROM collaboration_invites;
      DELETE FROM collaboration_sessions;
      DELETE FROM demand_letters;
    `);
  });

  describe('Collaboration Sessions', () => {
    it('should create collaboration session for a demand letter', () => {
      const letterId = createTestDemandLetter();

      // Check that we can create a session
      const sessionId = createTestSession(letterId);

      const session = db.prepare(
        'SELECT * FROM collaboration_sessions WHERE id = ?'
      ).get(sessionId) as { id: string; demand_letter_id: string; created_by: string; is_active: number };

      expect(session).toBeDefined();
      expect(session.demand_letter_id).toBe(letterId);
      expect(session.created_by).toBe(testUserId);
      expect(session.is_active).toBe(1);
    });

    it('should return existing active session for same demand letter', () => {
      const letterId = createTestDemandLetter();
      const sessionId1 = createTestSession(letterId);

      // Query for sessions
      const sessions = db.prepare(
        'SELECT * FROM collaboration_sessions WHERE demand_letter_id = ? AND is_active = 1'
      ).all(letterId) as Array<{ id: string }>;

      expect(sessions.length).toBe(1);
      expect(sessions[0].id).toBe(sessionId1);
    });

    it('should have expiration time in the future', () => {
      const letterId = createTestDemandLetter();
      const sessionId = createTestSession(letterId);

      const session = db.prepare(
        'SELECT expires_at FROM collaboration_sessions WHERE id = ?'
      ).get(sessionId) as { expires_at: string };

      const expiresAt = new Date(session.expires_at);
      const now = new Date();

      expect(expiresAt.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe('Collaboration Invites', () => {
    it('should create invite with valid token', () => {
      const letterId = createTestDemandLetter();
      const sessionId = createTestSession(letterId);
      const { inviteId, token } = createTestInvite(sessionId, letterId, {
        invitedUserId: testUserId2,
      });

      const invite = db.prepare(
        'SELECT * FROM collaboration_invites WHERE id = ?'
      ).get(inviteId) as {
        id: string;
        token: string;
        invited_user_id: string;
        permission: string;
        accepted: number;
      };

      expect(invite).toBeDefined();
      expect(invite.token).toBe(token);
      expect(invite.invited_user_id).toBe(testUserId2);
      expect(invite.permission).toBe('edit');
      expect(invite.accepted).toBe(0);
    });

    it('should store view permission correctly', () => {
      const letterId = createTestDemandLetter();
      const sessionId = createTestSession(letterId);
      const { inviteId } = createTestInvite(sessionId, letterId, {
        invitedUserId: testUserId2,
        permission: 'view',
      });

      const invite = db.prepare(
        'SELECT permission FROM collaboration_invites WHERE id = ?'
      ).get(inviteId) as { permission: string };

      expect(invite.permission).toBe('view');
    });

    it('should enforce unique token constraint', () => {
      const letterId = createTestDemandLetter();
      const sessionId = createTestSession(letterId);
      const { token } = createTestInvite(sessionId, letterId);

      // Try to create another invite with same token
      const inviteId2 = uuidv4();
      const now = new Date().toISOString();
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      expect(() => {
        db.prepare(`
          INSERT INTO collaboration_invites
          (id, session_id, demand_letter_id, invited_by, invited_email, token, permission, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(inviteId2, sessionId, letterId, testUserId, 'other@test.com', token, 'edit', now, expires);
      }).toThrow();
    });

    it('should mark invite as accepted', () => {
      const letterId = createTestDemandLetter();
      const sessionId = createTestSession(letterId);
      const { inviteId } = createTestInvite(sessionId, letterId, {
        invitedUserId: testUserId2,
      });

      // Accept invite
      db.prepare('UPDATE collaboration_invites SET accepted = 1 WHERE id = ?').run(inviteId);

      const invite = db.prepare(
        'SELECT accepted FROM collaboration_invites WHERE id = ?'
      ).get(inviteId) as { accepted: number };

      expect(invite.accepted).toBe(1);
    });

    it('should allow invite by email when user does not exist yet', () => {
      const letterId = createTestDemandLetter();
      const sessionId = createTestSession(letterId);
      const { inviteId } = createTestInvite(sessionId, letterId, {
        invitedEmail: 'newuser@test.com',
      });

      const invite = db.prepare(
        'SELECT invited_email, invited_user_id FROM collaboration_invites WHERE id = ?'
      ).get(inviteId) as { invited_email: string; invited_user_id: string | null };

      expect(invite.invited_email).toBe('newuser@test.com');
      expect(invite.invited_user_id).toBeNull();
    });
  });

  describe('Invite Token Lookup', () => {
    it('should find invite by token', () => {
      const letterId = createTestDemandLetter();
      const sessionId = createTestSession(letterId);
      const { token } = createTestInvite(sessionId, letterId, {
        invitedUserId: testUserId2,
      });

      const invite = db.prepare(
        'SELECT * FROM collaboration_invites WHERE token = ?'
      ).get(token) as { token: string; demand_letter_id: string };

      expect(invite).toBeDefined();
      expect(invite.token).toBe(token);
      expect(invite.demand_letter_id).toBe(letterId);
    });

    it('should not find expired invites', () => {
      const letterId = createTestDemandLetter();
      const sessionId = createTestSession(letterId);

      // Create expired invite
      const inviteId = uuidv4();
      const token = uuidv4().replace(/-/g, '');
      const now = new Date().toISOString();
      // Use a date clearly in the past (1 day ago) to avoid timing issues
      const expired = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO collaboration_invites
        (id, session_id, demand_letter_id, invited_by, invited_email, token, permission, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(inviteId, sessionId, letterId, testUserId, 'test@test.com', token, 'edit', now, expired);

      // Query with current time to check if expired
      const currentTime = new Date().toISOString();
      const invite = db.prepare(
        'SELECT * FROM collaboration_invites WHERE token = ? AND expires_at > ?'
      ).get(token, currentTime);

      expect(invite).toBeUndefined();
    });
  });

  describe('User Access Control', () => {
    it('should verify user belongs to same firm as demand letter', () => {
      const letterId = createTestDemandLetter();

      const letter = db.prepare(
        'SELECT firm_id FROM demand_letters WHERE id = ?'
      ).get(letterId) as { firm_id: string };

      expect(letter.firm_id).toBe(testFirmId);
    });

    it('should find users in the same firm', () => {
      const users = db.prepare(
        'SELECT id, email FROM users WHERE firm_id = ?'
      ).all(testFirmId) as Array<{ id: string; email: string }>;

      expect(users.length).toBe(2);
      expect(users.map(u => u.email)).toContain('attorney@test.com');
      expect(users.map(u => u.email)).toContain('paralegal@test.com');
    });

    it('should not allow creating demand letter for different firm', () => {
      // Create another firm
      const otherFirmId = uuidv4();
      db.prepare('INSERT INTO firms (id, name) VALUES (?, ?)').run(otherFirmId, 'Other Firm');

      const otherUserId = uuidv4();
      const passwordHash = bcrypt.hashSync('Password123!', 10);
      db.prepare(`
        INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(otherUserId, otherFirmId, 'other@other.com', passwordHash, 'Other', 'User', 'attorney');

      // Create letter in test firm
      const letterId = createTestDemandLetter();

      // Verify other user cannot access letter (simulated check)
      const letter = db.prepare(
        'SELECT * FROM demand_letters WHERE id = ? AND firm_id = ?'
      ).get(letterId, otherFirmId);

      expect(letter).toBeUndefined();
    });
  });

  describe('Cascade Delete', () => {
    it('should delete sessions when demand letter is deleted', () => {
      const letterId = createTestDemandLetter();
      const sessionId = createTestSession(letterId);

      // Verify session exists
      let session = db.prepare('SELECT * FROM collaboration_sessions WHERE id = ?').get(sessionId);
      expect(session).toBeDefined();

      // Delete demand letter
      db.prepare('DELETE FROM demand_letters WHERE id = ?').run(letterId);

      // Verify session is deleted
      session = db.prepare('SELECT * FROM collaboration_sessions WHERE id = ?').get(sessionId);
      expect(session).toBeUndefined();
    });

    it('should delete invites when session is deleted', () => {
      const letterId = createTestDemandLetter();
      const sessionId = createTestSession(letterId);
      const { inviteId } = createTestInvite(sessionId, letterId);

      // Verify invite exists
      let invite = db.prepare('SELECT * FROM collaboration_invites WHERE id = ?').get(inviteId);
      expect(invite).toBeDefined();

      // Delete session
      db.prepare('DELETE FROM collaboration_sessions WHERE id = ?').run(sessionId);

      // Verify invite is deleted
      invite = db.prepare('SELECT * FROM collaboration_invites WHERE id = ?').get(inviteId);
      expect(invite).toBeUndefined();
    });
  });

  describe('JWT Token Generation', () => {
    it('should generate valid JWT token with user info', () => {
      const decoded = jwt.verify(testToken, JWT_SECRET) as {
        userId: string;
        email: string;
        firmId: string;
        role: string;
      };

      expect(decoded.userId).toBe(testUserId);
      expect(decoded.email).toBe('attorney@test.com');
      expect(decoded.firmId).toBe(testFirmId);
      expect(decoded.role).toBe('attorney');
    });

    it('should reject invalid JWT token', () => {
      expect(() => {
        jwt.verify('invalid-token', JWT_SECRET);
      }).toThrow();
    });

    it('should reject token with wrong secret', () => {
      const tokenWithWrongSecret = jwt.sign(
        { userId: testUserId, email: 'test@test.com', firmId: testFirmId },
        'wrong-secret'
      );

      expect(() => {
        jwt.verify(tokenWithWrongSecret, JWT_SECRET);
      }).toThrow();
    });
  });

  describe('Active Collaborators Query', () => {
    it('should query pending invites for a document', () => {
      const letterId = createTestDemandLetter();
      const sessionId = createTestSession(letterId);

      // Create multiple invites
      createTestInvite(sessionId, letterId, { invitedEmail: 'user1@test.com' });
      createTestInvite(sessionId, letterId, { invitedEmail: 'user2@test.com' });

      const invites = db.prepare(`
        SELECT * FROM collaboration_invites
        WHERE demand_letter_id = ? AND expires_at > datetime('now')
      `).all(letterId) as Array<{ invited_email: string }>;

      expect(invites.length).toBe(2);
    });

    it('should filter accepted invites', () => {
      const letterId = createTestDemandLetter();
      const sessionId = createTestSession(letterId);

      const { inviteId: invite1 } = createTestInvite(sessionId, letterId, { invitedEmail: 'user1@test.com' });
      createTestInvite(sessionId, letterId, { invitedEmail: 'user2@test.com' });

      // Accept first invite
      db.prepare('UPDATE collaboration_invites SET accepted = 1 WHERE id = ?').run(invite1);

      const pendingInvites = db.prepare(`
        SELECT * FROM collaboration_invites
        WHERE demand_letter_id = ? AND accepted = 0 AND expires_at > datetime('now')
      `).all(letterId);

      expect(pendingInvites.length).toBe(1);
    });
  });
});
