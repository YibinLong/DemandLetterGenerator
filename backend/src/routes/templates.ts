// Template management routes for demand letter templates
import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/index.js';
import { Template, User } from '../db/schema.js';
import { authenticate, AuthRequest, requireDocumentEditor } from '../middleware/auth.js';
import { logAuditEvent } from '../services/audit.js';

const router = Router();

// Template categories for filtering
const TEMPLATE_CATEGORIES = [
  'Personal Injury',
  'Auto Accident',
  'Medical Malpractice',
  'Slip and Fall',
  'Product Liability',
  'Workers Compensation',
  'General',
  'Other'
];

// Extract placeholders from template content using {{placeholder}} syntax
const extractPlaceholders = (content: string): string[] => {
  const regex = /\{\{([^}]+)\}\}/g;
  const placeholders: Set<string> = new Set();
  let match;
  while ((match = regex.exec(content)) !== null) {
    placeholders.add(match[1].trim());
  }
  return Array.from(placeholders);
};

// Validate placeholders are properly formatted
const validatePlaceholders = (placeholders: string[]): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const validPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

  for (const placeholder of placeholders) {
    if (!validPattern.test(placeholder)) {
      errors.push(`Invalid placeholder name "${placeholder}". Must start with a letter or underscore and contain only alphanumeric characters and underscores.`);
    }
  }

  return { valid: errors.length === 0, errors };
};

// Create new template
router.post('/', authenticate, requireDocumentEditor, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, content, category, is_shared } = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Template name is required' });
      return;
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json({ error: 'Template content is required' });
      return;
    }

    // Validate name length
    if (name.length > 200) {
      res.status(400).json({ error: 'Template name must be 200 characters or less' });
      return;
    }

    // Validate category if provided
    if (category && !TEMPLATE_CATEGORIES.includes(category)) {
      res.status(400).json({
        error: 'Invalid category',
        valid_categories: TEMPLATE_CATEGORIES
      });
      return;
    }

    // Extract and validate placeholders
    const placeholders = extractPlaceholders(content);
    const validation = validatePlaceholders(placeholders);
    if (!validation.valid) {
      res.status(400).json({
        error: 'Invalid placeholders in template',
        details: validation.errors
      });
      return;
    }

    const db = getDatabase();
    const templateId = uuidv4();
    const now = new Date().toISOString();

    // Check for duplicate name within firm
    const existing = db.prepare(`
      SELECT id FROM templates WHERE firm_id = ? AND name = ?
    `).get(req.user!.firm_id, name.trim()) as { id: string } | undefined;

    if (existing) {
      res.status(409).json({ error: 'A template with this name already exists in your firm' });
      return;
    }

    // Insert template
    db.prepare(`
      INSERT INTO templates (id, firm_id, created_by, name, description, content, placeholders, category, is_shared, is_approved, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      templateId,
      req.user!.firm_id,
      req.user!.id,
      name.trim(),
      description?.trim() || null,
      content,
      JSON.stringify(placeholders),
      category || null,
      is_shared ? 1 : 0,
      0, // New templates are not approved by default
      now,
      now
    );

    // Log audit event
    await logAuditEvent({
      event_type: 'TEMPLATE_CREATED',
      user_id: req.user!.id,
      firm_id: req.user!.firm_id,
      resource_type: 'template',
      resource_id: templateId,
      details: {
        name: name.trim(),
        category,
        placeholder_count: placeholders.length,
        is_shared: is_shared ? true : false,
      },
      ip_address: req.ip || req.socket.remoteAddress,
    });

    // Get creator info for response
    const creator = db.prepare(`
      SELECT id, first_name, last_name, email FROM users WHERE id = ?
    `).get(req.user!.id) as Pick<User, 'id' | 'first_name' | 'last_name' | 'email'>;

    res.status(201).json({
      id: templateId,
      firm_id: req.user!.firm_id,
      created_by: req.user!.id,
      name: name.trim(),
      description: description?.trim() || null,
      content,
      placeholders,
      category: category || null,
      is_shared: is_shared ? true : false,
      is_approved: false,
      creator: {
        id: creator.id,
        name: `${creator.first_name} ${creator.last_name}`,
        email: creator.email,
      },
      created_at: now,
      updated_at: now,
      message: 'Template created successfully',
    });
  } catch (err) {
    console.error('Create template error:', err);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// List templates for the user's firm
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const {
      category,
      search,
      is_shared,
      is_approved,
      created_by,
      limit = '50',
      offset = '0'
    } = req.query;

    const conditions: string[] = ['t.firm_id = ?'];
    const params: (string | number)[] = [req.user!.firm_id];

    if (category && TEMPLATE_CATEGORIES.includes(String(category))) {
      conditions.push('t.category = ?');
      params.push(String(category));
    }

    if (search) {
      conditions.push('(t.name LIKE ? OR t.description LIKE ?)');
      const searchTerm = `%${String(search)}%`;
      params.push(searchTerm, searchTerm);
    }

    if (is_shared !== undefined) {
      conditions.push('t.is_shared = ?');
      params.push(is_shared === 'true' || is_shared === '1' ? 1 : 0);
    }

    if (is_approved !== undefined) {
      conditions.push('t.is_approved = ?');
      params.push(is_approved === 'true' || is_approved === '1' ? 1 : 0);
    }

    if (created_by) {
      conditions.push('t.created_by = ?');
      params.push(String(created_by));
    }

    const whereClause = conditions.join(' AND ');
    params.push(Number(limit), Number(offset));

    const templates = db.prepare(`
      SELECT
        t.id,
        t.firm_id,
        t.created_by,
        t.name,
        t.description,
        t.placeholders,
        t.category,
        t.is_shared,
        t.is_approved,
        t.created_at,
        t.updated_at,
        u.first_name || ' ' || u.last_name as creator_name,
        u.email as creator_email
      FROM templates t
      LEFT JOIN users u ON t.created_by = u.id
      WHERE ${whereClause}
      ORDER BY t.updated_at DESC
      LIMIT ? OFFSET ?
    `).all(...params) as Array<{
      id: string;
      firm_id: string;
      created_by: string;
      name: string;
      description: string | null;
      placeholders: string | null;
      category: string | null;
      is_shared: number;
      is_approved: number;
      created_at: string;
      updated_at: string;
      creator_name: string;
      creator_email: string;
    }>;

    // Get total count
    const countParams = params.slice(0, -2);
    const countResult = db.prepare(`
      SELECT COUNT(*) as count FROM templates t WHERE ${whereClause}
    `).get(...countParams) as { count: number };

    // Transform response
    const transformedTemplates = templates.map(t => ({
      id: t.id,
      firm_id: t.firm_id,
      created_by: t.created_by,
      name: t.name,
      description: t.description,
      placeholders: t.placeholders ? JSON.parse(t.placeholders) : [],
      category: t.category,
      is_shared: t.is_shared === 1,
      is_approved: t.is_approved === 1,
      creator: {
        id: t.created_by,
        name: t.creator_name,
        email: t.creator_email,
      },
      created_at: t.created_at,
      updated_at: t.updated_at,
    }));

    res.json({
      templates: transformedTemplates,
      total: countResult.count,
      limit: Number(limit),
      offset: Number(offset),
      categories: TEMPLATE_CATEGORIES,
    });
  } catch (err) {
    console.error('List templates error:', err);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// Get single template with full content
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const db = getDatabase();

    const template = db.prepare(`
      SELECT
        t.*,
        u.first_name || ' ' || u.last_name as creator_name,
        u.email as creator_email
      FROM templates t
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.id = ? AND t.firm_id = ?
    `).get(id, req.user!.firm_id) as (Template & {
      creator_name: string;
      creator_email: string;
    }) | undefined;

    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    // Count demand letters using this template
    const usageCount = db.prepare(`
      SELECT COUNT(*) as count FROM demand_letters WHERE template_id = ?
    `).get(template.id) as { count: number };

    res.json({
      id: template.id,
      firm_id: template.firm_id,
      created_by: template.created_by,
      name: template.name,
      description: template.description,
      content: template.content,
      placeholders: template.placeholders ? JSON.parse(template.placeholders) : [],
      category: template.category,
      is_shared: template.is_shared === 1,
      is_approved: template.is_approved === 1,
      creator: {
        id: template.created_by,
        name: template.creator_name,
        email: template.creator_email,
      },
      usage_count: usageCount.count,
      created_at: template.created_at,
      updated_at: template.updated_at,
    });
  } catch (err) {
    console.error('Get template error:', err);
    res.status(500).json({ error: 'Failed to get template' });
  }
});

// Update template
router.patch('/:id', authenticate, requireDocumentEditor, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, description, content, category, is_shared } = req.body;
    const db = getDatabase();

    // Check template exists and belongs to firm
    const existing = db.prepare(`
      SELECT * FROM templates WHERE id = ? AND firm_id = ?
    `).get(id, req.user!.firm_id) as Template | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    // Only creator or admin can update
    const isAdmin = req.user!.role === 'admin';
    if (existing.created_by !== req.user!.id && !isAdmin) {
      res.status(403).json({ error: 'Only the template creator or an admin can update this template' });
      return;
    }

    // Validate name if provided
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: 'Template name cannot be empty' });
        return;
      }
      if (name.length > 200) {
        res.status(400).json({ error: 'Template name must be 200 characters or less' });
        return;
      }
      // Check for duplicate name
      const duplicate = db.prepare(`
        SELECT id FROM templates WHERE firm_id = ? AND name = ? AND id != ?
      `).get(req.user!.firm_id, name.trim(), id) as { id: string } | undefined;
      if (duplicate) {
        res.status(409).json({ error: 'A template with this name already exists in your firm' });
        return;
      }
    }

    // Validate category if provided
    if (category !== undefined && category !== null && !TEMPLATE_CATEGORIES.includes(category)) {
      res.status(400).json({
        error: 'Invalid category',
        valid_categories: TEMPLATE_CATEGORIES
      });
      return;
    }

    // Extract and validate placeholders if content is updated
    let placeholders: string[] | null = null;
    if (content !== undefined) {
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        res.status(400).json({ error: 'Template content cannot be empty' });
        return;
      }
      placeholders = extractPlaceholders(content);
      const validation = validatePlaceholders(placeholders);
      if (!validation.valid) {
        res.status(400).json({
          error: 'Invalid placeholders in template',
          details: validation.errors
        });
        return;
      }
    }

    // Build update query
    const updates: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [new Date().toISOString()];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description?.trim() || null);
    }

    if (content !== undefined) {
      updates.push('content = ?');
      params.push(content);
      updates.push('placeholders = ?');
      params.push(JSON.stringify(placeholders));
    }

    if (category !== undefined) {
      updates.push('category = ?');
      params.push(category || null);
    }

    if (is_shared !== undefined) {
      updates.push('is_shared = ?');
      params.push(is_shared ? 1 : 0);
      // If changing to shared, reset approval status unless admin
      if (is_shared && !isAdmin && existing.is_approved) {
        updates.push('is_approved = ?');
        params.push(0);
      }
    }

    params.push(id);

    db.prepare(`
      UPDATE templates SET ${updates.join(', ')} WHERE id = ?
    `).run(...params);

    // Log audit event
    await logAuditEvent({
      event_type: 'TEMPLATE_UPDATED',
      user_id: req.user!.id,
      firm_id: req.user!.firm_id,
      resource_type: 'template',
      resource_id: id,
      details: {
        updated_fields: Object.keys(req.body),
      },
      ip_address: req.ip || req.socket.remoteAddress,
    });

    // Get updated template
    const template = db.prepare(`
      SELECT
        t.*,
        u.first_name || ' ' || u.last_name as creator_name,
        u.email as creator_email
      FROM templates t
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.id = ?
    `).get(id) as (Template & { creator_name: string; creator_email: string });

    res.json({
      id: template.id,
      firm_id: template.firm_id,
      created_by: template.created_by,
      name: template.name,
      description: template.description,
      content: template.content,
      placeholders: template.placeholders ? JSON.parse(template.placeholders) : [],
      category: template.category,
      is_shared: template.is_shared === 1,
      is_approved: template.is_approved === 1,
      creator: {
        id: template.created_by,
        name: template.creator_name,
        email: template.creator_email,
      },
      created_at: template.created_at,
      updated_at: template.updated_at,
      message: 'Template updated successfully',
    });
  } catch (err) {
    console.error('Update template error:', err);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Approve/unapprove template (admin only)
router.post('/:id/approve', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Only admins can approve templates' });
      return;
    }

    const id = req.params.id as string;
    const { approved } = req.body;
    const db = getDatabase();

    const existing = db.prepare(`
      SELECT id, is_shared FROM templates WHERE id = ? AND firm_id = ?
    `).get(id, req.user!.firm_id) as { id: string; is_shared: number } | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    // Template must be shared to be approved
    if (approved && existing.is_shared !== 1) {
      res.status(400).json({ error: 'Template must be shared with the firm before it can be approved' });
      return;
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE templates SET is_approved = ?, updated_at = ? WHERE id = ?
    `).run(approved ? 1 : 0, now, id);

    // Log audit event
    await logAuditEvent({
      event_type: approved ? 'TEMPLATE_APPROVED' : 'TEMPLATE_UNAPPROVED',
      user_id: req.user!.id,
      firm_id: req.user!.firm_id,
      resource_type: 'template',
      resource_id: id,
      details: {},
      ip_address: req.ip || req.socket.remoteAddress,
    });

    res.json({
      id,
      is_approved: approved ? true : false,
      updated_at: now,
      message: approved ? 'Template approved successfully' : 'Template unapproved successfully',
    });
  } catch (err) {
    console.error('Approve template error:', err);
    res.status(500).json({ error: 'Failed to update template approval status' });
  }
});

// Duplicate template
router.post('/:id/duplicate', authenticate, requireDocumentEditor, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name } = req.body;
    const db = getDatabase();

    // Get source template
    const source = db.prepare(`
      SELECT * FROM templates WHERE id = ? AND firm_id = ?
    `).get(id, req.user!.firm_id) as Template | undefined;

    if (!source) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    // Generate new name if not provided
    let newName = name?.trim() || `${source.name} (Copy)`;

    // Ensure unique name
    let counter = 1;
    let baseName = newName;
    while (true) {
      const existing = db.prepare(`
        SELECT id FROM templates WHERE firm_id = ? AND name = ?
      `).get(req.user!.firm_id, newName) as { id: string } | undefined;

      if (!existing) break;

      newName = `${baseName} (${counter})`;
      counter++;

      if (counter > 100) {
        res.status(400).json({ error: 'Could not generate unique template name' });
        return;
      }
    }

    const newId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO templates (id, firm_id, created_by, name, description, content, placeholders, category, is_shared, is_approved, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId,
      req.user!.firm_id,
      req.user!.id,
      newName,
      source.description,
      source.content,
      source.placeholders,
      source.category,
      0, // Duplicates are not shared by default
      0, // Duplicates are not approved by default
      now,
      now
    );

    // Log audit event
    await logAuditEvent({
      event_type: 'TEMPLATE_DUPLICATED',
      user_id: req.user!.id,
      firm_id: req.user!.firm_id,
      resource_type: 'template',
      resource_id: newId,
      details: {
        source_template_id: id,
        source_template_name: source.name,
        new_name: newName,
      },
      ip_address: req.ip || req.socket.remoteAddress,
    });

    // Get creator info for response
    const creator = db.prepare(`
      SELECT id, first_name, last_name, email FROM users WHERE id = ?
    `).get(req.user!.id) as Pick<User, 'id' | 'first_name' | 'last_name' | 'email'>;

    res.status(201).json({
      id: newId,
      firm_id: req.user!.firm_id,
      created_by: req.user!.id,
      name: newName,
      description: source.description,
      content: source.content,
      placeholders: source.placeholders ? JSON.parse(source.placeholders) : [],
      category: source.category,
      is_shared: false,
      is_approved: false,
      creator: {
        id: creator.id,
        name: `${creator.first_name} ${creator.last_name}`,
        email: creator.email,
      },
      created_at: now,
      updated_at: now,
      message: 'Template duplicated successfully',
    });
  } catch (err) {
    console.error('Duplicate template error:', err);
    res.status(500).json({ error: 'Failed to duplicate template' });
  }
});

// Preview template with placeholder values
router.post('/:id/preview', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { values } = req.body;
    const db = getDatabase();

    const template = db.prepare(`
      SELECT content, placeholders FROM templates WHERE id = ? AND firm_id = ?
    `).get(id, req.user!.firm_id) as Pick<Template, 'content' | 'placeholders'> | undefined;

    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const placeholders = template.placeholders ? JSON.parse(template.placeholders) as string[] : [];
    const providedValues = values || {};

    // Replace placeholders with provided values
    let preview = template.content;
    const missingPlaceholders: string[] = [];

    for (const placeholder of placeholders) {
      const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
      if (providedValues[placeholder] !== undefined) {
        preview = preview.replace(regex, String(providedValues[placeholder]));
      } else {
        missingPlaceholders.push(placeholder);
      }
    }

    res.json({
      preview,
      placeholders,
      provided: Object.keys(providedValues),
      missing: missingPlaceholders,
    });
  } catch (err) {
    console.error('Preview template error:', err);
    res.status(500).json({ error: 'Failed to preview template' });
  }
});

// Delete template
router.delete('/:id', authenticate, requireDocumentEditor, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const db = getDatabase();

    const existing = db.prepare(`
      SELECT * FROM templates WHERE id = ? AND firm_id = ?
    `).get(id, req.user!.firm_id) as Template | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    // Only creator or admin can delete
    const isAdmin = req.user!.role === 'admin';
    if (existing.created_by !== req.user!.id && !isAdmin) {
      res.status(403).json({ error: 'Only the template creator or an admin can delete this template' });
      return;
    }

    // Check if template is in use
    const usageCount = db.prepare(`
      SELECT COUNT(*) as count FROM demand_letters WHERE template_id = ?
    `).get(id) as { count: number };

    if (usageCount.count > 0) {
      // Don't delete, just mark as not shared/approved so it's hidden from library
      // but still referenced by existing demand letters
      res.status(400).json({
        error: 'Template is in use by demand letters and cannot be deleted',
        usage_count: usageCount.count,
        suggestion: 'Consider archiving the template by setting is_shared to false instead'
      });
      return;
    }

    // Delete template
    db.prepare('DELETE FROM templates WHERE id = ?').run(id);

    // Log audit event
    await logAuditEvent({
      event_type: 'TEMPLATE_DELETED',
      user_id: req.user!.id,
      firm_id: req.user!.firm_id,
      resource_type: 'template',
      resource_id: id,
      details: {
        name: existing.name,
        category: existing.category,
      },
      ip_address: req.ip || req.socket.remoteAddress,
    });

    res.json({ message: 'Template deleted successfully' });
  } catch (err) {
    console.error('Delete template error:', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Get available categories
router.get('/meta/categories', authenticate, async (req: AuthRequest, res: Response) => {
  res.json({ categories: TEMPLATE_CATEGORIES });
});

export default router;
