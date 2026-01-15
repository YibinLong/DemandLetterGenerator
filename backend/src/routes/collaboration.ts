// Collaboration routes for sharing and invites
import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDatabase } from '../db/index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { logAuditEvent } from '../services/audit.js';
import { getActiveCollaborators, getOrCreateSession } from '../services/collaboration.js';
import { DemandLetter, User, CollaborationInvite } from '../db/schema.js';

const router = Router();

// Helper to get string param value
const getParam = (value: string | string[] | undefined): string => {
  if (!value) return '';
  return Array.isArray(value) ? value[0] : value;
};

// Helper to get IP address as string
const getIpAddress = (ip: string | string[] | undefined): string | undefined => {
  if (!ip) return undefined;
  return Array.isArray(ip) ? ip[0] : ip;
};

// Get active collaborators for a demand letter
router.get('/:demandLetterId/active', authenticate, async (req: AuthRequest, res: Response) => {
  const demandLetterId = getParam(req.params.demandLetterId);
  const user = req.user!;

  // Verify access to demand letter
  const db = getDatabase();
  const letter = db.prepare(
    'SELECT * FROM demand_letters WHERE id = ? AND firm_id = ?'
  ).get(demandLetterId, user.firm_id) as DemandLetter | undefined;

  if (!letter) {
    res.status(404).json({ error: 'Demand letter not found' });
    return;
  }

  const collaborators = getActiveCollaborators(demandLetterId);

  res.json({
    demand_letter_id: demandLetterId,
    collaborators,
    count: collaborators.length,
  });
});

// Get or create collaboration session
router.post('/:demandLetterId/session', authenticate, async (req: AuthRequest, res: Response) => {
  const demandLetterId = getParam(req.params.demandLetterId);
  const user = req.user!;

  // Verify access to demand letter
  const db = getDatabase();
  const letter = db.prepare(
    'SELECT * FROM demand_letters WHERE id = ? AND firm_id = ?'
  ).get(demandLetterId, user.firm_id) as DemandLetter | undefined;

  if (!letter) {
    res.status(404).json({ error: 'Demand letter not found' });
    return;
  }

  const session = getOrCreateSession(demandLetterId, user.id);

  if (!session) {
    res.status(500).json({ error: 'Failed to create session' });
    return;
  }

  res.json({
    session_id: session.id,
    demand_letter_id: session.demand_letter_id,
    created_at: session.created_at,
    expires_at: session.expires_at,
  });
});

// Create collaboration invite
router.post('/:demandLetterId/invite', authenticate, async (req: AuthRequest, res: Response) => {
  const demandLetterId = getParam(req.params.demandLetterId);
  const { email, user_id, permission = 'edit' } = req.body;
  const user = req.user!;

  // Validate input
  if (!email && !user_id) {
    res.status(400).json({ error: 'Either email or user_id is required' });
    return;
  }

  if (permission !== 'view' && permission !== 'edit') {
    res.status(400).json({ error: 'Permission must be "view" or "edit"' });
    return;
  }

  // Verify access to demand letter
  const db = getDatabase();
  const letter = db.prepare(
    'SELECT * FROM demand_letters WHERE id = ? AND firm_id = ?'
  ).get(demandLetterId, user.firm_id) as DemandLetter | undefined;

  if (!letter) {
    res.status(404).json({ error: 'Demand letter not found' });
    return;
  }

  // If user_id is provided, verify the user is in the same firm
  let invitedUserId = user_id;
  let invitedEmail = email;

  if (user_id) {
    const invitedUser = db.prepare(
      'SELECT id, email, firm_id FROM users WHERE id = ?'
    ).get(user_id) as User | undefined;

    if (!invitedUser) {
      res.status(404).json({ error: 'Invited user not found' });
      return;
    }

    if (invitedUser.firm_id !== user.firm_id) {
      res.status(403).json({ error: 'Can only invite users from the same firm' });
      return;
    }

    invitedEmail = invitedUser.email;
  } else if (email) {
    // Check if email belongs to a user in the same firm
    const existingUser = db.prepare(
      'SELECT id, firm_id FROM users WHERE email = ?'
    ).get(email) as User | undefined;

    if (existingUser && existingUser.firm_id === user.firm_id) {
      invitedUserId = existingUser.id;
    } else if (existingUser) {
      res.status(403).json({ error: 'Cannot invite users from other firms' });
      return;
    }
    // If user doesn't exist, external invite (not supported yet)
    if (!existingUser) {
      res.status(400).json({ error: 'External invites not supported. User must have an account.' });
      return;
    }
  }

  // Get or create session
  const session = getOrCreateSession(demandLetterId, user.id);
  if (!session) {
    res.status(500).json({ error: 'Failed to create session' });
    return;
  }

  // Check for existing active invite
  const existingInvite = db.prepare(`
    SELECT * FROM collaboration_invites
    WHERE session_id = ? AND (invited_user_id = ? OR invited_email = ?)
    AND expires_at > datetime('now')
  `).get(session.id, invitedUserId, invitedEmail) as CollaborationInvite | undefined;

  if (existingInvite) {
    res.json({
      id: existingInvite.id,
      token: existingInvite.token,
      permission: existingInvite.permission,
      expires_at: existingInvite.expires_at,
      already_exists: true,
    });
    return;
  }

  // Create invite token
  const inviteId = uuidv4();
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

  db.prepare(`
    INSERT INTO collaboration_invites
    (id, session_id, demand_letter_id, invited_by, invited_user_id, invited_email, token, permission, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(inviteId, session.id, demandLetterId, user.id, invitedUserId || null, invitedEmail, token, permission, now, expires);

  // Log audit event
  logAuditEvent({
    event_type: 'COLLABORATION_INVITE_CREATED',
    user_id: user.id,
    firm_id: user.firm_id,
    resource_type: 'demand_letter',
    resource_id: demandLetterId,
    details: {
      invite_id: inviteId,
      invited_user_id: invitedUserId,
      invited_email: invitedEmail,
      permission,
    },
    ip_address: getIpAddress(req.ip),
  });

  res.status(201).json({
    id: inviteId,
    token,
    permission,
    expires_at: expires,
  });
});

// Accept collaboration invite
router.post('/invite/:token/accept', authenticate, async (req: AuthRequest, res: Response) => {
  const token = getParam(req.params.token);
  const user = req.user!;

  const db = getDatabase();

  // Find invite
  const invite = db.prepare(`
    SELECT ci.*, dl.firm_id as letter_firm_id
    FROM collaboration_invites ci
    JOIN demand_letters dl ON ci.demand_letter_id = dl.id
    WHERE ci.token = ? AND ci.expires_at > datetime('now')
  `).get(token) as (CollaborationInvite & { letter_firm_id: string }) | undefined;

  if (!invite) {
    res.status(404).json({ error: 'Invite not found or expired' });
    return;
  }

  // Verify user is allowed to accept this invite
  if (invite.invited_user_id && invite.invited_user_id !== user.id) {
    res.status(403).json({ error: 'This invite is for a different user' });
    return;
  }

  if (invite.invited_email && invite.invited_email !== user.email) {
    res.status(403).json({ error: 'This invite is for a different email address' });
    return;
  }

  // Verify user is in the same firm as the demand letter
  if (invite.letter_firm_id !== user.firm_id) {
    res.status(403).json({ error: 'You do not have access to this document' });
    return;
  }

  // Mark invite as accepted
  db.prepare(`
    UPDATE collaboration_invites SET accepted = 1 WHERE id = ?
  `).run(invite.id);

  // Log audit event
  logAuditEvent({
    event_type: 'COLLABORATION_INVITE_ACCEPTED',
    user_id: user.id,
    firm_id: user.firm_id,
    resource_type: 'demand_letter',
    resource_id: invite.demand_letter_id,
    details: {
      invite_id: invite.id,
      session_id: invite.session_id,
    },
    ip_address: getIpAddress(req.ip),
  });

  res.json({
    demand_letter_id: invite.demand_letter_id,
    session_id: invite.session_id,
    permission: invite.permission,
    accepted: true,
  });
});

// Get pending invites for a demand letter
router.get('/:demandLetterId/invites', authenticate, async (req: AuthRequest, res: Response) => {
  const demandLetterId = getParam(req.params.demandLetterId);
  const user = req.user!;

  // Verify access to demand letter
  const db = getDatabase();
  const letter = db.prepare(
    'SELECT * FROM demand_letters WHERE id = ? AND firm_id = ?'
  ).get(demandLetterId, user.firm_id) as DemandLetter | undefined;

  if (!letter) {
    res.status(404).json({ error: 'Demand letter not found' });
    return;
  }

  // Get pending invites
  const invites = db.prepare(`
    SELECT ci.id, ci.invited_email, ci.permission, ci.accepted, ci.created_at, ci.expires_at,
           u.first_name as invited_first_name, u.last_name as invited_last_name,
           ib.first_name as invited_by_first_name, ib.last_name as invited_by_last_name
    FROM collaboration_invites ci
    LEFT JOIN users u ON ci.invited_user_id = u.id
    JOIN users ib ON ci.invited_by = ib.id
    WHERE ci.demand_letter_id = ? AND ci.expires_at > datetime('now')
    ORDER BY ci.created_at DESC
  `).all(demandLetterId) as Array<{
    id: string;
    invited_email: string;
    permission: 'view' | 'edit';
    accepted: number;
    created_at: string;
    expires_at: string;
    invited_first_name: string | null;
    invited_last_name: string | null;
    invited_by_first_name: string;
    invited_by_last_name: string;
  }>;

  res.json({
    demand_letter_id: demandLetterId,
    invites: invites.map(inv => ({
      id: inv.id,
      invited_email: inv.invited_email,
      invited_name: inv.invited_first_name ? `${inv.invited_first_name} ${inv.invited_last_name}` : null,
      invited_by: `${inv.invited_by_first_name} ${inv.invited_by_last_name}`,
      permission: inv.permission,
      accepted: !!inv.accepted,
      created_at: inv.created_at,
      expires_at: inv.expires_at,
    })),
  });
});

// Revoke collaboration invite
router.delete('/:demandLetterId/invite/:inviteId', authenticate, async (req: AuthRequest, res: Response) => {
  const demandLetterId = getParam(req.params.demandLetterId);
  const inviteId = getParam(req.params.inviteId);
  const user = req.user!;

  // Verify access to demand letter
  const db = getDatabase();
  const letter = db.prepare(
    'SELECT * FROM demand_letters WHERE id = ? AND firm_id = ?'
  ).get(demandLetterId, user.firm_id) as DemandLetter | undefined;

  if (!letter) {
    res.status(404).json({ error: 'Demand letter not found' });
    return;
  }

  // Find and delete invite
  const result = db.prepare(`
    DELETE FROM collaboration_invites WHERE id = ? AND demand_letter_id = ?
  `).run(inviteId, demandLetterId);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Invite not found' });
    return;
  }

  res.json({ deleted: true });
});

// List users in the same firm (for invite suggestions)
router.get('/users', authenticate, async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;

  const db = getDatabase();

  let query = 'SELECT id, email, first_name, last_name, role FROM users WHERE firm_id = ? AND id != ? AND is_active = 1';
  const params: (string | number)[] = [user.firm_id, user.id];

  if (search) {
    query += ' AND (email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)';
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  query += ' ORDER BY first_name, last_name LIMIT 20';

  const users = db.prepare(query).all(...params) as Array<{
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
  }>;

  res.json({
    users: users.map(u => ({
      id: u.id,
      email: u.email,
      name: `${u.first_name} ${u.last_name}`,
      role: u.role,
    })),
  });
});

export default router;
