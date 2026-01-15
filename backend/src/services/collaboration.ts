// Collaboration service for real-time document editing
import { Server, Socket } from 'socket.io';
import http from 'http';
import jwt from 'jsonwebtoken';
import { getDatabase } from '../db/index.js';
import { User, DemandLetter } from '../db/schema.js';
import { logAuditEvent, AuditEventType } from './audit.js';

// Types for collaboration
export interface CollaborationUser {
  id: string;
  email: string;
  firm_id: string;
  first_name: string;
  last_name: string;
  color: string;
  cursor?: {
    anchor: number;
    head: number;
  };
}

export interface CollaborationSession {
  id: string;
  demand_letter_id: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  is_active: number;
}

export interface CollaborationInvite {
  id: string;
  session_id: string;
  demand_letter_id: string;
  invited_by: string;
  invited_user_id?: string;
  invited_email?: string;
  token: string;
  permission: 'view' | 'edit';
  accepted: number;
  created_at: string;
  expires_at: string;
}

// Color palette for user cursors
const CURSOR_COLORS = [
  '#f87171', // red
  '#fb923c', // orange
  '#fbbf24', // amber
  '#a3e635', // lime
  '#4ade80', // green
  '#2dd4bf', // teal
  '#22d3ee', // cyan
  '#60a5fa', // blue
  '#a78bfa', // violet
  '#f472b6', // pink
];

// Map to store active rooms and their users
const activeRooms = new Map<string, Map<string, CollaborationUser>>();

// Map to store Yjs document state updates
const documentUpdates = new Map<string, Uint8Array[]>();

// Get JWT secret
const getJWTSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'your-jwt-secret-change-in-production') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set in production');
    }
    return 'dev-jwt-secret-do-not-use-in-production';
  }
  return secret;
};

// Verify JWT token
const verifyToken = (token: string): { userId: string; firmId: string } | null => {
  try {
    const decoded = jwt.verify(token, getJWTSecret()) as { userId: string; firmId: string };
    return decoded;
  } catch {
    return null;
  }
};

// Get user from database
const getUserFromDB = (userId: string): CollaborationUser | null => {
  const db = getDatabase();
  const user = db.prepare(
    'SELECT id, email, firm_id, first_name, last_name, is_active FROM users WHERE id = ?'
  ).get(userId) as (User & { is_active: number }) | undefined;

  if (!user || !user.is_active) return null;

  // Assign a color based on user ID hash
  const colorIndex = Math.abs(hashCode(user.id)) % CURSOR_COLORS.length;

  return {
    id: user.id,
    email: user.email,
    firm_id: user.firm_id,
    first_name: user.first_name,
    last_name: user.last_name,
    color: CURSOR_COLORS[colorIndex],
  };
};

// Simple hash function for consistent color assignment
const hashCode = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
};

// Check if user has access to demand letter
const userHasAccess = (userId: string, firmId: string, demandLetterId: string): boolean => {
  const db = getDatabase();
  const letter = db.prepare(
    'SELECT id, firm_id FROM demand_letters WHERE id = ?'
  ).get(demandLetterId) as DemandLetter | undefined;

  if (!letter) return false;

  // User must be in the same firm as the demand letter
  return letter.firm_id === firmId;
};

// Create or get collaboration session
export const getOrCreateSession = (demandLetterId: string, userId: string): CollaborationSession | null => {
  const db = getDatabase();

  // Check for active session
  let session = db.prepare(
    'SELECT * FROM collaboration_sessions WHERE demand_letter_id = ? AND is_active = 1 AND expires_at > datetime("now")'
  ).get(demandLetterId) as CollaborationSession | undefined;

  if (!session) {
    // Create new session (24 hour expiry)
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO collaboration_sessions (id, demand_letter_id, created_by, created_at, expires_at, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(id, demandLetterId, userId, now, expires);

    session = {
      id,
      demand_letter_id: demandLetterId,
      created_by: userId,
      created_at: now,
      expires_at: expires,
      is_active: 1,
    };
  }

  return session;
};

// Initialize Socket.io server
export const initializeCollaboration = (httpServer: http.Server): Server => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? process.env.FRONTEND_URL
        : ['http://localhost:5173', 'http://localhost:3000'],
      credentials: true,
    },
    path: '/collaboration',
  });

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return next(new Error('Invalid token'));
    }

    const user = getUserFromDB(decoded.userId);
    if (!user) {
      return next(new Error('User not found'));
    }

    // Attach user to socket
    socket.data.user = user;
    next();
  });

  // Handle connections
  io.on('connection', (socket) => {
    const user = socket.data.user as CollaborationUser;
    console.log(`[Collaboration] User connected: ${user.email}`);

    // Join a document room for collaboration
    socket.on('join-document', async (data: { demandLetterId: string }) => {
      const { demandLetterId } = data;

      // Verify access
      if (!userHasAccess(user.id, user.firm_id, demandLetterId)) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }

      const roomId = `doc:${demandLetterId}`;

      // Leave any existing rooms first
      const rooms = Array.from(socket.rooms);
      for (const room of rooms) {
        if (room.startsWith('doc:') && room !== roomId) {
          await leaveRoom(socket, room);
        }
      }

      // Join the room
      await socket.join(roomId);

      // Get or create the room's user map
      if (!activeRooms.has(roomId)) {
        activeRooms.set(roomId, new Map());
      }
      const roomUsers = activeRooms.get(roomId)!;
      roomUsers.set(socket.id, user);

      // Get or create session
      const session = getOrCreateSession(demandLetterId, user.id);

      // Log audit event
      logAuditEvent({
        event_type: 'COLLABORATION_JOINED' as AuditEventType,
        user_id: user.id,
        firm_id: user.firm_id,
        resource_type: 'demand_letter',
        resource_id: demandLetterId,
        details: { session_id: session?.id },
        ip_address: socket.handshake.address,
      });

      // Send current users in room
      const usersInRoom = Array.from(roomUsers.values());
      socket.emit('room-users', { users: usersInRoom });

      // Notify others that user joined
      socket.to(roomId).emit('user-joined', { user });

      // Send any stored document updates (for late joiners)
      const updates = documentUpdates.get(roomId);
      if (updates && updates.length > 0) {
        socket.emit('sync-updates', { updates: updates.map(u => Array.from(u)) });
      }

      console.log(`[Collaboration] ${user.email} joined document ${demandLetterId}`);
    });

    // Handle document updates (Yjs sync)
    socket.on('sync-update', (data: { update: number[] }) => {
      const rooms = Array.from(socket.rooms);
      const docRoom = rooms.find(r => r.startsWith('doc:'));

      if (!docRoom) return;

      // Convert to Uint8Array
      const update = new Uint8Array(data.update);

      // Store update for late joiners
      if (!documentUpdates.has(docRoom)) {
        documentUpdates.set(docRoom, []);
      }
      const updates = documentUpdates.get(docRoom)!;
      updates.push(update);

      // Limit stored updates (keep last 100)
      if (updates.length > 100) {
        updates.shift();
      }

      // Broadcast to other users in the room
      socket.to(docRoom).emit('sync-update', { update: data.update });
    });

    // Handle awareness updates (cursor position, selection)
    socket.on('awareness-update', (data: { cursor?: { anchor: number; head: number } }) => {
      const rooms = Array.from(socket.rooms);
      const docRoom = rooms.find(r => r.startsWith('doc:'));

      if (!docRoom) return;

      const roomUsers = activeRooms.get(docRoom);
      if (roomUsers) {
        const currentUser = roomUsers.get(socket.id);
        if (currentUser) {
          currentUser.cursor = data.cursor;
          roomUsers.set(socket.id, currentUser);
        }
      }

      // Broadcast cursor update to other users
      socket.to(docRoom).emit('user-cursor-update', {
        userId: user.id,
        cursor: data.cursor,
      });
    });

    // Leave document room
    socket.on('leave-document', async () => {
      const rooms = Array.from(socket.rooms);
      const docRoom = rooms.find(r => r.startsWith('doc:'));

      if (docRoom) {
        await leaveRoom(socket, docRoom);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`[Collaboration] User disconnected: ${user.email}`);

      // Remove user from all rooms
      const rooms = Array.from(socket.rooms);
      for (const room of rooms) {
        if (room.startsWith('doc:')) {
          const roomUsers = activeRooms.get(room);
          if (roomUsers) {
            roomUsers.delete(socket.id);

            // Notify others
            socket.to(room).emit('user-left', { userId: user.id });

            // Clean up empty rooms
            if (roomUsers.size === 0) {
              activeRooms.delete(room);
              // Keep document updates for a while for reconnections
              setTimeout(() => {
                if (!activeRooms.has(room)) {
                  documentUpdates.delete(room);
                }
              }, 60000); // Clean up after 1 minute of inactivity
            }
          }
        }
      }
    });
  });

  return io;
};

// Helper to leave a room
const leaveRoom = async (socket: Socket, roomId: string): Promise<void> => {
  const user = socket.data.user as CollaborationUser;

  await socket.leave(roomId);

  const roomUsers = activeRooms.get(roomId);
  if (roomUsers) {
    roomUsers.delete(socket.id);

    // Notify others
    socket.to(roomId).emit('user-left', { userId: user.id });

    // Clean up empty rooms
    if (roomUsers.size === 0) {
      activeRooms.delete(roomId);
    }
  }

  // Extract demand letter ID from room ID
  const demandLetterId = roomId.replace('doc:', '');

  // Log audit event
  logAuditEvent({
    event_type: 'COLLABORATION_LEFT' as AuditEventType,
    user_id: user.id,
    firm_id: user.firm_id,
    resource_type: 'demand_letter',
    resource_id: demandLetterId,
    ip_address: socket.handshake.address,
  });

  console.log(`[Collaboration] ${user.email} left room ${roomId}`);
};

// Get active collaborators for a document
export const getActiveCollaborators = (demandLetterId: string): CollaborationUser[] => {
  const roomId = `doc:${demandLetterId}`;
  const roomUsers = activeRooms.get(roomId);

  if (!roomUsers) return [];

  return Array.from(roomUsers.values());
};

// Export the rooms map for testing
export const _getActiveRooms = () => activeRooms;
