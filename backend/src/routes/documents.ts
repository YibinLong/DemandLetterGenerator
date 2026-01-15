// Document upload and management routes
import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/index.js';
import { Document } from '../db/schema.js';
import { authenticate, AuthRequest, requireDocumentEditor } from '../middleware/auth.js';
import { logAuditEvent } from '../services/audit.js';
import { encryptBuffer, decryptBuffer, hashBuffer, generateSecureToken } from '../services/encryption.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Configure storage directory
const UPLOAD_DIR = path.resolve(__dirname, '../../data/uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Allowed file types and their MIME types
const ALLOWED_FILE_TYPES: Record<string, string[]> = {
  'pdf': ['application/pdf'],
  'docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  'txt': ['text/plain'],
};

const ALLOWED_EXTENSIONS = Object.keys(ALLOWED_FILE_TYPES);
const ALLOWED_MIME_TYPES = Object.values(ALLOWED_FILE_TYPES).flat();

// Max file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// File filter for multer
const fileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase().slice(1);
  const mimeType = file.mimetype;

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    callback(new Error(`Invalid file type. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`));
    return;
  }

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    callback(new Error(`Invalid MIME type. File extension does not match content type.`));
    return;
  }

  // Verify extension matches MIME type
  if (!ALLOWED_FILE_TYPES[ext]?.includes(mimeType)) {
    callback(new Error(`File extension "${ext}" does not match MIME type "${mimeType}"`));
    return;
  }

  callback(null, true);
};

// Configure multer for memory storage (we'll encrypt before writing to disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 10, // Max 10 files per request
  },
  fileFilter,
});

// Helper to get file type from extension
const getFileType = (filename: string): 'pdf' | 'docx' | 'txt' => {
  const ext = path.extname(filename).toLowerCase().slice(1);
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  return 'txt';
};

// Upload single document
router.post(
  '/upload',
  authenticate,
  requireDocumentEditor,
  upload.single('file'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file provided' });
        return;
      }

      const { case_reference, description } = req.body;
      const file = req.file;

      // Generate secure filename
      const documentId = uuidv4();
      const fileExt = path.extname(file.originalname).toLowerCase();
      const secureFilename = `${documentId}${fileExt}.enc`;
      const filePath = path.join(UPLOAD_DIR, secureFilename);

      // Encrypt file buffer before storing
      const { encrypted, iv, authTag } = encryptBuffer(file.buffer);
      const encryptedBuffer = Buffer.concat([iv, authTag, encrypted]);

      // Calculate hash of original file for integrity
      const fileHash = hashBuffer(file.buffer);

      // Write encrypted file to disk
      fs.writeFileSync(filePath, encryptedBuffer);

      // Store document metadata in database
      const db = getDatabase();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO documents (id, user_id, firm_id, filename, original_filename, file_type, file_size, file_path, case_reference, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        documentId,
        req.user!.id,
        req.user!.firm_id,
        secureFilename,
        file.originalname,
        getFileType(file.originalname),
        file.size,
        filePath,
        case_reference || null,
        description || null,
        now,
        now
      );

      // Log audit event
      await logAuditEvent({
        event_type: 'DOCUMENT_UPLOADED',
        user_id: req.user!.id,
        firm_id: req.user!.firm_id,
        resource_type: 'document',
        resource_id: documentId,
        details: {
          original_filename: file.originalname,
          file_type: getFileType(file.originalname),
          file_size: file.size,
          file_hash: fileHash,
        },
        ip_address: req.ip || req.socket.remoteAddress,
      });

      // Return document info
      res.status(201).json({
        id: documentId,
        original_filename: file.originalname,
        file_type: getFileType(file.originalname),
        file_size: file.size,
        case_reference: case_reference || null,
        description: description || null,
        created_at: now,
        message: 'Document uploaded successfully',
      });
    } catch (err) {
      console.error('Document upload error:', err);
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` });
          return;
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          res.status(400).json({ error: 'Too many files. Maximum is 10 files per request' });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message.includes('Invalid')) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Failed to upload document' });
    }
  }
);

// Upload multiple documents
router.post(
  '/upload-multiple',
  authenticate,
  requireDocumentEditor,
  upload.array('files', 10),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        res.status(400).json({ error: 'No files provided' });
        return;
      }

      const { case_reference, description } = req.body;
      const files = req.files as Express.Multer.File[];
      const db = getDatabase();
      const now = new Date().toISOString();
      const uploadedDocs: Array<{
        id: string;
        original_filename: string;
        file_type: string;
        file_size: number;
      }> = [];

      // Process each file
      for (const file of files) {
        const documentId = uuidv4();
        const fileExt = path.extname(file.originalname).toLowerCase();
        const secureFilename = `${documentId}${fileExt}.enc`;
        const filePath = path.join(UPLOAD_DIR, secureFilename);

        // Encrypt and store
        const { encrypted, iv, authTag } = encryptBuffer(file.buffer);
        const encryptedBuffer = Buffer.concat([iv, authTag, encrypted]);
        const fileHash = hashBuffer(file.buffer);

        fs.writeFileSync(filePath, encryptedBuffer);

        // Insert into database
        db.prepare(`
          INSERT INTO documents (id, user_id, firm_id, filename, original_filename, file_type, file_size, file_path, case_reference, description, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          documentId,
          req.user!.id,
          req.user!.firm_id,
          secureFilename,
          file.originalname,
          getFileType(file.originalname),
          file.size,
          filePath,
          case_reference || null,
          description || null,
          now,
          now
        );

        // Log audit event
        await logAuditEvent({
          event_type: 'DOCUMENT_UPLOADED',
          user_id: req.user!.id,
          firm_id: req.user!.firm_id,
          resource_type: 'document',
          resource_id: documentId,
          details: {
            original_filename: file.originalname,
            file_type: getFileType(file.originalname),
            file_size: file.size,
            file_hash: fileHash,
          },
          ip_address: req.ip || req.socket.remoteAddress,
        });

        uploadedDocs.push({
          id: documentId,
          original_filename: file.originalname,
          file_type: getFileType(file.originalname),
          file_size: file.size,
        });
      }

      res.status(201).json({
        documents: uploadedDocs,
        count: uploadedDocs.length,
        message: `${uploadedDocs.length} document(s) uploaded successfully`,
      });
    } catch (err) {
      console.error('Multiple document upload error:', err);
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` });
          return;
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          res.status(400).json({ error: 'Too many files. Maximum is 10 files per request' });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message.includes('Invalid')) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Failed to upload documents' });
    }
  }
);

// List documents for the user's firm
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const { case_reference, file_type, search, limit = '50', offset = '0' } = req.query;

    const conditions: string[] = ['firm_id = ?'];
    const params: (string | number)[] = [req.user!.firm_id];

    if (case_reference) {
      conditions.push('case_reference = ?');
      params.push(String(case_reference));
    }

    if (file_type && ALLOWED_EXTENSIONS.includes(String(file_type))) {
      conditions.push('file_type = ?');
      params.push(String(file_type));
    }

    if (search) {
      conditions.push('(original_filename LIKE ? OR description LIKE ?)');
      const searchTerm = `%${String(search)}%`;
      params.push(searchTerm, searchTerm);
    }

    const whereClause = conditions.join(' AND ');
    params.push(Number(limit), Number(offset));

    const documents = db.prepare(`
      SELECT id, user_id, firm_id, original_filename, file_type, file_size, case_reference, description, created_at, updated_at
      FROM documents
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params) as Omit<Document, 'filename' | 'file_path' | 'extracted_text'>[];

    // Get total count
    const countParams = params.slice(0, -2); // Remove limit and offset
    const countResult = db.prepare(`
      SELECT COUNT(*) as count FROM documents WHERE ${whereClause}
    `).get(...countParams) as { count: number };

    res.json({
      documents,
      total: countResult.count,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (err) {
    console.error('List documents error:', err);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

// Get single document metadata
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const db = getDatabase();

    const document = db.prepare(`
      SELECT id, user_id, firm_id, original_filename, file_type, file_size, case_reference, description, created_at, updated_at
      FROM documents
      WHERE id = ? AND firm_id = ?
    `).get(id, req.user!.firm_id) as Omit<Document, 'filename' | 'file_path' | 'extracted_text'> | undefined;

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json(document);
  } catch (err) {
    console.error('Get document error:', err);
    res.status(500).json({ error: 'Failed to get document' });
  }
});

// Download document
router.get('/:id/download', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const db = getDatabase();

    const document = db.prepare(`
      SELECT * FROM documents WHERE id = ? AND firm_id = ?
    `).get(id, req.user!.firm_id) as Document | undefined;

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Read and decrypt file
    if (!fs.existsSync(document.file_path)) {
      res.status(404).json({ error: 'Document file not found on disk' });
      return;
    }

    const encryptedBuffer = fs.readFileSync(document.file_path);

    // Extract components (format: [iv][authTag][encrypted])
    const IV_LENGTH = 12;
    const AUTH_TAG_LENGTH = 16;
    const iv = encryptedBuffer.subarray(0, IV_LENGTH);
    const authTag = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = encryptedBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decryptedBuffer = decryptBuffer({ encrypted, iv, authTag });

    // Log audit event
    await logAuditEvent({
      event_type: 'DOCUMENT_DOWNLOADED',
      user_id: req.user!.id,
      firm_id: req.user!.firm_id,
      resource_type: 'document',
      resource_id: id,
      details: {
        original_filename: document.original_filename,
        file_type: document.file_type,
      },
      ip_address: req.ip || req.socket.remoteAddress,
    });

    // Set response headers
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain',
    };

    res.setHeader('Content-Type', mimeTypes[document.file_type] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${document.original_filename}"`);
    res.setHeader('Content-Length', decryptedBuffer.length);

    res.send(decryptedBuffer);
  } catch (err) {
    console.error('Download document error:', err);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// Preview document (inline display, not download)
router.get('/:id/preview', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const db = getDatabase();

    const document = db.prepare(`
      SELECT * FROM documents WHERE id = ? AND firm_id = ?
    `).get(id, req.user!.firm_id) as Document | undefined;

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Read and decrypt file
    if (!fs.existsSync(document.file_path)) {
      res.status(404).json({ error: 'Document file not found on disk' });
      return;
    }

    const encryptedBuffer = fs.readFileSync(document.file_path);

    // Extract components (format: [iv][authTag][encrypted])
    const IV_LENGTH = 12;
    const AUTH_TAG_LENGTH = 16;
    const iv = encryptedBuffer.subarray(0, IV_LENGTH);
    const authTag = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = encryptedBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decryptedBuffer = decryptBuffer({ encrypted, iv, authTag });

    // Log audit event for preview
    await logAuditEvent({
      event_type: 'DOCUMENT_PREVIEWED',
      user_id: req.user!.id,
      firm_id: req.user!.firm_id,
      resource_type: 'document',
      resource_id: id,
      details: {
        original_filename: document.original_filename,
        file_type: document.file_type,
      },
      ip_address: req.ip || req.socket.remoteAddress,
    });

    // Set response headers for inline display
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain; charset=utf-8',
    };

    res.setHeader('Content-Type', mimeTypes[document.file_type] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${document.original_filename}"`);
    res.setHeader('Content-Length', decryptedBuffer.length);
    // Allow embedding in iframes from same origin
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    res.send(decryptedBuffer);
  } catch (err) {
    console.error('Preview document error:', err);
    res.status(500).json({ error: 'Failed to preview document' });
  }
});

// Update document metadata
router.patch('/:id', authenticate, requireDocumentEditor, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { case_reference, description } = req.body;
    const db = getDatabase();

    // Check document exists and belongs to firm
    const existing = db.prepare(`
      SELECT id FROM documents WHERE id = ? AND firm_id = ?
    `).get(id, req.user!.firm_id) as { id: string } | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Build update query
    const updates: string[] = ['updated_at = ?'];
    const params: (string | null)[] = [new Date().toISOString()];

    if (case_reference !== undefined) {
      updates.push('case_reference = ?');
      params.push(case_reference || null);
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description || null);
    }

    params.push(id);

    db.prepare(`
      UPDATE documents SET ${updates.join(', ')} WHERE id = ?
    `).run(...params);

    // Get updated document
    const document = db.prepare(`
      SELECT id, user_id, firm_id, original_filename, file_type, file_size, case_reference, description, created_at, updated_at
      FROM documents WHERE id = ?
    `).get(id) as Omit<Document, 'filename' | 'file_path' | 'extracted_text'>;

    res.json(document);
  } catch (err) {
    console.error('Update document error:', err);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// Delete document
router.delete('/:id', authenticate, requireDocumentEditor, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const db = getDatabase();

    // Get document info before deletion
    const document = db.prepare(`
      SELECT * FROM documents WHERE id = ? AND firm_id = ?
    `).get(id, req.user!.firm_id) as Document | undefined;

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Delete file from disk
    if (fs.existsSync(document.file_path)) {
      fs.unlinkSync(document.file_path);
    }

    // Delete from database
    db.prepare('DELETE FROM documents WHERE id = ?').run(id);

    // Log audit event
    await logAuditEvent({
      event_type: 'DOCUMENT_DELETED',
      user_id: req.user!.id,
      firm_id: req.user!.firm_id,
      resource_type: 'document',
      resource_id: id,
      details: {
        original_filename: document.original_filename,
        file_type: document.file_type,
        file_size: document.file_size,
      },
      ip_address: req.ip || req.socket.remoteAddress,
    });

    res.json({ message: 'Document deleted successfully' });
  } catch (err) {
    console.error('Delete document error:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
