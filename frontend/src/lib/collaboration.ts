// Collaboration client for real-time document editing
import { io, Socket } from 'socket.io-client';
import * as Y from 'yjs';
import { getAccessToken } from './api';

// Types
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
  session_id: string;
  demand_letter_id: string;
  created_at: string;
  expires_at: string;
}

export interface CollaborationInvite {
  id: string;
  token: string;
  permission: 'view' | 'edit';
  expires_at: string;
  already_exists?: boolean;
}

export interface InviteDetails {
  id: string;
  invited_email: string;
  invited_name: string | null;
  invited_by: string;
  permission: 'view' | 'edit';
  accepted: boolean;
  created_at: string;
  expires_at: string;
}

export interface FirmUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

// Collaboration events
export type CollaborationEventType =
  | 'connected'
  | 'disconnected'
  | 'user-joined'
  | 'user-left'
  | 'user-cursor-update'
  | 'sync-update'
  | 'room-users'
  | 'error';

export interface CollaborationEventData {
  connected: undefined;
  disconnected: undefined;
  'user-joined': { user: CollaborationUser };
  'user-left': { userId: string };
  'user-cursor-update': { userId: string; cursor?: { anchor: number; head: number } };
  'sync-update': { update: number[] };
  'room-users': { users: CollaborationUser[] };
  error: { message: string };
}

type EventCallback<T extends CollaborationEventType> = (data: CollaborationEventData[T]) => void;

// Collaboration client class
export class CollaborationClient {
  private socket: Socket | null = null;
  private ydoc: Y.Doc | null = null;
  private demandLetterId: string | null = null;
  private listeners: Map<CollaborationEventType, Set<EventCallback<CollaborationEventType>>> = new Map();
  private isConnected = false;
  private users: Map<string, CollaborationUser> = new Map();

  constructor() {
    // Initialize listener maps
    const events: CollaborationEventType[] = [
      'connected', 'disconnected', 'user-joined', 'user-left',
      'user-cursor-update', 'sync-update', 'room-users', 'error'
    ];
    events.forEach(event => this.listeners.set(event, new Set()));
  }

  // Connect to the WebSocket server
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const token = getAccessToken();
      if (!token) {
        reject(new Error('Not authenticated'));
        return;
      }

      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

      this.socket = io(baseUrl, {
        path: '/collaboration',
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
        this.isConnected = true;
        this.emit('connected', undefined);
        resolve();
      });

      this.socket.on('disconnect', () => {
        this.isConnected = false;
        this.emit('disconnected', undefined);
      });

      this.socket.on('connect_error', (error) => {
        this.emit('error', { message: error.message });
        reject(error);
      });

      // Room events
      this.socket.on('room-users', (data: { users: CollaborationUser[] }) => {
        this.users.clear();
        data.users.forEach(user => this.users.set(user.id, user));
        this.emit('room-users', data);
      });

      this.socket.on('user-joined', (data: { user: CollaborationUser }) => {
        this.users.set(data.user.id, data.user);
        this.emit('user-joined', data);
      });

      this.socket.on('user-left', (data: { userId: string }) => {
        this.users.delete(data.userId);
        this.emit('user-left', data);
      });

      this.socket.on('user-cursor-update', (data: { userId: string; cursor?: { anchor: number; head: number } }) => {
        const user = this.users.get(data.userId);
        if (user) {
          user.cursor = data.cursor;
          this.users.set(data.userId, user);
        }
        this.emit('user-cursor-update', data);
      });

      // Sync events
      this.socket.on('sync-update', (data: { update: number[] }) => {
        if (this.ydoc) {
          const update = new Uint8Array(data.update);
          Y.applyUpdate(this.ydoc, update);
        }
        this.emit('sync-update', data);
      });

      this.socket.on('sync-updates', (data: { updates: number[][] }) => {
        if (this.ydoc) {
          data.updates.forEach(update => {
            Y.applyUpdate(this.ydoc!, new Uint8Array(update));
          });
        }
      });

      this.socket.on('error', (data: { message: string }) => {
        this.emit('error', data);
      });
    });
  }

  // Join a document room
  joinDocument(demandLetterId: string, ydoc: Y.Doc): void {
    if (!this.socket || !this.isConnected) {
      throw new Error('Not connected to collaboration server');
    }

    this.demandLetterId = demandLetterId;
    this.ydoc = ydoc;

    // Listen for local Yjs updates
    ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      // Only send updates that originated locally
      if (origin !== 'remote') {
        this.sendUpdate(update);
      }
    });

    this.socket.emit('join-document', { demandLetterId });
  }

  // Leave the current document room
  leaveDocument(): void {
    if (!this.socket) return;

    if (this.ydoc) {
      this.ydoc.destroy();
      this.ydoc = null;
    }

    this.demandLetterId = null;
    this.users.clear();
    this.socket.emit('leave-document');
  }

  // Send a Yjs update to other collaborators
  private sendUpdate(update: Uint8Array): void {
    if (!this.socket || !this.isConnected) return;
    this.socket.emit('sync-update', { update: Array.from(update) });
  }

  // Update cursor position
  updateCursor(cursor: { anchor: number; head: number } | undefined): void {
    if (!this.socket || !this.isConnected) return;
    this.socket.emit('awareness-update', { cursor });
  }

  // Get active users in the room
  getUsers(): CollaborationUser[] {
    return Array.from(this.users.values());
  }

  // Check if connected
  get connected(): boolean {
    return this.isConnected;
  }

  // Get current document ID
  get currentDocumentId(): string | null {
    return this.demandLetterId;
  }

  // Event handling
  on<T extends CollaborationEventType>(event: T, callback: EventCallback<T>): () => void {
    const set = this.listeners.get(event);
    if (set) {
      set.add(callback as EventCallback<CollaborationEventType>);
    }
    return () => this.off(event, callback);
  }

  off<T extends CollaborationEventType>(event: T, callback: EventCallback<T>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback as EventCallback<CollaborationEventType>);
    }
  }

  private emit<T extends CollaborationEventType>(event: T, data: CollaborationEventData[T]): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach(callback => callback(data));
    }
  }

  // Disconnect from the server
  disconnect(): void {
    this.leaveDocument();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
  }
}

// Singleton instance
let collaborationClient: CollaborationClient | null = null;

export function getCollaborationClient(): CollaborationClient {
  if (!collaborationClient) {
    collaborationClient = new CollaborationClient();
  }
  return collaborationClient;
}

// API functions for collaboration REST endpoints
import { apiClient } from './api';

export async function getActiveCollaborators(demandLetterId: string): Promise<{
  demand_letter_id: string;
  collaborators: CollaborationUser[];
  count: number;
}> {
  const response = await apiClient.get(`/api/collaboration/${demandLetterId}/active`);
  return response.data;
}

export async function createCollaborationSession(demandLetterId: string): Promise<CollaborationSession> {
  const response = await apiClient.post(`/api/collaboration/${demandLetterId}/session`);
  return response.data;
}

export async function createCollaborationInvite(
  demandLetterId: string,
  invite: { email?: string; user_id?: string; permission?: 'view' | 'edit' }
): Promise<CollaborationInvite> {
  const response = await apiClient.post(`/api/collaboration/${demandLetterId}/invite`, invite);
  return response.data;
}

export async function acceptCollaborationInvite(token: string): Promise<{
  demand_letter_id: string;
  session_id: string;
  permission: 'view' | 'edit';
  accepted: boolean;
}> {
  const response = await apiClient.post(`/api/collaboration/invite/${token}/accept`);
  return response.data;
}

export async function getCollaborationInvites(demandLetterId: string): Promise<{
  demand_letter_id: string;
  invites: InviteDetails[];
}> {
  const response = await apiClient.get(`/api/collaboration/${demandLetterId}/invites`);
  return response.data;
}

export async function revokeCollaborationInvite(demandLetterId: string, inviteId: string): Promise<void> {
  await apiClient.delete(`/api/collaboration/${demandLetterId}/invite/${inviteId}`);
}

export async function searchFirmUsers(search?: string): Promise<{ users: FirmUser[] }> {
  const response = await apiClient.get('/api/collaboration/users', { params: { search } });
  return response.data;
}
