// Audit logging service for compliance tracking
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/index.js';

// Audit event types
export type AuditEventType =
  | 'USER_REGISTERED'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGED'
  | 'USER_UPDATED'
  | 'USER_DEACTIVATED'
  | 'DOCUMENT_UPLOADED'
  | 'DOCUMENT_DOWNLOADED'
  | 'DOCUMENT_PREVIEWED'
  | 'DOCUMENT_DELETED'
  | 'TEMPLATE_CREATED'
  | 'TEMPLATE_UPDATED'
  | 'TEMPLATE_DELETED'
  | 'TEMPLATE_APPROVED'
  | 'TEMPLATE_UNAPPROVED'
  | 'TEMPLATE_DUPLICATED'
  | 'DEMAND_LETTER_CREATED'
  | 'DEMAND_LETTER_UPDATED'
  | 'DEMAND_LETTER_DELETED'
  | 'DEMAND_LETTER_EXPORTED'
  | 'DEMAND_LETTER_BATCH_EXPORTED'
  | 'AI_GENERATION_REQUESTED'
  | 'AI_REFINEMENT_REQUESTED'
  | 'ACCESS_DENIED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'COLLABORATION_JOINED'
  | 'COLLABORATION_LEFT'
  | 'COLLABORATION_INVITE_CREATED'
  | 'COLLABORATION_INVITE_ACCEPTED';

export interface AuditEvent {
  event_type: AuditEventType;
  user_id?: string;
  firm_id?: string;
  resource_type?: string;
  resource_id?: string;
  details?: Record<string, unknown>;
  ip_address?: string | string[];
  user_agent?: string;
}

export interface AuditLogEntry {
  id: string;
  event_type: AuditEventType;
  user_id: string | null;
  firm_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  details: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// Log an audit event
export const logAuditEvent = async (event: AuditEvent): Promise<string> => {
  const id = uuidv4();
  const db = getDatabase();

  // Handle ip_address which may be string or string[]
  const ipAddress = event.ip_address
    ? Array.isArray(event.ip_address)
      ? event.ip_address[0]
      : event.ip_address
    : null;

  db.prepare(`
    INSERT INTO audit_logs (id, event_type, user_id, firm_id, resource_type, resource_id, details, ip_address, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    id,
    event.event_type,
    event.user_id || null,
    event.firm_id || null,
    event.resource_type || null,
    event.resource_id || null,
    event.details ? JSON.stringify(event.details) : null,
    ipAddress,
    event.user_agent || null
  );

  // Also log to console in development for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log(`[AUDIT] ${event.event_type}`, {
      user_id: event.user_id,
      firm_id: event.firm_id,
      resource: event.resource_type ? `${event.resource_type}:${event.resource_id}` : undefined,
      details: event.details,
    });
  }

  return id;
};

// Get audit logs with filtering options
export interface AuditLogQuery {
  user_id?: string;
  firm_id?: string;
  event_type?: AuditEventType;
  resource_type?: string;
  resource_id?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

export const getAuditLogs = (query: AuditLogQuery): AuditLogEntry[] => {
  const db = getDatabase();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (query.user_id) {
    conditions.push('user_id = ?');
    params.push(query.user_id);
  }

  if (query.firm_id) {
    conditions.push('firm_id = ?');
    params.push(query.firm_id);
  }

  if (query.event_type) {
    conditions.push('event_type = ?');
    params.push(query.event_type);
  }

  if (query.resource_type) {
    conditions.push('resource_type = ?');
    params.push(query.resource_type);
  }

  if (query.resource_id) {
    conditions.push('resource_id = ?');
    params.push(query.resource_id);
  }

  if (query.from_date) {
    conditions.push('created_at >= ?');
    params.push(query.from_date);
  }

  if (query.to_date) {
    conditions.push('created_at <= ?');
    params.push(query.to_date);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = query.limit || 100;
  const offset = query.offset || 0;

  params.push(limit, offset);

  return db.prepare(`
    SELECT * FROM audit_logs
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params) as AuditLogEntry[];
};

// Get audit log count
export const getAuditLogCount = (query: Omit<AuditLogQuery, 'limit' | 'offset'>): number => {
  const db = getDatabase();
  const conditions: string[] = [];
  const params: string[] = [];

  if (query.user_id) {
    conditions.push('user_id = ?');
    params.push(query.user_id);
  }

  if (query.firm_id) {
    conditions.push('firm_id = ?');
    params.push(query.firm_id);
  }

  if (query.event_type) {
    conditions.push('event_type = ?');
    params.push(query.event_type);
  }

  if (query.resource_type) {
    conditions.push('resource_type = ?');
    params.push(query.resource_type);
  }

  if (query.resource_id) {
    conditions.push('resource_id = ?');
    params.push(query.resource_id);
  }

  if (query.from_date) {
    conditions.push('created_at >= ?');
    params.push(query.from_date);
  }

  if (query.to_date) {
    conditions.push('created_at <= ?');
    params.push(query.to_date);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = db.prepare(`
    SELECT COUNT(*) as count FROM audit_logs
    ${whereClause}
  `).get(...params) as { count: number };

  return result.count;
};
