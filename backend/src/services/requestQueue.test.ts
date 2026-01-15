// Tests for Request Queue Service
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequestQueue, RequestQueue, QueuedRequest } from './requestQueue.js';

describe('RequestQueue', () => {
  let queue: RequestQueue;

  beforeEach(() => {
    queue = createRequestQueue({
      maxConcurrent: 2,
      maxQueueSize: 10,
      requestTimeout: 5000,
      maxRetries: 2,
      retryDelay: 100,
      enableDeduplication: true,
      deduplicationWindow: 1000,
      perUserLimit: 5,
      perUserLimitWindow: 60000,
    });
  });

  afterEach(() => {
    queue.stop();
  });

  describe('Enqueue', () => {
    it('should enqueue a request successfully', () => {
      const result = queue.enqueue('generate', { content: 'test' }, {
        userId: 'user1',
        firmId: 'firm1',
      });

      expect('id' in result).toBe(true);
      if ('id' in result) {
        expect(result.id).toBeDefined();
        expect(result.status).toBe('pending');
        expect(result.type).toBe('generate');
      }
    });

    it('should respect queue size limit', () => {
      // Fill the queue
      for (let i = 0; i < 10; i++) {
        queue.enqueue('generate', { id: i }, {
          userId: `user${i}`,
          firmId: 'firm1',
        });
      }

      // Should fail when full
      const result = queue.enqueue('generate', { id: 'overflow' }, {
        userId: 'user11',
        firmId: 'firm1',
      });

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('Queue is full');
      }
    });

    it('should respect per-user rate limit', () => {
      // Fill user's quota
      for (let i = 0; i < 5; i++) {
        queue.enqueue('generate', { id: i }, {
          userId: 'limited-user',
          firmId: 'firm1',
        });
      }

      // Should fail for same user
      const result = queue.enqueue('generate', { id: 'extra' }, {
        userId: 'limited-user',
        firmId: 'firm1',
      });

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('Too many requests');
      }
    });

    it('should detect duplicate requests', () => {
      const dedupKey = 'unique-key';

      const first = queue.enqueue('generate', { id: 1 }, {
        userId: 'user1',
        firmId: 'firm1',
        dedupKey,
      });

      const second = queue.enqueue('generate', { id: 2 }, {
        userId: 'user1',
        firmId: 'firm1',
        dedupKey,
      });

      expect('id' in first).toBe(true);
      expect('error' in second).toBe(true);
      if ('error' in second && 'existingRequestId' in second) {
        expect(second.error).toContain('Duplicate request');
        expect(second.existingRequestId).toBeDefined();
      }
    });

    it('should support priority ordering', () => {
      const low = queue.enqueue('generate', { priority: 'low' }, {
        userId: 'user1',
        firmId: 'firm1',
        priority: 10,
      });

      const high = queue.enqueue('generate', { priority: 'high' }, {
        userId: 'user2',
        firmId: 'firm1',
        priority: 1,
      });

      // High priority should be first in queue
      const position1 = queue.getQueuePosition((high as QueuedRequest).id);
      const position2 = queue.getQueuePosition((low as QueuedRequest).id);

      expect(position1).toBeLessThan(position2);
    });
  });

  describe('Status Tracking', () => {
    it('should return status of enqueued request', () => {
      const result = queue.enqueue('generate', { test: true }, {
        userId: 'user1',
        firmId: 'firm1',
      }) as QueuedRequest;

      const status = queue.getStatus(result.id);
      expect(status).toBeDefined();
      expect(status?.status).toBe('pending');
    });

    it('should return undefined for unknown request', () => {
      const status = queue.getStatus('nonexistent-id');
      expect(status).toBeUndefined();
    });

    it('should return queue position', () => {
      const first = queue.enqueue('generate', { order: 1 }, {
        userId: 'user1',
        firmId: 'firm1',
      }) as QueuedRequest;

      const second = queue.enqueue('generate', { order: 2 }, {
        userId: 'user2',
        firmId: 'firm1',
      }) as QueuedRequest;

      expect(queue.getQueuePosition(first.id)).toBe(1);
      expect(queue.getQueuePosition(second.id)).toBe(2);
    });
  });

  describe('Cancellation', () => {
    it('should cancel a pending request', () => {
      const result = queue.enqueue('generate', { test: true }, {
        userId: 'user1',
        firmId: 'firm1',
      }) as QueuedRequest;

      const cancelled = queue.cancel(result.id);
      expect(cancelled).toBe(true);

      const status = queue.getStatus(result.id);
      expect(status?.status).toBe('cancelled');
    });

    it('should return false for unknown request', () => {
      const cancelled = queue.cancel('nonexistent-id');
      expect(cancelled).toBe(false);
    });
  });

  describe('User Requests', () => {
    it('should return all requests for a user', () => {
      queue.enqueue('generate', { id: 1 }, {
        userId: 'target-user',
        firmId: 'firm1',
      });
      queue.enqueue('generate', { id: 2 }, {
        userId: 'target-user',
        firmId: 'firm1',
      });
      queue.enqueue('generate', { id: 3 }, {
        userId: 'other-user',
        firmId: 'firm1',
      });

      const userRequests = queue.getUserRequests('target-user');
      expect(userRequests).toHaveLength(2);
    });
  });

  describe('Statistics', () => {
    it('should return queue statistics', () => {
      queue.enqueue('generate', { id: 1 }, {
        userId: 'user1',
        firmId: 'firm1',
      });
      queue.enqueue('generate', { id: 2 }, {
        userId: 'user2',
        firmId: 'firm1',
      });

      const stats = queue.getStats();
      expect(stats.pendingCount).toBe(2);
      expect(stats.processingCount).toBe(0);
      expect(stats.activeUsers).toBe(2);
      expect(stats.queueUtilization).toBe(0.2); // 2/10
    });
  });

  describe('Processing', () => {
    it('should process requests with registered processor', async () => {
      const processedIds: string[] = [];

      queue.registerProcessor('generate', async (request) => {
        processedIds.push(request.id);
        return { success: true };
      });

      queue.start();

      const request = queue.enqueue('generate', { test: true }, {
        userId: 'user1',
        firmId: 'firm1',
      }) as QueuedRequest;

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(processedIds).toContain(request.id);
      const status = queue.getStatus(request.id);
      expect(status?.status).toBe('completed');
    });

    it('should retry failed requests', async () => {
      let attempts = 0;

      queue.registerProcessor('generate', async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary failure');
        }
        return { success: true };
      });

      queue.start();

      const request = queue.enqueue('generate', { test: true }, {
        userId: 'user1',
        firmId: 'firm1',
        maxRetries: 3,
      }) as QueuedRequest;

      // Wait for processing and retries
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(attempts).toBe(2);
      const status = queue.getStatus(request.id);
      expect(status?.status).toBe('completed');
    });

    it('should fail after max retries', async () => {
      queue.registerProcessor('generate', async () => {
        throw new Error('Permanent failure');
      });

      queue.start();

      const request = queue.enqueue('generate', { test: true }, {
        userId: 'user1',
        firmId: 'firm1',
        maxRetries: 2,
      }) as QueuedRequest;

      // Wait for processing and all retries
      await new Promise(resolve => setTimeout(resolve, 1500));

      const status = queue.getStatus(request.id);
      expect(status?.status).toBe('failed');
      expect(status?.error).toContain('Permanent failure');
    });

    it('should emit events during processing', async () => {
      const events: string[] = [];

      queue.on('enqueued', () => events.push('enqueued'));
      queue.on('processing', () => events.push('processing'));
      queue.on('completed', () => events.push('completed'));

      queue.registerProcessor('generate', async () => ({ success: true }));
      queue.start();

      queue.enqueue('generate', { test: true }, {
        userId: 'user1',
        firmId: 'firm1',
      });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(events).toContain('enqueued');
      expect(events).toContain('processing');
      expect(events).toContain('completed');
    });
  });

  describe('Wait for Completion', () => {
    it('should wait for request completion', async () => {
      queue.registerProcessor('generate', async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { result: 'done' };
      });

      queue.start();

      const request = queue.enqueue('generate', { test: true }, {
        userId: 'user1',
        firmId: 'firm1',
      }) as QueuedRequest;

      const result = await queue.waitForCompletion<{ result: string }>(request.id, 5000);
      expect(result.result).toBe('done');
    });

    it('should reject on failure', async () => {
      queue.registerProcessor('generate', async () => {
        throw new Error('Test error');
      });

      queue.start();

      const request = queue.enqueue('generate', { test: true }, {
        userId: 'user1',
        firmId: 'firm1',
        maxRetries: 0,
      }) as QueuedRequest;

      await expect(
        queue.waitForCompletion(request.id, 5000)
      ).rejects.toThrow('Test error');
    });

    it('should reject on timeout', async () => {
      queue.registerProcessor('generate', async () => {
        await new Promise(resolve => setTimeout(resolve, 10000));
        return { result: 'done' };
      });

      queue.start();

      const request = queue.enqueue('generate', { test: true }, {
        userId: 'user1',
        firmId: 'firm1',
      }) as QueuedRequest;

      await expect(
        queue.waitForCompletion(request.id, 100)
      ).rejects.toThrow('timed out');
    });
  });
});
