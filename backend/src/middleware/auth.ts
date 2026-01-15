// Authentication middleware using JWT
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDatabase } from '../db/index.js';
import { User } from '../db/schema.js';

// Extend Express Request to include user
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    firm_id: string;
    role: User['role'];
    first_name: string;
    last_name: string;
  };
}

// JWT payload interface
export interface JWTPayload {
  userId: string;
  email: string;
  firmId: string;
  role: User['role'];
  iat?: number;
  exp?: number;
}

// Get JWT secret from environment
const getJWTSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'your-jwt-secret-change-in-production') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set in production');
    }
    // Use a default for development
    return 'dev-jwt-secret-do-not-use-in-production';
  }
  return secret;
};

// Generate access token (short-lived)
export const generateAccessToken = (payload: Omit<JWTPayload, 'iat' | 'exp'>): string => {
  return jwt.sign(payload, getJWTSecret(), {
    expiresIn: '15m', // 15 minutes
  });
};

// Generate refresh token (longer-lived)
export const generateRefreshToken = (payload: Omit<JWTPayload, 'iat' | 'exp'>): string => {
  return jwt.sign(payload, getJWTSecret(), {
    expiresIn: '7d', // 7 days
  });
};

// Verify token
export const verifyToken = (token: string): JWTPayload => {
  return jwt.verify(token, getJWTSecret()) as JWTPayload;
};

// Authentication middleware - requires valid JWT token
export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Access token required' });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      const payload = verifyToken(token);

      // Get fresh user data from database
      const db = getDatabase();
      const user = db.prepare(
        'SELECT id, email, firm_id, role, first_name, last_name, is_active FROM users WHERE id = ?'
      ).get(payload.userId) as (User & { is_active: number }) | undefined;

      if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      if (!user.is_active) {
        res.status(401).json({ error: 'User account is deactivated' });
        return;
      }

      req.user = {
        id: user.id,
        email: user.email,
        firm_id: user.firm_id,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
      };

      next();
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
        return;
      }
      if (err instanceof jwt.JsonWebTokenError) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
};

// Optional authentication - attaches user if token is valid, but doesn't require it
export const optionalAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    const db = getDatabase();
    const user = db.prepare(
      'SELECT id, email, firm_id, role, first_name, last_name, is_active FROM users WHERE id = ?'
    ).get(payload.userId) as (User & { is_active: number }) | undefined;

    if (user && user.is_active) {
      req.user = {
        id: user.id,
        email: user.email,
        firm_id: user.firm_id,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
      };
    }
  } catch {
    // Token invalid, continue without user
  }

  next();
};

// Role-based authorization middleware factory
export const requireRole = (...allowedRoles: User['role'][]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.user.role,
      });
      return;
    }

    next();
  };
};

// Firm access control - ensures user can only access resources within their firm
export const requireFirmAccess = (firmIdParam: string = 'firmId') => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Get firm ID from route params, query, or body
    const requestedFirmId =
      req.params[firmIdParam] ||
      req.query[firmIdParam] ||
      (req.body && req.body[firmIdParam]);

    if (requestedFirmId && requestedFirmId !== req.user.firm_id) {
      // Admins can still only access their own firm's data
      res.status(403).json({
        error: 'Access denied: You can only access resources within your firm',
      });
      return;
    }

    next();
  };
};

// Admin-only middleware
export const requireAdmin = requireRole('admin');

// Attorney or admin middleware
export const requireAttorneyOrAdmin = requireRole('admin', 'attorney');

// Any authenticated user with document edit permissions
export const requireDocumentEditor = requireRole('admin', 'attorney', 'paralegal');
