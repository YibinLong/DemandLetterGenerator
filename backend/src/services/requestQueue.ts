// Request Queue Service for AI Generation Requests
// Provides queuing, prioritization, deduplication, and rate limiting for expensive AI operations

import { EventEmitter } from 'events';

export interface QueuedRequest<T = unknown> {
  id: string;
  type: 'generate' | 'refine' | 'analyze' | 'export';
  priority: number; // Lower is higher priority
  userId: string;
  firmId: string;
  payload: T;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  result?: unknown;
  error?: string;
  retryCount: number;
  maxRetries: number;
  dedupKey?: string;
}

export interface QueueConfig {
  // Maximum concurrent requests being processed
  maxConcurrent: number;
  // Maximum queue size
  maxQueueSize: number;
  // Request timeout in milliseconds
  requestTimeout: number;
  // Maximum retries for failed requests
  maxRetries: number;
  // Retry delay in milliseconds (exponential backoff base)
  retryDelay: number;
  // Enable request deduplication
  enableDeduplication: boolean;
  // Deduplication window in milliseconds
  deduplicationWindow: number;
  // Per-user request limit
  perUserLimit: number;
  // Per-user limit window in milliseconds
  perUserLimitWindow: number;
}

export interface QueueStats {
  pendingCount: number;
  processingCount: number;
  completedCount: number;
  failedCount: number;
  totalProcessed: number;
  averageWaitTime: number;
  averageProcessTime: number;
  activeUsers: number;
  queueUtilization: number;
}

const DEFAULT_CONFIG: QueueConfig = {
  maxConcurrent: 5,
  maxQueueSize: 100,
  requestTimeout: 120000, // 2 minutes
  maxRetries: 3,
  retryDelay: 1000,
  enableDeduplication: true,
  deduplicationWindow: 5000, // 5 seconds
  perUserLimit: 10,
  perUserLimitWindow: 60000, // 1 minute
};

type RequestCallback<T, R> = (request: QueuedRequest<T>) => Promise<R>;

class RequestQueue extends EventEmitter {
  private config: QueueConfig;
  private queue: QueuedRequest[] = [];
  private processing: Map<string, QueuedRequest> = new Map();
  private completed: Map<string, QueuedRequest> = new Map();
  private userRequestCounts: Map<string, { count: number; windowStart: number }> = new Map();
  private dedupCache: Map<string, { requestId: string; timestamp: number }> = new Map();
  private processors: Map<string, RequestCallback<unknown, unknown>> = new Map();
  private stats = {
    totalProcessed: 0,
    totalFailed: 0,
    totalWaitTime: 0,
    totalProcessTime: 0,
  };
  private processingInterval: ReturnType<typeof setInterval> | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<QueueConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the queue processor
   */
  start(): void {
    if (this.processingInterval) {
      return;
    }

    // Process queue every 100ms
    this.processingInterval = setInterval(() => this.processQueue(), 100);

    // Cleanup old data every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);

    console.log('[RequestQueue] Started with config:', {
      maxConcurrent: this.config.maxConcurrent,
      maxQueueSize: this.config.maxQueueSize,
    });
  }

  /**
   * Stop the queue processor
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    console.log('[RequestQueue] Stopped');
  }

  /**
   * Register a processor for a request type
   */
  registerProcessor<T, R>(type: string, processor: RequestCallback<T, R>): void {
    this.processors.set(type, processor as RequestCallback<unknown, unknown>);
    console.log(`[RequestQueue] Registered processor for type: ${type}`);
  }

  /**
   * Add a request to the queue
   */
  enqueue<T>(
    type: QueuedRequest['type'],
    payload: T,
    options: {
      userId: string;
      firmId: string;
      priority?: number;
      dedupKey?: string;
      maxRetries?: number;
    }
  ): QueuedRequest<T> | { error: string; existingRequestId?: string } {
    const { userId, firmId, priority = 5, dedupKey, maxRetries } = options;

    // Check queue size limit
    if (this.queue.length >= this.config.maxQueueSize) {
      return { error: 'Queue is full. Please try again later.' };
    }

    // Check per-user rate limit
    if (!this.checkUserLimit(userId)) {
      return { error: 'Too many requests. Please wait before submitting more.' };
    }

    // Check for duplicate requests
    if (this.config.enableDeduplication && dedupKey) {
      const existing = this.dedupCache.get(dedupKey);
      if (existing && Date.now() - existing.timestamp < this.config.deduplicationWindow) {
        return {
          error: 'Duplicate request detected',
          existingRequestId: existing.requestId,
        };
      }
    }

    const request: QueuedRequest<T> = {
      id: this.generateId(),
      type,
      priority,
      userId,
      firmId,
      payload,
      createdAt: new Date(),
      status: 'pending',
      retryCount: 0,
      maxRetries: maxRetries ?? this.config.maxRetries,
      dedupKey,
    };

    // Add to queue in priority order
    this.insertByPriority(request);

    // Track for deduplication
    if (dedupKey) {
      this.dedupCache.set(dedupKey, {
        requestId: request.id,
        timestamp: Date.now(),
      });
    }

    // Increment user request count
    this.incrementUserCount(userId);

    this.emit('enqueued', request);
    console.log(`[RequestQueue] Request ${request.id} enqueued (type: ${type}, priority: ${priority})`);

    return request;
  }

  /**
   * Get the status of a request
   */
  getStatus(requestId: string): QueuedRequest | undefined {
    // Check processing
    const processing = this.processing.get(requestId);
    if (processing) return processing;

    // Check completed
    const completed = this.completed.get(requestId);
    if (completed) return completed;

    // Check pending queue
    return this.queue.find(r => r.id === requestId);
  }

  /**
   * Cancel a pending request
   */
  cancel(requestId: string): boolean {
    const index = this.queue.findIndex(r => r.id === requestId);
    if (index !== -1) {
      const request = this.queue.splice(index, 1)[0];
      request.status = 'cancelled';
      this.completed.set(request.id, request);
      this.emit('cancelled', request);
      console.log(`[RequestQueue] Request ${requestId} cancelled`);
      return true;
    }
    return false;
  }

  /**
   * Wait for a request to complete
   */
  async waitForCompletion<R>(requestId: string, timeout?: number): Promise<R> {
    const actualTimeout = timeout ?? this.config.requestTimeout;

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const request = this.getStatus(requestId);
        if (!request) {
          clearInterval(checkInterval);
          reject(new Error('Request not found'));
          return;
        }

        if (request.status === 'completed') {
          clearInterval(checkInterval);
          resolve(request.result as R);
        } else if (request.status === 'failed') {
          clearInterval(checkInterval);
          reject(new Error(request.error || 'Request failed'));
        } else if (request.status === 'cancelled') {
          clearInterval(checkInterval);
          reject(new Error('Request was cancelled'));
        }
      }, 100);

      // Timeout
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Request timed out'));
      }, actualTimeout);
    });
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    const activeUsers = new Set([
      ...this.queue.map(r => r.userId),
      ...Array.from(this.processing.values()).map(r => r.userId),
    ]);

    return {
      pendingCount: this.queue.length,
      processingCount: this.processing.size,
      completedCount: this.completed.size,
      failedCount: this.stats.totalFailed,
      totalProcessed: this.stats.totalProcessed,
      averageWaitTime: this.stats.totalProcessed > 0
        ? this.stats.totalWaitTime / this.stats.totalProcessed
        : 0,
      averageProcessTime: this.stats.totalProcessed > 0
        ? this.stats.totalProcessTime / this.stats.totalProcessed
        : 0,
      activeUsers: activeUsers.size,
      queueUtilization: this.queue.length / this.config.maxQueueSize,
    };
  }

  /**
   * Get pending requests for a user
   */
  getUserRequests(userId: string): QueuedRequest[] {
    const pending = this.queue.filter(r => r.userId === userId);
    const processing = Array.from(this.processing.values()).filter(r => r.userId === userId);
    return [...pending, ...processing];
  }

  /**
   * Get queue position for a request
   */
  getQueuePosition(requestId: string): number {
    const index = this.queue.findIndex(r => r.id === requestId);
    return index !== -1 ? index + 1 : -1;
  }

  private async processQueue(): Promise<void> {
    // Check if we can process more requests
    if (this.processing.size >= this.config.maxConcurrent) {
      return;
    }

    // Get next request
    const request = this.queue.shift();
    if (!request) {
      return;
    }

    // Get processor
    const processor = this.processors.get(request.type);
    if (!processor) {
      console.error(`[RequestQueue] No processor for type: ${request.type}`);
      request.status = 'failed';
      request.error = `No processor for type: ${request.type}`;
      this.completed.set(request.id, request);
      return;
    }

    // Start processing
    request.status = 'processing';
    request.startedAt = new Date();
    this.processing.set(request.id, request);
    this.emit('processing', request);

    const waitTime = request.startedAt.getTime() - request.createdAt.getTime();

    try {
      // Process with timeout
      const result = await Promise.race([
        processor(request),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), this.config.requestTimeout)
        ),
      ]);

      request.status = 'completed';
      request.completedAt = new Date();
      request.result = result;

      const processTime = request.completedAt.getTime() - request.startedAt.getTime();
      this.stats.totalProcessed++;
      this.stats.totalWaitTime += waitTime;
      this.stats.totalProcessTime += processTime;

      this.emit('completed', request);
      console.log(`[RequestQueue] Request ${request.id} completed in ${processTime}ms`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Check if we should retry
      if (request.retryCount < request.maxRetries) {
        request.retryCount++;
        request.status = 'pending';
        request.startedAt = undefined;

        // Add back to queue with exponential backoff delay
        const delay = this.config.retryDelay * Math.pow(2, request.retryCount - 1);
        setTimeout(() => {
          this.insertByPriority(request);
          console.log(`[RequestQueue] Request ${request.id} requeued (retry ${request.retryCount}/${request.maxRetries})`);
        }, delay);
      } else {
        request.status = 'failed';
        request.completedAt = new Date();
        request.error = errorMessage;
        this.stats.totalFailed++;
        this.emit('failed', request);
        console.error(`[RequestQueue] Request ${request.id} failed: ${errorMessage}`);
      }
    } finally {
      this.processing.delete(request.id);
      if (request.status === 'completed' || request.status === 'failed') {
        this.completed.set(request.id, request);
      }
    }
  }

  private insertByPriority(request: QueuedRequest): void {
    // Find the right position based on priority
    const index = this.queue.findIndex(r => r.priority > request.priority);
    if (index === -1) {
      this.queue.push(request);
    } else {
      this.queue.splice(index, 0, request);
    }
  }

  private checkUserLimit(userId: string): boolean {
    const now = Date.now();
    const userLimit = this.userRequestCounts.get(userId);

    if (!userLimit) {
      return true;
    }

    // Reset if window has passed
    if (now - userLimit.windowStart > this.config.perUserLimitWindow) {
      this.userRequestCounts.set(userId, { count: 0, windowStart: now });
      return true;
    }

    return userLimit.count < this.config.perUserLimit;
  }

  private incrementUserCount(userId: string): void {
    const now = Date.now();
    const userLimit = this.userRequestCounts.get(userId);

    if (!userLimit || now - userLimit.windowStart > this.config.perUserLimitWindow) {
      this.userRequestCounts.set(userId, { count: 1, windowStart: now });
    } else {
      userLimit.count++;
    }
  }

  private cleanup(): void {
    const now = Date.now();

    // Clean up old dedup entries
    for (const [key, value] of this.dedupCache.entries()) {
      if (now - value.timestamp > this.config.deduplicationWindow * 2) {
        this.dedupCache.delete(key);
      }
    }

    // Clean up old completed requests (keep for 5 minutes)
    for (const [id, request] of this.completed.entries()) {
      if (request.completedAt && now - request.completedAt.getTime() > 300000) {
        this.completed.delete(id);
      }
    }

    // Clean up old user counts
    for (const [userId, data] of this.userRequestCounts.entries()) {
      if (now - data.windowStart > this.config.perUserLimitWindow * 2) {
        this.userRequestCounts.delete(userId);
      }
    }
  }

  private generateId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// Singleton instance
let queue: RequestQueue | null = null;

export function getRequestQueue(config?: Partial<QueueConfig>): RequestQueue {
  if (!queue) {
    queue = new RequestQueue(config);
    queue.start();
  }
  return queue;
}

export function stopRequestQueue(): void {
  if (queue) {
    queue.stop();
    queue = null;
  }
}

// For testing
export function createRequestQueue(config?: Partial<QueueConfig>): RequestQueue {
  return new RequestQueue(config);
}

export { RequestQueue };
export default getRequestQueue;
