// Authentication routes - login, register, refresh token, logout
import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/index.js';
import { User, Firm } from '../db/schema.js';
import {
  AuthRequest,
  authenticate,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
} from '../middleware/auth.js';
import { logAuditEvent } from '../services/audit.js';

const router = Router();

// Password validation
const validatePassword = (password: string): { valid: boolean; message?: string } => {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  return { valid: true };
};

// Email validation
const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// POST /api/auth/register - Register a new user
router.post('/register', async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, firstName, lastName, firmId, firmName, role = 'attorney' } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName) {
      res.status(400).json({ error: 'Missing required fields: email, password, firstName, lastName' });
      return;
    }

    // Validate email format
    if (!validateEmail(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      res.status(400).json({ error: passwordValidation.message });
      return;
    }

    // Validate role
    const validRoles = ['admin', 'attorney', 'paralegal', 'staff'];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: 'Invalid role. Must be one of: admin, attorney, paralegal, staff' });
      return;
    }

    const db = getDatabase();

    // Check if email already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    let actualFirmId = firmId;

    // If firmId is provided, verify it exists
    if (firmId) {
      const firm = db.prepare('SELECT id FROM firms WHERE id = ?').get(firmId) as Firm | undefined;
      if (!firm) {
        res.status(400).json({ error: 'Invalid firm ID' });
        return;
      }
    } else if (firmName) {
      // Create a new firm if firmName is provided
      actualFirmId = uuidv4();
      db.prepare(`
        INSERT INTO firms (id, name, created_at, updated_at)
        VALUES (?, ?, datetime('now'), datetime('now'))
      `).run(actualFirmId, firmName);
    } else {
      res.status(400).json({ error: 'Either firmId or firmName is required' });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const userId = uuidv4();
    db.prepare(`
      INSERT INTO users (id, firm_id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(userId, actualFirmId, email, passwordHash, firstName, lastName, role);

    // Generate tokens
    const tokenPayload = {
      userId,
      email,
      firmId: actualFirmId,
      role: role as User['role'],
    };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Log audit event
    await logAuditEvent({
      event_type: 'USER_REGISTERED',
      user_id: userId,
      firm_id: actualFirmId,
      details: { email, role },
      ip_address: req.ip || req.socket.remoteAddress,
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: userId,
        email,
        firstName,
        lastName,
        role,
        firmId: actualFirmId,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login - Login with email and password
router.post('/login', async (req: AuthRequest, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const db = getDatabase();

    // Get user by email
    const user = db.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).get(email) as User | undefined;

    if (!user) {
      // Use generic error to prevent user enumeration
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (!user.is_active) {
      res.status(401).json({ error: 'Account is deactivated' });
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      // Log failed login attempt
      await logAuditEvent({
        event_type: 'LOGIN_FAILED',
        user_id: user.id,
        firm_id: user.firm_id,
        details: { email, reason: 'Invalid password' },
        ip_address: req.ip || req.socket.remoteAddress,
      });

      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Update last login
    db.prepare(
      "UPDATE users SET last_login = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    ).run(user.id);

    // Generate tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      firmId: user.firm_id,
      role: user.role,
    };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Log successful login
    await logAuditEvent({
      event_type: 'LOGIN_SUCCESS',
      user_id: user.id,
      firm_id: user.firm_id,
      details: { email },
      ip_address: req.ip || req.socket.remoteAddress,
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        firmId: user.firm_id,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/refresh - Refresh access token using refresh token
router.post('/refresh', (req: AuthRequest, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token is required' });
      return;
    }

    // Verify refresh token
    let payload;
    try {
      payload = verifyToken(refreshToken);
    } catch {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }

    const db = getDatabase();

    // Verify user still exists and is active
    const user = db.prepare(
      'SELECT id, email, firm_id, role, is_active FROM users WHERE id = ?'
    ).get(payload.userId) as User | undefined;

    if (!user || !user.is_active) {
      res.status(401).json({ error: 'User not found or deactivated' });
      return;
    }

    // Generate new access token
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      firmId: user.firm_id,
      role: user.role,
    };
    const accessToken = generateAccessToken(tokenPayload);

    res.json({
      accessToken,
    });
  } catch (err) {
    console.error('Token refresh error:', err);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// GET /api/auth/me - Get current user info
router.get('/me', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const user = db.prepare(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.firm_id, u.last_login, u.created_at,
             f.name as firm_name
      FROM users u
      JOIN firms f ON u.firm_id = f.id
      WHERE u.id = ?
    `).get(req.user!.id) as (User & { firm_name: string }) | undefined;

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        firmId: user.firm_id,
        firmName: user.firm_name,
        lastLogin: user.last_login,
        createdAt: user.created_at,
      },
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// POST /api/auth/change-password - Change password
router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required' });
      return;
    }

    // Validate new password strength
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      res.status(400).json({ error: passwordValidation.message });
      return;
    }

    const db = getDatabase();
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as Pick<User, 'password_hash'> | undefined;

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    // Hash and update new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    db.prepare(
      "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(newPasswordHash, req.user!.id);

    // Log audit event
    await logAuditEvent({
      event_type: 'PASSWORD_CHANGED',
      user_id: req.user!.id,
      firm_id: req.user!.firm_id,
      details: {},
      ip_address: req.ip || req.socket.remoteAddress,
    });

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// POST /api/auth/logout - Logout (client should discard tokens)
router.post('/logout', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Log audit event
    await logAuditEvent({
      event_type: 'LOGOUT',
      user_id: req.user!.id,
      firm_id: req.user!.firm_id,
      details: {},
      ip_address: req.ip || req.socket.remoteAddress,
    });

    // Note: With JWT, we can't truly invalidate tokens server-side without a token blacklist
    // For full logout support, consider implementing token blacklisting or using short-lived tokens
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Logout failed' });
  }
});

export default router;
