// Change tracking routes for demand letters
import { Router, Response, Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/index.js';
import { DocumentChange, DocumentComment, User } from '../db/schema.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { logAuditEvent } from '../services/audit.js';

const router = Router();

// Helper to extract param (for Express 5 compatibility)
const getParam = (req: Request, name: string): string => {
  return (req.params as Record<string, string>)[name];
};

// Helper to get client IP
const getClientIp = (req: Request): string | string[] | undefined => {
  return req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
};

// Types for request bodies
interface CreateChangeRequest {
  change_type: 'insertion' | 'deletion' | 'modification' | 'format';
  position_start: number;
  position_end: number;
  old_content?: string;
  new_content?: string;
  version_id?: string;
  metadata?: Record<string, unknown>;
}

interface ReviewChangeRequest {
  action: 'accept' | 'reject';
}

interface CreateCommentRequest {
  content: string;
  change_id?: string;
  parent_id?: string;
  position_start?: number;
  position_end?: number;
}

interface UpdateCommentRequest {
  content: string;
}

// Extended types with user info
interface ChangeWithUser extends DocumentChange {
  user_name: string;
  user_email: string;
  reviewer_name?: string;
  reviewer_email?: string;
}

interface CommentWithUser extends DocumentComment {
  user_name: string;
  user_email: string;
  resolver_name?: string;
  resolver_email?: string;
  replies?: CommentWithUser[];
}

// ============= CHANGE ROUTES =============

// Get all changes for a demand letter
router.get(
  '/:demandLetterId/changes',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const demandLetterId = getParam(req, 'demandLetterId');
      const db = getDatabase();
      const status = req.query.status as string | undefined;

      // Verify user has access to this demand letter
      const demandLetter = db.prepare(`
        SELECT * FROM demand_letters WHERE id = ? AND firm_id = ?
      `).get(demandLetterId, req.user!.firm_id);

      if (!demandLetter) {
        res.status(404).json({ error: 'Demand letter not found' });
        return;
      }

      // Build query
      let query = `
        SELECT
          dc.*,
          u.first_name || ' ' || u.last_name as user_name,
          u.email as user_email,
          r.first_name || ' ' || r.last_name as reviewer_name,
          r.email as reviewer_email
        FROM document_changes dc
        LEFT JOIN users u ON dc.user_id = u.id
        LEFT JOIN users r ON dc.reviewed_by = r.id
        WHERE dc.demand_letter_id = ?
      `;
      const params: (string | undefined)[] = [demandLetterId];

      if (status) {
        query += ' AND dc.status = ?';
        params.push(status);
      }

      query += ' ORDER BY dc.created_at DESC';

      const changes = db.prepare(query).all(...params) as ChangeWithUser[];

      res.json({
        changes,
        total: changes.length,
        pending_count: changes.filter(c => c.status === 'pending').length,
        accepted_count: changes.filter(c => c.status === 'accepted').length,
        rejected_count: changes.filter(c => c.status === 'rejected').length,
      });
    } catch (error) {
      console.error('Failed to get changes:', error);
      res.status(500).json({ error: 'Failed to retrieve changes' });
    }
  }
);

// Create a new change
router.post(
  '/:demandLetterId/changes',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const demandLetterId = getParam(req, 'demandLetterId');
      const body = req.body as CreateChangeRequest;
      const db = getDatabase();

      // Validate required fields
      if (!body.change_type || body.position_start === undefined || body.position_end === undefined) {
        res.status(400).json({ error: 'change_type, position_start, and position_end are required' });
        return;
      }

      // Verify user has access to this demand letter
      const demandLetter = db.prepare(`
        SELECT * FROM demand_letters WHERE id = ? AND firm_id = ?
      `).get(demandLetterId, req.user!.firm_id);

      if (!demandLetter) {
        res.status(404).json({ error: 'Demand letter not found' });
        return;
      }

      const id = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO document_changes (
          id, demand_letter_id, version_id, user_id, change_type,
          position_start, position_end, old_content, new_content,
          status, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `).run(
        id,
        demandLetterId,
        body.version_id || null,
        req.user!.id,
        body.change_type,
        body.position_start,
        body.position_end,
        body.old_content || null,
        body.new_content || null,
        body.metadata ? JSON.stringify(body.metadata) : null,
        now
      );

      // Log audit event
      await logAuditEvent({
        event_type: 'CHANGE_CREATED',
        user_id: req.user!.id,
        firm_id: req.user!.firm_id,
        resource_type: 'document_change',
        resource_id: id,
        details: {
          demand_letter_id: demandLetterId,
          change_type: body.change_type,
        },
        ip_address: getClientIp(req),
        user_agent: req.headers['user-agent'],
      });

      // Fetch the created change with user info
      const change = db.prepare(`
        SELECT
          dc.*,
          u.first_name || ' ' || u.last_name as user_name,
          u.email as user_email
        FROM document_changes dc
        LEFT JOIN users u ON dc.user_id = u.id
        WHERE dc.id = ?
      `).get(id) as ChangeWithUser;

      res.status(201).json(change);
    } catch (error) {
      console.error('Failed to create change:', error);
      res.status(500).json({ error: 'Failed to create change' });
    }
  }
);

// Accept or reject a change
router.post(
  '/:demandLetterId/changes/:changeId/review',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const demandLetterId = getParam(req, 'demandLetterId');
      const changeId = getParam(req, 'changeId');
      const body = req.body as ReviewChangeRequest;
      const db = getDatabase();

      if (!body.action || !['accept', 'reject'].includes(body.action)) {
        res.status(400).json({ error: 'action must be either "accept" or "reject"' });
        return;
      }

      // Verify user has access to this demand letter
      const demandLetter = db.prepare(`
        SELECT * FROM demand_letters WHERE id = ? AND firm_id = ?
      `).get(demandLetterId, req.user!.firm_id);

      if (!demandLetter) {
        res.status(404).json({ error: 'Demand letter not found' });
        return;
      }

      // Check change exists and is pending
      const change = db.prepare(`
        SELECT * FROM document_changes WHERE id = ? AND demand_letter_id = ?
      `).get(changeId, demandLetterId) as DocumentChange | undefined;

      if (!change) {
        res.status(404).json({ error: 'Change not found' });
        return;
      }

      if (change.status !== 'pending') {
        res.status(400).json({ error: `Change has already been ${change.status}` });
        return;
      }

      const now = new Date().toISOString();
      const newStatus = body.action === 'accept' ? 'accepted' : 'rejected';

      db.prepare(`
        UPDATE document_changes
        SET status = ?, reviewed_by = ?, reviewed_at = ?
        WHERE id = ?
      `).run(newStatus, req.user!.id, now, changeId);

      // Log audit event
      await logAuditEvent({
        event_type: body.action === 'accept' ? 'CHANGE_ACCEPTED' : 'CHANGE_REJECTED',
        user_id: req.user!.id,
        firm_id: req.user!.firm_id,
        resource_type: 'document_change',
        resource_id: changeId,
        details: {
          demand_letter_id: demandLetterId,
          change_type: change.change_type,
        },
        ip_address: getClientIp(req),
        user_agent: req.headers['user-agent'],
      });

      // Fetch updated change with user info
      const updatedChange = db.prepare(`
        SELECT
          dc.*,
          u.first_name || ' ' || u.last_name as user_name,
          u.email as user_email,
          r.first_name || ' ' || r.last_name as reviewer_name,
          r.email as reviewer_email
        FROM document_changes dc
        LEFT JOIN users u ON dc.user_id = u.id
        LEFT JOIN users r ON dc.reviewed_by = r.id
        WHERE dc.id = ?
      `).get(changeId) as ChangeWithUser;

      res.json(updatedChange);
    } catch (error) {
      console.error('Failed to review change:', error);
      res.status(500).json({ error: 'Failed to review change' });
    }
  }
);

// Bulk accept/reject changes
router.post(
  '/:demandLetterId/changes/bulk-review',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const demandLetterId = getParam(req, 'demandLetterId');
      const { action, change_ids } = req.body as { action: 'accept' | 'reject'; change_ids: string[] };
      const db = getDatabase();

      if (!action || !['accept', 'reject'].includes(action)) {
        res.status(400).json({ error: 'action must be either "accept" or "reject"' });
        return;
      }

      if (!change_ids || !Array.isArray(change_ids) || change_ids.length === 0) {
        res.status(400).json({ error: 'change_ids must be a non-empty array' });
        return;
      }

      // Verify user has access to this demand letter
      const demandLetter = db.prepare(`
        SELECT * FROM demand_letters WHERE id = ? AND firm_id = ?
      `).get(demandLetterId, req.user!.firm_id);

      if (!demandLetter) {
        res.status(404).json({ error: 'Demand letter not found' });
        return;
      }

      const now = new Date().toISOString();
      const newStatus = action === 'accept' ? 'accepted' : 'rejected';

      // Update all pending changes
      const placeholders = change_ids.map(() => '?').join(',');
      const result = db.prepare(`
        UPDATE document_changes
        SET status = ?, reviewed_by = ?, reviewed_at = ?
        WHERE id IN (${placeholders}) AND demand_letter_id = ? AND status = 'pending'
      `).run(newStatus, req.user!.id, now, ...change_ids, demandLetterId);

      // Log audit event
      await logAuditEvent({
        event_type: action === 'accept' ? 'CHANGE_ACCEPTED' : 'CHANGE_REJECTED',
        user_id: req.user!.id,
        firm_id: req.user!.firm_id,
        resource_type: 'document_change',
        resource_id: demandLetterId,
        details: {
          action: 'bulk_review',
          change_ids,
          updated_count: result.changes,
        },
        ip_address: getClientIp(req),
        user_agent: req.headers['user-agent'],
      });

      res.json({
        message: `${result.changes} changes ${newStatus}`,
        updated_count: result.changes,
      });
    } catch (error) {
      console.error('Failed to bulk review changes:', error);
      res.status(500).json({ error: 'Failed to review changes' });
    }
  }
);

// Delete a change (only if pending and user owns it)
router.delete(
  '/:demandLetterId/changes/:changeId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const demandLetterId = getParam(req, 'demandLetterId');
      const changeId = getParam(req, 'changeId');
      const db = getDatabase();

      // Check change exists
      const change = db.prepare(`
        SELECT * FROM document_changes WHERE id = ? AND demand_letter_id = ?
      `).get(changeId, demandLetterId) as DocumentChange | undefined;

      if (!change) {
        res.status(404).json({ error: 'Change not found' });
        return;
      }

      // Only allow deletion of pending changes by the owner or admin
      if (change.status !== 'pending') {
        res.status(400).json({ error: 'Only pending changes can be deleted' });
        return;
      }

      if (change.user_id !== req.user!.id && req.user!.role !== 'admin') {
        res.status(403).json({ error: 'You can only delete your own changes' });
        return;
      }

      db.prepare('DELETE FROM document_changes WHERE id = ?').run(changeId);

      res.json({ message: 'Change deleted successfully' });
    } catch (error) {
      console.error('Failed to delete change:', error);
      res.status(500).json({ error: 'Failed to delete change' });
    }
  }
);

// ============= COMMENT ROUTES =============

// Get all comments for a demand letter
router.get(
  '/:demandLetterId/comments',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const demandLetterId = getParam(req, 'demandLetterId');
      const db = getDatabase();
      const includeResolved = req.query.include_resolved === 'true';

      // Verify user has access to this demand letter
      const demandLetter = db.prepare(`
        SELECT * FROM demand_letters WHERE id = ? AND firm_id = ?
      `).get(demandLetterId, req.user!.firm_id);

      if (!demandLetter) {
        res.status(404).json({ error: 'Demand letter not found' });
        return;
      }

      // Get all comments (including replies)
      let query = `
        SELECT
          dc.*,
          u.first_name || ' ' || u.last_name as user_name,
          u.email as user_email,
          r.first_name || ' ' || r.last_name as resolver_name,
          r.email as resolver_email
        FROM document_comments dc
        LEFT JOIN users u ON dc.user_id = u.id
        LEFT JOIN users r ON dc.resolved_by = r.id
        WHERE dc.demand_letter_id = ?
      `;

      if (!includeResolved) {
        query += ' AND dc.is_resolved = 0';
      }

      query += ' ORDER BY dc.created_at ASC';

      const allComments = db.prepare(query).all(demandLetterId) as CommentWithUser[];

      // Build nested comment structure
      const commentMap = new Map<string, CommentWithUser>();
      const topLevelComments: CommentWithUser[] = [];

      // First pass: create map and initialize replies array
      allComments.forEach(comment => {
        comment.replies = [];
        commentMap.set(comment.id, comment);
      });

      // Second pass: build tree structure
      allComments.forEach(comment => {
        if (comment.parent_id) {
          const parent = commentMap.get(comment.parent_id);
          if (parent) {
            parent.replies!.push(comment);
          }
        } else {
          topLevelComments.push(comment);
        }
      });

      res.json({
        comments: topLevelComments,
        total: allComments.length,
        unresolved_count: allComments.filter(c => !c.is_resolved).length,
      });
    } catch (error) {
      console.error('Failed to get comments:', error);
      res.status(500).json({ error: 'Failed to retrieve comments' });
    }
  }
);

// Create a new comment
router.post(
  '/:demandLetterId/comments',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const demandLetterId = getParam(req, 'demandLetterId');
      const body = req.body as CreateCommentRequest;
      const db = getDatabase();

      if (!body.content || body.content.trim() === '') {
        res.status(400).json({ error: 'Comment content is required' });
        return;
      }

      // Verify user has access to this demand letter
      const demandLetter = db.prepare(`
        SELECT * FROM demand_letters WHERE id = ? AND firm_id = ?
      `).get(demandLetterId, req.user!.firm_id);

      if (!demandLetter) {
        res.status(404).json({ error: 'Demand letter not found' });
        return;
      }

      // Verify parent comment exists if specified
      if (body.parent_id) {
        const parentComment = db.prepare(`
          SELECT * FROM document_comments WHERE id = ? AND demand_letter_id = ?
        `).get(body.parent_id, demandLetterId);

        if (!parentComment) {
          res.status(404).json({ error: 'Parent comment not found' });
          return;
        }
      }

      // Verify change exists if specified
      if (body.change_id) {
        const change = db.prepare(`
          SELECT * FROM document_changes WHERE id = ? AND demand_letter_id = ?
        `).get(body.change_id, demandLetterId);

        if (!change) {
          res.status(404).json({ error: 'Change not found' });
          return;
        }
      }

      const id = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO document_comments (
          id, demand_letter_id, change_id, user_id, parent_id,
          content, position_start, position_end, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        demandLetterId,
        body.change_id || null,
        req.user!.id,
        body.parent_id || null,
        body.content.trim(),
        body.position_start ?? null,
        body.position_end ?? null,
        now,
        now
      );

      // Log audit event
      await logAuditEvent({
        event_type: 'COMMENT_CREATED',
        user_id: req.user!.id,
        firm_id: req.user!.firm_id,
        resource_type: 'document_comment',
        resource_id: id,
        details: {
          demand_letter_id: demandLetterId,
          is_reply: !!body.parent_id,
          is_change_comment: !!body.change_id,
        },
        ip_address: getClientIp(req),
        user_agent: req.headers['user-agent'],
      });

      // Fetch the created comment with user info
      const comment = db.prepare(`
        SELECT
          dc.*,
          u.first_name || ' ' || u.last_name as user_name,
          u.email as user_email
        FROM document_comments dc
        LEFT JOIN users u ON dc.user_id = u.id
        WHERE dc.id = ?
      `).get(id) as CommentWithUser;

      res.status(201).json(comment);
    } catch (error) {
      console.error('Failed to create comment:', error);
      res.status(500).json({ error: 'Failed to create comment' });
    }
  }
);

// Update a comment
router.patch(
  '/:demandLetterId/comments/:commentId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const demandLetterId = getParam(req, 'demandLetterId');
      const commentId = getParam(req, 'commentId');
      const body = req.body as UpdateCommentRequest;
      const db = getDatabase();

      if (!body.content || body.content.trim() === '') {
        res.status(400).json({ error: 'Comment content is required' });
        return;
      }

      // Check comment exists and user owns it
      const comment = db.prepare(`
        SELECT * FROM document_comments WHERE id = ? AND demand_letter_id = ?
      `).get(commentId, demandLetterId) as DocumentComment | undefined;

      if (!comment) {
        res.status(404).json({ error: 'Comment not found' });
        return;
      }

      if (comment.user_id !== req.user!.id && req.user!.role !== 'admin') {
        res.status(403).json({ error: 'You can only edit your own comments' });
        return;
      }

      const now = new Date().toISOString();

      db.prepare(`
        UPDATE document_comments
        SET content = ?, updated_at = ?
        WHERE id = ?
      `).run(body.content.trim(), now, commentId);

      // Log audit event
      await logAuditEvent({
        event_type: 'COMMENT_UPDATED',
        user_id: req.user!.id,
        firm_id: req.user!.firm_id,
        resource_type: 'document_comment',
        resource_id: commentId,
        details: { demand_letter_id: demandLetterId },
        ip_address: getClientIp(req),
        user_agent: req.headers['user-agent'],
      });

      // Fetch updated comment
      const updatedComment = db.prepare(`
        SELECT
          dc.*,
          u.first_name || ' ' || u.last_name as user_name,
          u.email as user_email
        FROM document_comments dc
        LEFT JOIN users u ON dc.user_id = u.id
        WHERE dc.id = ?
      `).get(commentId) as CommentWithUser;

      res.json(updatedComment);
    } catch (error) {
      console.error('Failed to update comment:', error);
      res.status(500).json({ error: 'Failed to update comment' });
    }
  }
);

// Resolve/unresolve a comment
router.post(
  '/:demandLetterId/comments/:commentId/resolve',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const demandLetterId = getParam(req, 'demandLetterId');
      const commentId = getParam(req, 'commentId');
      const { resolved } = req.body as { resolved: boolean };
      const db = getDatabase();

      // Verify user has access to this demand letter
      const demandLetter = db.prepare(`
        SELECT * FROM demand_letters WHERE id = ? AND firm_id = ?
      `).get(demandLetterId, req.user!.firm_id);

      if (!demandLetter) {
        res.status(404).json({ error: 'Demand letter not found' });
        return;
      }

      // Check comment exists
      const comment = db.prepare(`
        SELECT * FROM document_comments WHERE id = ? AND demand_letter_id = ?
      `).get(commentId, demandLetterId) as DocumentComment | undefined;

      if (!comment) {
        res.status(404).json({ error: 'Comment not found' });
        return;
      }

      const now = new Date().toISOString();

      if (resolved) {
        db.prepare(`
          UPDATE document_comments
          SET is_resolved = 1, resolved_by = ?, resolved_at = ?
          WHERE id = ?
        `).run(req.user!.id, now, commentId);
      } else {
        db.prepare(`
          UPDATE document_comments
          SET is_resolved = 0, resolved_by = NULL, resolved_at = NULL
          WHERE id = ?
        `).run(commentId);
      }

      // Log audit event
      await logAuditEvent({
        event_type: 'COMMENT_RESOLVED',
        user_id: req.user!.id,
        firm_id: req.user!.firm_id,
        resource_type: 'document_comment',
        resource_id: commentId,
        details: {
          demand_letter_id: demandLetterId,
          resolved,
        },
        ip_address: getClientIp(req),
        user_agent: req.headers['user-agent'],
      });

      // Fetch updated comment
      const updatedComment = db.prepare(`
        SELECT
          dc.*,
          u.first_name || ' ' || u.last_name as user_name,
          u.email as user_email,
          r.first_name || ' ' || r.last_name as resolver_name,
          r.email as resolver_email
        FROM document_comments dc
        LEFT JOIN users u ON dc.user_id = u.id
        LEFT JOIN users r ON dc.resolved_by = r.id
        WHERE dc.id = ?
      `).get(commentId) as CommentWithUser;

      res.json(updatedComment);
    } catch (error) {
      console.error('Failed to resolve comment:', error);
      res.status(500).json({ error: 'Failed to resolve comment' });
    }
  }
);

// Delete a comment
router.delete(
  '/:demandLetterId/comments/:commentId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const demandLetterId = getParam(req, 'demandLetterId');
      const commentId = getParam(req, 'commentId');
      const db = getDatabase();

      // Check comment exists
      const comment = db.prepare(`
        SELECT * FROM document_comments WHERE id = ? AND demand_letter_id = ?
      `).get(commentId, demandLetterId) as DocumentComment | undefined;

      if (!comment) {
        res.status(404).json({ error: 'Comment not found' });
        return;
      }

      // Only allow deletion by owner or admin
      if (comment.user_id !== req.user!.id && req.user!.role !== 'admin') {
        res.status(403).json({ error: 'You can only delete your own comments' });
        return;
      }

      // Delete comment (replies will be cascade deleted)
      db.prepare('DELETE FROM document_comments WHERE id = ?').run(commentId);

      // Log audit event
      await logAuditEvent({
        event_type: 'COMMENT_DELETED',
        user_id: req.user!.id,
        firm_id: req.user!.firm_id,
        resource_type: 'document_comment',
        resource_id: commentId,
        details: { demand_letter_id: demandLetterId },
        ip_address: getClientIp(req),
        user_agent: req.headers['user-agent'],
      });

      res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
      console.error('Failed to delete comment:', error);
      res.status(500).json({ error: 'Failed to delete comment' });
    }
  }
);

// ============= VERSION COMPARISON =============

// Compare two versions
router.get(
  '/:demandLetterId/versions/compare',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const demandLetterId = getParam(req, 'demandLetterId');
      const fromVersion = req.query.from as string;
      const toVersion = req.query.to as string;
      const db = getDatabase();

      if (!fromVersion || !toVersion) {
        res.status(400).json({ error: 'Both "from" and "to" version numbers are required' });
        return;
      }

      // Verify user has access to this demand letter
      const demandLetter = db.prepare(`
        SELECT * FROM demand_letters WHERE id = ? AND firm_id = ?
      `).get(demandLetterId, req.user!.firm_id);

      if (!demandLetter) {
        res.status(404).json({ error: 'Demand letter not found' });
        return;
      }

      // Get both versions
      const fromVersionData = db.prepare(`
        SELECT
          v.*,
          u.first_name || ' ' || u.last_name as changed_by_name,
          u.email as changed_by_email
        FROM demand_letter_versions v
        LEFT JOIN users u ON v.changed_by = u.id
        WHERE v.demand_letter_id = ? AND v.version_number = ?
      `).get(demandLetterId, parseInt(fromVersion));

      const toVersionData = db.prepare(`
        SELECT
          v.*,
          u.first_name || ' ' || u.last_name as changed_by_name,
          u.email as changed_by_email
        FROM demand_letter_versions v
        LEFT JOIN users u ON v.changed_by = u.id
        WHERE v.demand_letter_id = ? AND v.version_number = ?
      `).get(demandLetterId, parseInt(toVersion));

      if (!fromVersionData) {
        res.status(404).json({ error: `Version ${fromVersion} not found` });
        return;
      }

      if (!toVersionData) {
        res.status(404).json({ error: `Version ${toVersion} not found` });
        return;
      }

      // Return both versions for client-side diff computation
      res.json({
        from: fromVersionData,
        to: toVersionData,
      });
    } catch (error) {
      console.error('Failed to compare versions:', error);
      res.status(500).json({ error: 'Failed to compare versions' });
    }
  }
);

export default router;
