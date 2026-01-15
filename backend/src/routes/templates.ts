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

// Get template analytics for the firm
router.get('/meta/analytics', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const firmId = req.user!.firm_id;

    // Get overall template statistics
    const totalStats = db.prepare(`
      SELECT
        COUNT(*) as total_templates,
        SUM(CASE WHEN is_shared = 1 THEN 1 ELSE 0 END) as shared_templates,
        SUM(CASE WHEN is_approved = 1 THEN 1 ELSE 0 END) as approved_templates
      FROM templates
      WHERE firm_id = ?
    `).get(firmId) as {
      total_templates: number;
      shared_templates: number;
      approved_templates: number;
    };

    // Get category breakdown
    const categoryBreakdown = db.prepare(`
      SELECT
        COALESCE(category, 'Uncategorized') as category,
        COUNT(*) as count
      FROM templates
      WHERE firm_id = ?
      GROUP BY category
      ORDER BY count DESC
    `).all(firmId) as Array<{ category: string; count: number }>;

    // Get top templates by usage (demand letters created)
    const topTemplates = db.prepare(`
      SELECT
        t.id,
        t.name,
        t.category,
        t.is_shared,
        t.is_approved,
        COUNT(dl.id) as usage_count,
        MAX(dl.created_at) as last_used_at,
        u.first_name || ' ' || u.last_name as creator_name
      FROM templates t
      LEFT JOIN demand_letters dl ON t.id = dl.template_id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.firm_id = ?
      GROUP BY t.id
      ORDER BY usage_count DESC, t.updated_at DESC
      LIMIT 10
    `).all(firmId) as Array<{
      id: string;
      name: string;
      category: string | null;
      is_shared: number;
      is_approved: number;
      usage_count: number;
      last_used_at: string | null;
      creator_name: string;
    }>;

    // Get recent template activity (created/updated in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentActivity = db.prepare(`
      SELECT
        COUNT(CASE WHEN created_at >= ? THEN 1 END) as templates_created,
        COUNT(CASE WHEN updated_at >= ? AND created_at < ? THEN 1 END) as templates_updated
      FROM templates
      WHERE firm_id = ?
    `).get(
      thirtyDaysAgo.toISOString(),
      thirtyDaysAgo.toISOString(),
      thirtyDaysAgo.toISOString(),
      firmId
    ) as { templates_created: number; templates_updated: number };

    // Get usage statistics (total demand letters generated with templates)
    const usageStats = db.prepare(`
      SELECT
        COUNT(*) as total_demand_letters,
        COUNT(template_id) as with_template,
        COUNT(DISTINCT template_id) as unique_templates_used
      FROM demand_letters
      WHERE firm_id = ?
    `).get(firmId) as {
      total_demand_letters: number;
      with_template: number;
      unique_templates_used: number;
    };

    // Get templates by creator
    const templatesByCreator = db.prepare(`
      SELECT
        u.id as user_id,
        u.first_name || ' ' || u.last_name as name,
        u.role,
        COUNT(t.id) as template_count,
        SUM(CASE WHEN t.is_shared = 1 THEN 1 ELSE 0 END) as shared_count
      FROM users u
      LEFT JOIN templates t ON u.id = t.created_by AND t.firm_id = ?
      WHERE u.firm_id = ?
      GROUP BY u.id
      HAVING template_count > 0
      ORDER BY template_count DESC
      LIMIT 10
    `).all(firmId, firmId) as Array<{
      user_id: string;
      name: string;
      role: string;
      template_count: number;
      shared_count: number;
    }>;

    res.json({
      summary: {
        total_templates: totalStats.total_templates || 0,
        shared_templates: totalStats.shared_templates || 0,
        approved_templates: totalStats.approved_templates || 0,
        private_templates: (totalStats.total_templates || 0) - (totalStats.shared_templates || 0),
      },
      category_breakdown: categoryBreakdown,
      top_templates: topTemplates.map(t => ({
        id: t.id,
        name: t.name,
        category: t.category,
        is_shared: t.is_shared === 1,
        is_approved: t.is_approved === 1,
        usage_count: t.usage_count,
        last_used_at: t.last_used_at,
        creator_name: t.creator_name,
      })),
      recent_activity: {
        templates_created_last_30_days: recentActivity.templates_created || 0,
        templates_updated_last_30_days: recentActivity.templates_updated || 0,
      },
      usage_statistics: {
        total_demand_letters: usageStats.total_demand_letters || 0,
        demand_letters_with_template: usageStats.with_template || 0,
        template_adoption_rate: usageStats.total_demand_letters > 0
          ? Math.round((usageStats.with_template / usageStats.total_demand_letters) * 100)
          : 0,
        unique_templates_used: usageStats.unique_templates_used || 0,
      },
      templates_by_creator: templatesByCreator,
    });
  } catch (err) {
    console.error('Get template analytics error:', err);
    res.status(500).json({ error: 'Failed to get template analytics' });
  }
});

// Seed default templates for a firm (admin only)
router.post('/meta/seed-defaults', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Only admins can seed default templates' });
      return;
    }

    const db = getDatabase();
    const firmId = req.user!.firm_id;
    const userId = req.user!.id;
    const now = new Date().toISOString();

    // Default starter templates for common demand letter types
    const defaultTemplates = [
      {
        name: 'Personal Injury - General',
        description: 'Standard demand letter template for personal injury cases',
        category: 'Personal Injury',
        content: `{{current_date}}

{{recipient_name}}
{{recipient_address}}

Re: {{client_name}} - Personal Injury Claim
    Claim/Case Reference: {{case_reference}}
    Date of Incident: {{incident_date}}

Dear {{recipient_name}}:

This office represents {{client_name}} in connection with injuries sustained on {{incident_date}}.

STATEMENT OF FACTS

On {{incident_date}}, our client {{client_name}} was injured due to the negligence of your insured/client. The incident occurred at {{incident_location}}.

{{incident_description}}

LIABILITY

{{liability_statement}}

DAMAGES

As a result of this incident, our client has suffered the following damages:

Medical Expenses: {{medical_expenses}}
Lost Wages: {{lost_wages}}
Pain and Suffering: {{pain_and_suffering}}
Other Damages: {{other_damages}}

DEMAND

Based on the foregoing, we hereby demand the sum of {{demand_amount}} to settle all claims arising from this incident.

This offer remains open for {{response_deadline_days}} days from the date of this letter. If we do not receive a satisfactory response within this time period, we will have no alternative but to pursue all available legal remedies.

Please direct all communications to this office.

Sincerely,

{{attorney_name}}
{{firm_name}}
{{firm_address}}
{{firm_phone}}`,
        placeholders: JSON.stringify([
          'current_date', 'recipient_name', 'recipient_address', 'client_name',
          'case_reference', 'incident_date', 'incident_location', 'incident_description',
          'liability_statement', 'medical_expenses', 'lost_wages', 'pain_and_suffering',
          'other_damages', 'demand_amount', 'response_deadline_days', 'attorney_name',
          'firm_name', 'firm_address', 'firm_phone'
        ]),
      },
      {
        name: 'Auto Accident - Standard',
        description: 'Demand letter template for motor vehicle accident claims',
        category: 'Auto Accident',
        content: `{{current_date}}

{{insurance_company}}
{{adjuster_name}}
{{insurance_address}}

Re: Claimant: {{client_name}}
    Your Insured: {{insured_name}}
    Claim Number: {{claim_number}}
    Date of Loss: {{incident_date}}

Dear {{adjuster_name}}:

This office represents {{client_name}} in connection with injuries and damages sustained in a motor vehicle accident that occurred on {{incident_date}}.

FACTS OF THE ACCIDENT

On {{incident_date}}, at approximately {{incident_time}}, our client was operating their {{client_vehicle}} when your insured, {{insured_name}}, driving a {{insured_vehicle}}, {{accident_description}}.

The accident occurred at/near {{accident_location}}. A police report was filed (Report No. {{police_report_number}}).

LIABILITY

Your insured is clearly liable for this accident. {{liability_explanation}}

INJURIES AND TREATMENT

As a direct result of this collision, our client sustained the following injuries:

{{injuries_list}}

Our client received treatment at the following medical providers:

{{treatment_summary}}

MEDICAL EXPENSES

Total Medical Expenses: {{total_medical_expenses}}

Itemized as follows:
{{medical_expenses_itemized}}

LOST WAGES

Our client was unable to work from {{lost_wages_period}}. Total lost wages: {{lost_wages_amount}}

PROPERTY DAMAGE

{{property_damage_description}}
Property Damage Total: {{property_damage_amount}}

DEMAND

In light of the foregoing, we demand the total sum of {{demand_amount}} to fully and finally settle this claim, broken down as follows:

Medical Expenses: {{total_medical_expenses}}
Lost Wages: {{lost_wages_amount}}
Property Damage: {{property_damage_amount}}
Pain and Suffering: {{pain_and_suffering_amount}}

Please respond to this demand within {{response_deadline_days}} days.

Sincerely,

{{attorney_name}}
{{firm_name}}`,
        placeholders: JSON.stringify([
          'current_date', 'insurance_company', 'adjuster_name', 'insurance_address',
          'client_name', 'insured_name', 'claim_number', 'incident_date', 'incident_time',
          'client_vehicle', 'insured_vehicle', 'accident_description', 'accident_location',
          'police_report_number', 'liability_explanation', 'injuries_list', 'treatment_summary',
          'total_medical_expenses', 'medical_expenses_itemized', 'lost_wages_period',
          'lost_wages_amount', 'property_damage_description', 'property_damage_amount',
          'demand_amount', 'pain_and_suffering_amount', 'response_deadline_days',
          'attorney_name', 'firm_name'
        ]),
      },
      {
        name: 'Medical Malpractice - Initial',
        description: 'Initial demand letter template for medical malpractice cases',
        category: 'Medical Malpractice',
        content: `{{current_date}}

VIA CERTIFIED MAIL - RETURN RECEIPT REQUESTED

{{defendant_name}}
{{defendant_address}}

{{insurance_company}}
{{insurance_address}}

Re: {{client_name}} v. {{defendant_name}}
    Medical Malpractice Claim
    Date(s) of Treatment: {{treatment_dates}}

Dear Sir/Madam:

This firm represents {{client_name}} in connection with medical malpractice occurring during treatment provided by {{defendant_name}} on or about {{treatment_dates}}.

FACTUAL BACKGROUND

{{factual_background}}

STANDARD OF CARE VIOLATIONS

The applicable standard of care required:

{{standard_of_care}}

{{defendant_name}} deviated from the standard of care by:

{{deviations_from_standard}}

CAUSATION AND DAMAGES

As a direct and proximate result of these deviations from the standard of care, {{client_name}} suffered:

{{injuries_and_damages}}

DAMAGES SUMMARY

Past Medical Expenses: {{past_medical_expenses}}
Future Medical Expenses: {{future_medical_expenses}}
Past Lost Earnings: {{past_lost_earnings}}
Future Lost Earning Capacity: {{future_lost_earnings}}
Pain and Suffering: {{pain_and_suffering}}
Loss of Consortium: {{loss_of_consortium}}

DEMAND

Based on the foregoing, we demand the sum of {{demand_amount}} to resolve all claims.

This demand will remain open for {{response_deadline_days}} days. Please be advised that a complaint will be filed if this matter is not resolved within this timeframe.

Very truly yours,

{{attorney_name}}
{{firm_name}}
{{firm_address}}`,
        placeholders: JSON.stringify([
          'current_date', 'defendant_name', 'defendant_address', 'insurance_company',
          'insurance_address', 'client_name', 'treatment_dates', 'factual_background',
          'standard_of_care', 'deviations_from_standard', 'injuries_and_damages',
          'past_medical_expenses', 'future_medical_expenses', 'past_lost_earnings',
          'future_lost_earnings', 'pain_and_suffering', 'loss_of_consortium',
          'demand_amount', 'response_deadline_days', 'attorney_name', 'firm_name',
          'firm_address'
        ]),
      },
      {
        name: 'Slip and Fall - Premises Liability',
        description: 'Demand letter template for slip and fall / premises liability cases',
        category: 'Slip and Fall',
        content: `{{current_date}}

{{property_owner_name}}
{{property_owner_address}}

{{insurance_company}}
{{insurance_address}}

Re: {{client_name}} - Premises Liability Claim
    Property Address: {{property_address}}
    Date of Incident: {{incident_date}}
    Claim Number: {{claim_number}}

Dear Sir/Madam:

This firm represents {{client_name}} regarding injuries sustained on {{incident_date}} at the premises located at {{property_address}}.

THE INCIDENT

On {{incident_date}}, our client {{client_name}} was lawfully present at the above-referenced property when {{incident_description}}.

{{detailed_incident_narrative}}

NOTICE AND DANGEROUS CONDITION

{{notice_and_dangerous_condition}}

The property owner/manager knew or should have known of this dangerous condition because:

{{knowledge_of_condition}}

LIABILITY

Under the laws of this state, property owners owe a duty to maintain their premises in a reasonably safe condition. The owner/occupier breached this duty by:

{{breach_of_duty}}

INJURIES AND TREATMENT

As a direct result of this incident, our client sustained:

{{injuries_sustained}}

Treatment received:

{{treatment_received}}

DAMAGES

Medical Expenses to Date: {{medical_expenses}}
Future Medical Expenses (Estimated): {{future_medical_expenses}}
Lost Wages: {{lost_wages}}
Pain and Suffering: {{pain_and_suffering}}

DEMAND

We hereby demand {{demand_amount}} to settle this claim.

Please respond within {{response_deadline_days}} days.

Sincerely,

{{attorney_name}}
{{firm_name}}`,
        placeholders: JSON.stringify([
          'current_date', 'property_owner_name', 'property_owner_address',
          'insurance_company', 'insurance_address', 'client_name', 'property_address',
          'incident_date', 'claim_number', 'incident_description', 'detailed_incident_narrative',
          'notice_and_dangerous_condition', 'knowledge_of_condition', 'breach_of_duty',
          'injuries_sustained', 'treatment_received', 'medical_expenses',
          'future_medical_expenses', 'lost_wages', 'pain_and_suffering',
          'demand_amount', 'response_deadline_days', 'attorney_name', 'firm_name'
        ]),
      },
      {
        name: 'Workers Compensation - Third Party',
        description: 'Demand letter template for third-party workers compensation claims',
        category: 'Workers Compensation',
        content: `{{current_date}}

{{defendant_name}}
{{defendant_address}}

Re: {{client_name}} - Third Party Workers' Compensation Claim
    Date of Injury: {{injury_date}}
    Location: {{injury_location}}

Dear Sir/Madam:

This firm represents {{client_name}} in connection with injuries sustained on {{injury_date}} while working at {{injury_location}}.

BACKGROUND

Our client was employed by {{employer_name}} and was performing their job duties when they were injured due to the negligence of {{defendant_name}}.

FACTS OF THE INCIDENT

{{incident_facts}}

THIRD PARTY LIABILITY

While workers' compensation provides no-fault coverage for workplace injuries, third parties who cause or contribute to workplace injuries may be held liable. {{defendant_name}} is liable because:

{{liability_basis}}

INJURIES AND TREATMENT

{{injuries_and_treatment}}

DAMAGES

Workers' Compensation Benefits Paid: {{wc_benefits_paid}}
(Note: {{employer_name}}'s workers' compensation carrier has a lien on any recovery)

Additional Medical Expenses: {{additional_medical}}
Lost Wages Beyond WC: {{additional_lost_wages}}
Pain and Suffering: {{pain_and_suffering}}
Permanent Impairment: {{permanent_impairment}}

DEMAND

We demand {{demand_amount}} to resolve this third-party claim. Please note that any settlement will be subject to the workers' compensation lien of {{wc_lien_amount}}.

Please respond within {{response_deadline_days}} days.

Sincerely,

{{attorney_name}}
{{firm_name}}`,
        placeholders: JSON.stringify([
          'current_date', 'defendant_name', 'defendant_address', 'client_name',
          'injury_date', 'injury_location', 'employer_name', 'incident_facts',
          'liability_basis', 'injuries_and_treatment', 'wc_benefits_paid',
          'additional_medical', 'additional_lost_wages', 'pain_and_suffering',
          'permanent_impairment', 'demand_amount', 'wc_lien_amount',
          'response_deadline_days', 'attorney_name', 'firm_name'
        ]),
      },
      {
        name: 'Product Liability - Defective Product',
        description: 'Demand letter template for defective product claims',
        category: 'Product Liability',
        content: `{{current_date}}

{{manufacturer_name}}
{{manufacturer_address}}

{{retailer_name}}
{{retailer_address}}

Re: {{client_name}} - Product Liability Claim
    Product: {{product_name}}
    Model/Serial Number: {{product_identifier}}
    Date of Incident: {{incident_date}}

Dear Sir/Madam:

This firm represents {{client_name}} in connection with injuries caused by a defective {{product_name}} on {{incident_date}}.

THE PRODUCT AND DEFECT

{{product_description}}

The product was defective because:

{{defect_description}}

THE INCIDENT

On {{incident_date}}, our client was using the {{product_name}} in a normal and foreseeable manner when:

{{incident_description}}

THEORIES OF LIABILITY

1. Design Defect: {{design_defect_theory}}

2. Manufacturing Defect: {{manufacturing_defect_theory}}

3. Failure to Warn: {{failure_to_warn_theory}}

INJURIES AND DAMAGES

{{injuries_description}}

Medical Expenses: {{medical_expenses}}
Lost Wages: {{lost_wages}}
Pain and Suffering: {{pain_and_suffering}}
Property Damage: {{property_damage}}
Future Damages: {{future_damages}}

DEMAND

Based on the foregoing, we demand {{demand_amount}} to settle all claims against all potentially liable parties.

This demand is made jointly and severally to the manufacturer, distributor, and retailer.

Please respond within {{response_deadline_days}} days.

Sincerely,

{{attorney_name}}
{{firm_name}}`,
        placeholders: JSON.stringify([
          'current_date', 'manufacturer_name', 'manufacturer_address', 'retailer_name',
          'retailer_address', 'client_name', 'product_name', 'product_identifier',
          'incident_date', 'product_description', 'defect_description', 'incident_description',
          'design_defect_theory', 'manufacturing_defect_theory', 'failure_to_warn_theory',
          'injuries_description', 'medical_expenses', 'lost_wages', 'pain_and_suffering',
          'property_damage', 'future_damages', 'demand_amount', 'response_deadline_days',
          'attorney_name', 'firm_name'
        ]),
      },
    ];

    // Check how many default templates already exist
    const existingDefaults = db.prepare(`
      SELECT name FROM templates
      WHERE firm_id = ? AND name LIKE '%- General' OR name LIKE '%- Standard' OR name LIKE '%- Initial' OR name LIKE '%Premises Liability' OR name LIKE '%Third Party' OR name LIKE '%Defective Product'
    `).all(firmId) as Array<{ name: string }>;

    const existingNames = new Set(existingDefaults.map(t => t.name));
    const templatesCreated: string[] = [];
    const templatesSkipped: string[] = [];

    for (const template of defaultTemplates) {
      // Skip if a template with similar name already exists
      if (existingNames.has(template.name)) {
        templatesSkipped.push(template.name);
        continue;
      }

      // Check for exact name collision
      const collision = db.prepare(`
        SELECT id FROM templates WHERE firm_id = ? AND name = ?
      `).get(firmId, template.name);

      if (collision) {
        templatesSkipped.push(template.name);
        continue;
      }

      const templateId = uuidv4();

      db.prepare(`
        INSERT INTO templates (id, firm_id, created_by, name, description, content, placeholders, category, is_shared, is_approved, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        templateId,
        firmId,
        userId,
        template.name,
        template.description,
        template.content,
        template.placeholders,
        template.category,
        1, // Shared with firm
        1, // Pre-approved
        now,
        now
      );

      templatesCreated.push(template.name);

      // Log audit event
      await logAuditEvent({
        event_type: 'TEMPLATE_CREATED',
        user_id: userId,
        firm_id: firmId,
        resource_type: 'template',
        resource_id: templateId,
        details: {
          name: template.name,
          category: template.category,
          is_default_template: true,
        },
        ip_address: req.ip || req.socket.remoteAddress,
      });
    }

    res.status(201).json({
      message: 'Default templates seeded successfully',
      templates_created: templatesCreated,
      templates_skipped: templatesSkipped,
      total_created: templatesCreated.length,
      total_skipped: templatesSkipped.length,
    });
  } catch (err) {
    console.error('Seed default templates error:', err);
    res.status(500).json({ error: 'Failed to seed default templates' });
  }
});

export default router;
