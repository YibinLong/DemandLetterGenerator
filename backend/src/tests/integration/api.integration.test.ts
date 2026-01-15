/**
 * Integration Tests for API Workflows
 * Tests complete request/response cycles through Express
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';

// Test configuration
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

// Test state
let app: Express;
let db: ReturnType<typeof Database>;
let testFirmId: string;
let testUserId: string;
let adminUserId: string;
let testToken: string;
let adminToken: string;

// Helper to create test user and get token
const createTestUser = (role: string = 'attorney') => {
  const userId = uuidv4();
  const passwordHash = bcrypt.hashSync('TestPassword123!', 10);

  db.prepare(`
    INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, testFirmId, `${userId}@test.com`, passwordHash, 'Test', 'User', role);

  const token = jwt.sign(
    { userId, email: `${userId}@test.com`, firmId: testFirmId, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  return { userId, token };
};

describe('API Integration Tests', () => {
  beforeAll(async () => {
    // Disable rate limiting for tests
    process.env.DISABLE_RATE_LIMIT = 'true';
    process.env.NODE_ENV = 'test';

    // Import test app dynamically
    const { createTestApp } = await import('./testApp.js');
    const testApp = await createTestApp();
    app = testApp.app;
    db = testApp.getDatabase();

    // Create test firm
    testFirmId = uuidv4();
    db.prepare(`
      INSERT INTO firms (id, name) VALUES (?, ?)
    `).run(testFirmId, 'Integration Test Firm');

    // Create test users
    const attorney = createTestUser('attorney');
    testUserId = attorney.userId;
    testToken = attorney.token;

    const admin = createTestUser('admin');
    adminUserId = admin.userId;
    adminToken = admin.token;
  });

  afterAll(() => {
    // Cleanup test data
    if (db) {
      db.prepare('DELETE FROM firms WHERE id = ?').run(testFirmId);
    }
  });

  describe('Health & Status Endpoints', () => {
    it('GET /health should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(['healthy', 'degraded']).toContain(response.body.status);
    });

    it('GET /metrics should return metrics data', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toHaveProperty('scaling');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('GET /api should return API info', async () => {
      const response = await request(app)
        .get('/api')
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('version');
      expect(response.body.message).toBe('Demand Letter Generator API');
    });
  });

  describe('Authentication Workflow', () => {
    const newUserEmail = `test-${Date.now()}@example.com`;
    const newUserPassword = 'SecurePassword123!';

    it('POST /api/auth/register should create a new user', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: newUserEmail,
          password: newUserPassword,
          firstName: 'Integration',
          lastName: 'Test',
          firmName: 'Test Law Firm',
        })
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe(newUserEmail);
    });

    it('POST /api/auth/login should authenticate user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: newUserEmail,
          password: newUserPassword,
        })
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe(newUserEmail);
    });

    it('POST /api/auth/login should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: newUserEmail,
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('GET /api/auth/me should return current user with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email');
    });

    it('GET /api/auth/me should reject invalid token', async () => {
      await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('Template Workflow', () => {
    let createdTemplateId: string;

    it('POST /api/templates should create a new template', async () => {
      const response = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          name: 'Test Demand Letter Template',
          content: 'Dear {{recipient_name}},\n\nThis is a test template.\n\nSincerely,\n{{sender_name}}',
          category: 'personal_injury',
          placeholders: ['recipient_name', 'sender_name'],
          isDefault: false,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Test Demand Letter Template');
      createdTemplateId = response.body.id;
    });

    it('GET /api/templates should list templates', async () => {
      const response = await request(app)
        .get('/api/templates')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /api/templates/:id should get specific template', async () => {
      const response = await request(app)
        .get(`/api/templates/${createdTemplateId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.id).toBe(createdTemplateId);
      expect(response.body.name).toBe('Test Demand Letter Template');
    });

    it('PUT /api/templates/:id should update template', async () => {
      const response = await request(app)
        .put(`/api/templates/${createdTemplateId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          name: 'Updated Template Name',
          content: 'Updated content with {{new_placeholder}}',
        })
        .expect(200);

      expect(response.body.name).toBe('Updated Template Name');
    });

    it('POST /api/templates/:id/duplicate should duplicate template', async () => {
      const response = await request(app)
        .post(`/api/templates/${createdTemplateId}/duplicate`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.id).not.toBe(createdTemplateId);
      expect(response.body.name).toContain('Copy');
    });

    it('DELETE /api/templates/:id should delete template', async () => {
      await request(app)
        .delete(`/api/templates/${createdTemplateId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      // Verify deletion
      await request(app)
        .get(`/api/templates/${createdTemplateId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(404);
    });
  });

  describe('Document Workflow', () => {
    it('GET /api/documents should list documents', async () => {
      const response = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /api/documents should filter by case reference', async () => {
      const response = await request(app)
        .get('/api/documents?case_reference=TEST-001')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /api/documents should require authentication', async () => {
      await request(app)
        .get('/api/documents')
        .expect(401);
    });
  });

  describe('Demand Letter Workflow', () => {
    let createdLetterId: string;

    it('GET /api/demand-letters should list demand letters', async () => {
      const response = await request(app)
        .get('/api/demand-letters')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('POST /api/demand-letters should create a new demand letter', async () => {
      const response = await request(app)
        .post('/api/demand-letters')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          title: 'Test Demand Letter',
          content: 'This is the initial content of the demand letter.',
          caseReference: 'CASE-INT-001',
          status: 'draft',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe('Test Demand Letter');
      expect(response.body.status).toBe('draft');
      createdLetterId = response.body.id;
    });

    it('GET /api/demand-letters/:id should get specific letter', async () => {
      const response = await request(app)
        .get(`/api/demand-letters/${createdLetterId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.id).toBe(createdLetterId);
      expect(response.body.title).toBe('Test Demand Letter');
    });

    it('PUT /api/demand-letters/:id should update demand letter', async () => {
      const response = await request(app)
        .put(`/api/demand-letters/${createdLetterId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          title: 'Updated Demand Letter',
          content: 'Updated content for the letter.',
          status: 'review',
        })
        .expect(200);

      expect(response.body.title).toBe('Updated Demand Letter');
      expect(response.body.status).toBe('review');
    });

    it('GET /api/demand-letters should filter by status', async () => {
      const response = await request(app)
        .get('/api/demand-letters?status=review')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      if (response.body.length > 0) {
        expect(response.body[0].status).toBe('review');
      }
    });

    it('DELETE /api/demand-letters/:id should delete demand letter', async () => {
      await request(app)
        .delete(`/api/demand-letters/${createdLetterId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      // Verify deletion
      await request(app)
        .get(`/api/demand-letters/${createdLetterId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(404);
    });
  });

  describe('Change Tracking Workflow', () => {
    let letterId: string;

    beforeAll(async () => {
      // Create a demand letter for change tracking tests
      const response = await request(app)
        .post('/api/demand-letters')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          title: 'Change Tracking Test Letter',
          content: 'Original content for tracking.',
          status: 'draft',
        });
      letterId = response.body.id;
    });

    it('GET /api/change-tracking/:documentId should get version history', async () => {
      const response = await request(app)
        .get(`/api/change-tracking/${letterId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('versions');
      expect(Array.isArray(response.body.versions)).toBe(true);
    });

    it('POST /api/change-tracking/:documentId/snapshot should create version snapshot', async () => {
      const response = await request(app)
        .post(`/api/change-tracking/${letterId}/snapshot`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          content: 'Updated content for version 2',
          comment: 'Second version',
        })
        .expect(201);

      expect(response.body).toHaveProperty('version');
    });

    afterAll(async () => {
      // Cleanup
      await request(app)
        .delete(`/api/demand-letters/${letterId}`)
        .set('Authorization', `Bearer ${testToken}`);
    });
  });

  describe('Collaboration Workflow', () => {
    let letterId: string;

    beforeAll(async () => {
      // Create a demand letter for collaboration tests
      const response = await request(app)
        .post('/api/demand-letters')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          title: 'Collaboration Test Letter',
          content: 'Content for collaboration testing.',
          status: 'draft',
        });
      letterId = response.body.id;
    });

    it('GET /api/collaboration/:documentId/participants should list participants', async () => {
      const response = await request(app)
        .get(`/api/collaboration/${letterId}/participants`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('participants');
      expect(Array.isArray(response.body.participants)).toBe(true);
    });

    it('POST /api/collaboration/:documentId/invite should invite user', async () => {
      const response = await request(app)
        .post(`/api/collaboration/${letterId}/invite`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          email: `${adminUserId}@test.com`,
          permission: 'edit',
        })
        .expect(200);

      expect(response.body).toHaveProperty('success');
    });

    afterAll(async () => {
      // Cleanup
      await request(app)
        .delete(`/api/demand-letters/${letterId}`)
        .set('Authorization', `Bearer ${testToken}`);
    });
  });

  describe('AI Prompts Workflow', () => {
    let promptId: string;

    it('GET /api/ai-prompts should list custom prompts', async () => {
      const response = await request(app)
        .get('/api/ai-prompts')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('POST /api/ai-prompts should create custom prompt', async () => {
      const response = await request(app)
        .post('/api/ai-prompts')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          name: 'Test Custom Prompt',
          description: 'A test prompt for integration testing',
          promptTemplate: 'Please {{action}} the following content: {{content}}',
          category: 'refinement',
          variables: ['action', 'content'],
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Test Custom Prompt');
      promptId = response.body.id;
    });

    it('GET /api/ai-prompts/:id should get specific prompt', async () => {
      const response = await request(app)
        .get(`/api/ai-prompts/${promptId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.id).toBe(promptId);
    });

    it('PUT /api/ai-prompts/:id should update prompt', async () => {
      const response = await request(app)
        .put(`/api/ai-prompts/${promptId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          name: 'Updated Custom Prompt',
          description: 'Updated description',
        })
        .expect(200);

      expect(response.body.name).toBe('Updated Custom Prompt');
    });

    it('DELETE /api/ai-prompts/:id should delete prompt', async () => {
      await request(app)
        .delete(`/api/ai-prompts/${promptId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      await request(app)
        .get('/api/non-existent-route')
        .expect(404);
    });

    it('should return 404 for non-existent resources', async () => {
      await request(app)
        .get('/api/templates/non-existent-id')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(404);
    });

    it('should return 401 for protected routes without auth', async () => {
      await request(app)
        .get('/api/templates')
        .expect(401);
    });
  });

  describe('Pagination & Filtering', () => {
    it('GET /api/demand-letters should support pagination', async () => {
      const response = await request(app)
        .get('/api/demand-letters?page=1&limit=10')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /api/templates should support category filtering', async () => {
      const response = await request(app)
        .get('/api/templates?category=personal_injury')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });
});
