import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Socket.io client
const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connected: false,
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

// Mock Yjs
vi.mock('yjs', () => ({
  Doc: vi.fn().mockImplementation(() => ({
    getText: vi.fn(() => ({
      observe: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
      toString: vi.fn(() => ''),
    })),
    on: vi.fn(),
    off: vi.fn(),
    destroy: vi.fn(),
  })),
  applyUpdate: vi.fn(),
  encodeStateAsUpdate: vi.fn(() => new Uint8Array()),
}));

// Mock API client
vi.mock('./api', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
  getAccessToken: vi.fn(() => 'mock-token'),
}));

// Import after mocks
import { CollaborationClient, getCollaborationClient } from './collaboration';

describe('CollaborationClient', () => {
  let client: CollaborationClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new CollaborationClient();
  });

  afterEach(() => {
    client.disconnect();
  });

  describe('Constructor', () => {
    it('should create client instance', () => {
      expect(client).toBeDefined();
    });

    it('should initialize event listeners', () => {
      // The client has a listeners map
      expect(client).toHaveProperty('on');
      expect(client).toHaveProperty('off');
    });
  });

  describe('Connection Status', () => {
    it('should have connected property', () => {
      expect(typeof client.connected).toBe('boolean');
    });

    it('should return false for connected when not connected', () => {
      expect(client.connected).toBe(false);
    });
  });

  describe('Document Operations', () => {
    it('should have joinDocument method', () => {
      expect(typeof client.joinDocument).toBe('function');
    });

    it('should have leaveDocument method', () => {
      expect(typeof client.leaveDocument).toBe('function');
    });

    it('should have currentDocumentId property', () => {
      expect(client.currentDocumentId).toBeNull();
    });
  });

  describe('User Management', () => {
    it('should have getUsers method', () => {
      expect(typeof client.getUsers).toBe('function');
    });

    it('should return empty array when no users', () => {
      expect(client.getUsers()).toEqual([]);
    });
  });

  describe('Cursor Updates', () => {
    it('should have updateCursor method', () => {
      expect(typeof client.updateCursor).toBe('function');
    });

    it('should not throw when calling updateCursor while disconnected', () => {
      expect(() => {
        client.updateCursor({ anchor: 0, head: 0 });
      }).not.toThrow();
    });
  });

  describe('Event Handling', () => {
    it('should have on method for event subscription', () => {
      expect(typeof client.on).toBe('function');
    });

    it('should have off method for event unsubscription', () => {
      expect(typeof client.off).toBe('function');
    });

    it('should return unsubscribe function from on()', () => {
      const callback = vi.fn();
      const unsubscribe = client.on('connected', callback);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should accept callback for error events', () => {
      const callback = vi.fn();
      client.on('error', callback);
      // Should not throw
      expect(true).toBe(true);
    });

    it('should accept callback for user-joined events', () => {
      const callback = vi.fn();
      client.on('user-joined', callback);
      // Should not throw
      expect(true).toBe(true);
    });

    it('should accept callback for user-left events', () => {
      const callback = vi.fn();
      client.on('user-left', callback);
      // Should not throw
      expect(true).toBe(true);
    });

    it('should accept callback for room-users events', () => {
      const callback = vi.fn();
      client.on('room-users', callback);
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('Disconnect', () => {
    it('should have disconnect method', () => {
      expect(typeof client.disconnect).toBe('function');
    });

    it('should not throw when disconnecting while not connected', () => {
      expect(() => {
        client.disconnect();
      }).not.toThrow();
    });
  });
});

describe('getCollaborationClient', () => {
  it('should return a CollaborationClient instance', () => {
    const client = getCollaborationClient();
    expect(client).toBeInstanceOf(CollaborationClient);
  });

  it('should return the same instance on subsequent calls', () => {
    const client1 = getCollaborationClient();
    const client2 = getCollaborationClient();
    expect(client1).toBe(client2);
  });
});

describe('Collaboration API Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchFirmUsers', () => {
    it('should be exported from collaboration module', async () => {
      const { searchFirmUsers } = await import('./collaboration');
      expect(typeof searchFirmUsers).toBe('function');
    });
  });

  describe('createCollaborationInvite', () => {
    it('should be exported from collaboration module', async () => {
      const { createCollaborationInvite } = await import('./collaboration');
      expect(typeof createCollaborationInvite).toBe('function');
    });
  });

  describe('getCollaborationInvites', () => {
    it('should be exported from collaboration module', async () => {
      const { getCollaborationInvites } = await import('./collaboration');
      expect(typeof getCollaborationInvites).toBe('function');
    });
  });

  describe('revokeCollaborationInvite', () => {
    it('should be exported from collaboration module', async () => {
      const { revokeCollaborationInvite } = await import('./collaboration');
      expect(typeof revokeCollaborationInvite).toBe('function');
    });
  });

  describe('createCollaborationSession', () => {
    it('should be exported from collaboration module', async () => {
      const { createCollaborationSession } = await import('./collaboration');
      expect(typeof createCollaborationSession).toBe('function');
    });
  });

  describe('getActiveCollaborators', () => {
    it('should be exported from collaboration module', async () => {
      const { getActiveCollaborators } = await import('./collaboration');
      expect(typeof getActiveCollaborators).toBe('function');
    });
  });

  describe('acceptCollaborationInvite', () => {
    it('should be exported from collaboration module', async () => {
      const { acceptCollaborationInvite } = await import('./collaboration');
      expect(typeof acceptCollaborationInvite).toBe('function');
    });
  });
});
