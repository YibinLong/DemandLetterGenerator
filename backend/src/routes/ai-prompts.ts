// AI Prompt Template management routes
import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { getDatabase } from '../db/index.js';
import { AIPromptTemplate, AIPromptTemplateVersion, User } from '../db/schema.js';
import { authenticate, AuthRequest, requireDocumentEditor } from '../middleware/auth.js';
import { logAuditEvent } from '../services/audit.js';

const router = Router();

// AI Service URL for testing prompts
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// Prompt types and categories
const PROMPT_TYPES = ['refinement', 'generation', 'analysis'] as const;
const PROMPT_CATEGORIES = [
  'Tone & Style',
  'Content Enhancement',
  'Legal Specific',
  'Formatting',
  'Summarization',
  'Custom',
] as const;

// Variable definition interface
interface PromptVariable {
  name: string;
  description: string;
  required: boolean;
  default_value?: string;
}

// Extract variables from prompt templates using {{variable}} syntax
const extractVariables = (systemPrompt: string, userPromptTemplate: string): string[] => {
  const regex = /\{\{([^}]+)\}\}/g;
  const variables: Set<string> = new Set();

  let match;
  while ((match = regex.exec(systemPrompt)) !== null) {
    variables.add(match[1].trim());
  }
  while ((match = regex.exec(userPromptTemplate)) !== null) {
    variables.add(match[1].trim());
  }

  return Array.from(variables);
};

// Validate variable names
const validateVariables = (variables: string[]): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const validPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

  for (const variable of variables) {
    if (!validPattern.test(variable)) {
      errors.push(`Invalid variable name "${variable}". Must start with a letter or underscore and contain only alphanumeric characters and underscores.`);
    }
  }

  return { valid: errors.length === 0, errors };
};

// Create new AI prompt template
router.post('/', authenticate, requireDocumentEditor, async (req: AuthRequest, res: Response) => {
  try {
    const {
      name,
      description,
      prompt_type,
      system_prompt,
      user_prompt_template,
      variables,
      category,
      is_shared,
    } = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Prompt template name is required' });
      return;
    }

    if (!prompt_type || !PROMPT_TYPES.includes(prompt_type)) {
      res.status(400).json({
        error: 'Invalid prompt type',
        valid_types: PROMPT_TYPES,
      });
      return;
    }

    if (!system_prompt || typeof system_prompt !== 'string' || system_prompt.trim().length === 0) {
      res.status(400).json({ error: 'System prompt is required' });
      return;
    }

    if (!user_prompt_template || typeof user_prompt_template !== 'string' || user_prompt_template.trim().length === 0) {
      res.status(400).json({ error: 'User prompt template is required' });
      return;
    }

    // Validate name length
    if (name.length > 200) {
      res.status(400).json({ error: 'Prompt template name must be 200 characters or less' });
      return;
    }

    // Validate category if provided
    if (category && !PROMPT_CATEGORIES.includes(category)) {
      res.status(400).json({
        error: 'Invalid category',
        valid_categories: PROMPT_CATEGORIES,
      });
      return;
    }

    // Extract and validate variables
    const extractedVariables = extractVariables(system_prompt, user_prompt_template);
    const validation = validateVariables(extractedVariables);
    if (!validation.valid) {
      res.status(400).json({
        error: 'Invalid variables in prompt template',
        details: validation.errors,
      });
      return;
    }

    // Merge extracted variables with user-provided variable definitions
    const variableDefinitions: PromptVariable[] = variables || [];
    const extractedSet = new Set(extractedVariables);

    // Add any new extracted variables not in user definitions
    for (const varName of extractedVariables) {
      if (!variableDefinitions.find(v => v.name === varName)) {
        variableDefinitions.push({
          name: varName,
          description: '',
          required: true,
        });
      }
    }

    // Remove any variable definitions not in extracted set
    const finalVariables = variableDefinitions.filter(v => extractedSet.has(v.name));

    const db = getDatabase();
    const promptId = uuidv4();
    const now = new Date().toISOString();

    // Check for duplicate name within firm
    const existing = db.prepare(`
      SELECT id FROM ai_prompt_templates WHERE firm_id = ? AND name = ?
    `).get(req.user!.firm_id, name.trim()) as { id: string } | undefined;

    if (existing) {
      res.status(409).json({ error: 'A prompt template with this name already exists in your firm' });
      return;
    }

    // Insert prompt template
    db.prepare(`
      INSERT INTO ai_prompt_templates (
        id, firm_id, created_by, name, description, prompt_type,
        system_prompt, user_prompt_template, variables, category,
        is_shared, is_approved, is_default, usage_count, current_version,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      promptId,
      req.user!.firm_id,
      req.user!.id,
      name.trim(),
      description?.trim() || null,
      prompt_type,
      system_prompt,
      user_prompt_template,
      JSON.stringify(finalVariables),
      category || null,
      is_shared ? 1 : 0,
      0, // New templates are not approved by default
      0, // Not a default template
      0, // Usage count starts at 0
      1, // Version 1
      now,
      now
    );

    // Create initial version record
    const versionId = uuidv4();
    db.prepare(`
      INSERT INTO ai_prompt_template_versions (
        id, prompt_template_id, version_number, system_prompt,
        user_prompt_template, variables, changed_by, change_summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      versionId,
      promptId,
      1,
      system_prompt,
      user_prompt_template,
      JSON.stringify(finalVariables),
      req.user!.id,
      'Initial version',
      now
    );

    // Log audit event
    await logAuditEvent({
      event_type: 'AI_PROMPT_TEMPLATE_CREATED',
      user_id: req.user!.id,
      firm_id: req.user!.firm_id,
      resource_type: 'ai_prompt_template',
      resource_id: promptId,
      details: {
        name: name.trim(),
        prompt_type,
        category,
        variable_count: finalVariables.length,
        is_shared: is_shared ? true : false,
      },
      ip_address: req.ip || req.socket.remoteAddress,
    });

    // Get creator info for response
    const creator = db.prepare(`
      SELECT id, first_name, last_name, email FROM users WHERE id = ?
    `).get(req.user!.id) as Pick<User, 'id' | 'first_name' | 'last_name' | 'email'>;

    res.status(201).json({
      id: promptId,
      firm_id: req.user!.firm_id,
      created_by: req.user!.id,
      name: name.trim(),
      description: description?.trim() || null,
      prompt_type,
      system_prompt,
      user_prompt_template,
      variables: finalVariables,
      category: category || null,
      is_shared: is_shared ? true : false,
      is_approved: false,
      is_default: false,
      usage_count: 0,
      current_version: 1,
      creator: {
        id: creator.id,
        name: `${creator.first_name} ${creator.last_name}`,
        email: creator.email,
      },
      created_at: now,
      updated_at: now,
      message: 'AI prompt template created successfully',
    });
  } catch (err) {
    console.error('Create AI prompt template error:', err);
    res.status(500).json({ error: 'Failed to create AI prompt template' });
  }
});

// List AI prompt templates
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const {
      prompt_type,
      category,
      search,
      is_shared,
      is_approved,
      include_defaults,
      created_by,
      limit = '50',
      offset = '0',
    } = req.query;

    const conditions: string[] = ['p.firm_id = ?'];
    const params: (string | number)[] = [req.user!.firm_id];

    // Include default prompts if requested
    if (include_defaults === 'true') {
      conditions[0] = '(p.firm_id = ? OR p.is_default = 1)';
    }

    if (prompt_type && PROMPT_TYPES.includes(prompt_type as typeof PROMPT_TYPES[number])) {
      conditions.push('p.prompt_type = ?');
      params.push(String(prompt_type));
    }

    if (category && PROMPT_CATEGORIES.includes(category as typeof PROMPT_CATEGORIES[number])) {
      conditions.push('p.category = ?');
      params.push(String(category));
    }

    if (search) {
      conditions.push('(p.name LIKE ? OR p.description LIKE ?)');
      const searchTerm = `%${String(search)}%`;
      params.push(searchTerm, searchTerm);
    }

    if (is_shared !== undefined) {
      conditions.push('p.is_shared = ?');
      params.push(is_shared === 'true' || is_shared === '1' ? 1 : 0);
    }

    if (is_approved !== undefined) {
      conditions.push('p.is_approved = ?');
      params.push(is_approved === 'true' || is_approved === '1' ? 1 : 0);
    }

    if (created_by) {
      conditions.push('p.created_by = ?');
      params.push(String(created_by));
    }

    const whereClause = conditions.join(' AND ');
    params.push(Number(limit), Number(offset));

    const prompts = db.prepare(`
      SELECT
        p.id,
        p.firm_id,
        p.created_by,
        p.name,
        p.description,
        p.prompt_type,
        p.variables,
        p.category,
        p.is_shared,
        p.is_approved,
        p.is_default,
        p.usage_count,
        p.current_version,
        p.created_at,
        p.updated_at,
        u.first_name || ' ' || u.last_name as creator_name,
        u.email as creator_email
      FROM ai_prompt_templates p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE ${whereClause}
      ORDER BY p.is_default DESC, p.usage_count DESC, p.updated_at DESC
      LIMIT ? OFFSET ?
    `).all(...params) as Array<{
      id: string;
      firm_id: string;
      created_by: string;
      name: string;
      description: string | null;
      prompt_type: string;
      variables: string | null;
      category: string | null;
      is_shared: number;
      is_approved: number;
      is_default: number;
      usage_count: number;
      current_version: number;
      created_at: string;
      updated_at: string;
      creator_name: string;
      creator_email: string;
    }>;

    // Get total count
    const countParams = params.slice(0, -2);
    const countResult = db.prepare(`
      SELECT COUNT(*) as count FROM ai_prompt_templates p WHERE ${whereClause}
    `).get(...countParams) as { count: number };

    // Transform response
    const transformedPrompts = prompts.map(p => ({
      id: p.id,
      firm_id: p.firm_id,
      created_by: p.created_by,
      name: p.name,
      description: p.description,
      prompt_type: p.prompt_type,
      variables: p.variables ? JSON.parse(p.variables) : [],
      category: p.category,
      is_shared: p.is_shared === 1,
      is_approved: p.is_approved === 1,
      is_default: p.is_default === 1,
      usage_count: p.usage_count,
      current_version: p.current_version,
      creator: {
        id: p.created_by,
        name: p.creator_name,
        email: p.creator_email,
      },
      created_at: p.created_at,
      updated_at: p.updated_at,
    }));

    res.json({
      prompts: transformedPrompts,
      total: countResult.count,
      limit: Number(limit),
      offset: Number(offset),
      prompt_types: PROMPT_TYPES,
      categories: PROMPT_CATEGORIES,
    });
  } catch (err) {
    console.error('List AI prompt templates error:', err);
    res.status(500).json({ error: 'Failed to list AI prompt templates' });
  }
});

// Get single AI prompt template with full content
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const db = getDatabase();

    const prompt = db.prepare(`
      SELECT
        p.*,
        u.first_name || ' ' || u.last_name as creator_name,
        u.email as creator_email
      FROM ai_prompt_templates p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = ? AND (p.firm_id = ? OR p.is_default = 1)
    `).get(id, req.user!.firm_id) as (AIPromptTemplate & {
      creator_name: string;
      creator_email: string;
    }) | undefined;

    if (!prompt) {
      res.status(404).json({ error: 'AI prompt template not found' });
      return;
    }

    res.json({
      id: prompt.id,
      firm_id: prompt.firm_id,
      created_by: prompt.created_by,
      name: prompt.name,
      description: prompt.description,
      prompt_type: prompt.prompt_type,
      system_prompt: prompt.system_prompt,
      user_prompt_template: prompt.user_prompt_template,
      variables: prompt.variables ? JSON.parse(prompt.variables) : [],
      category: prompt.category,
      is_shared: prompt.is_shared === 1,
      is_approved: prompt.is_approved === 1,
      is_default: prompt.is_default === 1,
      usage_count: prompt.usage_count,
      current_version: prompt.current_version,
      creator: {
        id: prompt.created_by,
        name: prompt.creator_name,
        email: prompt.creator_email,
      },
      created_at: prompt.created_at,
      updated_at: prompt.updated_at,
    });
  } catch (err) {
    console.error('Get AI prompt template error:', err);
    res.status(500).json({ error: 'Failed to get AI prompt template' });
  }
});

// Update AI prompt template
router.patch('/:id', authenticate, requireDocumentEditor, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const {
      name,
      description,
      system_prompt,
      user_prompt_template,
      variables,
      category,
      is_shared,
    } = req.body;
    const db = getDatabase();

    // Check prompt exists and belongs to firm
    const existing = db.prepare(`
      SELECT * FROM ai_prompt_templates WHERE id = ? AND firm_id = ?
    `).get(id, req.user!.firm_id) as AIPromptTemplate | undefined;

    if (!existing) {
      res.status(404).json({ error: 'AI prompt template not found' });
      return;
    }

    // Cannot update default templates
    if (existing.is_default) {
      res.status(403).json({ error: 'Cannot modify default prompt templates. Duplicate it instead.' });
      return;
    }

    // Only creator or admin can update
    const isAdmin = req.user!.role === 'admin';
    if (existing.created_by !== req.user!.id && !isAdmin) {
      res.status(403).json({ error: 'Only the prompt creator or an admin can update this template' });
      return;
    }

    // Validate name if provided
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: 'Prompt template name cannot be empty' });
        return;
      }
      if (name.length > 200) {
        res.status(400).json({ error: 'Prompt template name must be 200 characters or less' });
        return;
      }
      // Check for duplicate name
      const duplicate = db.prepare(`
        SELECT id FROM ai_prompt_templates WHERE firm_id = ? AND name = ? AND id != ?
      `).get(req.user!.firm_id, name.trim(), id) as { id: string } | undefined;
      if (duplicate) {
        res.status(409).json({ error: 'A prompt template with this name already exists in your firm' });
        return;
      }
    }

    // Validate category if provided
    if (category !== undefined && category !== null && !PROMPT_CATEGORIES.includes(category)) {
      res.status(400).json({
        error: 'Invalid category',
        valid_categories: PROMPT_CATEGORIES,
      });
      return;
    }

    // Track if prompts changed for versioning
    let promptsChanged = false;
    let newSystemPrompt = existing.system_prompt;
    let newUserPromptTemplate = existing.user_prompt_template;
    let finalVariables = existing.variables ? JSON.parse(existing.variables) : [];

    if (system_prompt !== undefined || user_prompt_template !== undefined) {
      newSystemPrompt = system_prompt !== undefined ? system_prompt : existing.system_prompt;
      newUserPromptTemplate = user_prompt_template !== undefined ? user_prompt_template : existing.user_prompt_template;

      if (newSystemPrompt !== existing.system_prompt || newUserPromptTemplate !== existing.user_prompt_template) {
        promptsChanged = true;
      }

      // Extract and validate variables from new prompts
      const extractedVariables = extractVariables(newSystemPrompt, newUserPromptTemplate);
      const validation = validateVariables(extractedVariables);
      if (!validation.valid) {
        res.status(400).json({
          error: 'Invalid variables in prompt template',
          details: validation.errors,
        });
        return;
      }

      // Merge with provided variable definitions
      const variableDefinitions: PromptVariable[] = variables || finalVariables;
      const extractedSet = new Set(extractedVariables);

      for (const varName of extractedVariables) {
        if (!variableDefinitions.find((v: PromptVariable) => v.name === varName)) {
          variableDefinitions.push({
            name: varName,
            description: '',
            required: true,
          });
        }
      }

      finalVariables = variableDefinitions.filter((v: PromptVariable) => extractedSet.has(v.name));
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

    if (system_prompt !== undefined) {
      updates.push('system_prompt = ?');
      params.push(system_prompt);
    }

    if (user_prompt_template !== undefined) {
      updates.push('user_prompt_template = ?');
      params.push(user_prompt_template);
    }

    if (system_prompt !== undefined || user_prompt_template !== undefined || variables !== undefined) {
      updates.push('variables = ?');
      params.push(JSON.stringify(finalVariables));
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

    // Create new version if prompts changed
    if (promptsChanged) {
      const newVersionNumber = existing.current_version + 1;
      updates.push('current_version = ?');
      params.push(newVersionNumber);

      const versionId = uuidv4();
      db.prepare(`
        INSERT INTO ai_prompt_template_versions (
          id, prompt_template_id, version_number, system_prompt,
          user_prompt_template, variables, changed_by, change_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        versionId,
        id,
        newVersionNumber,
        newSystemPrompt,
        newUserPromptTemplate,
        JSON.stringify(finalVariables),
        req.user!.id,
        'Updated prompt content',
        new Date().toISOString()
      );
    }

    params.push(id);

    db.prepare(`
      UPDATE ai_prompt_templates SET ${updates.join(', ')} WHERE id = ?
    `).run(...params);

    // Log audit event
    await logAuditEvent({
      event_type: 'AI_PROMPT_TEMPLATE_UPDATED',
      user_id: req.user!.id,
      firm_id: req.user!.firm_id,
      resource_type: 'ai_prompt_template',
      resource_id: id,
      details: {
        updated_fields: Object.keys(req.body),
        prompts_changed: promptsChanged,
      },
      ip_address: req.ip || req.socket.remoteAddress,
    });

    // Get updated template
    const template = db.prepare(`
      SELECT
        p.*,
        u.first_name || ' ' || u.last_name as creator_name,
        u.email as creator_email
      FROM ai_prompt_templates p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = ?
    `).get(id) as (AIPromptTemplate & { creator_name: string; creator_email: string });

    res.json({
      id: template.id,
      firm_id: template.firm_id,
      created_by: template.created_by,
      name: template.name,
      description: template.description,
      prompt_type: template.prompt_type,
      system_prompt: template.system_prompt,
      user_prompt_template: template.user_prompt_template,
      variables: template.variables ? JSON.parse(template.variables) : [],
      category: template.category,
      is_shared: template.is_shared === 1,
      is_approved: template.is_approved === 1,
      is_default: template.is_default === 1,
      usage_count: template.usage_count,
      current_version: template.current_version,
      creator: {
        id: template.created_by,
        name: template.creator_name,
        email: template.creator_email,
      },
      created_at: template.created_at,
      updated_at: template.updated_at,
      message: 'AI prompt template updated successfully',
    });
  } catch (err) {
    console.error('Update AI prompt template error:', err);
    res.status(500).json({ error: 'Failed to update AI prompt template' });
  }
});

// Get version history for a prompt template
router.get('/:id/versions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const db = getDatabase();

    // Verify prompt exists and belongs to firm
    const prompt = db.prepare(`
      SELECT id FROM ai_prompt_templates WHERE id = ? AND (firm_id = ? OR is_default = 1)
    `).get(id, req.user!.firm_id) as { id: string } | undefined;

    if (!prompt) {
      res.status(404).json({ error: 'AI prompt template not found' });
      return;
    }

    const versions = db.prepare(`
      SELECT v.*, u.first_name, u.last_name, u.email
      FROM ai_prompt_template_versions v
      LEFT JOIN users u ON v.changed_by = u.id
      WHERE v.prompt_template_id = ?
      ORDER BY v.version_number DESC
    `).all(id) as (AIPromptTemplateVersion & { first_name: string; last_name: string; email: string })[];

    res.json({
      versions: versions.map(v => ({
        id: v.id,
        version_number: v.version_number,
        system_prompt: v.system_prompt,
        user_prompt_template: v.user_prompt_template,
        variables: v.variables ? JSON.parse(v.variables) : [],
        change_summary: v.change_summary,
        changed_by: {
          id: v.changed_by,
          name: `${v.first_name} ${v.last_name}`,
          email: v.email,
        },
        created_at: v.created_at,
      })),
      total: versions.length,
    });
  } catch (err) {
    console.error('Get prompt versions error:', err);
    res.status(500).json({ error: 'Failed to get prompt versions' });
  }
});

// Restore a specific version
router.post('/:id/versions/:versionId/restore', authenticate, requireDocumentEditor, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const versionId = req.params.versionId as string;
    const db = getDatabase();

    // Verify prompt exists and belongs to firm
    const prompt = db.prepare(`
      SELECT * FROM ai_prompt_templates WHERE id = ? AND firm_id = ?
    `).get(id, req.user!.firm_id) as AIPromptTemplate | undefined;

    if (!prompt) {
      res.status(404).json({ error: 'AI prompt template not found' });
      return;
    }

    // Cannot restore default templates
    if (prompt.is_default) {
      res.status(403).json({ error: 'Cannot modify default prompt templates' });
      return;
    }

    // Get version to restore
    const version = db.prepare(`
      SELECT * FROM ai_prompt_template_versions WHERE id = ? AND prompt_template_id = ?
    `).get(versionId, id) as AIPromptTemplateVersion | undefined;

    if (!version) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }

    const now = new Date().toISOString();
    const newVersionNumber = prompt.current_version + 1;

    // Update prompt with version content
    db.prepare(`
      UPDATE ai_prompt_templates SET
        system_prompt = ?,
        user_prompt_template = ?,
        variables = ?,
        current_version = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      version.system_prompt,
      version.user_prompt_template,
      version.variables,
      newVersionNumber,
      now,
      id
    );

    // Create new version record for the restore
    const newVersionId = uuidv4();
    db.prepare(`
      INSERT INTO ai_prompt_template_versions (
        id, prompt_template_id, version_number, system_prompt,
        user_prompt_template, variables, changed_by, change_summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newVersionId,
      id,
      newVersionNumber,
      version.system_prompt,
      version.user_prompt_template,
      version.variables,
      req.user!.id,
      `Restored from version ${version.version_number}`,
      now
    );

    // Log audit event
    await logAuditEvent({
      event_type: 'AI_PROMPT_TEMPLATE_UPDATED',
      user_id: req.user!.id,
      firm_id: req.user!.firm_id,
      resource_type: 'ai_prompt_template',
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
      current_version: newVersionNumber,
      restored_from: version.version_number,
      updated_at: now,
      message: 'Prompt template restored successfully',
    });
  } catch (err) {
    console.error('Restore prompt version error:', err);
    res.status(500).json({ error: 'Failed to restore prompt version' });
  }
});

// Test/preview a prompt template
router.post('/:id/test', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { variable_values, sample_content } = req.body;
    const db = getDatabase();

    const prompt = db.prepare(`
      SELECT * FROM ai_prompt_templates WHERE id = ? AND (firm_id = ? OR is_default = 1)
    `).get(id, req.user!.firm_id) as AIPromptTemplate | undefined;

    if (!prompt) {
      res.status(404).json({ error: 'AI prompt template not found' });
      return;
    }

    const variables: PromptVariable[] = prompt.variables ? JSON.parse(prompt.variables) : [];
    const providedValues = variable_values || {};

    // Replace variables in prompts
    let previewSystemPrompt = prompt.system_prompt;
    let previewUserPrompt = prompt.user_prompt_template;
    const missingVariables: string[] = [];
    const usedVariables: string[] = [];

    for (const variable of variables) {
      const regex = new RegExp(`\\{\\{${variable.name}\\}\\}`, 'g');

      if (providedValues[variable.name] !== undefined) {
        const value = String(providedValues[variable.name]);
        previewSystemPrompt = previewSystemPrompt.replace(regex, value);
        previewUserPrompt = previewUserPrompt.replace(regex, value);
        usedVariables.push(variable.name);
      } else if (variable.default_value) {
        previewSystemPrompt = previewSystemPrompt.replace(regex, variable.default_value);
        previewUserPrompt = previewUserPrompt.replace(regex, variable.default_value);
        usedVariables.push(variable.name);
      } else if (variable.required) {
        missingVariables.push(variable.name);
      }
    }

    // If we have sample content, call AI service to test the prompt
    let aiResponse = null;
    if (sample_content && missingVariables.length === 0) {
      try {
        const response = await axios.post(`${AI_SERVICE_URL}/ai/test-prompt`, {
          system_prompt: previewSystemPrompt,
          user_prompt: previewUserPrompt,
          sample_content,
        }, {
          timeout: 60000,
        });
        aiResponse = {
          generated_text: response.data.content,
          tokens_used: response.data.usage?.total_tokens,
          model: response.data.model,
        };
      } catch (aiError) {
        if (axios.isAxiosError(aiError)) {
          aiResponse = {
            error: aiError.response?.data?.detail || aiError.message,
          };
        }
      }
    }

    // Update usage count
    db.prepare(`
      UPDATE ai_prompt_templates SET usage_count = usage_count + 1 WHERE id = ?
    `).run(id);

    res.json({
      preview: {
        system_prompt: previewSystemPrompt,
        user_prompt: previewUserPrompt,
      },
      variables: {
        defined: variables,
        provided: usedVariables,
        missing: missingVariables,
      },
      ai_response: aiResponse,
    });
  } catch (err) {
    console.error('Test prompt template error:', err);
    res.status(500).json({ error: 'Failed to test prompt template' });
  }
});

// Duplicate a prompt template
router.post('/:id/duplicate', authenticate, requireDocumentEditor, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name } = req.body;
    const db = getDatabase();

    // Get source template
    const source = db.prepare(`
      SELECT * FROM ai_prompt_templates WHERE id = ? AND (firm_id = ? OR is_default = 1)
    `).get(id, req.user!.firm_id) as AIPromptTemplate | undefined;

    if (!source) {
      res.status(404).json({ error: 'AI prompt template not found' });
      return;
    }

    // Generate new name if not provided
    let newName = name?.trim() || `${source.name} (Copy)`;

    // Ensure unique name
    let counter = 1;
    const baseName = newName;
    while (true) {
      const existing = db.prepare(`
        SELECT id FROM ai_prompt_templates WHERE firm_id = ? AND name = ?
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
      INSERT INTO ai_prompt_templates (
        id, firm_id, created_by, name, description, prompt_type,
        system_prompt, user_prompt_template, variables, category,
        is_shared, is_approved, is_default, usage_count, current_version,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId,
      req.user!.firm_id,
      req.user!.id,
      newName,
      source.description,
      source.prompt_type,
      source.system_prompt,
      source.user_prompt_template,
      source.variables,
      source.category,
      0, // Not shared by default
      0, // Not approved by default
      0, // Not a default template
      0, // Reset usage count
      1, // Start at version 1
      now,
      now
    );

    // Create initial version
    const versionId = uuidv4();
    db.prepare(`
      INSERT INTO ai_prompt_template_versions (
        id, prompt_template_id, version_number, system_prompt,
        user_prompt_template, variables, changed_by, change_summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      versionId,
      newId,
      1,
      source.system_prompt,
      source.user_prompt_template,
      source.variables,
      req.user!.id,
      `Duplicated from "${source.name}"`,
      now
    );

    // Log audit event
    await logAuditEvent({
      event_type: 'AI_PROMPT_TEMPLATE_DUPLICATED',
      user_id: req.user!.id,
      firm_id: req.user!.firm_id,
      resource_type: 'ai_prompt_template',
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
      prompt_type: source.prompt_type,
      system_prompt: source.system_prompt,
      user_prompt_template: source.user_prompt_template,
      variables: source.variables ? JSON.parse(source.variables) : [],
      category: source.category,
      is_shared: false,
      is_approved: false,
      is_default: false,
      usage_count: 0,
      current_version: 1,
      creator: {
        id: creator.id,
        name: `${creator.first_name} ${creator.last_name}`,
        email: creator.email,
      },
      created_at: now,
      updated_at: now,
      message: 'AI prompt template duplicated successfully',
    });
  } catch (err) {
    console.error('Duplicate AI prompt template error:', err);
    res.status(500).json({ error: 'Failed to duplicate AI prompt template' });
  }
});

// Approve/unapprove prompt template (admin only)
router.post('/:id/approve', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Only admins can approve prompt templates' });
      return;
    }

    const id = req.params.id as string;
    const { approved } = req.body;
    const db = getDatabase();

    const existing = db.prepare(`
      SELECT id, is_shared FROM ai_prompt_templates WHERE id = ? AND firm_id = ?
    `).get(id, req.user!.firm_id) as { id: string; is_shared: number } | undefined;

    if (!existing) {
      res.status(404).json({ error: 'AI prompt template not found' });
      return;
    }

    // Template must be shared to be approved
    if (approved && existing.is_shared !== 1) {
      res.status(400).json({ error: 'Prompt template must be shared with the firm before it can be approved' });
      return;
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE ai_prompt_templates SET is_approved = ?, updated_at = ? WHERE id = ?
    `).run(approved ? 1 : 0, now, id);

    // Log audit event
    await logAuditEvent({
      event_type: approved ? 'AI_PROMPT_TEMPLATE_APPROVED' : 'AI_PROMPT_TEMPLATE_UNAPPROVED',
      user_id: req.user!.id,
      firm_id: req.user!.firm_id,
      resource_type: 'ai_prompt_template',
      resource_id: id,
      details: {},
      ip_address: req.ip || req.socket.remoteAddress,
    });

    res.json({
      id,
      is_approved: approved ? true : false,
      updated_at: now,
      message: approved ? 'Prompt template approved successfully' : 'Prompt template unapproved successfully',
    });
  } catch (err) {
    console.error('Approve prompt template error:', err);
    res.status(500).json({ error: 'Failed to update prompt template approval status' });
  }
});

// Delete prompt template
router.delete('/:id', authenticate, requireDocumentEditor, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const db = getDatabase();

    const existing = db.prepare(`
      SELECT * FROM ai_prompt_templates WHERE id = ? AND firm_id = ?
    `).get(id, req.user!.firm_id) as AIPromptTemplate | undefined;

    if (!existing) {
      res.status(404).json({ error: 'AI prompt template not found' });
      return;
    }

    // Cannot delete default templates
    if (existing.is_default) {
      res.status(403).json({ error: 'Cannot delete default prompt templates' });
      return;
    }

    // Only creator or admin can delete
    const isAdmin = req.user!.role === 'admin';
    if (existing.created_by !== req.user!.id && !isAdmin) {
      res.status(403).json({ error: 'Only the prompt creator or an admin can delete this template' });
      return;
    }

    // Delete versions first
    db.prepare('DELETE FROM ai_prompt_template_versions WHERE prompt_template_id = ?').run(id);

    // Delete template
    db.prepare('DELETE FROM ai_prompt_templates WHERE id = ?').run(id);

    // Log audit event
    await logAuditEvent({
      event_type: 'AI_PROMPT_TEMPLATE_DELETED',
      user_id: req.user!.id,
      firm_id: req.user!.firm_id,
      resource_type: 'ai_prompt_template',
      resource_id: id,
      details: {
        name: existing.name,
        prompt_type: existing.prompt_type,
        category: existing.category,
      },
      ip_address: req.ip || req.socket.remoteAddress,
    });

    res.json({ message: 'AI prompt template deleted successfully' });
  } catch (err) {
    console.error('Delete AI prompt template error:', err);
    res.status(500).json({ error: 'Failed to delete AI prompt template' });
  }
});

// Get available metadata (types and categories)
router.get('/meta/info', authenticate, async (req: AuthRequest, res: Response) => {
  res.json({
    prompt_types: PROMPT_TYPES,
    categories: PROMPT_CATEGORIES,
    variable_syntax: '{{variable_name}}',
    reserved_variables: [
      'current_draft',
      'instructions',
      'documents',
      'case_info',
      'template',
    ],
  });
});

// Seed default prompt templates (admin only)
router.post('/meta/seed-defaults', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Only admins can seed default prompt templates' });
      return;
    }

    const db = getDatabase();
    const firmId = req.user!.firm_id;
    const userId = req.user!.id;
    const now = new Date().toISOString();

    // Default prompt templates for refinement
    const defaultPrompts = [
      {
        name: 'Make More Assertive',
        description: 'Strengthens the tone to be more demanding while maintaining professionalism',
        prompt_type: 'refinement',
        category: 'Tone & Style',
        system_prompt: `You are an expert legal writing assistant. Your task is to revise the provided demand letter to have a more assertive and demanding tone while maintaining professional legal standards.

Guidelines:
- Use stronger, more confident language
- Emphasize the strength of the client's position
- Be firm but not aggressive or unprofessional
- Maintain all factual content
- Keep the same structure`,
        user_prompt_template: `Please revise the following demand letter to be more assertive in tone:

**Current Draft:**
{{current_draft}}

Make the language stronger and more demanding while remaining professional. Emphasize the client's strong position and the urgency of the matter.`,
        variables: JSON.stringify([
          { name: 'current_draft', description: 'The current demand letter content', required: true },
        ]),
      },
      {
        name: 'Condense & Shorten',
        description: 'Reduces length while preserving all essential information and arguments',
        prompt_type: 'refinement',
        category: 'Content Enhancement',
        system_prompt: `You are an expert legal writing assistant. Your task is to condense and shorten the provided demand letter while preserving all essential legal arguments and factual information.

Guidelines:
- Remove redundant phrases and repetitive content
- Combine related points where appropriate
- Maintain all critical facts and legal arguments
- Keep the professional tone
- Preserve the logical flow of arguments`,
        user_prompt_template: `Please condense the following demand letter while keeping all essential information:

**Current Draft:**
{{current_draft}}

Target reduction: approximately {{reduction_percentage}}% shorter while retaining all key facts, legal arguments, and the demand itself.`,
        variables: JSON.stringify([
          { name: 'current_draft', description: 'The current demand letter content', required: true },
          { name: 'reduction_percentage', description: 'Target reduction percentage', required: false, default_value: '25' },
        ]),
      },
      {
        name: 'Add More Detail',
        description: 'Expands on key facts and arguments with additional detail',
        prompt_type: 'refinement',
        category: 'Content Enhancement',
        system_prompt: `You are an expert legal writing assistant. Your task is to expand the provided demand letter with more detailed explanations of facts, injuries, and legal arguments.

Guidelines:
- Add more specific details to support each claim
- Elaborate on damages with more descriptive language
- Strengthen legal arguments with additional reasoning
- Maintain factual accuracy - do not fabricate information
- If specific details are unknown, use appropriate legal language to indicate estimates or approximations`,
        user_prompt_template: `Please expand the following demand letter with more detail:

**Current Draft:**
{{current_draft}}

**Areas to focus on:**
{{focus_areas}}

Add more specific details, strengthen arguments, and provide fuller explanations where appropriate.`,
        variables: JSON.stringify([
          { name: 'current_draft', description: 'The current demand letter content', required: true },
          { name: 'focus_areas', description: 'Specific areas to expand on', required: false, default_value: 'damages, liability, and the impact on the client' },
        ]),
      },
      {
        name: 'Formal Legal Tone',
        description: 'Revises language to be more formal and use proper legal terminology',
        prompt_type: 'refinement',
        category: 'Tone & Style',
        system_prompt: `You are an expert legal writing assistant specializing in formal legal correspondence. Your task is to revise the provided demand letter to use more formal legal language and proper legal terminology.

Guidelines:
- Use formal legal terminology appropriately
- Remove casual or informal language
- Add proper legal citations format where applicable
- Maintain precision in language
- Use passive voice where appropriate for legal writing
- Ensure proper legal conventions are followed`,
        user_prompt_template: `Please revise the following demand letter to use more formal legal language:

**Current Draft:**
{{current_draft}}

Convert informal language to proper legal terminology. Ensure the letter follows formal legal writing conventions.`,
        variables: JSON.stringify([
          { name: 'current_draft', description: 'The current demand letter content', required: true },
        ]),
      },
      {
        name: 'Clarify Damages',
        description: 'Provides clearer breakdown and explanation of damages claimed',
        prompt_type: 'refinement',
        category: 'Legal Specific',
        system_prompt: `You are an expert legal writing assistant specializing in damages calculations and presentation. Your task is to revise the damages section of the demand letter to be clearer and more detailed.

Guidelines:
- Provide clear itemization of all damages
- Explain the basis for each damage category
- Include supporting calculations where appropriate
- Connect damages to specific injuries or losses
- Use persuasive language to justify amounts
- Ensure logical flow from facts to damages`,
        user_prompt_template: `Please clarify and improve the damages presentation in the following demand letter:

**Current Draft:**
{{current_draft}}

Focus on:
1. Clear itemization of each damage category
2. Explanation of how amounts were calculated
3. Connection between injuries/losses and specific damages
4. Persuasive justification for the total demand`,
        variables: JSON.stringify([
          { name: 'current_draft', description: 'The current demand letter content', required: true },
        ]),
      },
      {
        name: 'Strengthen Liability Arguments',
        description: 'Strengthens the arguments establishing defendant liability',
        prompt_type: 'refinement',
        category: 'Legal Specific',
        system_prompt: `You are an expert legal writing assistant specializing in liability analysis. Your task is to strengthen the liability arguments in the demand letter.

Guidelines:
- Emphasize key facts supporting liability
- Add legal reasoning connecting facts to liability
- Reference applicable legal standards or duties
- Address potential defenses preemptively
- Use persuasive language while remaining accurate
- Maintain logical flow of liability argument`,
        user_prompt_template: `Please strengthen the liability arguments in the following demand letter:

**Current Draft:**
{{current_draft}}

**Liability theory:**
{{liability_theory}}

Focus on:
1. Clear statement of duty owed
2. Specific breach of that duty
3. Direct causation between breach and injuries
4. Address any potential comparative fault arguments`,
        variables: JSON.stringify([
          { name: 'current_draft', description: 'The current demand letter content', required: true },
          { name: 'liability_theory', description: 'Primary liability theory (e.g., negligence, strict liability)', required: false, default_value: 'negligence' },
        ]),
      },
      {
        name: 'Custom Refinement',
        description: 'Apply custom instructions to refine the demand letter',
        prompt_type: 'refinement',
        category: 'Custom',
        system_prompt: `You are an expert legal writing assistant. Your task is to modify the demand letter according to the specific instructions provided while maintaining professional legal standards.

Guidelines:
- Follow the specific instructions carefully
- Maintain factual accuracy
- Preserve professional legal tone
- Keep the overall document structure unless instructed otherwise
- Only make changes that align with the provided instructions`,
        user_prompt_template: `Please refine the following demand letter according to these instructions:

**Current Draft:**
{{current_draft}}

**Refinement Instructions:**
{{instructions}}

**Source Documents (for reference):**
{{documents}}

Apply the requested changes while maintaining professional legal standards.`,
        variables: JSON.stringify([
          { name: 'current_draft', description: 'The current demand letter content', required: true },
          { name: 'instructions', description: 'Specific refinement instructions', required: true },
          { name: 'documents', description: 'Original source documents for reference', required: false },
        ]),
      },
    ];

    // Check how many default templates already exist for this firm
    const existingDefaults = db.prepare(`
      SELECT name FROM ai_prompt_templates
      WHERE firm_id = ? AND is_default = 1
    `).all(firmId) as Array<{ name: string }>;

    const existingNames = new Set(existingDefaults.map(t => t.name));
    const templatesCreated: string[] = [];
    const templatesSkipped: string[] = [];

    for (const template of defaultPrompts) {
      if (existingNames.has(template.name)) {
        templatesSkipped.push(template.name);
        continue;
      }

      // Check for exact name collision
      const collision = db.prepare(`
        SELECT id FROM ai_prompt_templates WHERE firm_id = ? AND name = ?
      `).get(firmId, template.name);

      if (collision) {
        templatesSkipped.push(template.name);
        continue;
      }

      const templateId = uuidv4();

      db.prepare(`
        INSERT INTO ai_prompt_templates (
          id, firm_id, created_by, name, description, prompt_type,
          system_prompt, user_prompt_template, variables, category,
          is_shared, is_approved, is_default, usage_count, current_version,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        templateId,
        firmId,
        userId,
        template.name,
        template.description,
        template.prompt_type,
        template.system_prompt,
        template.user_prompt_template,
        template.variables,
        template.category,
        1, // Shared with firm
        1, // Pre-approved
        1, // Default template
        0, // Usage count
        1, // Version 1
        now,
        now
      );

      // Create initial version
      const versionId = uuidv4();
      db.prepare(`
        INSERT INTO ai_prompt_template_versions (
          id, prompt_template_id, version_number, system_prompt,
          user_prompt_template, variables, changed_by, change_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        versionId,
        templateId,
        1,
        template.system_prompt,
        template.user_prompt_template,
        template.variables,
        userId,
        'Initial default template',
        now
      );

      templatesCreated.push(template.name);

      // Log audit event
      await logAuditEvent({
        event_type: 'AI_PROMPT_TEMPLATE_CREATED',
        user_id: userId,
        firm_id: firmId,
        resource_type: 'ai_prompt_template',
        resource_id: templateId,
        details: {
          name: template.name,
          prompt_type: template.prompt_type,
          is_default_template: true,
        },
        ip_address: req.ip || req.socket.remoteAddress,
      });
    }

    res.status(201).json({
      message: 'Default AI prompt templates seeded successfully',
      templates_created: templatesCreated,
      templates_skipped: templatesSkipped,
      total_created: templatesCreated.length,
      total_skipped: templatesSkipped.length,
    });
  } catch (err) {
    console.error('Seed default AI prompt templates error:', err);
    res.status(500).json({ error: 'Failed to seed default AI prompt templates' });
  }
});

export default router;
