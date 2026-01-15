// Demand letter management routes
import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import fs from 'fs';
import { getDatabase } from '../db/index.js';
import { DemandLetter, DemandLetterVersion, Document, DemandLetterDocument, AIGenerationHistory } from '../db/schema.js';
import { authenticate, AuthRequest, requireDocumentEditor } from '../middleware/auth.js';
import { logAuditEvent } from '../services/audit.js';
import { decryptBuffer } from '../services/encryption.js';
import { cache, cacheKeys, cacheTTL } from '../services/cache.js';
import { cacheMiddleware, invalidateCache } from '../middleware/caching.js';
import { timeQuery } from '../services/performance.js';

const router = Router();

// AI Service URL
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// Types for request bodies
interface CreateDemandLetterRequest {
  title: string;
  document_ids: string[];
  case_info?: {
    case_reference?: string;
    client_name?: string;
    incident_date?: string;
    defendant_name?: string;
    defendant_insurance?: string;
    claim_number?: string;
    additional_info?: string;
  };
  instructions?: string;
  template?: string;
  template_id?: string;
  model?: string;
}

interface UpdateDemandLetterRequest {
  title?: string;
  content?: string;
  content_html?: string;
  status?: 'draft' | 'in_review' | 'approved' | 'sent' | 'archived';
  case_reference?: string;
  client_name?: string;
  recipient_name?: string;
  recipient_address?: string;
  incident_date?: string;
  demand_amount?: number;
  metadata?: Record<string, unknown>;
}

interface RefineRequest {
  instructions: string;
  model?: string;
}

interface ExportOptions {
  font_name?: string;
  font_size?: number;
  margin_top?: number;
  margin_bottom?: number;
  margin_left?: number;
  margin_right?: number;
  line_spacing?: number;
  include_letterhead?: boolean;
  letterhead_firm_name?: string;
  letterhead_address?: string;
  letterhead_phone?: string;
  letterhead_email?: string;
  include_page_numbers?: boolean;
  include_date?: boolean;
}

interface ExportRequest {
  options?: ExportOptions;
}

interface BatchExportRequest {
  demand_letter_ids: string[];
  options?: ExportOptions;
}

// Helper to read and decrypt document content for AI processing
const getDocumentContent = (doc: Document): Buffer => {
  if (!fs.existsSync(doc.file_path)) {
    throw new Error(`Document file not found: ${doc.original_filename}`);
  }

  const encryptedBuffer = fs.readFileSync(doc.file_path);

  // Extract encryption components
  const IV_LENGTH = 12;
  const AUTH_TAG_LENGTH = 16;
  const iv = encryptedBuffer.subarray(0, IV_LENGTH);
  const authTag = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = encryptedBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  return decryptBuffer({ encrypted, iv, authTag });
};

// Create new demand letter with AI generation
router.post(
  '/',
  authenticate,
  requireDocumentEditor,
  async (req: AuthRequest, res: Response) => {
    const startTime = Date.now();

    try {
      const body = req.body as CreateDemandLetterRequest;
      const { title, document_ids, case_info, instructions, template, template_id, model } = body;

      if (!title?.trim()) {
        res.status(400).json({ error: 'Title is required' });
        return;
      }

      if (!document_ids || document_ids.length === 0) {
        res.status(400).json({ error: 'At least one document is required' });
        return;
      }

      const db = getDatabase();

      // Verify all documents exist and belong to the firm
      const documents = document_ids.map(id => {
        const doc = db.prepare(`
          SELECT * FROM documents WHERE id = ? AND firm_id = ?
        `).get(id, req.user!.firm_id) as Document | undefined;

        if (!doc) {
          throw new Error(`Document not found: ${id}`);
        }

        return doc;
      });

      // Get template content if template_id is provided
      let templateContent = template;
      if (template_id && !templateContent) {
        const templateRecord = db.prepare(`
          SELECT content FROM templates WHERE id = ? AND firm_id = ?
        `).get(template_id, req.user!.firm_id) as { content: string } | undefined;

        if (templateRecord) {
          templateContent = templateRecord.content;
        }
      }

      // Prepare documents for AI service (base64 encoded)
      const aiDocuments = documents.map(doc => {
        const content = getDocumentContent(doc);
        return {
          filename: doc.original_filename,
          content: content.toString('base64'),
        };
      });

      // Call AI service to generate demand letter
      let aiResponse;
      try {
        aiResponse = await axios.post(`${AI_SERVICE_URL}/ai/generate`, {
          documents: aiDocuments,
          case_info: case_info || {},
          instructions: instructions || '',
          template: templateContent || '',
          model: model || 'gpt-4o-mini',
        }, {
          timeout: 120000, // 2 minute timeout for AI generation
        });
      } catch (aiError) {
        if (axios.isAxiosError(aiError)) {
          console.error('AI service error:', aiError.response?.data || aiError.message);
          res.status(502).json({
            error: 'AI generation failed',
            details: aiError.response?.data?.detail || aiError.message,
          });
          return;
        }
        throw aiError;
      }

      const generatedContent = aiResponse.data.content;
      const usage = aiResponse.data.usage;

      // Create demand letter record
      const demandLetterId = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO demand_letters (
          id, user_id, firm_id, template_id, title, content, status,
          case_reference, client_name, recipient_name, recipient_address,
          incident_date, demand_amount, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        demandLetterId,
        req.user!.id,
        req.user!.firm_id,
        template_id || null,
        title,
        generatedContent,
        'draft',
        case_info?.case_reference || null,
        case_info?.client_name || null,
        case_info?.defendant_name || null, // recipient is typically the defendant
        null, // recipient_address
        case_info?.incident_date || null,
        null, // demand_amount
        JSON.stringify({ ai_model: model || 'gpt-4o-mini' }),
        now,
        now
      );

      // Create initial version
      const versionId = uuidv4();
      db.prepare(`
        INSERT INTO demand_letter_versions (
          id, demand_letter_id, version_number, content, changed_by, change_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        versionId,
        demandLetterId,
        1,
        generatedContent,
        req.user!.id,
        'Initial AI generation',
        now
      );

      // Link source documents to demand letter
      for (const doc of documents) {
        db.prepare(`
          INSERT INTO demand_letter_documents (id, demand_letter_id, document_id, created_at)
          VALUES (?, ?, ?, ?)
        `).run(uuidv4(), demandLetterId, doc.id, now);
      }

      // Record AI generation history
      const historyId = uuidv4();
      db.prepare(`
        INSERT INTO ai_generation_history (
          id, demand_letter_id, user_id, prompt, response_summary,
          model_used, tokens_used, generation_type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        historyId,
        demandLetterId,
        req.user!.id,
        JSON.stringify({ case_info, instructions }),
        generatedContent.substring(0, 500) + (generatedContent.length > 500 ? '...' : ''),
        model || 'gpt-4o-mini',
        usage?.total_tokens || 0,
        'initial',
        now
      );

      // Log audit event
      await logAuditEvent({
        event_type: 'DEMAND_LETTER_CREATED',
        user_id: req.user!.id,
        firm_id: req.user!.firm_id,
        resource_type: 'demand_letter',
        resource_id: demandLetterId,
        details: {
          title,
          document_count: documents.length,
          model_used: model || 'gpt-4o-mini',
          tokens_used: usage?.total_tokens,
          generation_time_ms: Date.now() - startTime,
        },
        ip_address: req.ip || req.socket.remoteAddress,
      });

      await logAuditEvent({
        event_type: 'AI_GENERATION_REQUESTED',
        user_id: req.user!.id,
        firm_id: req.user!.firm_id,
        resource_type: 'demand_letter',
        resource_id: demandLetterId,
        details: {
          model: model || 'gpt-4o-mini',
          tokens_used: usage?.total_tokens,
          estimated_cost: usage?.estimated_cost,
        },
        ip_address: req.ip || req.socket.remoteAddress,
      });

      // Invalidate cache for demand letter lists
      invalidateCache([/^GET:.*:demand-letters/]);

      // Return created demand letter
      res.status(201).json({
        id: demandLetterId,
        title,
        content: generatedContent,
        status: 'draft',
        case_reference: case_info?.case_reference || null,
        client_name: case_info?.client_name || null,
        version: 1,
        source_documents: documents.map(d => ({
          id: d.id,
          filename: d.original_filename,
          file_type: d.file_type,
        })),
        ai_usage: {
          model: aiResponse.data.model,
          tokens: usage?.total_tokens,
          estimated_cost: usage?.estimated_cost,
        },
        generation_time_ms: Date.now() - startTime,
        created_at: now,
      });
    } catch (err) {
      console.error('Create demand letter error:', err);
      if (err instanceof Error && err.message.includes('Document not found')) {
        res.status(404).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Failed to create demand letter' });
    }
  }
);

// Generate demand letter with streaming response
router.post(
  '/generate-stream',
  authenticate,
  requireDocumentEditor,
  async (req: AuthRequest, res: Response) => {
    try {
      const body = req.body as CreateDemandLetterRequest;
      const { document_ids, case_info, instructions, template, template_id, model } = body;

      if (!document_ids || document_ids.length === 0) {
        res.status(400).json({ error: 'At least one document is required' });
        return;
      }

      const db = getDatabase();

      // Verify and get documents
      const documents = document_ids.map(id => {
        const doc = db.prepare(`
          SELECT * FROM documents WHERE id = ? AND firm_id = ?
        `).get(id, req.user!.firm_id) as Document | undefined;

        if (!doc) {
          throw new Error(`Document not found: ${id}`);
        }

        return doc;
      });

      // Get template content if template_id is provided
      let templateContent = template;
      if (template_id && !templateContent) {
        const templateRecord = db.prepare(`
          SELECT content FROM templates WHERE id = ? AND firm_id = ?
        `).get(template_id, req.user!.firm_id) as { content: string } | undefined;

        if (templateRecord) {
          templateContent = templateRecord.content;
        }
      }

      // Prepare documents for AI service
      const aiDocuments = documents.map(doc => {
        const content = getDocumentContent(doc);
        return {
          filename: doc.original_filename,
          content: content.toString('base64'),
        };
      });

      // Set headers for streaming
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      // Stream from AI service
      const aiResponse = await axios.post(`${AI_SERVICE_URL}/ai/generate/stream`, {
        documents: aiDocuments,
        case_info: case_info || {},
        instructions: instructions || '',
        template: templateContent || '',
        model: model || 'gpt-4o-mini',
      }, {
        responseType: 'stream',
        timeout: 120000,
      });

      // Pipe the stream to the client
      aiResponse.data.pipe(res);

      aiResponse.data.on('end', () => {
        res.end();
      });

      aiResponse.data.on('error', (err: Error) => {
        console.error('Stream error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream error' });
        } else {
          res.end();
        }
      });
    } catch (err) {
      console.error('Generate stream error:', err);
      if (!res.headersSent) {
        if (err instanceof Error && err.message.includes('Document not found')) {
          res.status(404).json({ error: err.message });
          return;
        }
        res.status(500).json({ error: 'Failed to generate demand letter' });
      }
    }
  }
);

// List demand letters for the user's firm
router.get(
  '/',
  authenticate,
  cacheMiddleware({ ttlSeconds: cacheTTL.list }),
  async (req: AuthRequest, res: Response) => {
    try {
      const db = getDatabase();
      const {
        status,
        case_reference,
        search,
        limit = '50',
        offset = '0',
      } = req.query;

      const conditions: string[] = ['dl.firm_id = ?'];
      const params: (string | number)[] = [req.user!.firm_id];

      if (status) {
        conditions.push('dl.status = ?');
        params.push(String(status));
      }

      if (case_reference) {
        conditions.push('dl.case_reference = ?');
        params.push(String(case_reference));
      }

      if (search) {
        conditions.push('(dl.title LIKE ? OR dl.client_name LIKE ? OR dl.case_reference LIKE ?)');
        const searchTerm = `%${String(search)}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      const whereClause = conditions.join(' AND ');
      params.push(Number(limit), Number(offset));

      // Optimized query: JOIN with subquery to get version counts in a single query
      // This fixes the N+1 problem by fetching demand letters and version counts together
      const demandLettersWithVersions = timeQuery('listDemandLetters', () =>
        db.prepare(`
          SELECT
            dl.id, dl.user_id, dl.firm_id, dl.template_id, dl.title, dl.status,
            dl.case_reference, dl.client_name, dl.recipient_name, dl.incident_date,
            dl.demand_amount, dl.created_at, dl.updated_at,
            COALESCE(vc.version_count, 0) as version_count
          FROM demand_letters dl
          LEFT JOIN (
            SELECT demand_letter_id, COUNT(*) as version_count
            FROM demand_letter_versions
            GROUP BY demand_letter_id
          ) vc ON dl.id = vc.demand_letter_id
          WHERE ${whereClause}
          ORDER BY dl.updated_at DESC
          LIMIT ? OFFSET ?
        `).all(...params)
      ) as (Omit<DemandLetter, 'content' | 'recipient_address' | 'metadata' | 'content_html'> & { version_count: number })[];

      // Get total count
      const countParams = params.slice(0, -2);
      const countResult = timeQuery('countDemandLetters', () =>
        db.prepare(`
          SELECT COUNT(*) as count FROM demand_letters dl WHERE ${whereClause}
        `).get(...countParams)
      ) as { count: number };

      res.json({
        demand_letters: demandLettersWithVersions,
        total: countResult.count,
        limit: Number(limit),
        offset: Number(offset),
      });
    } catch (err) {
      console.error('List demand letters error:', err);
      res.status(500).json({ error: 'Failed to list demand letters' });
    }
  }
);

// Get single demand letter with full content
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const db = getDatabase();

    const demandLetter = db.prepare(`
      SELECT * FROM demand_letters WHERE id = ? AND firm_id = ?
    `).get(id, req.user!.firm_id) as DemandLetter | undefined;

    if (!demandLetter) {
      res.status(404).json({ error: 'Demand letter not found' });
      return;
    }

    // Get source documents
    const sourceDocuments = db.prepare(`
      SELECT d.id, d.original_filename, d.file_type, d.file_size, d.created_at
      FROM documents d
      JOIN demand_letter_documents dld ON d.id = dld.document_id
      WHERE dld.demand_letter_id = ?
    `).all(id) as Pick<Document, 'id' | 'original_filename' | 'file_type' | 'file_size' | 'created_at'>[];

    // Get version count
    const versionCount = db.prepare(`
      SELECT COUNT(*) as count FROM demand_letter_versions WHERE demand_letter_id = ?
    `).get(id) as { count: number };

    // Get latest version number
    const latestVersion = db.prepare(`
      SELECT MAX(version_number) as version FROM demand_letter_versions WHERE demand_letter_id = ?
    `).get(id) as { version: number };

    res.json({
      ...demandLetter,
      metadata: demandLetter.metadata ? JSON.parse(demandLetter.metadata) : null,
      source_documents: sourceDocuments,
      version: latestVersion.version || 1,
      version_count: versionCount.count,
    });
  } catch (err) {
    console.error('Get demand letter error:', err);
    res.status(500).json({ error: 'Failed to get demand letter' });
  }
});

// Update demand letter
router.patch(
  '/:id',
  authenticate,
  requireDocumentEditor,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params.id as string;
      const body = req.body as UpdateDemandLetterRequest;
      const db = getDatabase();

      // Check demand letter exists and belongs to firm
      const existing = db.prepare(`
        SELECT * FROM demand_letters WHERE id = ? AND firm_id = ?
      `).get(id, req.user!.firm_id) as DemandLetter | undefined;

      if (!existing) {
        res.status(404).json({ error: 'Demand letter not found' });
        return;
      }

      const now = new Date().toISOString();
      const updates: string[] = ['updated_at = ?'];
      const params: (string | number | null)[] = [now];

      // Track if content changed for versioning
      let contentChanged = false;
      let newContent = existing.content;
      let newContentHtml = existing.content_html;

      if (body.title !== undefined) {
        updates.push('title = ?');
        params.push(body.title);
      }

      if (body.content !== undefined && body.content !== existing.content) {
        updates.push('content = ?');
        params.push(body.content);
        contentChanged = true;
        newContent = body.content;
      }

      if (body.content_html !== undefined) {
        updates.push('content_html = ?');
        params.push(body.content_html);
        newContentHtml = body.content_html;
        // If content wasn't explicitly provided but content_html was, mark as changed
        if (body.content === undefined) {
          contentChanged = true;
        }
      }

      if (body.status !== undefined) {
        updates.push('status = ?');
        params.push(body.status);
      }

      if (body.case_reference !== undefined) {
        updates.push('case_reference = ?');
        params.push(body.case_reference || null);
      }

      if (body.client_name !== undefined) {
        updates.push('client_name = ?');
        params.push(body.client_name || null);
      }

      if (body.recipient_name !== undefined) {
        updates.push('recipient_name = ?');
        params.push(body.recipient_name || null);
      }

      if (body.recipient_address !== undefined) {
        updates.push('recipient_address = ?');
        params.push(body.recipient_address || null);
      }

      if (body.incident_date !== undefined) {
        updates.push('incident_date = ?');
        params.push(body.incident_date || null);
      }

      if (body.demand_amount !== undefined) {
        updates.push('demand_amount = ?');
        params.push(body.demand_amount ?? null);
      }

      if (body.metadata !== undefined) {
        updates.push('metadata = ?');
        params.push(JSON.stringify(body.metadata));
      }

      params.push(id);

      db.prepare(`
        UPDATE demand_letters SET ${updates.join(', ')} WHERE id = ?
      `).run(...params);

      // Create new version if content changed
      if (contentChanged) {
        const latestVersion = db.prepare(`
          SELECT MAX(version_number) as version FROM demand_letter_versions WHERE demand_letter_id = ?
        `).get(id) as { version: number };

        const newVersionNumber = (latestVersion.version || 0) + 1;

        db.prepare(`
          INSERT INTO demand_letter_versions (
            id, demand_letter_id, version_number, content, content_html, changed_by, change_summary, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          uuidv4(),
          id,
          newVersionNumber,
          newContent,
          newContentHtml || null,
          req.user!.id,
          'Manual edit',
          now
        );
      }

      // Log audit event
      await logAuditEvent({
        event_type: 'DEMAND_LETTER_UPDATED',
        user_id: req.user!.id,
        firm_id: req.user!.firm_id,
        resource_type: 'demand_letter',
        resource_id: id,
        details: {
          fields_updated: Object.keys(body),
          content_changed: contentChanged,
        },
        ip_address: req.ip || req.socket.remoteAddress,
      });

      // Invalidate cache for demand letter lists and this specific letter
      invalidateCache([/^GET:.*:demand-letters/, new RegExp(`demand-letter:${id}`)]);

      // Return updated demand letter
      const updated = db.prepare(`
        SELECT * FROM demand_letters WHERE id = ?
      `).get(id) as DemandLetter;

      res.json({
        ...updated,
        metadata: updated.metadata ? JSON.parse(updated.metadata) : null,
      });
    } catch (err) {
      console.error('Update demand letter error:', err);
      res.status(500).json({ error: 'Failed to update demand letter' });
    }
  }
);

// Refine demand letter with AI
router.post(
  '/:id/refine',
  authenticate,
  requireDocumentEditor,
  async (req: AuthRequest, res: Response) => {
    const startTime = Date.now();

    try {
      const id = req.params.id as string;
      const body = req.body as RefineRequest;
      const db = getDatabase();

      if (!body.instructions?.trim()) {
        res.status(400).json({ error: 'Refinement instructions are required' });
        return;
      }

      // Get existing demand letter
      const demandLetter = db.prepare(`
        SELECT * FROM demand_letters WHERE id = ? AND firm_id = ?
      `).get(id, req.user!.firm_id) as DemandLetter | undefined;

      if (!demandLetter) {
        res.status(404).json({ error: 'Demand letter not found' });
        return;
      }

      // Get source documents for context
      const sourceDocIds = db.prepare(`
        SELECT document_id FROM demand_letter_documents WHERE demand_letter_id = ?
      `).all(id) as { document_id: string }[];

      const aiDocuments = sourceDocIds.map(({ document_id }) => {
        const doc = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(document_id) as Document;
        const content = getDocumentContent(doc);
        return {
          filename: doc.original_filename,
          content: content.toString('base64'),
        };
      });

      // Call AI service to refine
      let aiResponse;
      try {
        aiResponse = await axios.post(`${AI_SERVICE_URL}/ai/refine`, {
          current_draft: demandLetter.content,
          instructions: body.instructions,
          documents: aiDocuments,
          model: body.model || 'gpt-4o-mini',
        }, {
          timeout: 120000,
        });
      } catch (aiError) {
        if (axios.isAxiosError(aiError)) {
          console.error('AI refine error:', aiError.response?.data || aiError.message);
          res.status(502).json({
            error: 'AI refinement failed',
            details: aiError.response?.data?.detail || aiError.message,
          });
          return;
        }
        throw aiError;
      }

      const refinedContent = aiResponse.data.content;
      const usage = aiResponse.data.usage;
      const now = new Date().toISOString();

      // Update demand letter content
      db.prepare(`
        UPDATE demand_letters SET content = ?, updated_at = ? WHERE id = ?
      `).run(refinedContent, now, id);

      // Create new version
      const latestVersion = db.prepare(`
        SELECT MAX(version_number) as version FROM demand_letter_versions WHERE demand_letter_id = ?
      `).get(id) as { version: number };

      const newVersionNumber = (latestVersion.version || 0) + 1;

      db.prepare(`
        INSERT INTO demand_letter_versions (
          id, demand_letter_id, version_number, content, changed_by, change_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        id,
        newVersionNumber,
        refinedContent,
        req.user!.id,
        `AI refinement: ${body.instructions.substring(0, 100)}`,
        now
      );

      // Record AI generation history
      db.prepare(`
        INSERT INTO ai_generation_history (
          id, demand_letter_id, user_id, prompt, response_summary,
          model_used, tokens_used, generation_type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        id,
        req.user!.id,
        body.instructions,
        refinedContent.substring(0, 500) + (refinedContent.length > 500 ? '...' : ''),
        body.model || 'gpt-4o-mini',
        usage?.total_tokens || 0,
        'refinement',
        now
      );

      // Log audit events
      await logAuditEvent({
        event_type: 'DEMAND_LETTER_UPDATED',
        user_id: req.user!.id,
        firm_id: req.user!.firm_id,
        resource_type: 'demand_letter',
        resource_id: id,
        details: {
          action: 'ai_refinement',
          version: newVersionNumber,
        },
        ip_address: req.ip || req.socket.remoteAddress,
      });

      await logAuditEvent({
        event_type: 'AI_REFINEMENT_REQUESTED',
        user_id: req.user!.id,
        firm_id: req.user!.firm_id,
        resource_type: 'demand_letter',
        resource_id: id,
        details: {
          model: body.model || 'gpt-4o-mini',
          tokens_used: usage?.total_tokens,
          estimated_cost: usage?.estimated_cost,
        },
        ip_address: req.ip || req.socket.remoteAddress,
      });

      res.json({
        id,
        content: refinedContent,
        version: newVersionNumber,
        ai_usage: {
          model: aiResponse.data.model,
          tokens: usage?.total_tokens,
          estimated_cost: usage?.estimated_cost,
        },
        refinement_time_ms: Date.now() - startTime,
        updated_at: now,
      });
    } catch (err) {
      console.error('Refine demand letter error:', err);
      res.status(500).json({ error: 'Failed to refine demand letter' });
    }
  }
);

// Get demand letter versions
router.get('/:id/versions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const db = getDatabase();

    // Verify demand letter exists and belongs to firm
    const demandLetter = db.prepare(`
      SELECT id FROM demand_letters WHERE id = ? AND firm_id = ?
    `).get(id, req.user!.firm_id) as { id: string } | undefined;

    if (!demandLetter) {
      res.status(404).json({ error: 'Demand letter not found' });
      return;
    }

    const versions = db.prepare(`
      SELECT dlv.*, u.first_name, u.last_name, u.email
      FROM demand_letter_versions dlv
      LEFT JOIN users u ON dlv.changed_by = u.id
      WHERE dlv.demand_letter_id = ?
      ORDER BY dlv.version_number DESC
    `).all(id) as (DemandLetterVersion & { first_name: string; last_name: string; email: string })[];

    res.json({
      versions: versions.map(v => ({
        id: v.id,
        version_number: v.version_number,
        change_summary: v.change_summary,
        changed_by: {
          id: v.changed_by,
          name: `${v.first_name} ${v.last_name}`,
          email: v.email,
        },
        created_at: v.created_at,
        // Don't include full content in list - fetch individually
      })),
      total: versions.length,
    });
  } catch (err) {
    console.error('Get versions error:', err);
    res.status(500).json({ error: 'Failed to get versions' });
  }
});

// Get specific version content
router.get('/:id/versions/:versionId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const versionId = req.params.versionId as string;
    const db = getDatabase();

    // Verify demand letter exists and belongs to firm
    const demandLetter = db.prepare(`
      SELECT id FROM demand_letters WHERE id = ? AND firm_id = ?
    `).get(id, req.user!.firm_id) as { id: string } | undefined;

    if (!demandLetter) {
      res.status(404).json({ error: 'Demand letter not found' });
      return;
    }

    const version = db.prepare(`
      SELECT dlv.*, u.first_name, u.last_name, u.email
      FROM demand_letter_versions dlv
      LEFT JOIN users u ON dlv.changed_by = u.id
      WHERE dlv.id = ? AND dlv.demand_letter_id = ?
    `).get(versionId, id) as (DemandLetterVersion & { first_name: string; last_name: string; email: string }) | undefined;

    if (!version) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }

    res.json({
      id: version.id,
      version_number: version.version_number,
      content: version.content,
      content_html: version.content_html,
      change_summary: version.change_summary,
      changed_by: {
        id: version.changed_by,
        name: `${version.first_name} ${version.last_name}`,
        email: version.email,
      },
      created_at: version.created_at,
    });
  } catch (err) {
    console.error('Get version error:', err);
    res.status(500).json({ error: 'Failed to get version' });
  }
});

// Restore specific version
router.post(
  '/:id/versions/:versionId/restore',
  authenticate,
  requireDocumentEditor,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params.id as string;
      const versionId = req.params.versionId as string;
      const db = getDatabase();

      // Verify demand letter exists and belongs to firm
      const demandLetter = db.prepare(`
        SELECT * FROM demand_letters WHERE id = ? AND firm_id = ?
      `).get(id, req.user!.firm_id) as DemandLetter | undefined;

      if (!demandLetter) {
        res.status(404).json({ error: 'Demand letter not found' });
        return;
      }

      // Get version to restore
      const version = db.prepare(`
        SELECT * FROM demand_letter_versions WHERE id = ? AND demand_letter_id = ?
      `).get(versionId, id) as DemandLetterVersion | undefined;

      if (!version) {
        res.status(404).json({ error: 'Version not found' });
        return;
      }

      const now = new Date().toISOString();

      // Update demand letter content (including content_html if available)
      db.prepare(`
        UPDATE demand_letters SET content = ?, content_html = ?, updated_at = ? WHERE id = ?
      `).run(version.content, version.content_html || null, now, id);

      // Create new version for the restore
      const latestVersion = db.prepare(`
        SELECT MAX(version_number) as version FROM demand_letter_versions WHERE demand_letter_id = ?
      `).get(id) as { version: number };

      const newVersionNumber = (latestVersion.version || 0) + 1;

      db.prepare(`
        INSERT INTO demand_letter_versions (
          id, demand_letter_id, version_number, content, content_html, changed_by, change_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        id,
        newVersionNumber,
        version.content,
        version.content_html || null,
        req.user!.id,
        `Restored from version ${version.version_number}`,
        now
      );

      // Log audit event
      await logAuditEvent({
        event_type: 'DEMAND_LETTER_UPDATED',
        user_id: req.user!.id,
        firm_id: req.user!.firm_id,
        resource_type: 'demand_letter',
        resource_id: id,
        details: {
          action: 'version_restore',
          restored_from_version: version.version_number,
          new_version: newVersionNumber,
        },
        ip_address: req.ip || req.socket.remoteAddress,
      });

      res.json({
        id,
        content: version.content,
        version: newVersionNumber,
        restored_from: version.version_number,
        updated_at: now,
      });
    } catch (err) {
      console.error('Restore version error:', err);
      res.status(500).json({ error: 'Failed to restore version' });
    }
  }
);

// Get AI generation history for demand letter
router.get('/:id/ai-history', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const db = getDatabase();

    // Verify demand letter exists and belongs to firm
    const demandLetter = db.prepare(`
      SELECT id FROM demand_letters WHERE id = ? AND firm_id = ?
    `).get(id, req.user!.firm_id) as { id: string } | undefined;

    if (!demandLetter) {
      res.status(404).json({ error: 'Demand letter not found' });
      return;
    }

    const history = db.prepare(`
      SELECT h.*, u.first_name, u.last_name, u.email
      FROM ai_generation_history h
      LEFT JOIN users u ON h.user_id = u.id
      WHERE h.demand_letter_id = ?
      ORDER BY h.created_at DESC
    `).all(id) as (AIGenerationHistory & { first_name: string; last_name: string; email: string })[];

    res.json({
      history: history.map(h => ({
        id: h.id,
        generation_type: h.generation_type,
        prompt: h.prompt,
        response_summary: h.response_summary,
        model_used: h.model_used,
        tokens_used: h.tokens_used,
        user: {
          id: h.user_id,
          name: `${h.first_name} ${h.last_name}`,
          email: h.email,
        },
        created_at: h.created_at,
      })),
      total: history.length,
    });
  } catch (err) {
    console.error('Get AI history error:', err);
    res.status(500).json({ error: 'Failed to get AI history' });
  }
});

// Delete demand letter
router.delete(
  '/:id',
  authenticate,
  requireDocumentEditor,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params.id as string;
      const db = getDatabase();

      // Verify demand letter exists and belongs to firm
      const demandLetter = db.prepare(`
        SELECT * FROM demand_letters WHERE id = ? AND firm_id = ?
      `).get(id, req.user!.firm_id) as DemandLetter | undefined;

      if (!demandLetter) {
        res.status(404).json({ error: 'Demand letter not found' });
        return;
      }

      // Delete related records (cascade should handle this, but be explicit)
      db.prepare('DELETE FROM demand_letter_documents WHERE demand_letter_id = ?').run(id);
      db.prepare('DELETE FROM demand_letter_versions WHERE demand_letter_id = ?').run(id);
      db.prepare('DELETE FROM ai_generation_history WHERE demand_letter_id = ?').run(id);
      db.prepare('DELETE FROM demand_letters WHERE id = ?').run(id);

      // Log audit event
      await logAuditEvent({
        event_type: 'DEMAND_LETTER_DELETED',
        user_id: req.user!.id,
        firm_id: req.user!.firm_id,
        resource_type: 'demand_letter',
        resource_id: id,
        details: {
          title: demandLetter.title,
          status: demandLetter.status,
        },
        ip_address: req.ip || req.socket.remoteAddress,
      });

      // Invalidate cache for demand letter lists
      invalidateCache([/^GET:.*:demand-letters/]);

      res.json({ message: 'Demand letter deleted successfully' });
    } catch (err) {
      console.error('Delete demand letter error:', err);
      res.status(500).json({ error: 'Failed to delete demand letter' });
    }
  }
);

// Export demand letter to Word document
router.post(
  '/:id/export',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params.id as string;
      const body = req.body as ExportRequest;
      const db = getDatabase();

      // Get demand letter
      const demandLetter = db.prepare(`
        SELECT * FROM demand_letters WHERE id = ? AND firm_id = ?
      `).get(id, req.user!.firm_id) as DemandLetter | undefined;

      if (!demandLetter) {
        res.status(404).json({ error: 'Demand letter not found' });
        return;
      }

      // Get firm info for letterhead if needed
      let exportOptions = body.options || {};
      if (exportOptions.include_letterhead) {
        const firm = db.prepare(`SELECT * FROM firms WHERE id = ?`).get(req.user!.firm_id) as {
          name: string;
          address?: string;
          phone?: string;
          email?: string;
        } | undefined;

        if (firm) {
          exportOptions = {
            ...exportOptions,
            letterhead_firm_name: exportOptions.letterhead_firm_name || firm.name,
            letterhead_address: exportOptions.letterhead_address || firm.address,
            letterhead_phone: exportOptions.letterhead_phone || firm.phone,
            letterhead_email: exportOptions.letterhead_email || firm.email,
          };
        }
      }

      // Call AI service to generate Word document
      let aiResponse;
      try {
        aiResponse = await axios.post(
          `${AI_SERVICE_URL}/ai/export`,
          {
            content: demandLetter.content,
            title: demandLetter.title,
            options: exportOptions,
          },
          {
            responseType: 'arraybuffer',
            timeout: 30000,
          }
        );
      } catch (aiError) {
        if (axios.isAxiosError(aiError)) {
          console.error('AI export error:', aiError.response?.data || aiError.message);
          res.status(502).json({
            error: 'Export failed',
            details: aiError.message,
          });
          return;
        }
        throw aiError;
      }

      // Log audit event
      await logAuditEvent({
        event_type: 'DEMAND_LETTER_EXPORTED',
        user_id: req.user!.id,
        firm_id: req.user!.firm_id,
        resource_type: 'demand_letter',
        resource_id: id,
        details: {
          title: demandLetter.title,
          format: 'docx',
        },
        ip_address: req.ip || req.socket.remoteAddress,
      });

      // Set response headers from AI service response
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader(
        'Content-Disposition',
        aiResponse.headers['content-disposition'] || `attachment; filename="${demandLetter.title.replace(/[^a-zA-Z0-9]/g, '_')}.docx"`
      );
      res.setHeader('Content-Length', aiResponse.data.length);

      res.send(Buffer.from(aiResponse.data));
    } catch (err) {
      console.error('Export demand letter error:', err);
      res.status(500).json({ error: 'Failed to export demand letter' });
    }
  }
);

// Batch export demand letters to Word documents (ZIP)
router.post(
  '/export/batch',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const body = req.body as BatchExportRequest;
      const { demand_letter_ids, options } = body;

      if (!demand_letter_ids || demand_letter_ids.length === 0) {
        res.status(400).json({ error: 'At least one demand letter ID is required' });
        return;
      }

      if (demand_letter_ids.length > 50) {
        res.status(400).json({ error: 'Maximum 50 demand letters per batch export' });
        return;
      }

      const db = getDatabase();

      // Get all demand letters
      const demandLetters = demand_letter_ids.map(id => {
        const dl = db.prepare(`
          SELECT * FROM demand_letters WHERE id = ? AND firm_id = ?
        `).get(id, req.user!.firm_id) as DemandLetter | undefined;

        if (!dl) {
          throw new Error(`Demand letter not found: ${id}`);
        }

        return dl;
      });

      // Get firm info for letterhead if needed
      let exportOptions = options || {};
      if (exportOptions.include_letterhead) {
        const firm = db.prepare(`SELECT * FROM firms WHERE id = ?`).get(req.user!.firm_id) as {
          name: string;
          address?: string;
          phone?: string;
          email?: string;
        } | undefined;

        if (firm) {
          exportOptions = {
            ...exportOptions,
            letterhead_firm_name: exportOptions.letterhead_firm_name || firm.name,
            letterhead_address: exportOptions.letterhead_address || firm.address,
            letterhead_phone: exportOptions.letterhead_phone || firm.phone,
            letterhead_email: exportOptions.letterhead_email || firm.email,
          };
        }
      }

      // Call AI service for batch export
      let aiResponse;
      try {
        aiResponse = await axios.post(
          `${AI_SERVICE_URL}/ai/export/batch`,
          {
            items: demandLetters.map(dl => ({
              id: dl.id,
              content: dl.content,
              title: dl.title,
              filename: dl.title.replace(/[^a-zA-Z0-9]/g, '_'),
            })),
            options: exportOptions,
          },
          {
            responseType: 'arraybuffer',
            timeout: 120000, // 2 minutes for batch
          }
        );
      } catch (aiError) {
        if (axios.isAxiosError(aiError)) {
          console.error('AI batch export error:', aiError.response?.data || aiError.message);
          res.status(502).json({
            error: 'Batch export failed',
            details: aiError.message,
          });
          return;
        }
        throw aiError;
      }

      // Log audit event
      await logAuditEvent({
        event_type: 'DEMAND_LETTER_BATCH_EXPORTED',
        user_id: req.user!.id,
        firm_id: req.user!.firm_id,
        resource_type: 'demand_letter',
        resource_id: 'batch',
        details: {
          count: demandLetters.length,
          ids: demand_letter_ids,
          format: 'docx',
        },
        ip_address: req.ip || req.socket.remoteAddress,
      });

      // Set response headers
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="demand_letters.zip"');
      res.setHeader('Content-Length', aiResponse.data.length);
      res.setHeader('X-Export-File-Count', aiResponse.headers['x-export-file-count'] || demandLetters.length);

      res.send(Buffer.from(aiResponse.data));
    } catch (err) {
      console.error('Batch export error:', err);
      if (err instanceof Error && err.message.includes('Demand letter not found')) {
        res.status(404).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Failed to batch export demand letters' });
    }
  }
);

// Get export options
router.get('/export/options', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Get firm info for letterhead defaults
    const db = getDatabase();
    const firm = db.prepare(`SELECT * FROM firms WHERE id = ?`).get(req.user!.firm_id) as {
      name: string;
      address?: string;
      phone?: string;
      email?: string;
    } | undefined;

    res.json({
      fonts: [
        'Times New Roman',
        'Arial',
        'Calibri',
        'Georgia',
        'Garamond',
        'Century',
        'Palatino Linotype',
        'Book Antiqua',
      ],
      defaults: {
        font_name: 'Times New Roman',
        font_size: 12,
        margin_top: 1.0,
        margin_bottom: 1.0,
        margin_left: 1.0,
        margin_right: 1.0,
        line_spacing: 1.0,
        include_letterhead: false,
        include_page_numbers: true,
        include_date: true,
      },
      font_sizes: [10, 11, 12, 14],
      line_spacing_options: [1.0, 1.15, 1.5, 2.0],
      margin_range: { min: 0.5, max: 2.0 },
      firm_letterhead: firm ? {
        firm_name: firm.name,
        address: firm.address,
        phone: firm.phone,
        email: firm.email,
      } : null,
    });
  } catch (err) {
    console.error('Get export options error:', err);
    res.status(500).json({ error: 'Failed to get export options' });
  }
});

export default router;
