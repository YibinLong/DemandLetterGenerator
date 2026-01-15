// Rate limiting middleware using SQLite for persistence
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/index.js';
import { AuthRequest } from './auth.js';
import { logAuditEvent } from '../services/audit.js';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  max: number; // Maximum requests per window
  message?: string; // Custom error message
  keyGenerator?: (req: Request) => string; // Custom key generator
  skipFailedRequests?: boolean; // Don't count failed requests
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skip?: (req: Request) => boolean; // Skip rate limiting for certain requests
}

// Default configuration for general API endpoints
export const defaultConfig: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests, please try again later',
};

// Stricter configuration for authentication endpoints
export const authConfig: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes
  message: 'Too many login attempts, please try again later',
};

// Configuration for AI generation endpoints (more expensive operations)
export const aiConfig: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 AI requests per minute
  message: 'AI generation rate limit exceeded, please try again later',
};

// Get identifier for rate limiting (IP address or user ID if authenticated)
const getIdentifier = (req: Request): string => {
  const authReq = req as AuthRequest;
  if (authReq.user?.id) {
    return `user:${authReq.user.id}`;
  }
  // Use IP address for unauthenticated requests
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded
    ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0])
    : req.ip || req.socket.remoteAddress || 'unknown';
  return `ip:${ip}`;
};

// Clean up expired rate limit records
const cleanupExpiredRecords = (): void => {
  const db = getDatabase();
  try {
    // Delete records older than 24 hours
    db.prepare(`
      DELETE FROM rate_limits
      WHERE datetime(window_start) < datetime('now', '-24 hours')
    `).run();
  } catch (err) {
    console.error('Error cleaning up rate limit records:', err);
  }
};

// Run cleanup periodically (every hour)
let cleanupInterval: ReturnType<typeof setInterval> | null = null;
export const startRateLimitCleanup = (): void => {
  if (!cleanupInterval) {
    cleanupInterval = setInterval(cleanupExpiredRecords, 60 * 60 * 1000);
  }
};

// Stop cleanup (for testing)
export const stopRateLimitCleanup = (): void => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
};

// Rate limit middleware factory
export const rateLimit = (config: Partial<RateLimitConfig> = {}): ((req: Request, res: Response, next: NextFunction) => void) => {
  const options = { ...defaultConfig, ...config };

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Check if we should skip this request
      if (options.skip && options.skip(req)) {
        next();
        return;
      }

      const db = getDatabase();
      const identifier = options.keyGenerator ? options.keyGenerator(req) : getIdentifier(req);
      const endpoint = req.path;
      const key = `${identifier}:${endpoint}`;
      const windowStartTime = new Date(Date.now() - options.windowMs).toISOString();

      // Get current rate limit record
      const record = db.prepare(`
        SELECT id, request_count, window_start
        FROM rate_limits
        WHERE identifier = ? AND endpoint = ? AND datetime(window_start) > datetime(?)
      `).get(identifier, endpoint, windowStartTime) as { id: string; request_count: number; window_start: string } | undefined;

      if (record) {
        // Check if limit exceeded
        if (record.request_count >= options.max) {
          // Log the rate limit exceeded event
          const authReq = req as AuthRequest;
          logAuditEvent({
            event_type: 'RATE_LIMIT_EXCEEDED',
            user_id: authReq.user?.id,
            firm_id: authReq.user?.firm_id,
            details: {
              endpoint,
              identifier,
              count: record.request_count,
              limit: options.max,
            },
            ip_address: req.ip || req.socket.remoteAddress,
          }).catch(console.error);

          res.status(429).json({
            error: options.message,
            retryAfter: Math.ceil(options.windowMs / 1000),
          });
          return;
        }

        // Increment the counter
        db.prepare(`
          UPDATE rate_limits
          SET request_count = request_count + 1
          WHERE id = ?
        `).run(record.id);
      } else {
        // Create new record
        db.prepare(`
          INSERT OR REPLACE INTO rate_limits (id, identifier, endpoint, request_count, window_start, created_at)
          VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
        `).run(uuidv4(), identifier, endpoint);
      }

      // Add rate limit headers
      const currentCount = record ? record.request_count + 1 : 1;
      res.setHeader('X-RateLimit-Limit', options.max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, options.max - currentCount));
      res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + Math.ceil(options.windowMs / 1000));

      next();
    } catch (err) {
      // Don't block requests if rate limiting fails
      console.error('Rate limiting error:', err);
      next();
    }
  };
};

// Pre-configured rate limiters for common use cases
export const generalRateLimit = rateLimit(defaultConfig);
export const authRateLimit = rateLimit(authConfig);
export const aiRateLimit = rateLimit(aiConfig);

// Export for testing
export { getIdentifier };
